# 🔧 环境变量配置指南

## 📝 概述

本项目已从硬编码端口改为使用环境变量配置，提高了灵活性和可维护性。

## ✅ 已完成的更改

### 1. 端口变更
- **旧端口**: 30001
- **新端口**: 30005

### 2. 创建的文件
- ✅ `.env` - 环境变量配置文件（已添加到 .gitignore）
- ✅ `.env.example` - 环境变量配置模板（用于版本控制和团队协作）

### 3. 更新的文件

#### 后端配置
- `server/index.js` - 服务器端口配置
- `ecosystem.config.js` - PM2 进程管理配置

#### 前端配置
- `src/utils/serverApi.js` - API 基础地址
- `src/utils/chunkedUpload.js` - 分块上传 API 地址
- `src/utils/chunkedDownload.js` - 分块下载 API 地址
- `src/components/ModelEditPanel/EditVlm.vue` - VLM 提示词库 API 地址

#### 文档
- `README.md` - 添加环境变量配置说明
- `DEPLOYMENT.md` - 更新部署文档端口信息
- `CHANGELOG_PROMPTS.md` - 更新提示词配置文档

## 🚀 使用方法

### 首次使用

1. **确认环境变量文件存在**：
   ```bash
   # 检查 .env 文件是否存在
   ls .env
   
   # 如果不存在，从模板创建
   cp .env.example .env
   ```

2. **根据需要修改配置**：
   打开 `.env` 文件，根据实际情况修改配置项：
   ```env
   # 后端 API 地址
   VITE_API_BASE_URL=http://localhost:30005/api
   
   # 分块传输大小（10MB）
   VITE_CHUNK_SIZE=10485760
   
   # 应用基础路径
   VITE_APP_BASE_URL=/
   ```

### 启动项目

#### 开发环境

**启动后端服务器**：
```bash
# 方式一：直接运行
cd server
node index.js

# 方式二：使用 PM2
pm2 start ecosystem.config.js

# 方式三：npm script（如果配置了）
npm run server
```

**启动前端开发服务器**：
```bash
# 使用 pnpm
pnpm install
pnpm serve

# 或使用 yarn
yarn install
yarn serve

# 或使用 npm
npm install
npm run serve
```

#### 生产环境

1. **修改 .env 文件**：
   ```env
   # 使用实际的生产环境域名
   VITE_API_BASE_URL=https://your-domain.com/api
   VITE_APP_BASE_URL=/your-app-path/
   ```

2. **构建前端**：
   ```bash
   pnpm build
   # 或
   yarn build
   ```

3. **启动后端**：
   ```bash
   # 设置生产环境端口（可选）
   export PORT=30005
   pm2 start ecosystem.config.js --env production
   ```

## 🔍 端口配置说明

### 配置优先级

系统按以下优先级读取端口配置：

1. **环境变量** `PORT` - 最高优先级
   ```bash
   PORT=8080 node server/index.js
   ```

2. **PM2 配置文件** `ecosystem.config.js`
   ```javascript
   env: {
     PORT: 30005
   }
   ```

3. **代码默认值** - 最低优先级
   ```javascript
   const PORT = process.env.PORT || 30005;
   ```

### 前端 API 地址配置

1. **环境变量** `.env` 文件 - 最高优先级
   ```env
   VITE_API_BASE_URL=http://localhost:30005/api
   ```

2. **代码默认值** - 最低优先级
   ```javascript
   const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30005/api';
   ```

## 🌍 不同环境配置示例

### 本地开发
```env
VITE_API_BASE_URL=http://localhost:30005/api
VITE_APP_BASE_URL=/
```

### 局域网访问
```env
VITE_API_BASE_URL=http://192.168.1.100:30005/api
VITE_APP_BASE_URL=/
```

### 生产环境（域名）
```env
VITE_API_BASE_URL=https://api.example.com/api
VITE_APP_BASE_URL=/3d-label-tool/
```

### 生产环境（子路径部署）
```env
VITE_API_BASE_URL=https://example.com/api
VITE_APP_BASE_URL=/3d-label-tool/
```

## 🐛 常见问题

### Q: 修改 .env 后没有生效？
**A**: 需要重启开发服务器：
```bash
# 停止前端服务器（Ctrl+C）
# 重新启动
pnpm serve
```

### Q: 后端服务器端口被占用？
**A**: 修改端口：
```bash
# 临时修改
PORT=30006 node server/index.js

# 或修改 ecosystem.config.js 中的端口配置
```

### Q: 前端无法连接后端？
**A**: 检查以下几点：
1. 后端服务器是否正在运行？
2. 端口是否正确？
3. 防火墙是否阻止了连接？
4. `.env` 文件中的 API 地址是否正确？

### Q: 生产环境 CORS 错误？
**A**: 确保后端配置了正确的 CORS 设置：
```javascript
// server/index.js 已配置
app.use(cors());
```

## 📋 检查清单

部署前请确认：

- [ ] `.env` 文件已创建并配置正确
- [ ] 后端端口配置为 30005（或自定义端口）
- [ ] 前端 API 地址指向正确的后端地址
- [ ] 生产环境使用了正确的域名和协议（https）
- [ ] 防火墙已开放相应端口
- [ ] PM2 配置文件端口正确（如果使用 PM2）

## 🎯 建议

1. **不要提交 .env 文件到版本控制**
   - `.env` 文件已在 `.gitignore` 中
   - 使用 `.env.example` 作为配置模板

2. **团队协作**
   - 更新 `.env.example` 文件并提交到版本控制
   - 团队成员根据 `.env.example` 创建自己的 `.env` 文件

3. **安全性**
   - 生产环境使用 HTTPS
   - 不要在代码中硬编码敏感信息
   - 使用环境变量管理所有配置

4. **可维护性**
   - 所有配置集中在 `.env` 文件
   - 修改端口只需要改一个地方
   - 方便不同环境的切换

## 📞 支持

如有问题，请提交 issue 或联系项目维护者。

---

**最后更新**: 2025-12-13
**当前版本**: 端口 30005

