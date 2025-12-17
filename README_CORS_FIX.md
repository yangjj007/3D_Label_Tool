# 🛠️ CORS 错误完整修复方案

> **最后更新**: 2025-12-17  
> **版本**: v2.0 - 新增 VLM API 代理支持

---

## 📋 目录

1. [问题概述](#问题概述)
2. [快速修复](#快速修复)
3. [详细说明](#详细说明)
4. [测试验证](#测试验证)
5. [常见问题](#常见问题)
6. [技术细节](#技术细节)

---

## 问题概述

### 🔴 常见的 CORS 错误

#### 错误 1: VLM API 跨域访问被阻止（新增）

```
Access to XMLHttpRequest at 'http://localhost:30000/v1/chat/completions' 
from origin 'http://localhost:9999' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**原因**: 前端（localhost:9999）直接访问 VLM API（localhost:30000）跨域

#### 错误 2: 后端 API 配置错误

```
Access to XMLHttpRequest at 'http://0.0.0.0:10000/api/...' 
from origin 'http://localhost:9999' has been blocked by CORS policy
```

**原因**: `.env` 文件配置了错误的访问地址（0.0.0.0）

---

## 快速修复

### 🚀 三步解决

#### 步骤 1: 创建环境配置

```bash
# Windows
copy env.template .env

# Unix/Linux/Mac
cp env.template .env
```

#### 步骤 2: 启动服务

**Windows:**
```batch
start-dev.bat
```

**Unix/Linux/Mac:**
```bash
PORT=10000 npm run dev:full
```

#### 步骤 3: 验证修复

打开浏览器访问 http://localhost:9999，检查：

- ✅ 无 CORS 错误
- ✅ 文件列表正常加载
- ✅ VLM 对话功能正常

### 🧪 测试工具

打开测试页面验证所有修复：

```
http://localhost:9999/test-cors-fix.html
```

---

## 详细说明

### 🔧 修复方案 1: VLM API 代理（新增）

**问题**: 浏览器阻止跨域访问外部 VLM API

**解决方案**: 后端代理转发

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   前端      │         │  项目后端代理     │         │  VLM API    │
│ :9999       │ ─────>  │  :10000          │ ─────>  │  :30000     │
└─────────────┘         └──────────────────┘         └─────────────┘
   浏览器请求              服务器转发请求              实际 API
                         (无 CORS 限制)
```

**修改的文件**:

1. **`server/index.js`** - 添加代理路由

```javascript
app.post('/api/vlm-proxy', async (req, res) => {
  // 转发 VLM API 请求
  const { baseUrl, apiKey, requestBody } = req.body;
  // ... 转发逻辑
});
```

2. **`src/utils/vlmService.js`** - 自动使用代理

```javascript
// 检测到 localhost API 时自动使用代理
if (this.baseUrl.includes('localhost')) {
  response = await axios.post(this.proxyUrl, {
    baseUrl: this.baseUrl,
    apiKey: this.apiKey,
    requestBody
  });
}
```

3. **`vite.config.js`** - 开发环境代理

```javascript
server: {
  proxy: {
    '/api': {
      target: backendUrl,
      changeOrigin: true
    }
  }
}
```

**工作流程**:

1. 前端检测到 VLM API 地址是 localhost
2. 自动切换到使用代理模式
3. 请求发送到项目后端 `/api/vlm-proxy`
4. 后端转发请求到实际的 VLM API
5. 返回结果给前端

**特性**:

- ✅ 自动检测 localhost API 并使用代理
- ✅ 远程 API（https://...）仍然直接访问
- ✅ 无需修改 VLM API 本身
- ✅ 支持所有 OpenAI 兼容接口

### 🔧 修复方案 2: 环境变量配置

**问题**: 使用 `0.0.0.0` 作为客户端访问地址

**解决方案**: 正确配置 `.env` 文件

**创建 `.env` 文件**:

```env
# 本地开发
VITE_API_BASE_URL=http://localhost:10000/api

# 或远程访问
# VITE_API_BASE_URL=http://10.26.2.3:10000/api

VITE_APP_BASE_URL=/
```

**关键区别**:

| 配置 | 用途 | 正确值 |
|------|------|--------|
| 服务器监听地址 | 服务器绑定网络接口 | `0.0.0.0` ✅ |
| 客户端访问地址 | 浏览器访问 URL | `localhost` 或 实际IP ✅ |

### 🔧 修复方案 3: 强制环境变量验证

**问题**: 代码中有默认值，导致配置不一致

**解决方案**: 修改代码强制要求配置

**修改的文件**:

- `src/utils/serverApi.js`
- `src/components/ModelEditPanel/EditVlm.vue`
- `src/utils/chunkedDownload.js`
- `src/utils/chunkedUpload.js`

**修改内容**:

```javascript
// 之前（有默认值）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30005/api';

// 现在（强制配置）
if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error('❌ 未设置环境变量 VITE_API_BASE_URL');
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

### 🔧 修复方案 4: 后端 CORS 配置

**文件**: `server/index.js`

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: false
}));
```

---

## 测试验证

### 🧪 方法 1: 使用测试工具

打开测试页面：

```
http://localhost:9999/test-cors-fix.html
```

测试项目：

1. ✅ 后端健康状态
2. ✅ VLM 代理功能
3. ✅ 文件 API

### 🧪 方法 2: 浏览器控制台

按 `F12` 打开开发者工具，查看：

**成功的日志**:

```
[VLM] 使用代理: http://localhost:10000/api/vlm-proxy
[VLM] qwen3-vl-30b-a3b-instruct 调用成功
```

**不应该看到**:

```
❌ Access to XMLHttpRequest ... has been blocked by CORS policy
```

### 🧪 方法 3: 命令行测试

**测试后端健康**:

```bash
curl http://localhost:10000/api/health
```

**测试 VLM 代理**:

```bash
curl -X POST http://localhost:10000/api/vlm-proxy \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "http://localhost:30000",
    "apiKey": "sk-xxxxx",
    "requestBody": {
      "model": "gpt-4o",
      "messages": [{"role": "user", "content": "Hello"}]
    }
  }'
```

---

## 常见问题

### ❓ Q1: 仍然看到 VLM CORS 错误？

**检查清单**:

- [ ] 后端服务已启动（`PORT=10000 npm run dev:full`）
- [ ] 后端日志显示 "🔄 VLM代理已启用"
- [ ] VLM API 地址包含 `localhost`
- [ ] 浏览器控制台显示 "使用代理"

**解决方法**:

```javascript
// 如果自动检测失败，手动配置
const vlm = new MultiImageVLM({
  baseUrl: 'http://localhost:30000',
  apiKey: 'your-key',
  useProxy: true,  // 强制使用代理
  proxyUrl: 'http://localhost:10000/api/vlm-proxy'
});
```

### ❓ Q2: 后端代理请求失败？

**检查**:

1. VLM API 服务是否运行？

```bash
curl http://localhost:30000/v1/models
```

2. API Key 是否有效？

3. 查看后端日志：

```
[VLM Proxy] 转发请求到: http://localhost:30000/v1/chat/completions
[VLM Proxy] 代理请求失败: ...
```

### ❓ Q3: 如何禁用代理？

如果 VLM API 已经支持 CORS：

```javascript
vlm.init({
  useProxy: false
});
```

### ❓ Q4: 端口被占用？

**Windows**:

```batch
netstat -ano | findstr ":10000"
taskkill /PID [进程ID] /F
```

**Unix/Linux/Mac**:

```bash
lsof -i :10000
kill -9 [进程ID]
```

### ❓ Q5: 生产环境如何配置？

**使用 HTTPS 和域名**:

```env
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

**配置具体的 CORS 源**:

```javascript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true
}));
```

---

## 技术细节

### 🏗️ 架构设计

```
                    ┌─────────────────────────────┐
                    │      浏览器 (localhost:9999)  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
            ┌───────▼────┐  ┌──────▼──────┐ ┌────▼─────┐
            │  Vite Proxy │  │ 项目后端代理 │ │ 直接请求  │
            └───────┬────┘  └──────┬──────┘ └────┬─────┘
                    │              │             │
            ┌───────▼──────────────▼─────┐       │
            │   项目后端 (localhost:10000) │       │
            └───────┬────────────────────┘       │
                    │                            │
            ┌───────▼────────┐          ┌────────▼────────┐
            │  VLM API (本地) │          │ VLM API (远程)   │
            │ localhost:30000│          │ https://api...  │
            └────────────────┘          └─────────────────┘
```

### 🔐 安全考虑

1. **API Key 保护**: 代理可以在服务器端加密存储 API Key
2. **限流控制**: 代理层可以添加速率限制
3. **请求日志**: 记录所有 VLM API 调用
4. **访问控制**: 可以添加认证中间件

### ⚡ 性能优化

1. **请求缓存**: 相同请求可以缓存结果
2. **连接池**: 复用 HTTP 连接
3. **超时控制**: 设置合理的超时时间（5分钟）
4. **错误重试**: 内置指数退避重试机制

### 🔄 兼容性

- ✅ 支持所有 OpenAI 兼容的 VLM API
- ✅ 支持自定义请求头（Referer, X-Title 等）
- ✅ 支持流式和非流式响应
- ✅ 支持图片 base64 和 URL 两种格式

---

## 📚 相关文档

- **快速开始**: [CORS_FIX_QUICK_START.md](./CORS_FIX_QUICK_START.md)
- **详细指南**: [CORS_FIX_GUIDE.md](./CORS_FIX_GUIDE.md)
- **修复总结**: [CORS_FIX_SUMMARY.md](./CORS_FIX_SUMMARY.md)
- **环境配置**: [ENV_SETUP.md](./ENV_SETUP.md)
- **配置模板**: [env.template](./env.template)

---

## 📝 更新日志

### v2.0 (2025-12-17)

- ✨ 新增 VLM API 代理支持
- ✨ 自动检测并使用代理
- ✨ 添加测试工具页面
- 📝 更新所有文档

### v1.0 (之前)

- 🔧 修复环境变量配置
- 🔧 强制环境变量验证
- 🔧 改进后端 CORS 配置
- 📝 创建配置文档和启动脚本

---

## 🎉 总结

通过以上修复，项目现在可以：

1. ✅ 完全避免 CORS 错误
2. ✅ 支持本地和远程 VLM API
3. ✅ 自动检测并使用代理
4. ✅ 提供完善的测试工具
5. ✅ 配置灵活且安全

如有问题，请参考详细文档或联系开发者。

**祝使用愉快！** 🚀

