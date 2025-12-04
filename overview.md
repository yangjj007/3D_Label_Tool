# Three.js 3D模型可视化编辑系统 - 项目架构概述

## 项目简介

这是一个基于 **Vue 3** + **Three.js** + **Element Plus** 开发的3D模型可视化编辑系统，提供完整的3D模型加载、编辑、预览和导出功能。作者：answer，当前使用 Three.js 版本：0.179.0。

## 技术栈

### 前端框架
- **Vue 3** (Composition API) - 现代化的前端框架
- **Element Plus** - Vue 3 企业级UI组件库
- **Vue Router 4** - 单页面应用路由管理
- **Pinia** - Vue 3 官方状态管理库

### 3D 引擎与工具
- **Three.js 0.179.0** - 主流 WebGL 3D 引擎
- **Vite** - 现代前端构建工具
- **SCSS** - CSS 预处理器

### 开发工具链
- **ESLint** + **Prettier** - 代码规范检查
- **Husky** + **lint-staged** - Git 提交规范
- **Cypress** - E2E 测试框架

## 项目结构

```
threejs-3dmodel-edit/
├── public/                    # 静态资源
│   ├── draco/                # Draco 压缩库
│   ├── threeFile/            # 3D模型文件 (GLB/GLTF)
│   ├── image/                # 界面图片资源
│   └── favicon.ico
├── src/                      # 源码目录
│   ├── components/           # 组件目录
│   │   ├── ModelEditPanel/   # 编辑面板组件
│   │   ├── ModelChoose/      # 模型选择器
│   │   ├── Loading/          # 加载组件
│   │   └── ...
│   ├── layouts/              # 布局组件
│   │   ├── EditView.vue      # 编辑视图布局
│   │   └── VrView.vue        # VR视图布局
│   ├── views/                # 页面视图
│   │   ├── modelEdit/        # 模型编辑页面
│   │   ├── modelPreview/     # 模型预览页面
│   │   ├── modelIframe/      # 内嵌页面
│   │   ├── modelBase/        # 模型库页面
│   │   └── vrPage/           # VR页面
│   ├── utils/                # 工具函数
│   │   ├── modelEditClass/   # 3D编辑核心模块
│   │   ├── renderModel.js    # 3D渲染引擎
│   │   ├── storage.js        # 本地存储
│   │   └── ...
│   ├── store/                # 状态管理
│   │   ├── pinia.js          # Pinia配置
│   │   └── meshEditStore.js  # 网格编辑状态
│   ├── config/               # 配置文件
│   │   ├── constant.js       # 常量定义
│   │   └── model.js          # 模型配置
│   ├── style/                # 全局样式
│   ├── router/               # 路由配置
│   └── main.js               # 应用入口
├── tests/                    # 测试目录
│   └── e2e/                  # E2E测试
└── 配置文件 (package.json, vite.config.js 等)
```

## 核心架构

### 1. 应用架构

本项目采用 **组件化架构** + **模块化设计**，主要分为以下几个层次：

#### **表现层 (Presentation Layer)**
- **路由层**: Vue Router 管理页面导航
- **布局层**: EditView 和 VrView 两个主要布局
- **组件层**: 细粒度的UI组件和功能组件

#### **业务逻辑层 (Business Logic Layer)**
- **状态管理**: Pinia 统一管理应用状态
- **模型编辑**: modelEditClass 模块集合处理各种编辑功能
- **渲染引擎**: renderModel 类封装 Three.js 核心功能

#### **数据层 (Data Layer)**
- **本地存储**: IndexedDB + localStorage 数据持久化
- **模型数据**: 支持多种3D模型格式的数据处理

### 2. 3D渲染架构

#### **核心类：renderModel**
位于 `src/utils/renderModel.js`，是整个3D渲染系统的核心，封装了：

- **场景管理**: Three.js Scene、Camera、Renderer
- **模型加载**: 支持 GLTF/GLB/OBJ/FBX/STL 等格式
- **控制器**: OrbitControls 轨道控制器
- **后期处理**: EffectComposer、OutlinePass、BloomPass 等
- **事件系统**: 模型交互、拖拽、选择等

#### **编辑模块系统**
位于 `src/utils/modelEditClass/`，采用模块化设计：

```javascript
// 模块分类
├── helperModules.js      // 辅助工具
├── geometryModules.js    // 几何体系统
├── manyModelModules.js   // 多模型管理
├── stageFlowModules.js   // 后期效果
├── animationModules.js   // 动画系统
├── tagsModules.jsx       // 标注系统
├── shaderModules.js      // 着色器系统
├── backgroundModules.js  // 背景系统
├── lightModules.js       // 灯光系统
└── materialModules.js    // 材质系统
```

### 3. 状态管理架构

#### **Pinia Store 设计**
- **useMeshEditStore**: 管理网格编辑相关状态
- **useIndexedDBStore**: 管理 IndexedDB 数据库操作

#### **状态流转**
```
用户操作 → 组件事件 → Pinia Actions → renderModel 方法 → Three.js API → 视图更新
```

## 主要功能模块

### 1. 模型编辑功能

#### **基础编辑**
- **背景设置**: 纯色、渐变、图片、视频背景
- **材质编辑**: 颜色、纹理、透明度、法线贴图等
- **灯光控制**: 方向光、点光源、聚光灯参数调节
- **相机控制**: 轨道控制器、视角重置

#### **高级编辑**
- **几何体操作**: 添加基础几何体 (立方体、球体、圆柱等)
- **多模型管理**: 加载多个3D模型并独立控制
- **动画系统**: 模型动画播放控制
- **后期效果**: 轮廓线、泛光、FXAA抗锯齿等
- **3D标签**: 在模型上添加文本标注
- **着色器**: 自定义GLSL着色器效果

### 2. 数据管理

#### **模型库系统**
- 内置模型库管理
- 自定义模型上传
- 配置数据保存和加载
- IndexedDB 本地存储

#### **导出功能**
- **GLB/GLTF**: 标准3D模型格式导出
- **USDZ**: Apple AR格式导出
- **场景封面**: 渲染结果截图下载

### 3. 用户界面

#### **编辑界面**
- 左侧：模型选择面板
- 中间：3D渲染视口
- 右侧：属性编辑面板

#### **预览界面**
- 全屏3D展示
- VR模式支持
- 内嵌页面集成

## 技术特点

### 1. 性能优化
- **DRACO压缩**: 减小3D模型文件大小
- **LOD系统**: 视距剔除优化渲染性能
- **对象池**: 复用Three.js对象减少GC压力

### 2. 用户体验
- **响应式设计**: 自适应不同屏幕尺寸
- **拖拽交互**: 支持拖拽添加模型和几何体
- **实时预览**: 编辑即时反馈
- **加载进度**: 模型加载进度条显示

### 3. 扩展性
- **模块化架构**: 易于添加新功能模块
- **插件系统**: 支持自定义着色器和效果
- **配置驱动**: 通过配置文件扩展功能

## 部署和构建

### 开发环境
```bash
npm run dev          # 启动开发服务器
npm run serve        # 生产环境预览
```

### 构建部署
```bash
npm run build        # 生产环境构建
npm run build:pro    # 生产环境完整构建
```

### 代码质量
```bash
npm run lint         # ESLint 检查
npm run test:e2e     # E2E 测试
```

## 总结

这是一个功能完整、架构清晰的3D模型编辑系统，采用了现代前端技术栈，具有良好的可维护性和扩展性。通过模块化设计，将复杂的3D编辑功能拆分为独立模块，每个模块职责清晰，易于开发和维护。该系统不仅提供了丰富的3D编辑功能，还具备良好的用户体验和性能表现。
