# 环境变量配置说明

本项目现在**强制要求**通过环境变量配置前后端地址，确保生产环境的安全性和灵活性。

## 📋 必需的环境变量

### 前端环境变量

在项目根目录创建 `.env` 文件：

```bash
# .env
# 前端API地址配置
VITE_API_BASE_URL=http://localhost:10000/api

# 其他Vite配置
VITE_APP_BASE_URL=/
```

**远程服务器访问示例：**
```bash
# .env (远程访问)
VITE_API_BASE_URL=http://10.26.2.3:10000/api
VITE_APP_BASE_URL=/
```

### 后端环境变量

**方式1：使用 .env 文件 (推荐)**

后端需要配置 `PORT` 环境变量。您可以：
- 在启动脚本中设置
- 使用 `dotenv` 包加载 .env 文件

**方式2：直接在启动命令中设置**

```bash
# Linux/Mac
export PORT=10000
npm run dev:full

# 或一行命令
PORT=10000 npm run dev:full
```

**Windows PowerShell:**
```powershell
$env:PORT=10000
npm run dev:full
```

**Windows CMD:**
```cmd
set PORT=10000
npm run dev:full
```

## 🚀 快速启动

### 步骤1：创建 .env 文件

在项目根目录创建 `.env` 文件，内容：
```bash
VITE_API_BASE_URL=http://localhost:10000/api
VITE_APP_BASE_URL=/
```

### 步骤2：启动服务

```bash
# 设置后端端口并启动
PORT=10000 npm run dev:full
```

## ⚠️ 错误处理

### 前端错误
如果看到以下错误：
```
❌ 错误: 未设置环境变量 VITE_API_BASE_URL
```
**解决方案：** 在项目根目录创建 `.env` 文件并配置 `VITE_API_BASE_URL`

### 后端错误
如果看到以下错误：
```
❌ 错误: 未设置环境变量 PORT
```
**解决方案：** 在启动命令前设置 `PORT` 环境变量

## 📝 .env 文件示例

创建 `.env` 文件：
```bash
# 前端配置
VITE_API_BASE_URL=http://localhost:10000/api
VITE_APP_BASE_URL=/
```

## 🔧 常见场景配置

### 本地开发
```bash
VITE_API_BASE_URL=http://localhost:10000/api
```

### 远程服务器部署
```bash
VITE_API_BASE_URL=http://your-server-ip:10000/api
```

### 使用域名
```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

## ⚠️ 常见错误

### 错误1：使用 0.0.0.0 作为API地址

**错误配置：**
```bash
VITE_API_BASE_URL=http://0.0.0.0:10000/api  # ❌ 错误！
```

**正确配置：**
```bash
VITE_API_BASE_URL=http://localhost:10000/api  # ✅ 本地开发
# 或
VITE_API_BASE_URL=http://10.26.2.3:10000/api  # ✅ 远程访问
```

**说明：**
- `0.0.0.0` 是服务器的**监听地址**，表示监听所有网络接口
- 客户端（浏览器）**不能**使用 `0.0.0.0` 作为访问地址
- 本地访问使用 `localhost` 或 `127.0.0.1`
- 远程访问使用服务器的**实际IP地址**

### 错误2：CORS跨域错误

如果看到以下错误：
```
Access to XMLHttpRequest at 'http://...' has been blocked by CORS policy
```

**可能原因：**
1. API地址配置错误（使用了 `0.0.0.0`）
2. 前后端端口不匹配
3. 后端服务未启动

**解决步骤：**
1. 检查 `.env` 文件中的 `VITE_API_BASE_URL` 配置
2. 确认后端服务已成功启动（查看是否有 `🚀 服务器运行在...` 日志）
3. 重启前端服务让配置生效

## 💡 提示

1. `.env` 文件不应提交到 Git 仓库（已在 .gitignore 中）
2. 使用 `env.template` 作为配置模板
3. 不同环境使用不同的配置文件：`.env.development`, `.env.production`
4. 修改 `.env` 文件后必须重启服务才能生效

