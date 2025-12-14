# Linux服务器部署指南

## 快速部署步骤

### 1. 准备服务器环境

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要的依赖
sudo apt install -y \
  curl \
  wget \
  git \
  build-essential \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils
```

### 2. 安装Node.js和pnpm

```bash
# 安装nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装Node.js 21
nvm install 21
nvm use 21

# 安装pnpm
npm install -g pnpm

# 安装PM2（进程管理器）
npm install -g pm2
```

### 3. 安装Chrome浏览器

```bash
# 下载Chrome安装包
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# 安装Chrome
sudo dpkg -i google-chrome-stable_current_amd64.deb

# 如果有依赖问题，运行：
sudo apt-get install -f

# 验证安装
google-chrome --version
```

### 4. 克隆并配置项目

```bash
# 克隆代码仓库（如果还没有）
cd /opt  # 或其他目录
git clone <your-repo-url> 3D_Label_Tool
cd 3D_Label_Tool

# 安装项目依赖
pnpm install

# 构建前端
pnpm build:pro

# 赋予脚本执行权限
chmod +x start-batch-labeling.sh
chmod +x stop-all.sh
chmod +x start_chrome_swiftshader.sh
chmod +x start_chrome_xvfb.sh

# 创建必要的目录
mkdir -p logs files/raw_files files/labeled_files temp-chunks
```

### 5. 测试运行

```bash
# 测试启动
bash start-batch-labeling.sh

# 如果遇到问题，检查日志
tail -f logs/batch-labeling-*.log
tail -f /tmp/chrome.log
```

### 6. 配置systemd服务（推荐）

```bash
# 创建服务文件
sudo nano /etc/systemd/system/3d-batch-labeling.service
```

内容如下：

```ini
[Unit]
Description=3D Model Batch Labeling Service
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/opt/3D_Label_Tool
Environment="PATH=/home/your_username/.nvm/versions/node/v21.3.0/bin:/usr/local/bin:/usr/bin:/bin"
Environment="CONCURRENCY=4"
Environment="VIEW_KEYS=axial"
ExecStart=/bin/bash /opt/3D_Label_Tool/start-batch-labeling.sh
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/3d-batch-labeling.log
StandardError=append:/var/log/3d-batch-labeling-error.log

[Install]
WantedBy=multi-user.target
```

**重要**：将 `your_username` 替换为实际用户名，并确保 `PATH` 中包含正确的Node.js路径。

```bash
# 重新加载systemd配置
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

## 使用Git同步代码

### 初次部署后，更新代码：

```bash
cd /opt/3D_Label_Tool

# 停止所有服务
bash stop-all.sh

# 拉取最新代码
git pull origin main

# 安装新依赖（如果有）
pnpm install

# 重新构建前端
pnpm build:pro

# 重启服务
bash start-batch-labeling.sh
# 或使用systemd
sudo systemctl restart 3d-batch-labeling.service
```

### 自动部署脚本

创建 `deploy.sh`：

```bash
#!/bin/bash

echo "🚀 开始部署..."

# 停止服务
echo "⏹️  停止服务..."
bash stop-all.sh || true

# 拉取代码
echo "📥 拉取最新代码..."
git pull origin main

# 安装依赖
echo "📦 安装依赖..."
pnpm install --frozen-lockfile

# 构建前端
echo "🔨 构建前端..."
pnpm build:pro

# 赋予执行权限
chmod +x start-batch-labeling.sh stop-all.sh start_chrome_*.sh

# 重启服务
echo "🚀 重启服务..."
if systemctl is-active --quiet 3d-batch-labeling.service; then
    sudo systemctl restart 3d-batch-labeling.service
    echo "✅ 服务已通过systemd重启"
else
    bash start-batch-labeling.sh &
    echo "✅ 服务已手动启动"
fi

echo "✅ 部署完成！"
```

然后使用：

```bash
chmod +x deploy.sh
bash deploy.sh
```

## 安全配置

### 1. 创建专用用户

```bash
# 创建系统用户
sudo useradd -r -m -s /bin/bash labeling

# 设置目录权限
sudo chown -R labeling:labeling /opt/3D_Label_Tool

# 切换到该用户运行服务
sudo -u labeling bash start-batch-labeling.sh
```

### 2. 配置防火墙

```bash
# 如果需要外网访问前端（不推荐，建议通过Nginx反向代理）
sudo ufw allow 29999/tcp  # 前端
sudo ufw allow 30005/tcp  # 后端API

# 启用防火墙
sudo ufw enable
```

### 3. Nginx反向代理（推荐）

```bash
# 安装Nginx
sudo apt install nginx

# 创建配置文件
sudo nano /etc/nginx/sites-available/3d-label-tool
```

内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:29999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # 后端API
    location /api {
        proxy_pass http://localhost:30005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/3d-label-tool /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

## 监控和告警

### 1. 日志轮转

创建 `/etc/logrotate.d/3d-label-tool`：

```
/opt/3D_Label_Tool/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 labeling labeling
    sharedscripts
    postrotate
        systemctl reload 3d-batch-labeling.service > /dev/null 2>&1 || true
    endscript
}
```

### 2. 磁盘空间监控

```bash
# 添加到crontab
crontab -e

# 每天检查磁盘空间
0 6 * * * df -h / | grep -vE '^Filesystem' | awk '{if(int($5) > 80) print "磁盘使用率超过80%: " $0}' | mail -s "磁盘空间告警" admin@example.com
```

### 3. 进程监控

```bash
# 使用PM2的监控功能
pm2 monit

# 或安装监控面板
pm2 install pm2-server-monit
```

## 性能优化

### 1. 系统优化

```bash
# 增加文件描述符限制
sudo nano /etc/security/limits.conf
```

添加：

```
* soft nofile 65536
* hard nofile 65536
```

### 2. Chrome优化

根据服务器配置调整并发数：

```bash
# 查看CPU核心数
nproc

# 查看内存
free -h

# 如果是8核16GB，设置并发数为8
export CONCURRENCY=8
```

### 3. 定期清理

创建清理脚本 `cleanup.sh`：

```bash
#!/bin/bash

# 清理30天前的日志
find /opt/3D_Label_Tool/logs -name "*.log" -mtime +30 -delete

# 清理Chrome缓存
rm -rf /tmp/chrome-batch-labeling

# 清理临时文件
rm -rf /opt/3D_Label_Tool/temp-chunks/*

echo "清理完成"
```

添加到crontab：

```bash
# 每周日凌晨2点清理
0 2 * * 0 /opt/3D_Label_Tool/cleanup.sh
```

## 故障恢复

### 备份策略

```bash
# 备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backup/3d-label-tool"
mkdir -p $BACKUP_DIR

# 备份文件目录
tar -czf $BACKUP_DIR/files-$DATE.tar.gz /opt/3D_Label_Tool/files

# 备份配置
tar -czf $BACKUP_DIR/config-$DATE.tar.gz \
  /opt/3D_Label_Tool/.env \
  /opt/3D_Label_Tool/prompts-library.json

# 删除30天前的备份
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### 恢复

```bash
# 恢复文件
tar -xzf files-20250115.tar.gz -C /

# 恢复配置
tar -xzf config-20250115.tar.gz -C /
```

## 常见问题

### Q1: 服务器重启后服务没有自动启动

**解决**：
```bash
# 确认systemd服务已启用
sudo systemctl is-enabled 3d-batch-labeling.service

# 如果显示disabled，启用它
sudo systemctl enable 3d-batch-labeling.service
```

### Q2: Chrome崩溃

**解决**：
```bash
# 增加共享内存
sudo mount -o remount,size=2G /dev/shm

# 或在/etc/fstab中添加：
tmpfs /dev/shm tmpfs defaults,size=2G 0 0
```

### Q3: 内存不足

**解决**：
```bash
# 创建swap空间
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 永久挂载
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 技术支持

遇到问题？

1. 查看日志：`tail -f logs/batch-labeling-*.log`
2. 查看服务状态：`sudo systemctl status 3d-batch-labeling.service`
3. 检查资源：`htop`, `free -h`, `df -h`
4. 提交Issue到GitHub仓库

## 更新日志

- 2025-01-15: 初始版本，支持自动化批量打标

