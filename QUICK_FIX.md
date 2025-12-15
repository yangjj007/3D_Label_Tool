# 🚑 快速修复指南 - CORS错误

## 问题症状

浏览器控制台显示：
```
Access to XMLHttpRequest at 'http://0.0.0.0:10000/api/...' has been blocked by CORS policy
```

## 根本原因

`.env` 文件中配置了错误的API地址：使用了 `0.0.0.0` 而不是 `localhost`

---

## ✅ 解决方案（3步）

### 步骤1：修改 .env 文件

打开项目根目录的 `.env` 文件，将：
```bash
VITE_API_BASE_URL=http://0.0.0.0:10000/api  # ❌ 错误
```

改为：
```bash
VITE_API_BASE_URL=http://localhost:10000/api  # ✅ 正确
```

如果 `.env` 文件不存在，参考 `env.template` 创建一个。

### 步骤2：停止当前服务

在终端中按 `Ctrl+C` 停止正在运行的服务。

### 步骤3：重新启动服务

```bash
# Linux/Mac
PORT=10000 npm run dev:full

# Windows PowerShell
$env:PORT=10000; npm run dev:full

# Windows CMD
set PORT=10000 && npm run dev:full
```

---

## 📌 验证是否成功

启动后检查：
1. ✅ 后端日志显示：`🚀 服务器运行在 http://0.0.0.0:10000`
2. ✅ 前端日志显示：`➜  Local:   http://localhost:9999/`
3. ✅ 浏览器打开 http://localhost:9999 无CORS错误
4. ✅ 能够正常加载文件列表

---

## 🔍 为什么不能用 0.0.0.0？

| 地址 | 用途 | 说明 |
|------|------|------|
| `0.0.0.0` | **服务器监听地址** | 表示监听所有网络接口，仅用于服务器配置 |
| `localhost` | **本地访问地址** | 客户端通过这个地址访问本机服务 |
| `127.0.0.1` | **本地回环地址** | 与 localhost 相同，IP形式 |
| `10.26.2.3` | **局域网IP地址** | 其他设备通过这个地址访问服务器 |

**服务器配置：**
```javascript
app.listen(PORT, '0.0.0.0')  // ✅ 正确 - 监听所有网络接口
```

**客户端配置：**
```bash
VITE_API_BASE_URL=http://localhost:10000/api  # ✅ 正确 - 本地访问
VITE_API_BASE_URL=http://10.26.2.3:10000/api # ✅ 正确 - 远程访问
VITE_API_BASE_URL=http://0.0.0.0:10000/api   # ❌ 错误 - 无效地址
```

---

## 🌐 远程访问配置

如果需要从其他机器访问服务器：

### 服务器端（Linux）
```bash
# .env 文件
VITE_API_BASE_URL=http://10.26.2.3:10000/api  # 使用服务器实际IP

# 启动服务
PORT=10000 npm run dev:full
```

### 客户端（本地浏览器）
访问：http://10.26.2.3:9999

### 防火墙配置（如需要）
```bash
# 开放端口
sudo ufw allow 9999  # 前端
sudo ufw allow 10000 # 后端
```

---

## 📞 还是不行？

检查以下几点：
1. [ ] `.env` 文件确实存在于项目根目录
2. [ ] `.env` 文件内容正确（没有多余空格、正确的端口号）
3. [ ] 已经完全停止旧服务并重启
4. [ ] 浏览器已清除缓存并刷新（Ctrl+Shift+R）
5. [ ] 后端服务确实启动成功（没有端口占用错误）
6. [ ] 端口号一致（后端 10000，.env 中也是 10000）

