# 3D模型标注系统 - 服务器存储版本部署指南

## 系统概述

本系统已升级为服务器端存储架构，支持：

- ✅ 模型文件服务器端存储（区分未打标/已打标）
- ✅ 分块上传/下载大文件（支持断点续传）
- ✅ 分页文件列表管理
- ✅ 批量打标流水线（自动预加载下一批次）
- ✅ IndexedDB临时工作区（减少服务器压力）

## 快速开始

### 1. 安装依赖

```bash
# 使用pnpm（推荐）
pnpm install

# 或使用npm
npm install
```

### 2. 配置环境变量

复制环境变量模板：

```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```

编辑 `.env` 文件（开发环境默认配置即可）：

```env
VITE_API_BASE_URL=http://localhost:30001/api
VITE_CHUNK_SIZE=10485760
VITE_DEFAULT_BATCH_SIZE=10
VITE_MAX_CONCURRENT_TAGS=3
```

### 3. 启动服务

**开发环境 - 同时启动前后端：**

```bash
npm run dev:full
```

**或分别启动：**

```bash
# 终端1：启动前端
npm run serve

# 终端2：启动后端
npm run server
```

服务地址：
- 前端：http://localhost:5173
- 后端：http://localhost:30001

## 工作流程说明

### 上传阶段

1. 用户通过"批量上传"或单个上传功能上传模型文件
2. 文件通过分块上传到服务器 `files/raw_files/` 目录
3. 支持断点续传，上传失败可继续

### 批量打标阶段

1. 点击"批量打标"按钮
2. 系统自动加载当前页的raw文件到IndexedDB工作区
3. 同时预加载下一页文件（提高效率）
4. 并发处理当前批次的文件（可配置并发数）
5. 每个文件处理完成后：
   - 上传到服务器 `files/labeled_files/` 目录
   - 从IndexedDB删除临时文件
6. 当前批次完成后，提示是否继续下一批次
7. 循环直到所有文件处理完成

### 查看和管理

- 切换文件类型：未打标/已打标/全部
- 分页浏览文件列表
- 查看文件是否在工作区（显示"工作区"标签）
- 按需加载文件到工作区
- 删除服务器文件

## 目录结构

```
3D_Label_Tool/
├── server/
│   ├── index.js              # Express后端服务
│   └── README.md             # 服务器部署详细文档
├── src/
│   ├── utils/
│   │   ├── chunkedUpload.js      # 分块上传工具
│   │   ├── chunkedDownload.js    # 分块下载工具
│   │   ├── serverApi.js          # 服务器API封装
│   │   └── filePersistence.js    # IndexedDB管理（已更新）
│   ├── components/
│   │   ├── FileList/index.vue    # 文件列表（已改造为分页）
│   │   └── ModelChoose/index.vue # 模型选择器（已集成服务器上传）
│   └── views/
│       └── modelEdit/index.vue   # 编辑页面（已集成批量打标流水线）
├── files/                    # 服务器文件存储
│   ├── raw_files/            # 未打标文件
│   └── labeled_files/        # 已打标文件
├── temp-chunks/              # 临时分块文件
├── .env.example              # 环境变量模板
├── ecosystem.config.js       # PM2配置文件
└── DEPLOYMENT.md             # 本文档
```

## 核心功能说明

### 1. 分块上传/下载

- **块大小**：默认10MB，可通过环境变量配置
- **并发控制**：最多3个块同时上传/下载
- **断点续传**：上传失败后可继续
- **进度显示**：实时显示上传/下载进度

### 2. 分页文件列表

- **每页数量**：可配置（5/10/20/50）
- **文件类型过滤**：raw/labeled/all
- **状态显示**：未打标/已打标/工作区
- **按需加载**：点击"加载"按钮才下载到IndexedDB

### 3. 批量打标流水线

- **预加载机制**：处理当前批次时自动预加载下一批次
- **并发处理**：可配置1-8个文件同时处理
- **自动保存**：打标完成后自动上传到服务器
- **自动清理**：保存后自动从IndexedDB删除
- **批次管理**：支持暂停和继续

### 4. IndexedDB临时工作区

- **临时标记**：所有从服务器下载的文件标记为临时
- **批次号**：每个批次的文件有对应的批次号
- **自动清理**：打标完成后自动清理当前批次
- **空间优化**：不保存已上传服务器的文件

## 生产环境部署

详细部署说明请参考：[server/README.md](server/README.md)

简要步骤：

1. 构建前端：`npm run build:pro`
2. 配置生产环境变量（`.env.production`）
3. 使用PM2启动后端：`pm2 start ecosystem.config.js`
4. 配置Nginx反向代理
5. 设置SSL证书（可选）

## 常见问题

### Q1: 文件上传失败

**A:** 检查以下几点：
- 服务器端口30001是否正常运行
- 网络连接是否正常
- 磁盘空间是否充足
- 文件格式是否支持（.glb, .gltf, .obj, .fbx, .stl）

### Q2: 批量打标时文件加载慢

**A:** 
- 减少每页文件数量（调整pageSize）
- 检查网络带宽
- 服务器端可以考虑使用SSD提高读写速度

### Q3: IndexedDB空间不足

**A:**
- 系统会自动清理已打标的文件
- 可以手动清理临时文件（在浏览器开发者工具中）
- IndexedDB限制通常为几GB，足够临时使用

### Q4: 服务器文件找不到

**A:**
- 检查files目录权限
- 确认文件是否真的上传成功
- 查看服务器日志：`pm2 logs 3d-label-server`

## 性能优化建议

1. **服务器配置**
   - CPU: 至少2核
   - 内存: 至少4GB
   - 存储: SSD推荐，至少100GB

2. **网络优化**
   - 使用CDN加速静态资源
   - 启用Gzip压缩
   - 配置合理的缓存策略

3. **应用优化**
   - 适当调整块大小（较快网络可增大到20MB）
   - 控制并发数（避免过载）
   - 定期清理旧文件

## 备份建议

重要数据备份：

```bash
# 备份files目录
tar -czf backup-$(date +%Y%m%d).tar.gz files/

# 定期备份（crontab示例）
0 2 * * * cd /path/to/3D_Label_Tool && tar -czf backup-$(date +\%Y\%m\%d).tar.gz files/
```

## 技术栈

- **前端**: Vue3 + Vite + Element Plus + Three.js
- **后端**: Node.js + Express + Multer
- **存储**: 
  - 服务器端: 文件系统
  - 客户端: IndexedDB（临时）
- **通信**: HTTP/REST API + 分块传输

## 更新日志

### v2.0.0 (2024-12-08)

- ✨ 新增服务器端存储架构
- ✨ 支持分块上传/下载大文件
- ✨ 文件列表改为分页模式
- ✨ 批量打标流水线优化
- ✨ IndexedDB作为临时工作区
- 🐛 修复大文件上传内存溢出问题
- 📝 完善部署文档

## 许可证

参见 [LICENSE](LICENSE) 文件。

## 技术支持

- 📧 Email: [项目维护者邮箱]
- 🐛 Issues: [项目仓库Issues页面]
- 📖 文档: [server/README.md](server/README.md)

