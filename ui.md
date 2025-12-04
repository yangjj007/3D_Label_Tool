# Three.js 3D模型编辑系统 - 用户界面逻辑概述

## 项目概述

这是一个基于 Three.js + Vue3 + Element-Plus 开发的 3D 模型可视化编辑系统，提供完整的 3D 模型编辑、预览和导出功能。

## 主要界面结构

### 1. 主编辑界面 (`src/views/modelEdit/index.vue`)

#### 头部操作栏
- **系统信息显示**: 显示系统版本信息和作者信息
- **模型库按钮**: 跳转到模型库页面 (`src/views/modelBase/index.vue`)
- **数据保存**: 保存当前模型配置到模板库
- **效果预览**: 在新标签页预览编辑效果 (`src/views/modelPreview/index.vue`)
- **导出功能**: 支持封面下载和模型导出 (GLB/GLTF/USDZ格式)
- **嵌入代码**: 生成模型的嵌入代码 (`src/components/ImplantCodeDialog/index.vue`)
- **全屏控制**: 浏览器全屏切换

#### 左侧模型选择面板 (`src/components/ModelChoose/index.vue`)
- **场景编辑模式切换**:
  - 单模型模式: 通过点击加载不同模型
  - 多模型模式: 通过拖拽添加多个模型
  - 几何体模式: 通过拖拽添加几何体模型
- **模型分类**:
  - 普通模型: 静态3D模型展示
  - 动画模型: 带动画效果的模型
  - 几何体模型: 基础几何形状 (立方体、球体等)
- **外部模型上传**: 支持 .glb/.obj/.gltf/.fbx/.stl 格式文件上传

#### 中间3D视图区域
- **模型展示容器**: Three.js 渲染区域 (`#model`)
- **相机控制**: 居中重置按钮
- **拖拽支持**: 支持模型拖拽放置和几何体添加

#### 右侧编辑面板 (`src/components/ModelEditPanel/index.vue`)
包含10个功能标签页，每个对应不同的编辑功能：

### 2. 编辑功能面板详情

#### 背景编辑 (`src/components/ModelEditPanel/EditBackground.vue`)
- 背景类型选择: 纯色背景、图片背景、视频背景
- 背景图片上传和配置
- 视频背景设置和播放控制

#### 材质编辑 (`src/components/ModelEditPanel/EditMaterial.vue`)
- 材质类型切换: 基础材质、标准材质、物理材质等
- 材质列表选择: 显示模型的所有材质组件
- 材质属性配置:
  - 材质颜色选择器
  - 透明度调节 (0-1)
  - 金属度调节
  - 粗糙度调节
  - 环境光遮蔽
  - 法线贴图
  - 视差贴图
  - 深度写入开关
  - 网格显示开关

#### 后期/操作 (`src/components/ModelEditPanel/EditLaterStage.vue`)
- 后期效果开关控制
- 效果类型选择: 晕影、色差、像素化、噪点等
- 效果参数调节

#### 灯光配置 (`src/components/ModelEditPanel/EditLight.vue`)
- 灯光类型选择: 环境光、平行光、点光源、聚光灯
- 灯光属性调节:
  - 颜色设置
  - 强度调节
  - 位置控制
  - 目标设置
  - 阴影开关
  - 阴影参数配置

#### 模型动画 (`src/components/ModelEditPanel/EditAnimation.vue`)
- 动画列表显示
- 动画播放控制: 播放/暂停/停止
- 动画速度调节
- 动画循环设置

#### 辅助线/轴配置 (`src/components/ModelEditPanel/EditAttribute.vue`)
- 坐标轴显示开关
- 网格辅助线开关
- 包围盒显示
- 变换控制器配置

#### 几何体模型配置 (`src/components/ModelEditPanel/EditGeometry.vue`)
- 几何体材质列表管理
- 几何体参数编辑:
  - 尺寸调节 (宽度、高度、深度)
  - 分段数设置
  - 曲率参数
  - 几何体删除功能

#### 标签配置 (`src/components/ModelEditPanel/EditTags.vue`)
- 3D标签类型选择: 支持多种图标类型
- 标签拖拽添加: 可拖拽多个标签到模型上
- 标签列表管理
- 标签属性编辑:
  - 容器尺寸调节
  - 字体大小设置
  - 文本内容编辑
  - 位置偏移控制
  - 标签删除功能

#### 多模型配置 (`src/components/ModelEditPanel/EditMoreModel.vue`)
- 多模型列表显示
- 选中模型编辑:
  - 模型旋转控制 (X/Y/Z轴)
  - 模型位置调节 (X/Y/Z轴)
  - 模型缩放设置
  - 模型删除功能

#### 着色器配置 (`src/components/ModelEditPanel/EditShader.vue`)
- 着色器类型选择
- 着色器参数调节
- 自定义着色器代码编辑

### 3. 模型库界面 (`src/views/modelBase/index.vue`)

#### 左侧模板库
- 模型模板列表显示
- 拖拽添加模型到画布

#### 右侧拖拽画布
- 支持多个模型组件拖拽放置
- 可调整大小和位置
- 右键菜单: 删除功能
- 键盘快捷键: Delete键删除选中项

### 4. 预览界面 (`src/views/modelPreview/index.vue`)
- 应用所有编辑配置的模型预览
- 使用动态组件渲染 (`src/utils/initThreeTemplate.jsx`)

### 5. VR预览界面 (`src/views/vrPage/index.vue`)
- VR模式模型展示
- 使用专用VR渲染器 (`src/utils/vrRenderModel.js`)

## 核心工具类和配置

### 渲染引擎
- **renderModel** (`src/utils/renderModel.js`): 主3D渲染引擎，负责模型加载、场景管理、交互控制
- **vrRenderModel** (`src/utils/vrRenderModel.js`): VR专用渲染器
- **initThreeTemplate** (`src/utils/initThreeTemplate.jsx`): 预览页面动态组件生成

### 编辑模块
- **modelEditClass** (`src/utils/modelEditClass/`): 各功能编辑模块
  - `animationModules.js`: 动画控制模块
  - `backgroundModules.js`: 背景设置模块
  - `geometryModules.js`: 几何体编辑模块
  - `lightModules.js`: 灯光配置模块
  - `materialModules.js`: 材质编辑模块
  - `shaderModules.js`: 着色器模块
  - `stageFlowModules.js`: 后期效果模块
  - `tagsModules.jsx`: 3D标签模块
  - `manyModelModules.js`: 多模型管理模块

### 状态管理
- **Pinia Store** (`src/store/meshEditStore.js`): 全局状态管理，存储模型API实例和编辑状态

### 配置管理
- **常量定义** (`src/config/constant.js`): 系统常量和缓存键
- **模型配置** (`src/config/model.js`): 内置模型列表和配置

## 交互逻辑

### 模型加载流程
1. 用户选择模型 → 触发加载动画
2. 调用 `renderModel.init()` 初始化Three.js场景
3. 加载模型文件并解析
4. 初始化各编辑模块
5. 绑定事件监听器

### 编辑流程
1. 用户选择编辑标签页
2. 对应组件挂载并获取当前模型状态
3. 用户调整参数 → 实时更新Three.js场景
4. 配置保存到本地存储

### 拖拽交互
- **几何体添加**: 从左侧面板拖拽到3D视图
- **多模型添加**: 从左侧面板拖拽到3D视图
- **标签添加**: 从标签面板拖拽到3D视图
- **模型库拖拽**: 从模型库拖拽组件到画布

## 响应式设计

- **移动端适配**: 支持触摸交互和移动端优化
- **自适应布局**: 基于视口大小的响应式布局
- **性能优化**: 懒加载、对象池复用、防抖节流

## 数据持久化

- **本地存储**: 使用IndexedDB存储大型数据
- **配置缓存**: 自动保存用户编辑状态
- **模板系统**: 支持模型配置的保存和复用

这个系统提供了完整的3D模型编辑工作流，从模型导入到最终导出，支持多种编辑模式和丰富的可视化效果配置。
