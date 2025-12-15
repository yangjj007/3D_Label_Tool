# 🔧 CORS错误修复总结

## 问题描述

您遇到的错误：
```
Access to XMLHttpRequest at 'http://0.0.0.0:10000/api/...' 
from origin 'http://localhost:9999' has been blocked by CORS policy
```

## 根本原因

1. **`.env` 文件配置错误** - 使用了 `http://0.0.0.0:10000/api` 而不是 `http://localhost:10000/api`
2. **多个文件还保留默认值** - 有些文件在环境变量未设置时使用默认值，导致不一致

---

## ✅ 已完成的修复

### 1. 修改了4个源代码文件

强制要求从环境变量读取配置，否则报错：

- ✅ `src/utils/serverApi.js`
- ✅ `src/components/ModelEditPanel/EditVlm.vue`
- ✅ `src/utils/chunkedDownload.js`
- ✅ `src/utils/chunkedUpload.js`

**修改内容：**
```javascript
// 之前（有默认值）
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30005/api';

// 现在（强制要求配置）
if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error('❌ 错误: 未设置环境变量 VITE_API_BASE_URL...');
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

### 2. 改进了后端CORS配置

**文件：** `server/index.js`

- ✅ 明确配置了CORS策略
- ✅ 允许所有必需的HTTP方法
- ✅ 暴露必要的响应头

```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: false
}));
```

### 3. 创建了配置模板和文档

- ✅ `env.template` - 环境变量配置模板
- ✅ `ENV_SETUP.md` - 详细的环境配置说明
- ✅ `QUICK_FIX.md` - 快速修复指南
- ✅ `CORS_FIX_SUMMARY.md` - 本文档

### 4. 创建了自动化启动脚本

- ✅ `start-dev.sh` - Linux/Mac 启动脚本
- ✅ `start-dev.bat` - Windows 启动脚本
- ✅ 在 `package.json` 中添加了便捷命令

**功能：**
- 自动检查 `.env` 文件是否存在
- 自动验证配置是否正确（检测 `0.0.0.0` 错误）
- 自动检查端口占用
- 自动设置 `PORT` 环境变量

---

## 🚀 现在如何启动项目

### 方法1：使用启动脚本（推荐）

**Linux/Mac:**
```bash
npm start
# 或
bash start-dev.sh
```

**Windows:**
```bash
npm run start:win
# 或双击
start-dev.bat
```

### 方法2：手动启动

**步骤1：** 创建 `.env` 文件（参考 `env.template`）
```bash
VITE_API_BASE_URL=http://localhost:10000/api
VITE_APP_BASE_URL=/
```

**步骤2：** 启动服务
```bash
# Linux/Mac
PORT=10000 npm run dev:full

# Windows PowerShell
$env:PORT=10000; npm run dev:full

# Windows CMD
set PORT=10000 && npm run dev:full
```

---

## 📋 配置检查清单

在启动前，请确认：

- [ ] 项目根目录存在 `.env` 文件
- [ ] `.env` 文件内容正确：
  ```bash
  VITE_API_BASE_URL=http://localhost:10000/api  # ✅ 使用 localhost
  # 不是 http://0.0.0.0:10000/api              # ❌ 错误
  ```
- [ ] 端口 10000 和 9999 未被占用
- [ ] 启动命令中设置了 `PORT=10000`

---

## 🔍 为什么不能用 0.0.0.0？

### 概念区分

| 配置项 | 用途 | 正确的值 |
|--------|------|---------|
| **服务器监听地址** | 服务器绑定哪些网络接口 | `0.0.0.0` ✅ |
| **客户端访问地址** | 浏览器如何访问服务器 | `localhost` 或 实际IP ✅ |

### 代码示例

**后端（服务器监听）：**
```javascript
// server/index.js
app.listen(PORT, '0.0.0.0', () => {  // ✅ 正确 - 监听所有接口
  console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
});
```

**前端（客户端访问）：**
```bash
# .env
VITE_API_BASE_URL=http://localhost:10000/api  # ✅ 正确 - 本地访问
# 或
VITE_API_BASE_URL=http://10.26.2.3:10000/api # ✅ 正确 - 远程访问
```

### 详细解释

- **`0.0.0.0`** - 服务器监听地址
  - 表示"监听所有可用的网络接口"
  - 包括 localhost (127.0.0.1) 和所有实际网卡IP
  - **只在服务器端配置中使用**

- **`localhost` / `127.0.0.1`** - 本地回环地址
  - 只能从本机访问
  - 用于开发环境
  - **客户端访问本地服务时使用**

- **实际IP（如 `10.26.2.3`）** - 网络地址
  - 可以从局域网其他设备访问
  - 用于远程访问
  - **客户端访问远程服务时使用**

---

## 🌐 不同场景的配置

### 场景1：本地开发（前后端同一台机器）

```bash
# .env
VITE_API_BASE_URL=http://localhost:10000/api
```

**访问：** http://localhost:9999

---

### 场景2：远程服务器（服务器在Linux，本地浏览器访问）

**服务器端 `.env`：**
```bash
VITE_API_BASE_URL=http://10.26.2.3:10000/api  # 服务器实际IP
```

**启动服务：**
```bash
PORT=10000 npm run dev:full
```

**本地浏览器访问：** http://10.26.2.3:9999

**防火墙（如需要）：**
```bash
sudo ufw allow 9999
sudo ufw allow 10000
```

---

### 场景3：生产环境（使用域名）

```bash
# .env
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

配合 Nginx 反向代理。

---

## ⚠️ 常见错误

### 错误1：混淆监听地址和访问地址
```bash
# ❌ 错误
VITE_API_BASE_URL=http://0.0.0.0:10000/api
```

### 错误2：端口不一致
```bash
# 后端启动在 10000
PORT=10000 npm run dev:full

# 但 .env 中配置的是 30005
VITE_API_BASE_URL=http://localhost:30005/api  # ❌ 端口不匹配
```

### 错误3：修改配置后未重启
修改 `.env` 文件后，**必须重启服务**才能生效。

---

## 📞 故障排查

如果还是遇到问题，按顺序检查：

1. **检查 .env 文件**
   ```bash
   cat .env  # Linux/Mac
   type .env # Windows
   ```
   确认没有 `0.0.0.0`

2. **检查后端是否启动**
   - 查看终端日志
   - 应该看到：`🚀 服务器运行在 http://0.0.0.0:10000`

3. **检查端口是否正确**
   ```bash
   # Linux/Mac
   lsof -i :10000
   lsof -i :9999
   
   # Windows
   netstat -ano | findstr :10000
   netstat -ano | findstr :9999
   ```

4. **清除浏览器缓存**
   - 按 `Ctrl+Shift+R` 强制刷新
   - 或清除浏览器缓存

5. **检查防火墙**（远程访问时）
   ```bash
   sudo ufw status
   ```

6. **查看浏览器控制台**
   - 按 `F12` 打开开发者工具
   - 查看 Console 和 Network 标签

---

## 📚 相关文档

- **快速修复：** `QUICK_FIX.md`
- **详细配置：** `ENV_SETUP.md`
- **配置模板：** `env.template`
- **主文档：** `README.md`

---

## ✅ 验证修复成功

启动后，您应该看到：

**后端日志：**
```
📂 服务器目录配置:
   工作目录: /path/to/3D_Label_Tool
   ...
🚀 服务器运行在 http://0.0.0.0:10000
```

**前端日志：**
```
VITE v5.4.21  ready in 1096 ms
➜  Local:   http://localhost:9999/
➜  Network: http://10.26.2.3:9999/
```

**浏览器：**
- ✅ 打开 http://localhost:9999 无错误
- ✅ 控制台无 CORS 错误
- ✅ 能够加载文件列表
- ✅ 提示词库加载成功

---

**祝您使用愉快！** 🎉

