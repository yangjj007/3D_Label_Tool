# 批量打标快速启动指南

## 🚀 快速启动

### 一键启动（推荐）

```bash
bash start-batch-labeling.sh
```

脚本会自动：
- ✅ 检查并创建 `.env` 配置文件
- ✅ 启动后端服务（端口 10000）
- ✅ 构建并启动前端服务（端口 9999）
- ✅ 启动 Chrome 浏览器（调试端口 30000）
- ✅ 运行批量打标自动化脚本

---

## 📋 端口配置

脚本使用以下端口（在 `start-batch-labeling.sh` 开头配置）：

```bash
server_port=9999        # 前端服务端口
api_port=10000          # 后端服务端口
chrome_debug_port=30000 # Chrome调试端口
```

### 修改端口

如需修改端口，编辑 `start-batch-labeling.sh` 文件的第 29-31 行：

```bash
server_port=9999   # 改为您想要的前端端口
api_port=10000     # 改为您想要的后端端口
chrome_debug_port=30000  # 改为您想要的Chrome调试端口
```

**注意：**
- 修改端口后，脚本会自动更新 `.env` 文件
- 前端会自动重新构建以使用新的API地址
- 无需手动修改其他配置文件

---

## 🔧 PM2 配置

如果使用 PM2 管理进程，端口配置在 `ecosystem.config.js`：

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 10000  // 后端端口
}
```

**修改方法：**
1. 编辑 `ecosystem.config.js`，修改 `PORT` 值
2. 编辑 `start-batch-labeling.sh`，修改 `api_port` 值（保持一致）
3. 运行启动脚本

---

## 🐛 常见问题

### 1. 后端启动超时

**错误信息：**
```
❌ 后端服务启动超时
❌ 后端服务启动失败，请查看日志: logs/server.log
```

**原因：**
- 端口被占用
- 未设置 PORT 环境变量
- 依赖未安装

**解决方案：**

**步骤1：检查端口占用**
```bash
lsof -i:10000
# 或
netstat -tuln | grep 10000
```

**步骤2：查看后端日志**
```bash
cat logs/server.log
# 或
tail -f logs/server.log
```

**步骤3：检查错误信息**
- 如果看到 `❌ 错误: 未设置环境变量 PORT`
  - 这是正常的，脚本现在会自动设置
  - 重新运行脚本即可

- 如果看到 `EADDRINUSE`（端口被占用）
  - 停止占用端口的进程：
    ```bash
    # 找到进程ID
    lsof -i:10000
    # 杀掉进程
    kill -9 <PID>
    ```
  - 或修改脚本中的 `api_port` 值

### 2. 前端构建失败

**错误信息：**
```
❌ 错误: 未设置环境变量 VITE_API_BASE_URL
```

**解决方案：**

脚本会自动创建 `.env` 文件。如果仍然报错：

```bash
# 手动创建 .env 文件
cat > .env << EOF
VITE_API_BASE_URL=http://localhost:10000/api
VITE_APP_BASE_URL=/
EOF

# 重新运行脚本
bash start-batch-labeling.sh
```

### 3. Chrome 启动失败

**原因：**
- Chrome 未安装
- Xvfb 未安装（无头模式需要）
- 调试端口被占用

**解决方案：**

```bash
# 检查 Chrome
which google-chrome chromium-browser chromium

# 检查 Xvfb
which Xvfb

# 检查调试端口
lsof -i:30000
```

### 4. 修改端口后前端仍使用旧API地址

**原因：**
- 前端使用旧的构建版本
- `.env` 文件未更新

**解决方案：**

```bash
# 删除旧构建
rm -rf dist

# 重新运行脚本（会自动重新构建）
bash start-batch-labeling.sh
```

---

## 📊 服务状态检查

### 检查服务是否运行

```bash
# 检查端口
lsof -i:9999   # 前端
lsof -i:10000  # 后端
lsof -i:30000  # Chrome

# 使用 PM2（如果安装了）
pm2 list

# 检查进程
ps aux | grep "node server/index.js"
ps aux | grep "chrome.*remote-debugging"
```

### 查看日志

```bash
# 后端日志
tail -f logs/server.log

# PM2 日志
pm2 logs 3d-label-server

# 批量打标日志
tail -f logs/batch-labeling.log
```

---

## 🛑 停止服务

### 停止所有服务

```bash
bash stop-all.sh
```

### 手动停止

```bash
# 停止 PM2 服务
pm2 stop 3d-label-server
pm2 stop 3d-label-frontend

# 或删除
pm2 delete 3d-label-server
pm2 delete 3d-label-frontend

# 停止通过 PID 文件启动的服务
if [ -f .server.pid ]; then
    kill $(cat .server.pid)
    rm .server.pid
fi

if [ -f .frontend.pid ]; then
    kill $(cat .frontend.pid)
    rm .frontend.pid
fi

# 停止 Chrome
pkill -f "chrome.*remote-debugging-port"
```

---

## 🔄 重启服务

```bash
# 停止现有服务
bash stop-all.sh

# 等待几秒
sleep 3

# 重新启动
bash start-batch-labeling.sh
```

---

## 📝 自定义配置

### 环境变量

可以在运行脚本时设置环境变量：

```bash
# 自定义并发数
CONCURRENCY=32 bash start-batch-labeling.sh

# 自定义视图
VIEW_KEYS="front,back,left,right" bash start-batch-labeling.sh

# 自定义所有配置
SERVER_URL=http://localhost:8080 \
API_URL=http://localhost:8081/api \
CONCURRENCY=16 \
VIEW_KEYS=axial \
bash start-batch-labeling.sh
```

### 修改脚本配置

编辑 `start-batch-labeling.sh` 开头的变量：

```bash
server_port=9999        # 前端端口
api_port=10000          # 后端端口
chrome_debug_port=30000 # Chrome调试端口

export CONCURRENCY="${CONCURRENCY:-16}"      # 并发数
export VIEW_KEYS="${VIEW_KEYS:-axial}"       # 视图配置
```

---

## ✅ 验证配置正确

启动后，您应该看到：

```
========================================
3D模型批量打标 - 自动化启动
========================================
ℹ️  配置信息：
  项目目录: /path/to/3D_Label_Tool
  前端地址: http://localhost:9999
  后端地址: http://localhost:10000
  并发数: 16
  视图配置: axial
  Chrome调试端口: 30000

[0/4] 检查依赖...
✅ 依赖检查通过

[1/4] 检查后端服务...
✅ 后端服务启动成功

[2/4] 检查前端服务...
✅ 前端服务启动成功

[3/4] 检查Chrome浏览器...
✅ Chrome浏览器启动成功

[4/4] 启动批量打标自动化...
✅ 批量打标自动化已启动
```

---

## 📞 获取更多帮助

- **详细故障排查：** `BATCH_LABELING_TROUBLESHOOTING.md`
- **部署指南：** `DEPLOYMENT.md`
- **主文档：** `README.md`

