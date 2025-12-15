# 环境变量配置说明

本项目现在**强制要求**通过环境变量配置前后端地址，确保生产环境的安全性和灵活性。

## 📋 必需的环境变量

### 前端环境变量

在项目根目录创建 `.env` 文件：

```bash
# .env
# 前端API地址配置
VITE_API_BASE_URL=http://localhost:30005/api

# 其他Vite配置
VITE_APP_BASE_URL=/
```

**远程服务器访问示例：**
```bash
# .env (远程访问)
VITE_API_BASE_URL=http://10.26.2.3:30005/api
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
export PORT=30005
npm run dev:full

# 或一行命令
PORT=30005 npm run dev:full
```

**Windows PowerShell:**
```powershell
$env:PORT=30005
npm run dev:full
```

**Windows CMD:**
```cmd
set PORT=30005
npm run dev:full
```

## 🚀 快速启动

### 步骤1：创建 .env 文件

在项目根目录创建 `.env` 文件，内容：
```bash
VITE_API_BASE_URL=http://localhost:30005/api
VITE_APP_BASE_URL=/
```

### 步骤2：启动服务

```bash
# 设置后端端口并启动
PORT=30005 npm run dev:full
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
VITE_API_BASE_URL=http://localhost:30005/api
VITE_APP_BASE_URL=/
```

## 🔧 常见场景配置

### 本地开发
```bash
VITE_API_BASE_URL=http://localhost:30005/api
```

### 远程服务器部署
```bash
VITE_API_BASE_URL=http://your-server-ip:30005/api
```

### 使用域名
```bash
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

## 💡 提示

1. `.env` 文件不应提交到 Git 仓库（已在 .gitignore 中）
2. 提供 `.env.example` 供团队成员参考
3. 不同环境使用不同的配置文件：`.env.development`, `.env.production`

