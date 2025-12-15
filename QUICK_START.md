# 快速开始指南

## 🚀 30秒快速上手

### 1. 配置VLM API（首次必须）

```bash
# 交互式配置
bash configure-vlm-api.sh

# 或使用npm脚本
pnpm config-vlm
```

按提示输入：
- API地址（如：`https://api.openai.com/v1`）
- API Key（如：`sk-xxxxx`）
- 模型名称（如：`gpt-4-vision-preview`）

脚本会自动测试连通性并显示结果。

### 2. 运行批量打标

```bash
# 一键启动所有服务并开始打标
bash start-batch-labeling.sh

# 或
pnpm start-batch
```

就这么简单！✨

---

## 📋 完整脚本列表

### VLM API配置相关

| 脚本 | 用途 | 命令 |
|------|------|------|
| `configure-vlm-api.sh` | 配置和测试VLM API | `bash configure-vlm-api.sh` |
| `configure-vlm-api.js` | Node.js版配置工具 | `node automation/configure-vlm-api.js` |
| `show-vlm-config.sh` | 查看当前配置 | `bash show-vlm-config.sh` |

### 批量打标相关

| 脚本 | 用途 | 命令 |
|------|------|------|
| `start-batch-labeling.sh` | 一键启动批量打标 | `bash start-batch-labeling.sh` |
| `batch-labeling.js` | 核心自动化脚本 | `node automation/batch-labeling.js` |
| `stop-all.sh` | 停止所有服务 | `bash stop-all.sh` |

### Chrome启动相关

| 脚本 | 用途 | 命令 |
|------|------|------|
| `start_chrome_swiftshader.sh` | CPU软件渲染（稳定） | `bash start_chrome_swiftshader.sh` |
| `start_chrome_xvfb.sh` | GPU加速（需要GPU） | `bash start_chrome_xvfb.sh` |

---

## 🎯 使用场景

### 场景1：第一次使用

```bash
# 1. 安装依赖
pnpm install

# 2. 构建前端
pnpm build:pro

# 3. 配置VLM API
bash configure-vlm-api.sh

# 4. 开始批量打标
bash start-batch-labeling.sh
```

### 场景2：更新代码后

```bash
# 1. 拉取代码
git pull

# 2. 更新依赖
pnpm install

# 3. 重新构建
pnpm build:pro

# 4. 启动（配置已保存，无需重新配置）
bash start-batch-labeling.sh
```

### 场景3：更换API或重新测试

```bash
# 重新配置
bash configure-vlm-api.sh

# 查看配置
bash show-vlm-config.sh
```

### 场景4：服务器后台运行

```bash
# 使用nohup后台运行
nohup bash start-batch-labeling.sh > batch.log 2>&1 &

# 或使用screen
screen -S batch
bash start-batch-labeling.sh
# Ctrl+A D 分离

# 或使用systemd（推荐）
# 参见 DEPLOYMENT.md
```

---

## ⚙️ 配置参数

### 环境变量

```bash
# VLM API配置
export VLM_API_URL="https://api.openai.com/v1"
export VLM_API_KEY="sk-xxxxx"
export VLM_MODEL="gpt-4-vision-preview"

# 批量打标参数
export CONCURRENCY=8              # 并发数
export VIEW_KEYS="main,axial"     # 视图配置
export SERVER_URL="http://localhost:29999"
export API_URL="http://localhost:30005"
```

### npm脚本快捷方式

```bash
pnpm config-vlm      # 配置VLM API
pnpm show-config     # 查看配置
pnpm start-batch     # 启动批量打标
pnpm stop-all        # 停止所有服务
pnpm batch-label     # 仅运行批量打标脚本
```

---

## 📊 监控和日志

### 查看实时进度

批量打标运行时会显示实时进度：

```
┌─────────────────────────────────────────────────────────┐
│ ████████████████░░░░░░░░░░░░░░  54.3% │
│ 进度: 27/50 | 耗时: 15.2min | 预计剩余: 12.8min          │
├─────────────────────────────────────────────────────────┤
```

### 查看日志文件

```bash
# 批量打标日志
tail -f logs/batch-labeling-*.log

# Chrome日志
tail -f /tmp/chrome.log

# 后端日志
tail -f logs/server.log

# PM2日志（如果使用PM2）
pm2 logs
```

---

## 🔧 故障排查

### API配置问题

```bash
# 测试API连通性
bash configure-vlm-api.sh

# 查看配置
bash show-vlm-config.sh

# 查看配置文件
cat vlm-config.json
```

### 服务启动问题

```bash
# 检查端口占用
lsof -i:29999   # 前端
lsof -i:30005   # 后端
lsof -i:30000   # Chrome调试端口

# 停止所有服务重新开始
bash stop-all.sh
bash start-batch-labeling.sh
```

### Chrome问题

```bash
# 查看Chrome进程
ps aux | grep chrome

# 查看Chrome日志
tail -f /tmp/chrome.log

# 重启Chrome
pkill -f "chrome.*30000"
bash start_chrome_swiftshader.sh
```

---

## 📖 详细文档

- **自动化系统详解**: [automation/README.md](automation/README.md)
- **VLM配置指南**: [automation/VLM_CONFIG.md](automation/VLM_CONFIG.md)
- **Linux部署指南**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **项目README**: [README.md](README.md)

---

## 💡 最佳实践

### 1. 硬件选择

- **CPU渲染**（SwiftShader）：适合无GPU环境，并发数4-8
- **GPU渲染**（Xvfb）：适合有NVIDIA GPU，并发数8-32

### 2. 并发数调优

根据您的配置调整 `CONCURRENCY`：

```bash
# 8核16GB + CPU渲染
export CONCURRENCY=4

# 16核32GB + GPU
export CONCURRENCY=16

# 32核64GB + 多GPU
export CONCURRENCY=32
```

### 3. 安全建议

- ✅ 不要将 `vlm-config.json` 提交到Git
- ✅ 定期轮换API Key
- ✅ 监控API使用量和费用
- ✅ 设置API调用配额

### 4. 性能优化

- 使用SSD存储文件
- 确保足够的内存（建议16GB+）
- 使用GPU加速（速度提升10-100倍）
- 定期清理日志和临时文件

---

## 🆘 获取帮助

1. **查看日志**: 大多数问题的答案在日志文件中
2. **测试API**: 使用配置脚本测试API连通性
3. **检查文档**: 查看详细文档了解更多信息
4. **提交Issue**: GitHub Issues

---

## 🎉 开始使用

```bash
# 三步走！
bash configure-vlm-api.sh    # 1. 配置API
bash start-batch-labeling.sh # 2. 开始打标
# 3. 等待完成，喝杯咖啡 ☕
```

祝您打标愉快！ 🚀

