"""
segment_mesh.py — PartField 分割脚本

用法:
    python scripts/segment_mesh.py \
        --model_id  <modelId> \
        --num_clusters <int, 默认10; 0=自动> \
        --method  <agglomerative|kmeans|hdbscan, 默认agglomerative> \
        --models_dir <files/models 路径> \
        --ckpt  <模型权重路径> \
        --gpu   <auto|0|1|...|cpu>

GPU 选择:
    --gpu auto  自动选择空闲显存最大的 GPU（默认）
    --gpu 0     使用 GPU 0
    --gpu 1     使用 GPU 1
    --gpu cpu   禁用 GPU，使用 CPU

也可通过环境变量 PARTFIELD_GPU 指定（服务端优先级更高）。

输出 (files/models/{model_id}/segments/):
    mesh.ply          — PartField 预处理后的三角网格
    face_labels.npy   — 每面整数标签 (num_faces,)
    face_labels.json  — 同上，JSON 数组
    config.json       — 分割配置
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime

import numpy as np

# ──────────────────────────────────────────────────────────────────────────────
# 确保项目根目录在 sys.path 中（脚本可能从任意目录执行）
# ──────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ──────────────────────────────────────────────────────────────────────────────
# GPU 自动选择（在 import torch 之前设置 CUDA_VISIBLE_DEVICES）
# ──────────────────────────────────────────────────────────────────────────────
def select_best_gpu():
    """
    通过 nvidia-smi 查询所有 GPU 的显存使用情况，
    返回空闲显存最多的 GPU 索引（int），查询失败返回 None。
    """
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=index,memory.used,memory.total,utilization.gpu',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None

        best_idx, best_free = None, -1
        for line in result.stdout.strip().split('\n'):
            parts = [p.strip() for p in line.split(',')]
            if len(parts) < 4:
                continue
            idx        = int(parts[0])
            mem_used   = float(parts[1])   # MiB
            mem_total  = float(parts[2])   # MiB
            gpu_util   = float(parts[3])   # %
            mem_free   = mem_total - mem_used
            # 优先选空闲显存最大的；显存相同时选利用率最低的
            score = mem_free * 1000 - gpu_util
            if score > best_free:
                best_free = score
                best_idx  = idx
            print(f'  GPU {idx}: {mem_used:.0f}/{mem_total:.0f} MiB used, '
                  f'{mem_free:.0f} MiB free, utilization {gpu_util:.0f}%')

        return best_idx
    except Exception as e:
        print(f'[GPU] nvidia-smi 查询失败: {e}')
        return None


def setup_gpu(gpu_arg: str):
    """
    根据 --gpu 参数设置 CUDA_VISIBLE_DEVICES。
    必须在 import torch 之前调用。
      'auto'  → 自动选择空闲显存最大的 GPU
      数字    → 直接指定 GPU 索引（如 '0', '1'）
      'cpu'   → 禁用 GPU
    """
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


def parse_args():
    parser = argparse.ArgumentParser(description='PartField mesh segmentation')
    parser.add_argument('--model_id',     required=True,  help='Model ID (folder name under models_dir)')
    parser.add_argument('--num_clusters', type=int, default=10,
                        help='分割块数，0 = 自动检测（最大间距法）')
    parser.add_argument('--auto_max_clusters', type=int, default=10,
                        help='自动模式下的搜索上限（默认 10）')
    parser.add_argument('--auto_method', default='gap', choices=['gap', 'silhouette'],
                        help='自动模式下的选 k 策略：gap=最大间距法（默认），silhouette=轮廓系数法')
    parser.add_argument('--method',       default='agglomerative', choices=['agglomerative', 'kmeans'])
    parser.add_argument('--models_dir',   default=os.path.join(PROJECT_ROOT, 'files', 'models'))
    parser.add_argument('--ckpt',         default=os.path.join(PROJECT_ROOT, 'partfield-ckpt', 'model_objaverse.ckpt'),
                        help='Path to PartField checkpoint')
    parser.add_argument('--gpu',          default='auto',
                        help='GPU 选择: "auto"=自动选择最佳GPU, "0"/"1"/...=指定GPU, "cpu"=禁用GPU')
    parser.add_argument('--n_point_per_face', type=int, default=1000,
                        help='每面采样点数 (降低可减少显存，默认1000)')
    parser.add_argument('--n_sample_each', type=int, default=10000,
                        help='每次采样批次大小 (降低可减少显存，默认10000)')
    return parser.parse_args()


# ──────────────────────────────────────────────────────────────────────────────
# 步骤 1 — 特征提取
# ──────────────────────────────────────────────────────────────────────────────
def extract_features(mesh_path: str, uid: str, feat_dir: str, ckpt_path: str,
                     n_point_per_face: int = 1000, n_sample_each: int = 10000):
    """
    通过 PyTorch Lightning 运行 PartField 推理。
    产出：
      feat_dir/input_{uid}_0.ply      — 预处理后的三角网格
      feat_dir/part_feat_{uid}_0*.npy — 每面特征
    """
    import torch
    from lightning.pytorch import Trainer
    from lightning.pytorch.strategies import DDPStrategy
    from partfield.config.defaults import _C as default_cfg
    from partfield.model_trainer_pvcnn_only_demo import Model

    # 创建临时 data_path，只放待推理的网格
    data_dir = tempfile.mkdtemp(prefix='pf_input_')
    ext = os.path.splitext(mesh_path)[1]
    shutil.copy(mesh_path, os.path.join(data_dir, f'{uid}{ext}'))

    # 构造最小化配置（参照 PartField-main/configs/final/demo.yaml）
    cfg = default_cfg.clone()
    cfg.defrost()
    cfg.result_name             = os.path.basename(feat_dir)
    cfg.output_dir              = os.path.dirname(feat_dir)
    cfg.continue_ckpt           = ckpt_path
    cfg.triplane_channels_low   = 128
    cfg.triplane_channels_high  = 512
    cfg.triplane_resolution     = 128
    cfg.n_point_per_face        = n_point_per_face
    cfg.n_sample_each           = n_sample_each
    cfg.is_pc                   = False
    cfg.remesh_demo             = False
    cfg.correspondence_demo     = False
    cfg.preprocess_mesh         = True
    cfg.use_2d_feat             = False
    cfg.use_pvcnnonly           = True
    cfg.dataset.data_path       = data_dir
    cfg.dataset.val_batch_size  = 1
    cfg.dataset.val_num_workers = 0
    cfg.pvcnn.z_triplane_channels   = 256
    cfg.pvcnn.z_triplane_resolution = 128
    cfg.freeze()

    os.makedirs(feat_dir, exist_ok=True)

    # 旧版 change cwd → feat_dir 以匹配 model_trainer 中的相对路径
    orig_cwd = os.getcwd()
    os.chdir(os.path.dirname(feat_dir))   # chdir 到 exp_results 的父目录

    try:
        trainer = Trainer(
            devices=1 if torch.cuda.is_available() else 0,
            accelerator='gpu' if torch.cuda.is_available() else 'cpu',
            precision='16-mixed' if torch.cuda.is_available() else '32',
            strategy='auto',
            logger=False,
            enable_checkpointing=False,
            enable_progress_bar=True,
        )
        model = Model(cfg)
        trainer.predict(model, ckpt_path=ckpt_path)
    finally:
        os.chdir(orig_cwd)
        shutil.rmtree(data_dir, ignore_errors=True)


# ──────────────────────────────────────────────────────────────────────────────
# 步骤 2 — 聚类
# ──────────────────────────────────────────────────────────────────────────────
def find_optimal_k_from_distances(distances, min_k=2, max_k=20):
    """
    最大间距法（Dendrogram Gap）自动确定最优聚类数。

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
            best_k = k + 1

    print(f'[AutoCluster] 最大间距 gap={best_gap:.6f}，最优簇数={best_k}')
    return best_k


def run_clustering(feat_dir: str, uid: str, num_clusters: int, method: str,
                   auto_max_clusters: int = 10, auto_method: str = 'gap'):
    """
    读取 feat_dir 中的特征 NPY，运行聚类，返回:
      face_labels: np.ndarray (num_faces,)  整数标签

    num_clusters=0 → 自动模式（auto_method='gap'：最大间距法；'silhouette'：轮廓系数法）
    """
    from sklearn.cluster import AgglomerativeClustering, KMeans

    auto_mode = (num_clusters == 0)

    # 加载特征（batch 版本优先）
    feat_path_batch  = os.path.join(feat_dir, f'part_feat_{uid}_0_batch.npy')
    feat_path_single = os.path.join(feat_dir, f'part_feat_{uid}_0.npy')

    if os.path.exists(feat_path_batch):
        point_feat = np.load(feat_path_batch)
    elif os.path.exists(feat_path_single):
        point_feat = np.load(feat_path_single)
    else:
        raise FileNotFoundError(
            f'找不到特征文件: {feat_path_batch} 或 {feat_path_single}'
        )

    # L2 归一化
    norms = np.linalg.norm(point_feat, axis=-1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    point_feat = point_feat / norms

    if method == 'hdbscan':
        mode_label = '全自动（HDBSCAN）'
    elif auto_mode:
        mode_label = f'自动-{auto_method}（上限{auto_max_clusters}）'
    else:
        mode_label = str(num_clusters)
    print(f'[Clustering] 特征形状: {point_feat.shape}, 方法: {method}, 目标簇数: {mode_label}')

    if method == 'kmeans':
        if auto_mode:
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
            labels = KMeans(n_clusters=num_clusters, random_state=0, n_init='auto').fit(point_feat).labels_
    elif method == 'hdbscan':
        # ── HDBSCAN：全自动密度聚类，无需指定簇数 ──────────────────
        # 特征维度通常为 448，直接跑 HDBSCAN 会导致 KD 树退化为 O(n²)。
        # 先用 PCA 降到 32 维，使 KD 树恢复 O(n log n) 效率（约快 10-50x）。
        from sklearn.decomposition import PCA
        n_pca = min(32, point_feat.shape[1], point_feat.shape[0] - 1)
        if n_pca < point_feat.shape[1]:
            pca = PCA(n_components=n_pca, random_state=0)
            feat_hdb = pca.fit_transform(point_feat)
            print(f'[HDBSCAN] PCA {point_feat.shape[1]}→{n_pca} 维，'
                  f'方差保留 {pca.explained_variance_ratio_.sum():.1%}')
        else:
            feat_hdb = point_feat

        # min_samples=5：固定邻域密度阈值，不随 min_cluster_size 膨胀，
        # 避免生成过多噪声点（噪声越多，后续 KNN 回退越慢）
        min_cs = max(5, min(50, len(point_feat) // 100))
        print(f'[HDBSCAN] 样本数={len(point_feat)}, min_cluster_size={min_cs}')
        try:
            from sklearn.cluster import HDBSCAN as _HDBSCAN
            clusterer = _HDBSCAN(min_cluster_size=min_cs, min_samples=5, n_jobs=-1)
            labels_raw = clusterer.fit_predict(feat_hdb)
        except ImportError:
            import hdbscan as _hdbscan_lib
            clusterer = _hdbscan_lib.HDBSCAN(
                min_cluster_size=min_cs, min_samples=5, core_dist_n_jobs=-1)
            labels_raw = clusterer.fit_predict(feat_hdb)

        # 将噪声点（label=-1）用原始高维特征做 KNN 分配（更准确）
        noise_mask = (labels_raw == -1)
        if noise_mask.any():
            n_noise = noise_mask.sum()
            valid_mask = ~noise_mask
            print(f'[HDBSCAN] 噪声点数: {n_noise}，回退 KNN 分配...')
            if valid_mask.any():
                from sklearn.neighbors import NearestNeighbors
                nn = NearestNeighbors(n_neighbors=1, algorithm='auto')
                nn.fit(point_feat[valid_mask])
                _, idx = nn.kneighbors(point_feat[noise_mask])
                labels_raw[noise_mask] = labels_raw[valid_mask][idx.flatten()]
            else:
                labels_raw[:] = 0
        print(f'[HDBSCAN] 自动发现簇数: {len(np.unique(labels_raw))}')
        labels = labels_raw
    else:
        # Agglomerative — 需要面邻接矩阵
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
            mesh.faces, mesh.vertices, with_knn=True
        )

        n_samples = point_feat.shape[0]

        if auto_mode:
            # 带距离记录的完整树（gap 和 silhouette 均需要 children_）
            clustering = AgglomerativeClustering(
                connectivity=adj, n_clusters=1,
                compute_distances=True,
            ).fit(point_feat)

            if auto_method == 'silhouette':
                from sklearn.metrics import silhouette_score
                all_levels = hierarchical_clustering_labels(
                    clustering.children_, n_samples, max_cluster=auto_max_clusters)
                best_labels, best_k, best_score = None, 2, -np.inf
                for h_labels_list in all_levels:
                    k_actual = len(np.unique(h_labels_list))
                    if k_actual < 2:
                        continue
                    n_sub = min(5000, n_samples)
                    score = silhouette_score(
                        point_feat, h_labels_list,
                        metric='cosine', sample_size=n_sub, random_state=0)
                    print(f'[AutoCluster] Agglo k={k_actual}: 轮廓系数={score:.4f}')
                    if score > best_score:
                        best_score = score
                        best_k = k_actual
                        best_labels = h_labels_list
                print(f'[AutoCluster] 凝聚聚类(轮廓系数) 最优簇数: {best_k}（score={best_score:.4f}）')
                labels = (np.array(best_labels) if best_labels is not None
                          else np.zeros(n_samples, dtype=int))
            else:
                # gap 最大间距法
                target_k = find_optimal_k_from_distances(
                    clustering.distances_, min_k=2, max_k=auto_max_clusters)
                print(f'[AutoCluster] 凝聚聚类(间距法) 最优簇数: {target_k}')
                hierarchical = hierarchical_clustering_labels(
                    clustering.children_, n_samples, max_cluster=target_k)
                labels = (np.array(hierarchical[0]) if hierarchical
                          else np.zeros(n_samples, dtype=int))
        else:
            clustering = AgglomerativeClustering(
                connectivity=adj, n_clusters=1,
            ).fit(point_feat)
            hierarchical = hierarchical_clustering_labels(
                clustering.children_, n_samples, max_cluster=num_clusters)
            labels = (np.array(hierarchical[0]) if hierarchical
                      else np.zeros(n_samples, dtype=int))

    # 重新映射为 0-based 连续整数
    unique = np.unique(labels)
    remap = {old: new for new, old in enumerate(unique)}
    face_labels = np.array([remap[l] for l in labels], dtype=np.int32)

    print(f'[Clustering] 实际簇数: {len(unique)}')
    return face_labels


# ──────────────────────────────────────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    # 在 import torch 之前设置 CUDA_VISIBLE_DEVICES
    setup_gpu(args.gpu)

    model_dir = os.path.join(args.models_dir, args.model_id)
    seg_dir   = os.path.join(model_dir, 'segments')
    meta_path = os.path.join(model_dir, 'meta.json')

    print(f'[PartField] 开始分割: {args.model_id}')
    mode_label = f'自动（上限{args.auto_max_clusters}）' if args.num_clusters == 0 else str(args.num_clusters)
    print(f'[PartField] 方法: {args.method}, 目标簇数: {mode_label}')

    # ── 找到原始 mesh 文件 ──────────────────────────────────────────────────
    orig_file = None
    for f in os.listdir(model_dir):
        if f.startswith('original.'):
            orig_file = os.path.join(model_dir, f)
            break

    if orig_file is None:
        print(f'[ERROR] 找不到原始文件: {model_dir}')
        sys.exit(1)

    ext = os.path.splitext(orig_file)[1].lower()
    uid = 'original'  # dataloader uid 由文件名去掉扩展名得到

    # ── 特征提取 ─────────────────────────────────────────────────────────────
    feat_dir = os.path.join(PROJECT_ROOT, 'exp_results', f'pf_{args.model_id}')
    print(f'[PartField] 特征目录: {feat_dir}')

    os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

    t0 = time.time()
    extract_features(orig_file, uid, feat_dir, args.ckpt,
                     n_point_per_face=args.n_point_per_face,
                     n_sample_each=args.n_sample_each)
    print(f'[PartField] 特征提取完成，耗时 {time.time()-t0:.1f}s')

    # ── 聚类 ─────────────────────────────────────────────────────────────────
    t1 = time.time()
    face_labels = run_clustering(feat_dir, uid, args.num_clusters, args.method,
                                 auto_max_clusters=args.auto_max_clusters,
                                 auto_method=args.auto_method)
    print(f'[PartField] 聚类完成，耗时 {time.time()-t1:.1f}s')

    # ── 保存结果 ─────────────────────────────────────────────────────────────
    os.makedirs(seg_dir, exist_ok=True)

    # 1. 拷贝预处理后的 PLY
    src_ply = os.path.join(feat_dir, f'input_{uid}_0.ply')
    if os.path.exists(src_ply):
        shutil.copy(src_ply, os.path.join(seg_dir, 'mesh.ply'))
        print(f'[PartField] mesh.ply 已保存')
    else:
        print(f'[WARNING] 找不到预处理 PLY: {src_ply}')

    # 2. 保存 face_labels.npy
    npy_path = os.path.join(seg_dir, 'face_labels.npy')
    np.save(npy_path, face_labels)
    print(f'[PartField] face_labels.npy 已保存，形状: {face_labels.shape}')

    # 3. 保存 face_labels.json（前端消费）
    json_path = os.path.join(seg_dir, 'face_labels.json')
    with open(json_path, 'w') as f:
        json.dump(face_labels.tolist(), f)
    print(f'[PartField] face_labels.json 已保存')

    # 4. 保存 config.json
    config = {
        'numClusters': int(len(np.unique(face_labels))),
        'requestedClusters': args.num_clusters,  # 0 表示自动模式
        'method': args.method,
        'numFaces': int(len(face_labels)),
        'createdAt': datetime.utcnow().isoformat() + 'Z'
    }
    with open(os.path.join(seg_dir, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)
    print(f'[PartField] config.json 已保存: {config}')

    # ── 更新 meta.json ────────────────────────────────────────────────────────
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            meta = json.load(f)
        meta['status'] = 'segmented'
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)
        print(f'[PartField] meta.json 状态已更新 → segmented')

    # ── 清理临时特征文件（可选，节省磁盘） ──────────────────────────────────
    shutil.rmtree(feat_dir, ignore_errors=True)
    print(f'[PartField] 临时特征目录已清理: {feat_dir}')

    print(f'[PartField] 全部完成！总耗时 {time.time()-t0:.1f}s')


if __name__ == '__main__':
    main()
