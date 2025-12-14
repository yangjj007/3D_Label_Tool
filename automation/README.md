# 批量打标自动化系统

## 概述

此自动化系统允许您在Linux集群的容器中不间断地运行3D模型批量打标任务，无需保持前端浏览器打开。

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                   自动化系统架构                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐      ┌──────────────┐           │
│  │  后端服务    │◄────►│  前端服务    │           │
│  │  :30005      │      │  :29999      │           │
│  └──────────────┘      └──────────────┘           │
│         ▲                      ▲                    │
│         │                      │                    │
│         │                      │                    │
│  ┌──────┴──────────────────────┴──────┐           │
│  │     Chrome Headless                 │           │
│  │     (remote-debugging-port:30000)   │           │
│  └──────────────┬──────────────────────┘           │
│                 │                                   │
│                 ▼                                   │
│  ┌─────────────────────────────────────┐           │
│  │  Puppeteer 自动化脚本               │           │
│  │  (automation/batch-labeling.js)     │           │
│  └─────────────────────────────────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 核心组件

### 1. batch-labeling.js
自动化脚本的核心，负责：
- 连接到已运行的Chrome实例（通过调试端口30000）
- 导航到前端应用并触发批量打标
- 实时监控处理进度
- 生成详细报告

### 2. start-batch-labeling.sh
一键启动脚本，自动执行：
1. 检查并启动后端服务（端口30005）
2. 检查并启动前端服务（端口29999）
3. 检查并启动Chrome浏览器（调试端口30000）
4. 运行批量打标自动化脚本

### 3. stop-all.sh
停止所有服务的脚本：
- 停止后端、前端、Chrome
- 清理临时文件和进程
- 清理Chrome缓存数据

## 快速开始

### 前置要求

1. **Node.js** (v21+)
2. **pnpm** 或 **npm**
3. **Google Chrome** 或 **Chromium**
4. **PM2**（可选，用于进程管理）

### 安装依赖

```bash
# 克隆代码仓库
git clone <your-repo-url>
cd 3D_Label_Tool

# 安装依赖
pnpm install

# 构建前端
pnpm build:pro
```

### 运行批量打标

#### 方式1：一键启动（推荐）

```bash
bash start-batch-labeling.sh
```

这会自动启动所有服务并开始批量打标。

#### 方式2：手动启动各个服务

```bash
# 1. 启动后端
pnpm server
# 或使用PM2
pm2 start ecosystem.config.js

# 2. 启动前端
pnpm preview --host 0.0.0.0 --port 29999

# 3. 启动Chrome（选择一种方式）
bash start_chrome_swiftshader.sh  # CPU软件渲染（稳定）
# 或
bash start_chrome_xvfb.sh         # GPU加速（需要GPU）

# 4. 运行批量打标
node automation/batch-labeling.js
```

### 停止服务

```bash
bash stop-all.sh
```

## 配置选项

通过环境变量配置：

```bash
# 前端服务地址
export SERVER_URL="http://localhost:29999"

# 后端API地址
export API_URL="http://localhost:30005"

# 并发数（同时处理的文件数量）
export CONCURRENCY=4

# 视图配置（逗号分隔：main,top,side,axial）
export VIEW_KEYS="axial"

# Chrome调试端口
export CHROME_DEBUG_PORT=30000

# 然后运行
bash start-batch-labeling.sh
```

或直接在命令行指定：

```bash
CONCURRENCY=8 VIEW_KEYS="main,axial" bash start-batch-labeling.sh
```

## 视图选项说明

- `main` - 主视图（正面）
- `top` - 俯视图（顶部）
- `side` - 侧视图（侧面）
- `axial` - 轴测视图（斜45度）

可以选择多个视图，用逗号分隔：`VIEW_KEYS="main,top,axial"`

## 性能调优

### 并发数建议

根据硬件配置选择合适的并发数：

| 渲染模式 | CPU | 内存 | 建议并发数 |
|---------|-----|------|-----------|
| SwiftShader (CPU) | 8核+ | 16GB+ | 4-8 |
| SwiftShader (CPU) | 16核+ | 32GB+ | 8-12 |
| Xvfb + GPU | GPU 4GB+ | 16GB+ | 8-16 |
| Xvfb + GPU | GPU 8GB+ | 32GB+ | 16-32 |

### 注意事项

1. **SwiftShader模式**（CPU渲染）：
   - 速度较慢，但最稳定
   - 不需要GPU
   - 适合无GPU的服务器环境

2. **Xvfb + GPU模式**：
   - 速度快10-100倍
   - 需要NVIDIA GPU + 驱动
   - 适合有GPU的服务器环境

## 监控和日志

### 日志文件

所有日志保存在 `logs/` 目录：

```
logs/
├── batch-labeling-2025-01-15.log  # 批量打标日志
├── server.log                      # 后端服务日志
├── frontend.log                    # 前端服务日志
└── error-screenshot.png            # 错误时的截图
```

### 查看实时日志

```bash
# 批量打标进度
tail -f logs/batch-labeling-*.log

# 后端服务
tail -f logs/server.log

# Chrome日志
tail -f /tmp/chrome.log

# PM2日志（如果使用PM2）
pm2 logs
```

## Linux服务器部署

### 使用systemd实现开机自启

创建服务文件 `/etc/systemd/system/3d-batch-labeling.service`：

```ini
[Unit]
Description=3D Model Batch Labeling Service
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/3D_Label_Tool
ExecStart=/bin/bash /path/to/3D_Label_Tool/start-batch-labeling.sh
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/3d-batch-labeling.log
StandardError=append:/var/log/3d-batch-labeling-error.log

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
# 重载systemd配置
sudo systemctl daemon-reload

# 启用服务（开机自启）
sudo systemctl enable 3d-batch-labeling.service

# 启动服务
sudo systemctl start 3d-batch-labeling.service

# 查看状态
sudo systemctl status 3d-batch-labeling.service

# 查看日志
sudo journalctl -u 3d-batch-labeling.service -f
```

### 后台运行（不依赖SSH连接）

使用nohup：

```bash
nohup bash start-batch-labeling.sh > batch.log 2>&1 &
```

或使用screen：

```bash
screen -S batch-labeling
bash start-batch-labeling.sh
# 按 Ctrl+A 然后 D 分离会话

# 恢复会话
screen -r batch-labeling
```

或使用tmux：

```bash
tmux new -s batch-labeling
bash start-batch-labeling.sh
# 按 Ctrl+B 然后 D 分离会话

# 恢复会话
tmux attach -t batch-labeling
```

## 故障排查

### 问题1：Chrome启动失败

**原因**：Chrome未安装或配置不正确

**解决**：
```bash
# 检查Chrome是否安装
which google-chrome
which chromium-browser

# 如果未安装，在Debian/Ubuntu上安装：
sudo apt update
sudo apt install -y google-chrome-stable
```

### 问题2：前端无法连接

**原因**：前端服务未启动或端口被占用

**解决**：
```bash
# 检查端口占用
lsof -i:29999

# 杀死占用端口的进程
kill -9 <PID>

# 重新启动
bash start-batch-labeling.sh
```

### 问题3：批量打标卡死

**原因**：
- 内存不足
- GPU资源耗尽
- 并发数过高

**解决**：
```bash
# 降低并发数
export CONCURRENCY=2
bash start-batch-labeling.sh

# 监控资源使用
htop
nvidia-smi  # 如果使用GPU
```

### 问题4：Puppeteer连接失败

**原因**：Chrome调试端口未开启

**解决**：
```bash
# 确认Chrome已用调试端口启动
ps aux | grep "remote-debugging-port=30000"

# 测试调试端口
curl http://localhost:30000/json/version

# 如果失败，重启Chrome
bash start_chrome_swiftshader.sh
```

## API接口

前端暴露了以下全局API供自动化脚本使用：

### window.startBatchLabeling(options)

启动批量打标任务

**参数**：
```javascript
{
  concurrency: 4,           // 并发数
  viewKeys: ['axial']       // 视图键数组
}
```

**返回**：
```javascript
{
  success: true             // 是否成功
  // 或
  success: false,
  error: "错误信息"
}
```

### window.__BATCH_STATUS__

获取批量处理状态（每秒更新）

**返回**：
```javascript
{
  processed: 10,            // 已处理数量
  total: 50,                // 总数量
  isProcessing: true        // 是否正在处理
}
```

## 最佳实践

1. **分批处理**：如果文件数量很大（>1000），建议分批处理，避免一次性加载过多文件

2. **定期清理**：定期清理 `logs/` 和 `/tmp/chrome-batch-labeling`

3. **监控资源**：使用 `htop`, `nvidia-smi` 监控系统资源

4. **备份数据**：在批量处理前备份 `files/` 目录

5. **测试先行**：先用少量文件测试（CONCURRENCY=1），确认流程正常后再大规模处理

## 进阶配置

### 使用cron定时任务

每天凌晨3点自动运行：

```bash
# 编辑crontab
crontab -e

# 添加任务
0 3 * * * cd /path/to/3D_Label_Tool && bash start-batch-labeling.sh >> /var/log/batch-labeling-cron.log 2>&1
```

### 邮件通知

在 `automation/batch-labeling.js` 中添加邮件发送功能（需要安装nodemailer）：

```javascript
// 在生成报告后发送邮件
const nodemailer = require('nodemailer');

async function sendEmailReport(report) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-password'
    }
  });

  await transporter.sendMail({
    from: '"3D Label System" <your-email@gmail.com>',
    to: 'admin@example.com',
    subject: '批量打标完成报告',
    text: report
  });
}
```

## 许可证

本项目遵循原项目的许可证。

## 支持

如有问题，请提交Issue或查看项目Wiki。

