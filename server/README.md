# 3D模型标注系统 - 服务器端部署说明

## 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0 或 pnpm >= 8.0.0
- 至少 2GB 可用磁盘空间（用于存储模型文件）

## 安装步骤

### 1. 安装依赖

在项目根目录运行：

```bash
# 使用 npm
npm install

# 或使用 pnpm
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 文件为 `.env`：

```bash
cp .env.example .env
```

然后编辑 `.env` 文件，根据实际情况修改配置：

```env
VITE_API_BASE_URL=http://your-server-ip:3001/api
VITE_CHUNK_SIZE=10485760
VITE_DEFAULT_BATCH_SIZE=10
VITE_MAX_CONCURRENT_TAGS=3
```

### 3. 创建存储目录

服务器会自动创建以下目录，但您也可以手动创建：

```bash
mkdir -p files/raw_files
mkdir -p files/labeled_files
mkdir -p temp-chunks
```

## 启动服务

### 开发环境

**仅启动后端服务器：**

```bash
npm run server
```

**同时启动前端和后端：**

```bash
npm run dev:full
```

服务器将在 `http://localhost:3001` 启动。

### 生产环境部署

#### 方式一：使用 PM2（推荐）

1. 安装 PM2：

```bash
npm install -g pm2
```

2. 创建 PM2 配置文件 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: '3d-label-server',
    script: './server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

3. 启动服务：

```bash
pm2 start ecosystem.config.js
```

4. 设置开机自启：

```bash
pm2 startup
pm2 save
```

5. 常用 PM2 命令：

```bash
pm2 list              # 查看所有进程
pm2 logs 3d-label-server  # 查看日志
pm2 restart 3d-label-server  # 重启服务
pm2 stop 3d-label-server     # 停止服务
pm2 delete 3d-label-server   # 删除进程
```

#### 方式二：使用 systemd

1. 创建 systemd 服务文件 `/etc/systemd/system/3d-label.service`：

```ini
[Unit]
Description=3D Model Label Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/3D_Label_Tool
ExecStart=/usr/bin/node /path/to/3D_Label_Tool/server/index.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

2. 启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl start 3d-label
sudo systemctl enable 3d-label
```

## Nginx 反向代理配置

创建 Nginx 配置文件 `/etc/nginx/sites-available/3d-label`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/3D_Label_Tool/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 增加超时时间（用于大文件上传）
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        
        # 增加请求体大小限制
        client_max_body_size 1000M;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/3d-label /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS 配置（可选）

使用 Let's Encrypt 配置 HTTPS：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## API 接口说明

### 文件列表

```
GET /api/files?type=raw&page=1&pageSize=10
```

- `type`: raw（未打标）、labeled（已打标）、all（全部）
- `page`: 页码
- `pageSize`: 每页数量

### 上传文件块

```
POST /api/upload-chunk
Content-Type: multipart/form-data

{
  chunk: File,
  fileId: string,
  chunkIndex: number,
  totalChunks: number
}
```

### 合并文件块

```
POST /api/merge-chunks
Content-Type: application/json

{
  fileId: string,
  filename: string,
  totalChunks: number,
  metadata: object
}
```

### 下载文件

```
GET /api/download/:fileId
```

支持 HTTP Range 请求实现分块下载。

### 移动到已打标

```
POST /api/move-to-labeled
Content-Type: multipart/form-data

{
  file: File,
  fileId: string,
  metadata: string (JSON)
}
```

### 删除文件

```
DELETE /api/files/:fileId
```

## 目录结构

```
3D_Label_Tool/
├── server/
│   ├── index.js          # 服务器主文件
│   └── README.md         # 本文档
├── files/
│   ├── raw_files/        # 未打标文件
│   └── labeled_files/    # 已打标文件
├── temp-chunks/          # 临时分块文件
├── dist/                 # 前端构建产物
└── .env                  # 环境变量配置
```

## 监控和日志

### 查看服务状态

```bash
# PM2
pm2 status

# systemd
sudo systemctl status 3d-label
```

### 查看日志

```bash
# PM2
pm2 logs 3d-label-server

# systemd
sudo journalctl -u 3d-label -f
```

### 磁盘空间监控

定期检查模型文件目录的磁盘使用情况：

```bash
du -sh files/
df -h
```

## 性能优化建议

1. **增加服务器内存**：处理大文件时建议至少 4GB 内存
2. **使用 SSD**：提高文件读写性能
3. **启用 Nginx 缓存**：缓存静态资源
4. **配置文件清理策略**：定期清理旧的临时文件

## 常见问题

### 1. 文件上传失败

- 检查 Nginx 的 `client_max_body_size` 配置
- 检查服务器磁盘空间是否充足
- 查看服务器日志排查错误

### 2. 服务无法启动

- 检查端口 3001 是否被占用
- 检查 Node.js 版本是否符合要求
- 查看错误日志

### 3. 跨域问题

- 确保服务器正确配置了 CORS
- 检查前端的 API_BASE_URL 配置

## 安全建议

1. **限制上传文件类型**：只允许 .glb、.gltf、.obj、.fbx、.stl 格式
2. **设置文件大小限制**：根据实际需求调整最大文件大小
3. **启用 HTTPS**：保护数据传输安全
4. **定期备份**：备份 files 目录中的重要数据
5. **访问控制**：如需要，添加认证机制

## 技术支持

如遇到问题，请查看：
- 服务器日志：`pm2 logs` 或 `sudo journalctl -u 3d-label`
- Nginx 日志：`/var/log/nginx/error.log`
- 项目 Issues：提交到项目仓库

## 许可证

参见项目根目录的 LICENSE 文件。

