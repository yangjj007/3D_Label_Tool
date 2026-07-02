# GitHub 工业级数据飞轮项目调研

## 调研结论

成熟的数据飞轮不是单点功能，而是一套闭环系统：数据进入、自动预标注、人工审核、质量门禁、版本发布、训练评估、线上反馈再回流。对 3D 模型多模态数据处理来说，最值得借鉴的不是某一个项目的 UI，而是它们共同强调的三件事：

1. **数据对象标准化**：每条样本必须能追溯到原始资产、视角证据、标注、审核、模型版本和质量指标。
2. **人机协同闭环**：模型负责预标注和风险排序，人负责修正、审核和高价值判断。
3. **Write-Audit-Publish**：候选数据先进入待审核分支或状态，只有通过 schema、质量、分布和人工抽检后，才能进入训练集发布版本。

## GitHub 项目矩阵

### 标注与人机协同

| 项目 | GitHub | 工业级设计点 | 对当前项目的借鉴 |
| --- | --- | --- | --- |
| Label Studio | [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio) | 开源多类型数据标注工具，支持图像、视频、音频、文本、时序等数据；README 提到多用户、多项目、云存储、ML 模型集成、预标注和 REST API 嵌入数据管线。 | 把当前 `模型 + segment + 截图 + prompt + label` 封装成统一任务对象，拆分 `prediction / annotation / review`，人工只做接受、拒绝、修正。 |
| CVAT | [cvat-ai/cvat](https://github.com/cvat-ai/cvat) | 视觉数据集生产平台，README 明确支持 image/video/3D point cloud、AI-assisted labeling、quality assurance、团队协作、analytics、SDK/CLI/REST API、20+ 导入导出格式。 | 借鉴 `Project -> Task -> Job -> Review` 层级，把 3D 模型标注拆成批次、样本、部件和审核任务；增加 issue、consensus、ground truth/honeypot 抽检思想。 |
| Argilla | [argilla-io/argilla](https://github.com/argilla-io/argilla) | AI 工程师和领域专家协作构建高质量数据集；用 `fields/questions/guidelines` 定义任务，适合 human feedback、LLM/RAG 反馈和专家审核。 | 给 3D 部件标注增加问题式 schema：部件名称、材质、功能、空间关系、可交互属性、置信度、是否需要复核。 |
| MONAI Label | [Project-MONAI/MONAILabel](https://github.com/Project-MONAI/MONAILabel) | 医学图像智能标注和学习系统，README 强调 server-client 架构、AI 辅助交互式标注、持续从用户交互中学习，并支持 3D Slicer/OHIF/CVAT 等 viewer。 | 借鉴“模型服务 + 标注前端 + 用户交互反馈”的闭环，把 PartField/VLM 推理做成可持续改进的标注服务，而不是一次性脚本。 |

### 数据巡检、错误发现与主动选样

| 项目 | GitHub | 工业级设计点 | 对当前项目的借鉴 |
| --- | --- | --- | --- |
| FiftyOne | [voxel51/fiftyone](https://github.com/voxel51/fiftyone) | README 强调可视化和标注数据、评估模型、提升数据/模型质量；适合做 visual AI 数据集工作台、模型错误分析和样本筛选。 | 建一个 3D 数据巡检台：同屏看模型、segment 高亮、多视角截图、VLM 标签、质量分和审核状态；按不确定性、重复、离群、模型失败选下一批样本。 |
| Cleanlab | [cleanlab/cleanlab](https://github.com/cleanlab/cleanlab) | README 说明它能自动检测 label errors、outliers、duplicates、多标注员共识、annotator quality，并建议要 label/re-label 的样本。 | 每轮训练后给样本生成 `label_issue_score`，把疑似错标、重复、离群、低一致性样本自动回流到复核队列。 |
| Snorkel | [snorkel-team/snorkel](https://github.com/snorkel-team/snorkel) | 用弱监督和 programmatic labeling 快速生成训练数据，README 强调把结构化方法引入手工训练数据创建和管理。 | 给 3D 标注加规则层：几何尺寸、材质先验、空间位置、视角一致性、类别共现、无效标签规则；输出弱标签、规则覆盖率、冲突率。 |

### 数据版本、质量门禁与发布

| 项目 | GitHub | 工业级设计点 | 对当前项目的借鉴 |
| --- | --- | --- | --- |
| DVC | [iterative/dvc](https://github.com/iterative/dvc) | README 强调 version data/models、lightweight pipelines、local experiment tracking、比较数据/代码/参数/指标，并可复现实验。 | 当前项目可引入 `dataset_version`：每次上传、分割、标注、过滤、训练都绑定数据版本、代码 commit、prompt 版本和模型版本。 |
| lakeFS | [treeverse/lakeFS](https://github.com/treeverse/lakeFS) | 把对象存储变成 Git-like 数据湖；README 强调 branch、commit、merge、rollback，以及 Write-Audit-Publish 和 hooks 质量门禁。 | 大规模 3D 文件可放对象存储，用分支表示 `raw`、`auto-label-candidate`、`reviewed`、`dataset-vN`；只有 QA 通过才 merge。 |
| Great Expectations / GX Core | [great-expectations/great_expectations](https://github.com/great-expectations/great_expectations) | 用 expectations 做数据质量规则、验证和报告，适合把数据契约变成自动检查。 | 建立 3D expectation suite：模型文件存在、segment 数量合理、截图齐全、label 不为空、ontology 合法、面数/体素指标在范围内。 |
| Evidently | [evidentlyai/evidently](https://github.com/evidentlyai/evidently) | README 说明它可 evaluate/test/monitor ML 和 LLM 系统，支持 100+ metrics、data drift、data quality、LLM judges、offline evals 和 live monitoring。 | 做数据飞轮监控面板：类别分布漂移、材质/复杂度分布漂移、无效标签率、人工接受率、VLM 幻觉率、复核通过率。 |
| Deepchecks | [deepchecks/deepchecks](https://github.com/deepchecks/deepchecks) | README 强调从 research 到 production 的数据/模型连续验证，支持 built-in checks、suites、CI 和 monitoring。 | 数据入库前自动跑“体检”：训练/验证泄漏、类别长尾、重复模型、冲突标签、弱切片、分割块异常。 |

### 编排、实验与模型生命周期

| 项目 | GitHub | 工业级设计点 | 对当前项目的借鉴 |
| --- | --- | --- | --- |
| MLflow | [mlflow/mlflow](https://github.com/mlflow/mlflow) | README 称其为 AI engineering platform，支持 debug、evaluate、monitor、optimize，并管理模型和数据访问；还覆盖 prompt management、evaluation、observability。 | 把每次 VLM 标注、PartField 分割、训练和评估都记录成 run：数据版本、prompt、模型、参数、指标、artifact、失败样本。 |
| Flyte | [flyteorg/flyte](https://github.com/flyteorg/flyte) | README 强调动态、可恢复 AI 编排，用 Python 协调 data、models、compute；适合大规模任务 DAG。 | 把 3D 流程拆成可重试任务：上传校验、分割、渲染、VLM 生成、质检、人工审核、训练、评估、发布。 |
| Kubeflow | [kubeflow/kubeflow](https://github.com/kubeflow/kubeflow) | README 说明它是 Kubernetes 上 AI 平台工具基础，覆盖 AI lifecycle，具有模块化、可扩展、可移植特点。 | 如果面试官问大规模生产化，可回答：训练、批量推理、模型服务和工作流可以迁到 K8s/Kubeflow 统一调度。 |
| Metaflow | [Netflix/metaflow](https://github.com/Netflix/metaflow) | README 说明它支持从 notebook 快速原型到可维护生产部署，统一 code、data、compute。 | 算法实验早期可用 Metaflow 把“3D 数据处理 notebook”沉淀成可复现 flow，再迁到 Flyte/Kubeflow。 |

### 3D / 多模态数据构建

| 项目 | GitHub | 工业级设计点 | 对当前项目的借鉴 |
| --- | --- | --- | --- |
| OpenScene | [pengsongyou/openscene](https://github.com/pengsongyou/openscene) | 3D open-vocabulary scene understanding；README 说明它提供预处理 3D&2D 数据、多视角 fused features，并把 2D image features 融合到 3D 点。 | 强化当前 `3D segment -> 多视角截图 -> 文本标签` 为可训练的 2D-3D feature 对齐：保留相机位、渲染参数、segment id 和多视角证据。 |
| ConceptFusion | [concept-fusion/concept-fusion](https://github.com/concept-fusion/concept-fusion) | 用 2D foundation model 的 mask/features，通过 RGB-D/SLAM 融合成 3D feature map，可支持文本查询和相似区域检索。 | 把“一次性标签”升级成“持续可查询的 3D 语义资产”：为 segment 保存 embedding，后续新类别可以文本查询而不是重标全量数据。 |
| OpenMask3D | [OpenMask3D/openmask3d](https://github.com/OpenMask3D/openmask3d) | 先预测 class-agnostic 3D instance masks，再聚合 posed RGB-D 多视角 CLIP crop 特征形成 per-mask embedding。 | 当前 PartField segment 可以继续升级成 instance/entity 层，保存每个实体的多视角 embedding、caption 和审核状态。 |
| Open3D-ML | [isl-org/Open3D-ML](https://github.com/isl-org/Open3D-ML) | Open3D 的 3D ML 扩展，README 覆盖 3D 数据处理、SemanticKITTI/KITTI 数据读取、语义分割、3D detection、训练/评估 pipeline。 | 借鉴标准 3D 数据集接口和训练 pipeline：模型、数据、pipeline 配置化，便于从标注工具衔接到训练评估。 |
| OpenPCDet | [open-mmlab/OpenPCDet](https://github.com/open-mmlab/OpenPCDet) | LiDAR 3D detection 工具箱，常见做法是数据集 converter、统一坐标/box 定义、GT database、augmentation、metric 分层。 | 如果项目扩展到点云/自动驾驶式 3D 检测，可借鉴 converter 和统一 box/坐标系，避免不同数据源格式互相污染。 |
| 3D-LLM | [UMass-Embodied-AGI/3D-LLM](https://github.com/UMass-Embodied-AGI/3D-LLM) | README 展示 Objaverse/ScanNet 等 3D 语言数据构建，包含多视角渲染、caption 生成、3D feature 构建。 | 当前项目的面试表达可以强调与成熟 3D LLM 数据构建一致：先多视角渲染，再生成语言，再把语言和 3D 特征/对象绑定。 |
| Cap3D | [crockwell/Cap3D](https://github.com/crockwell/Cap3D) | 面向 Objaverse/Objaverse-XL 的 3D object caption 数据生成，结合多视角渲染、captioning、image-text alignment 和 LLM 汇总。 | 借鉴“多视角 caption -> LLM 汇总 -> 质量筛选”的对象级描述生成流程，用在办公椅、桌子、灯具等资产。 |
| ULIP / ULIP-2 | [salesforce/ULIP](https://github.com/salesforce/ULIP) | 统一 language、image、point cloud 的对比学习，目标是把 3D backbone 对齐到图文语义空间。 | 数据飞轮不只产出文本标签，还可以产出 3D-image-text triplets，支撑后续检索、分类和指令数据。 |
| PointLLM | [InternRobotics/PointLLM](https://github.com/InternRobotics/PointLLM) | README 说明使用 Objaverse 彩色点云和 instruction-following 数据，包含 660K 点云、brief description 和 complex instruction 数据。 | 可借鉴大规模 3D 指令数据的样本结构：`point cloud/object id + description/instruction + train/val split + filtered version`。 |
| EmbodiedScan / MMScan | [InternRobotics/EmbodiedScan](https://github.com/InternRobotics/EmbodiedScan) | 面向 embodied AI 的 RGB-D、3D detection、occupancy、visual grounding 数据；MMScan 采用 VLM 初始化和人工纠错思路。 | 可把自动 VLM 标注、人审、benchmark 组织成一体化流程，特别适合展示“模型预标注 + 人类纠错”的工业闭环。 |
| SceneVerse | [scene-verse/sceneverse](https://github.com/scene-verse/sceneverse) | 整合 indoor scenes，使用 scene graph 与 LLM 生成 object/scene/referring language。 | 当前项目可从单部件标签扩展到关系语言：`扶手在坐垫两侧`、`脚轮连接底座末端`、`靠背支撑人体背部`。 |
| LLaVA-3D | [LLaVA-3D paper](https://arxiv.org/abs/2409.18125) | 公开论文展示将多视角 2D CLIP patch 与 3D position embedding 结合，进行 2D/3D joint instruction tuning。 | 面试中可强调：3D 多模态不一定先上重型 3D encoder，也可以复用强 2D LMM，再用几何位置和多视角证据补 3D 感知。 |

## 3D 多模态飞轮抽象

从 3D 专线项目可以抽象出一条更贴岗位的飞轮：

1. **采集层**：真实 scan、Objaverse 资产、CAD/GLB 模型、仿真轨迹统一成 `scene/object/frame/camera_pose/rgb/depth/pointcloud/mask/box/text`。
2. **自动弱标注层**：SAM/Mask2Former 做 mask，CLIP/BLIP/OpenSeg/VLM 做语义，LLM 生成 caption、QA、referring expression。
3. **3D 几何校验层**：用 depth、pose、多视角一致性把 2D 结果投回 3D，过滤遮挡、漂移、低置信和错位。
4. **实体图层**：把 point/mask/box/segment 合成 object id，再补属性、材质、关系、affordance、语言指令。
5. **训练层**：OpenScene 式 2D-3D feature fusion，ULIP 式 3D-image-text 对比预训练，PointLLM/3D-LLM 式 instruction tuning。
6. **反馈层**：caption、grounding、QA、open-vocab retrieval 的失败样本回流，触发重渲染、重标注、人审和难例挖掘。

这对当前项目的启发是：不要只沉淀最终标签，还要沉淀可复用的中间资产，如多视角图、segment mask、相机参数、per-segment embedding、prompt、审核记录和质量分。

## 成熟项目的共同设计模式

### 1. 统一样本 Manifest

不要只存散落文件路径。建议把每个 3D 多模态样本抽象成 manifest：

```json
{
  "sample_id": "office_chair_0001",
  "asset_uri": "models/office_chair/original.glb",
  "modalities": ["mesh", "rendered_views", "segment_masks", "text_label"],
  "segment_id": 7,
  "view_keys": ["main", "top", "side", "axial"],
  "annotation_uri": "labels/info.json",
  "prompt_version": "vlm_prompt_v3",
  "prelabel_model": "gpt-4o",
  "review_status": "accepted",
  "quality": {
    "label_issue_score": 0.08,
    "view_completeness": 1.0,
    "geometry_score": 0.91
  },
  "dataset_version": "3d_multimodal_v1.2"
}
```

### 2. Prediction / Annotation / Review 分层

成熟平台很少把模型输出直接当最终标签。建议拆成三层：

- `prediction`：VLM/PartField/规则系统给出的候选标签、置信度、模型版本。
- `annotation`：人工或自动流程采纳后的正式标注。
- `review`：复核结论、问题类型、审核人、抽检策略和修改历史。

这样面试时可以回答“模型不是自己生成自己裁判”，而是先生成候选，再经过规则和人工审核进入发布集。

### 3. Write-Audit-Publish 状态机

借鉴 lakeFS 的思路，把候选数据和正式数据隔离：

```text
raw
  -> preprocessed
  -> segmented
  -> pre_labeled
  -> reviewed
  -> qa_passed
  -> dataset_released
  -> training_used
  -> production_feedback
```

每个状态都有准入条件：比如 `qa_passed` 必须满足截图齐全、标签非空、segment 对齐、几何指标合法、抽检通过。

### 4. 主动选样与错误回流

借鉴 FiftyOne、Cleanlab、Evidently：

- 模型不确定性高的样本优先复核。
- VLM 标签太短、太泛、命中无效词的样本回流。
- segment 数量异常、体素指标异常的样本回流。
- 人工多次修改的类别作为下一轮重点抽样。
- 训练集上弱切片表现差的类别/物体形态进入下一批标注任务。

### 5. 数据版本和实验血缘

借鉴 DVC、MLflow：

每次训练或评估必须能回答：

- 用的是哪个原始数据版本？
- 用的是哪个标注版本？
- 用的是哪个 prompt 版本？
- 用的是哪个 VLM/分割模型版本？
- 失败样本和人工修正样本在哪里？
- 模型指标是在哪个 dataset release 上得到的？

### 6. 数据质量指标面板

面试时可以把数据质量指标讲成四组：

- **完整性**：文件是否存在、截图是否齐全、segment 是否有标签、label 是否为空。
- **一致性**：3D segment 和 2D 视角是否对齐、跨视角描述是否冲突、ontology 是否一致。
- **可靠性**：人工接受率、复核通过率、无效标签率、label issue score。
- **分布与漂移**：类别分布、材质分布、复杂度分布、长尾类别覆盖率、重复率。

## 对当前项目的落地路线

### 短期可讲成“已具备雏形”

- 已经有 3D 文件入库、分块上传和状态元数据。
- 已经有 PartField 分割和 segment 级可视化。
- 已经有多视角截图和 VLM 标签生成。
- 已经有无效标签过滤、VVD/VFC/VSC 复杂度指标和人工编辑。
- 已经有 `segId -> screenshots -> prompt -> label` 的证据链雏形。

### 中期可以说“按工业飞轮补齐”

- 增加统一 manifest。
- 增加 prediction/annotation/review 三层数据结构。
- 增加数据版本号、prompt 版本号、模型版本号。
- 增加 QA gate：完整性、对齐、分布、重复、人工抽检。
- 增加主动选样队列：不确定、异常、长尾、失败样本优先复核。
- 增加数据发布状态：candidate -> accepted -> released。

### 面试表达升级版

我会把项目从“3D 标注工具”升级表述为“面向 3D 多模态训练数据的数据飞轮原型”。它的核心不是单次生成标签，而是把原始 3D 资产经过自动分割、多视角渲染、VLM 预标注、人机协同审核、质量门禁和版本发布，变成可持续迭代的数据资产。成熟平台如 Label Studio、CVAT、FiftyOne、Cleanlab、DVC、lakeFS 和 MLflow 给我的启发是：工业级数据系统一定要把候选预测、人工标注、审核记录、数据版本和模型指标拆开管理，只有这样才能形成稳定的数据闭环。

## 参考来源

- [HumanSignal/label-studio](https://github.com/HumanSignal/label-studio)
- [cvat-ai/cvat](https://github.com/cvat-ai/cvat)
- [argilla-io/argilla](https://github.com/argilla-io/argilla)
- [Project-MONAI/MONAILabel](https://github.com/Project-MONAI/MONAILabel)
- [voxel51/fiftyone](https://github.com/voxel51/fiftyone)
- [cleanlab/cleanlab](https://github.com/cleanlab/cleanlab)
- [snorkel-team/snorkel](https://github.com/snorkel-team/snorkel)
- [iterative/dvc](https://github.com/iterative/dvc)
- [treeverse/lakeFS](https://github.com/treeverse/lakeFS)
- [great-expectations/great_expectations](https://github.com/great-expectations/great_expectations)
- [evidentlyai/evidently](https://github.com/evidentlyai/evidently)
- [deepchecks/deepchecks](https://github.com/deepchecks/deepchecks)
- [mlflow/mlflow](https://github.com/mlflow/mlflow)
- [flyteorg/flyte](https://github.com/flyteorg/flyte)
- [kubeflow/kubeflow](https://github.com/kubeflow/kubeflow)
- [Netflix/metaflow](https://github.com/Netflix/metaflow)
- [pengsongyou/openscene](https://github.com/pengsongyou/openscene)
- [isl-org/Open3D-ML](https://github.com/isl-org/Open3D-ML)
- [UMass-Embodied-AGI/3D-LLM](https://github.com/UMass-Embodied-AGI/3D-LLM)
- [InternRobotics/PointLLM](https://github.com/InternRobotics/PointLLM)
