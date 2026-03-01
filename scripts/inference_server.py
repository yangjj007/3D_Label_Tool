#!/usr/bin/env python3
"""
inference_server.py — PartField 推理服务器

预加载分割模型到 GPU，通过 HTTP 接收推理请求，实现低延迟分割。

启动:
    python scripts/inference_server.py [--gpu auto] [--port 5555] [--ckpt path/to/ckpt]

环境变量:
    PARTFIELD_GPU   GPU 选择 (同 --gpu)
    PARTFIELD_PORT  服务端口 (同 --port)

API:
    GET  /health  → {"status":"ready","device":"cuda:0"}
    POST /segment → body: {"model_id","num_clusters","method","models_dir"}
                  ← {"success":true,...} | {"success":false,"error":"..."}
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from datetime import datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ──────────────────────────────────────────────────────────────────────────────
# GPU 选择
# ──────────────────────────────────────────────────────────────────────────────
def select_best_gpu():
    try:
        result = subprocess.run(
            ['nvidia-smi',
             '--query-gpu=index,memory.used,memory.total,utilization.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None

        best_idx, best_score = None, -1
        for line in result.stdout.strip().split('\n'):
            parts = [p.strip() for p in line.split(',')]
            if len(parts) < 4:
                continue
            idx = int(parts[0])
            mem_used = float(parts[1])
            mem_total = float(parts[2])
            gpu_util = float(parts[3])
            mem_free = mem_total - mem_used
            score = mem_free * 1000 - gpu_util
            if score > best_score:
                best_score = score
                best_idx = idx
            print(f'  GPU {idx}: {mem_used:.0f}/{mem_total:.0f} MiB, '
                  f'{mem_free:.0f} MiB free, util {gpu_util:.0f}%')
        return best_idx
    except Exception as e:
        print(f'[GPU] nvidia-smi 查询失败: {e}')
        return None


def setup_gpu(gpu_arg):
    if gpu_arg == 'cpu':
        os.environ['CUDA_VISIBLE_DEVICES'] = ''
        print('[GPU] 已禁用 GPU，将使用 CPU')
        return
    if gpu_arg == 'auto':
        print('[GPU] 正在自动选择最佳 GPU ...')
        best = select_best_gpu()
        if best is not None:
            os.environ['CUDA_VISIBLE_DEVICES'] = str(best)
            print(f'[GPU] 自动选择 → GPU {best}')
        else:
            print('[GPU] 自动选择失败，使用默认 GPU')
    else:
        os.environ['CUDA_VISIBLE_DEVICES'] = gpu_arg
        print(f'[GPU] 手动指定 → GPU {gpu_arg}')


# ──────────────────────────────────────────────────────────────────────────────
# 全局模型状态
# ──────────────────────────────────────────────────────────────────────────────
_model = None
_device = None
_ckpt_path = None
_gpu_lock = threading.Lock()
_server_status = 'loading'  # loading → ready | error


def load_model(ckpt_path, use_fp16=False):
    """创建模型、加载权重、移至 GPU，全程只调用一次。"""
    global _model, _device, _ckpt_path, _server_status

    import torch
    from partfield.config.defaults import _C as default_cfg
    from partfield.model_trainer_pvcnn_only_demo import Model

    os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

    _ckpt_path = ckpt_path

    cfg = default_cfg.clone()
    cfg.defrost()
    cfg.triplane_channels_low = 128
    cfg.triplane_channels_high = 512
    cfg.triplane_resolution = 128
    cfg.n_point_per_face = 1000
    cfg.n_sample_each = 10000
    cfg.is_pc = False
    cfg.remesh_demo = False
    cfg.correspondence_demo = False
    cfg.preprocess_mesh = True
    cfg.use_2d_feat = False
    cfg.use_pvcnnonly = True
    cfg.dataset.data_path = tempfile.mkdtemp()
    cfg.dataset.val_batch_size = 1
    cfg.dataset.val_num_workers = 0
    cfg.pvcnn.z_triplane_channels = 256
    cfg.pvcnn.z_triplane_resolution = 128
    cfg.result_name = '__init__'
    cfg.output_dir = PROJECT_ROOT
    cfg.continue_ckpt = ckpt_path
    cfg.freeze()

    print('[Server] 正在创建模型 ...', flush=True)
    model = Model(cfg)

    print('[Server] 正在加载权重 ...', flush=True)
    ckpt = torch.load(ckpt_path, map_location='cpu')
    state_dict = ckpt.get('state_dict', ckpt)
    model.load_state_dict(state_dict, strict=False)

    _device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    dtype_label = 'fp16' if use_fp16 else 'fp32'
    print(f'[Server] 正在将模型移至 {_device} ({dtype_label}) ...', flush=True)

    if use_fp16 and _device.type == 'cuda':
        model = model.half()
        print('[Server] 模型已转为 FP16（显存占用减半）', flush=True)

    model = model.to(_device)
    model.eval()
    _model = model

    shutil.rmtree(cfg.dataset.data_path, ignore_errors=True)

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        mem_alloc = torch.cuda.memory_allocated() / 1024 ** 2
        mem_total = torch.cuda.get_device_properties(0).total_memory / 1024 ** 2
        print(f'[Server] GPU 显存: 模型 {mem_alloc:.0f} MiB / 总计 {mem_total:.0f} MiB',
              flush=True)

    _server_status = 'ready'
    print(f'[Server] ✅ 模型已就绪 ({_device}, {dtype_label})', flush=True)


# ──────────────────────────────────────────────────────────────────────────────
# 推理管线
# ──────────────────────────────────────────────────────────────────────────────
def _move_batch_to_device(batch, device):
    import torch
    out = {}
    for k, v in batch.items():
        if isinstance(v, torch.Tensor):
            out[k] = v.to(device)
        else:
            out[k] = v
    return out


def extract_features_preloaded(model_id, models_dir,
                               n_point_per_face=None, n_sample_each=None):
    """使用预加载模型提取特征，跳过模型创建和权重加载。"""
    import torch
    from torch.utils.data import DataLoader
    from partfield.dataloader import Demo_Dataset

    model_dir = os.path.join(models_dir, model_id)
    feat_dir = os.path.join(PROJECT_ROOT, 'exp_results', f'pf_{model_id}')
    uid = 'original'

    orig_file = None
    for f in os.listdir(model_dir):
        if f.startswith('original.'):
            orig_file = os.path.join(model_dir, f)
            break
    if not orig_file:
        raise FileNotFoundError(f'找不到原始文件: {model_dir}')

    data_dir = tempfile.mkdtemp(prefix='pf_input_')
    ext = os.path.splitext(orig_file)[1]
    shutil.copy(orig_file, os.path.join(data_dir, f'{uid}{ext}'))
    os.makedirs(feat_dir, exist_ok=True)

    try:
        _model.cfg.defrost()
        _model.cfg.dataset.data_path = data_dir
        _model.cfg.result_name = os.path.basename(feat_dir)
        _model.cfg.output_dir = os.path.dirname(feat_dir)
        if n_point_per_face is not None:
            _model.cfg.n_point_per_face = n_point_per_face
        if n_sample_each is not None:
            _model.cfg.n_sample_each = n_sample_each
        _model.cfg.freeze()

        dataset = Demo_Dataset(_model.cfg)
        dataloader = DataLoader(
            dataset, batch_size=1, num_workers=0,
            shuffle=False, pin_memory=True, drop_last=False,
        )

        orig_cwd = os.getcwd()
        os.chdir(PROJECT_ROOT)
        try:
            use_amp = _device.type == 'cuda'
            with torch.no_grad():
                with torch.cuda.amp.autocast(enabled=use_amp):
                    for batch_idx, batch in enumerate(dataloader):
                        batch = _move_batch_to_device(batch, _device)
                        _model.predict_step(batch, batch_idx)
        finally:
            os.chdir(orig_cwd)
    finally:
        shutil.rmtree(data_dir, ignore_errors=True)

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return feat_dir


def find_optimal_k_from_distances(distances, min_k=2, max_k=20):
    """
    最大间距法（Dendrogram Gap）自动确定最优聚类数。

    原理：凝聚聚类每次合并两个最近的簇，合并代价记录在 distances_ 中。
    当把 k+1 个簇合并为 k 个的代价远大于把 k+2 合并为 k+1 的代价时，
    说明 k+1 个簇之间界限清晰，是自然的停止点。

    distances[i]：第 i+1 次合并时的代价（按合并顺序，从小到大）。
    合并 k+1 → k 个簇对应的索引：distances[n_samples - k - 1]
    """
    n_samples = len(distances) + 1
    hi = min(max_k, n_samples - 1)
    lo = max(min_k, 2)

    if lo >= hi:
        return lo

    best_k = lo
    best_gap = -np.inf

    for k in range(lo, hi):
        idx_this = n_samples - k - 1   # 合并 k+1 → k 的代价索引
        idx_next = n_samples - k - 2   # 合并 k+2 → k+1 的代价索引
        if idx_this < 0 or idx_next < 0:
            continue
        gap = float(distances[idx_this]) - float(distances[idx_next])
        if gap > best_gap:
            best_gap = gap
            best_k = k + 1  # 大跳升说明 k+1 个簇是自然停止点

    print(f'[AutoCluster] 最大间距 gap={best_gap:.6f}，最优簇数={best_k}')
    return best_k


def run_clustering(feat_dir, uid, num_clusters, method, auto_max_clusters=20):
    """
    读取特征 NPY，运行聚类。

    num_clusters=0  → 自动模式：由算法根据特征分布决定最优簇数
    num_clusters>0  → 固定模式：使用指定簇数（原有行为）
    auto_max_clusters：自动模式下的搜索上限（默认 20）
    """
    from sklearn.cluster import AgglomerativeClustering, KMeans

    auto_mode = (num_clusters == 0)

    feat_path_batch = os.path.join(feat_dir, f'part_feat_{uid}_0_batch.npy')
    feat_path_single = os.path.join(feat_dir, f'part_feat_{uid}_0.npy')

    if os.path.exists(feat_path_batch):
        point_feat = np.load(feat_path_batch)
    elif os.path.exists(feat_path_single):
        point_feat = np.load(feat_path_single)
    else:
        raise FileNotFoundError(
            f'找不到特征文件: {feat_path_batch} 或 {feat_path_single}')

    norms = np.linalg.norm(point_feat, axis=-1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    point_feat = point_feat / norms

    mode_label = f'自动（上限{auto_max_clusters}）' if auto_mode else str(num_clusters)
    print(f'[Clustering] 特征形状: {point_feat.shape}, '
          f'方法: {method}, 目标簇数: {mode_label}')

    if method == 'kmeans':
        if auto_mode:
            # 轮廓系数法：对 k=2..auto_max_clusters 逐一评分，取最优
            from sklearn.metrics import silhouette_score
            best_k, best_score = 2, -np.inf
            for k in range(2, auto_max_clusters + 1):
                km = KMeans(n_clusters=k, random_state=0, n_init='auto').fit(point_feat)
                if len(np.unique(km.labels_)) < k:
                    continue
                n_sub = min(5000, len(point_feat))
                score = silhouette_score(
                    point_feat, km.labels_,
                    metric='cosine', sample_size=n_sub, random_state=0)
                print(f'[AutoCluster] KMeans k={k}: 轮廓系数={score:.4f}')
                if score > best_score:
                    best_score = score
                    best_k = k
            print(f'[AutoCluster] KMeans 最优簇数: {best_k}（轮廓系数={best_score:.4f}）')
            labels = KMeans(n_clusters=best_k, random_state=0, n_init='auto').fit(point_feat).labels_
        else:
            labels = KMeans(
                n_clusters=num_clusters, random_state=0, n_init='auto'
            ).fit(point_feat).labels_
    else:
        # ── 凝聚聚类（Agglomerative）──────────────────────────────
        partfield_main = os.path.join(PROJECT_ROOT, 'PartField-main')
        if partfield_main not in sys.path:
            sys.path.insert(0, partfield_main)
        from run_part_clustering import (
            construct_face_adjacency_matrix_facemst,
            hierarchical_clustering_labels,
        )
        from partfield.utils import load_mesh_util

        mesh_ply = os.path.join(feat_dir, f'input_{uid}_0.ply')
        mesh = load_mesh_util(mesh_ply)
        # 官方 option=1，with_knn=True：facemst 对干净/碎片化网格均适用
        adj = construct_face_adjacency_matrix_facemst(
            mesh.faces, mesh.vertices, with_knn=True)

        if auto_mode:
            # 带距离记录的完整树，用最大间距法确定最优 k
            clustering = AgglomerativeClustering(
                connectivity=adj, n_clusters=1,
                compute_distances=True,
            ).fit(point_feat)
            optimal_k = find_optimal_k_from_distances(
                clustering.distances_,
                min_k=2, max_k=auto_max_clusters)
            print(f'[AutoCluster] 凝聚聚类最优簇数: {optimal_k}')
            target_k = optimal_k
        else:
            clustering = AgglomerativeClustering(
                connectivity=adj, n_clusters=1,
            ).fit(point_feat)
            target_k = num_clusters

        n_samples = point_feat.shape[0]
        hierarchical = hierarchical_clustering_labels(
            clustering.children_, n_samples,
            max_cluster=target_k)

        labels = (np.array(hierarchical[0]) if hierarchical
                  else np.zeros(n_samples, dtype=int))

    unique = np.unique(labels)
    remap = {old: new for new, old in enumerate(unique)}
    face_labels = np.array([remap[l] for l in labels], dtype=np.int32)
    print(f'[Clustering] 实际簇数: {len(unique)}')
    return face_labels


def do_segment(model_id, num_clusters=10, method='agglomerative',
               models_dir=None, n_point_per_face=None, n_sample_each=None,
               auto_max_clusters=20):
    """
    完整分割管线：特征提取 → 聚类 → 保存结果 → 更新 meta。

    num_clusters=0 触发自动模式，auto_max_clusters 为搜索上限。
    """
    if models_dir is None:
        models_dir = os.path.join(PROJECT_ROOT, 'files', 'models')

    model_dir = os.path.join(models_dir, model_id)
    seg_dir = os.path.join(model_dir, 'segments')
    meta_path = os.path.join(model_dir, 'meta.json')
    uid = 'original'

    t0 = time.time()

    # 1. 特征提取（GPU）
    print(f'[Segment] {model_id}: 提取特征 ...', flush=True)
    feat_dir = extract_features_preloaded(
        model_id, models_dir,
        n_point_per_face=n_point_per_face,
        n_sample_each=n_sample_each)
    print(f'[Segment] 特征提取完成，耗时 {time.time() - t0:.1f}s', flush=True)

    # 2. 聚类（CPU）
    t1 = time.time()
    print(f'[Segment] {model_id}: 聚类 ...', flush=True)
    face_labels = run_clustering(feat_dir, uid, num_clusters, method,
                                 auto_max_clusters=auto_max_clusters)
    print(f'[Segment] 聚类完成，耗时 {time.time() - t1:.1f}s', flush=True)

    # 3. 保存结果
    os.makedirs(seg_dir, exist_ok=True)

    src_ply = os.path.join(feat_dir, f'input_{uid}_0.ply')
    if os.path.exists(src_ply):
        shutil.copy(src_ply, os.path.join(seg_dir, 'mesh.ply'))

    np.save(os.path.join(seg_dir, 'face_labels.npy'), face_labels)

    with open(os.path.join(seg_dir, 'face_labels.json'), 'w') as f:
        json.dump(face_labels.tolist(), f)

    actual_clusters = int(len(np.unique(face_labels)))
    config = {
        'numClusters': actual_clusters,
        'requestedClusters': num_clusters,
        'method': method,
        'numFaces': int(len(face_labels)),
        'createdAt': datetime.utcnow().isoformat() + 'Z',
    }
    with open(os.path.join(seg_dir, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    # 4. 更新 meta.json
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        meta['status'] = 'segmented'
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)

    # 5. 清理临时特征
    shutil.rmtree(feat_dir, ignore_errors=True)

    total = time.time() - t0
    print(f'[Segment] ✅ {model_id} 完成，总耗时 {total:.1f}s', flush=True)
    return {
        'success': True,
        'model_id': model_id,
        'num_clusters': actual_clusters,
        'elapsed': round(total, 1),
    }


# ──────────────────────────────────────────────────────────────────────────────
# HTTP 服务
# ──────────────────────────────────────────────────────────────────────────────
class InferenceHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        sys.stderr.write(f'[HTTP] {self.address_string()} {fmt % args}\n')
        sys.stderr.flush()

    def _send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── GET ────────────────────────────────────────────────────
    def do_GET(self):
        if self.path == '/health':
            import torch
            gpu_info = None
            if torch.cuda.is_available():
                mem_alloc = torch.cuda.memory_allocated() / 1024 ** 2
                mem_total = torch.cuda.get_device_properties(0).total_memory / 1024 ** 2
                gpu_info = f'{mem_alloc:.0f}/{mem_total:.0f} MiB'
            self._send_json(200, {
                'status': _server_status,
                'device': str(_device) if _device else None,
                'gpu_memory': gpu_info,
            })
        else:
            self._send_json(404, {'error': 'Not found'})

    # ── POST ───────────────────────────────────────────────────
    def do_POST(self):
        if self.path != '/segment':
            self._send_json(404, {'error': 'Not found'})
            return

        if _server_status != 'ready':
            self._send_json(503, {
                'success': False,
                'error': f'服务未就绪 (status={_server_status})',
            })
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            model_id = body.get('model_id')
            if not model_id:
                self._send_json(400, {
                    'success': False, 'error': 'model_id 必填'})
                return

            num_clusters = int(body.get('num_clusters', 10))
            method = body.get('method', 'agglomerative')
            models_dir = body.get('models_dir')
            auto_max_clusters = int(body.get('auto_max_clusters', 20))

            n_point_per_face = body.get('n_point_per_face')
            n_sample_each = body.get('n_sample_each')
            if n_point_per_face is not None:
                n_point_per_face = int(n_point_per_face)
            if n_sample_each is not None:
                n_sample_each = int(n_sample_each)

            with _gpu_lock:
                result = do_segment(
                    model_id, num_clusters, method, models_dir,
                    n_point_per_face=n_point_per_face,
                    n_sample_each=n_sample_each,
                    auto_max_clusters=auto_max_clusters)

            self._send_json(200, result)

        except Exception as e:
            traceback.print_exc()
            self._send_json(500, {'success': False, 'error': str(e)})


# ──────────────────────────────────────────────────────────────────────────────
# 入口
# ──────────────────────────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description='PartField Inference Server')
    p.add_argument('--port', type=int,
                   default=int(os.environ.get('PARTFIELD_PORT', '5555')))
    p.add_argument('--gpu',
                   default=os.environ.get('PARTFIELD_GPU', 'auto'))
    p.add_argument('--ckpt',
                   default=os.path.join(PROJECT_ROOT,
                                        'partfield-ckpt',
                                        'model_objaverse.ckpt'))
    p.add_argument('--fp16', action='store_true',
                   default=os.environ.get('PARTFIELD_FP16', '').lower() in ('1', 'true', 'yes'),
                   help='使用 FP16 半精度加载模型，显存占用减半')
    return p.parse_args()


def main():
    args = parse_args()

    setup_gpu(args.gpu)

    try:
        load_model(args.ckpt, use_fp16=args.fp16)
    except Exception:
        global _server_status
        _server_status = 'error'
        traceback.print_exc()
        print('[Server] ❌ 模型加载失败', flush=True)
        sys.exit(1)

    server = ThreadingHTTPServer(('0.0.0.0', args.port), InferenceHandler)
    print(f'[Server] 🚀 推理服务已启动，监听端口 {args.port}', flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Server] 正在关闭 ...', flush=True)
        server.shutdown()


if __name__ == '__main__':
    main()
