"""
segment_mesh.py — PartField 分割脚本

用法:
    python scripts/segment_mesh.py \
        --model_id  <modelId> \
        --num_clusters <int, 默认10> \
        --method  <agglomerative|kmeans, 默认agglomerative> \
        --models_dir <files/models 路径> \
        --ckpt  <模型权重路径>

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


def parse_args():
    parser = argparse.ArgumentParser(description='PartField mesh segmentation')
    parser.add_argument('--model_id',     required=True,  help='Model ID (folder name under models_dir)')
    parser.add_argument('--num_clusters', type=int, default=10, help='Target number of segments')
    parser.add_argument('--method',       default='agglomerative', choices=['agglomerative', 'kmeans'])
    parser.add_argument('--models_dir',   default=os.path.join(PROJECT_ROOT, 'files', 'models'))
    parser.add_argument('--ckpt',         default=os.path.join(PROJECT_ROOT, 'partfield-ckpt', 'model_objaverse.ckpt'),
                        help='Path to PartField checkpoint')
    return parser.parse_args()


# ──────────────────────────────────────────────────────────────────────────────
# 步骤 1 — 特征提取
# ──────────────────────────────────────────────────────────────────────────────
def extract_features(mesh_path: str, uid: str, feat_dir: str, ckpt_path: str):
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
    cfg.n_point_per_face        = 1000
    cfg.n_sample_each           = 10000
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
def run_clustering(feat_dir: str, uid: str, num_clusters: int, method: str):
    """
    读取 feat_dir 中的特征 NPY，运行聚类，返回:
      face_labels: np.ndarray (num_faces,)  整数标签
    """
    from sklearn.cluster import AgglomerativeClustering, KMeans

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

    print(f'[Clustering] 特征形状: {point_feat.shape}, 方法: {method}, 目标簇数: {num_clusters}')

    if method == 'kmeans':
        clustering = KMeans(n_clusters=num_clusters, random_state=0, n_init='auto')
        clustering.fit(point_feat)
        labels = clustering.labels_
    else:
        # Agglomerative — 需要面邻接矩阵
        # 动态导入 PartField-main 中的聚类工具
        partfield_main = os.path.join(PROJECT_ROOT, 'PartField-main')
        if partfield_main not in sys.path:
            sys.path.insert(0, partfield_main)
        from run_part_clustering import (
            construct_face_adjacency_matrix_ccmst,
            hierarchical_clustering_labels,
        )
        from partfield.utils import load_mesh_util

        mesh_ply = os.path.join(feat_dir, f'input_{uid}_0.ply')
        mesh = load_mesh_util(mesh_ply)

        adj = construct_face_adjacency_matrix_ccmst(
            mesh.faces, mesh.vertices, with_knn=True
        )
        clustering = AgglomerativeClustering(
            connectivity=adj, n_clusters=1
        ).fit(point_feat)
        hierarchical = hierarchical_clustering_labels(
            clustering.children_, point_feat.shape[0], max_cluster=num_clusters
        )
        # hierarchical[-1] 对应最多的簇数（max_cluster 个簇）
        labels = np.array(hierarchical[-1]) if hierarchical else np.zeros(len(point_feat), dtype=int)

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

    model_dir = os.path.join(args.models_dir, args.model_id)
    seg_dir   = os.path.join(model_dir, 'segments')
    meta_path = os.path.join(model_dir, 'meta.json')

    print(f'[PartField] 开始分割: {args.model_id}')
    print(f'[PartField] 方法: {args.method}, 目标簇数: {args.num_clusters}')

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

    t0 = time.time()
    extract_features(orig_file, uid, feat_dir, args.ckpt)
    print(f'[PartField] 特征提取完成，耗时 {time.time()-t0:.1f}s')

    # ── 聚类 ─────────────────────────────────────────────────────────────────
    t1 = time.time()
    face_labels = run_clustering(feat_dir, uid, args.num_clusters, args.method)
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
        'requestedClusters': args.num_clusters,
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
