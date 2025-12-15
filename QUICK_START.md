# 批量打标 - 快速开始指南

## 🚀 一键启动（推荐）

```bash
bash start-batch-labeling.sh
```

这个脚本会自动：
- ✅ 启动后端服务
- ✅ 启动前端服务
- ✅ 启动 Chrome 浏览器
- ✅ 执行批量打标
- ✅ 生成详细报告

## 🔍 遇到问题？

### 1. 首先运行诊断

```bash
bash diagnose.sh
```

这会检查：
- 所有依赖是否安装
- 服务是否运行
- 端口是否正确
- Chrome 是否启动
- WebGL 是否可用

### 2. 检查 WebGL 支持

```bash
node check-webgl.js
```

如果显示 `❌ WebGL 不可用`：

```bash
# 停止现有 Chrome
pkill -f "chrome.*remote-debugging-port"

# 使用 SwiftShader 启动
bash start_chrome_swiftshader.sh

# 再次检查
node check-webgl.js
```

### 3. 查看详细日志

```bash
# 实时查看 Chrome 日志
tail -f logs/chrome.log

# 实时查看批量打标日志
tail -f logs/batch-labeling-*.log

# 查看错误截图（如果有）
ls -lh logs/error-screenshot.png
```

## 📖 详细文档

- **完整故障排除**: `WEBGL_TROUBLESHOOTING.md`
- **修复总结**: `BATCH_LABELING_FIX.md`

## ⚡ 性能优化

### CPU 软件渲染（无 GPU 服务器）

```bash
export CONCURRENCY=4
export VIEW_KEYS=axial
bash start-batch-labeling.sh
```

### GPU 硬件加速（有 GPU 服务器）

```bash
# 先启动 Xvfb 模式
bash start_chrome_xvfb.sh

export CONCURRENCY=16
export VIEW_KEYS=axial,sagittal,coronal
bash start-batch-labeling.sh
```

## 🛠️ 常用命令

```bash
# 检查服务状态
bash diagnose.sh

# 检查 WebGL
node check-webgl.js

# 查看端口占用
lsof -i:9999    # 前端
lsof -i:10000   # 后端
lsof -i:30000   # Chrome

# 停止所有服务
pkill -f "chrome.*remote-debugging-port"
pm2 stop all

# 清理日志
rm -f logs/*.log logs/*.png
```

## 💡 Tips

1. **首次运行**：先运行 `bash diagnose.sh` 确保环境正确
2. **WebGL 问题**：使用 `node check-webgl.js` 诊断
3. **性能慢**：如果使用 SwiftShader，降低并发数到 4-8
4. **调试模式**：查看 `logs/` 目录下的所有日志文件
