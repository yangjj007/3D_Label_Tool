# PartField 项目核心模块概览

> PartField: Learning 3D Feature Fields for Part Segmentation and Beyond [ICCV 2025]  
> 基于前馈模型学习 3D 部件特征场，用于部件分割及更多下游任务。

---

## 一、项目简介

PartField 是一个前馈模型，能够从 3D 形状预测部件级特征场（part-based feature field）。学习到的特征可通过聚类得到高质量部件分割，在质量和速度上优于开放世界的 3D 部件分割方法。支持 Mesh、点云、Gaussian Splats 等多种输入形式，特征在形状间具有一致性，可用于共分割、交互选择、对应关系等任务。

---

## 二、项目结构与入口脚本

```
PartField-main/
├── partfield_inference.py      # 特征提取主入口
├── run_part_clustering.py      # 部件聚类分割（Mesh）
├── run_part_clustering_remesh.py # 重网格后的聚类
├── compute_metric.py           # 评估指标计算
├── configs/                    # 配置文件
├── partfield/                  # 核心源码
├── applications/               # 应用与交互工具
└── data/                       # 数据目录
```

### 主流程

1. **特征提取** → `partfield_inference.py`（使用 PyTorch Lightning）
2. **部件分割** → `run_part_clustering.py`（Agglomerative / K-Means）
3. **评估** → `compute_metric.py`（如 mIoU）

---

## 三、输出文件格式

### 3.1 特征提取输出（`exp_results/partfield_features/[result_name]/`）

| 文件名 | 格式 | 说明 |
|--------|------|------|
| `input_{uid}_{view_id}.ply` | PLY | 输入 mesh 的 PLY 副本（顶点、三角面），供后续聚类读取 |
| `part_feat_{uid}_{view_id}.npy` | NumPy | 部件特征，形状 `(N, C)`。点云时 N=点数；Mesh 时为面内采样点聚合后按面数 `(num_faces, 448)` |
| `part_feat_{uid}_{view_id}_batch.npy` | NumPy | 大 mesh 时的批量特征，形状与上类似 |
| `feat_pca_{uid}_{view_id}.ply` | PLY | PCA 降维后的特征可视化点云（含 RGB 颜色） |

- `uid`：模型 ID（通常为文件名不含扩展名）
- `view_id`：视角 ID，默认 0

### 3.2 分割聚类输出（`exp_results/clustering/[dump_dir]/`）

输出目录下有两个子目录：

**`cluster_out/`** — 纯标签数据  
- 文件：`{uid}_{view_id}_{num_cluster}.npy`
- 格式：NumPy 数组，形状 `(M, 1)` 或 `(M,)`
- 含义：每个面（Mesh）或每个点（点云）的部件标签，整数 0, 1, 2, ...
- `num_cluster`：部件数量；Agglomerative 时为层次剪枝后的数量

**`ply/`** — 可视化网格/点云（`export_mesh=True` 时生成）  
- 文件：`{uid}_{view_id}_{num_cluster}.ply`
- 格式：PLY，带顶点颜色
- 含义：同一部件共享颜色（`tab20` 配色），便于直接查看分割结果

### 3.3 标签文件的使用

- **NumPy 标签**：`np.load('xxx.npy')` 得到形状为 `(num_faces,)` 或 `(num_points,)` 的整数数组
- **打包到 OBJ**：`applications/pack_labels_to_obj.py` 可将「每行一个整数」的文本标签写入 OBJ 的 per-face UV，用作标量场可视化

---

## 四、核心模块概览

### 4.1 配置模块 `partfield/config/`

- **defaults.py**：默认配置
  - Triplane（分辨率、通道数等）
  - PVCNN
  - 数据集与训练参数
  - 损失函数等
- **解析**：基于 yacs 的配置解析

### 4.2 数据加载 `partfield/dataloader.py`

| 数据集类 | 用途 |
|----------|------|
| `Demo_Dataset` | 基础演示（支持 mesh .obj/.glb 与点云 .ply） |
| `Demo_Remesh_Dataset` | 重网格后的演示数据 |
| `Correspondence_Demo_Dataset` | 对应关系演示 |

### 4.3 模型训练器 `partfield/model_trainer_pvcnn_only_demo.py`

- **Model**：PyTorch Lightning 模型
  - 使用 PVCNN 编码器 `TriPlanePC2Encoder`
  - Triplane Transformer 做特征增强
  - VanillaMLP 做 SDF 解码
  - 在前向中提取并保存部件特征到 `exp_results/partfield_features/`

### 4.4 模型架构 `partfield/model/`

#### Triplane 模块 `triplane.py`

- **TriplaneTransformer**：对 triplane 特征做下采样 → Transformer → 上采样
- **project_onto_planes / sample_from_planes**：3D 点投影到三个正交平面并采样
- **get_grid_coord**：网格坐标生成

#### PVCNN 模块 `PVCNN/`

- **TriPlanePC2Encoder** (`encoder_pc.py`)：点云到 Triplane 的编码器，核心特征提取
- **sample_triplane_feat**：在 Triplane 上采样特征
- **pv_module/**：PVCNN 子模块
  - `voxelization.py`：体素化
  - `pvconv.py`：PVConv
  - `ball_query.py`：Ball Query
  - `pointnet.py`：PointNet 相关层

#### UNet 模块 `UNet/`

- **ResidualUNet3D**：3D 残差 UNet，用于体积特征处理

#### 模型工具 `model_utils.py`

- **VanillaMLP**：多层感知机，用作 SDF 解码器

### 4.5 聚类算法（`run_part_clustering.py` 及相关逻辑）

- `construct_face_adjacency_matrix_naive`：基础面邻接矩阵
- `construct_face_adjacency_matrix_facemst`：基于面 MST 的邻接
- `construct_face_adjacency_matrix_ccmst`：基于连通分量 MST 的邻接
- `hierarchical_clustering_labels`：层次聚类标签
- `solve_clustering`：聚类主流程，支持 Agglomerative 与 K-Means

### 4.6 工具 `partfield/utils.py`

- **load_mesh_util**：网格加载工具（支持 .obj, .glb 等）

---

## 五、应用模块 `applications/`

| 脚本 | 功能 |
|------|------|
| `single_shape.py` | 单形状特征可视化与分割（PCA、特征维度、聚合聚类、K-Means） |
| `shape_pair.py` | 形状对共分割与特征探索 |
| `multi_shape_cosegment.py` | 多形状共分割（少样本标注、监督模式） |
| `run_smooth_functional_map.py` | 3D 对应关系计算 |
| `pack_labels_to_obj.py` | 将分割标签打包到 OBJ 模型 |

---

## 六、技术要点

1. **Triplane 表示**：三个正交平面的特征表示，便于 3D 几何与语义的编码与解码
2. **PVCNN 编码**：点云体素卷积网络，高效处理非均匀点云
3. **Transformer 增强**：Triplane Transformer 提升部件级特征判别力
4. **多模态输入**：Mesh (.obj, .glb)、点云 (.ply)、Gaussian Splats
5. **聚类策略**：
   - Mesh：Agglomerative（依赖面邻接）+ 可选 MST 邻接构造
   - 点云：K-Means
6. **复杂网格处理**：支持预处理、重网格、KNN-MST 邻接等，应对多连通分量与较差拓扑

---

## 七、依赖概览

- **深度学习**：PyTorch 2.4, Lightning 2.2, torch-scatter
- **几何处理**：trimesh, libigl, open3d, pymeshlab, mesh2sdf, tetgen, potpourri3d
- **可视化**：polyscope, vtk
- **其他**：h5py, yacs, scikit-learn, einops, plyfile 等

---

## 八、参考资料

- **论文**：[PartField: Learning 3D Feature Fields for Part Segmentation and Beyond](https://arxiv.org/pdf/2504.11451)
- **项目**：[NVIDIA PartField Release](https://research.nvidia.com/labs/toronto-ai/partfield-release/)
- **代码参考**：OpenLRM, PyTorch 3D UNet, PVCNN, SAMPart3D

