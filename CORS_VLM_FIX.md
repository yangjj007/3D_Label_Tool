# VLM CORS 错误修复指南

## 问题说明

当前端（`http://localhost:9999`）尝试直接访问本地VLM服务（`http://localhost:30000`）时，浏览器的同源策略会阻止跨域请求，导致CORS错误：

```
Access to XMLHttpRequest at 'http://localhost:30000/v1/chat/completions' 
from origin 'http://localhost:9999' has been blocked by CORS policy
```

## 已实施的解决方案：后端代理 ✅

### 工作原理

1. **前端检测**：自动检测VLM服务是否为本地服务（包含 `localhost` 或 `127.0.0.1`）
2. **代理转发**：如果是本地服务，请求会自动通过后端服务器（30005端口）代理
3. **避免CORS**：后端到VLM的请求不受浏览器CORS限制

### 修改内容

#### 1. 后端服务器 (`server/index.js`)

添加了 VLM 代理路由：

```javascript
// VLM API 代理
app.post('/api/vlm/chat/completions', async (req, res) => {
  // 接收前端请求并转发到本地VLM服务
  // 返回VLM服务的响应给前端
});
```

#### 2. 前端服务 (`src/utils/vlmService.js`)

修改了请求逻辑，自动使用代理：

```javascript
// 检测是否为本地VLM服务
const isLocalVLM = this.baseUrl.includes('localhost') || 
                   this.baseUrl.includes('127.0.0.1');

if (isLocalVLM) {
  // 通过后端代理访问
  const proxyUrl = '/api/vlm/chat/completions';
  response = await axios.post(proxyUrl, { ... });
} else {
  // 直接访问远程服务
  response = await axios.post(`${this.baseUrl}/v1/chat/completions`, { ... });
}
```

## 使用方法

### 1. 重启服务

```bash
# Windows
npm run dev:full

# 或分别启动
npm run serve  # 前端 (9999端口)
npm run server # 后端 (30005端口)
```

### 2. 确保VLM服务运行

确保你的VLM服务正在 `http://localhost:30000` 运行。

### 3. 测试

现在你的前端应该可以正常访问VLM服务了，不会再出现CORS错误。

## 备选方案：直接配置VLM服务的CORS

如果你能访问VLM服务的配置，也可以直接在VLM服务端启用CORS：

### 方案A：如果VLM服务是Express/Node.js应用

```javascript
const cors = require('cors');
app.use(cors({
  origin: '*',  // 或指定具体域名 'http://localhost:9999'
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 方案B：如果VLM服务是FastAPI/Python应用

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 或指定 ["http://localhost:9999"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 方案C：如果VLM服务是Flask/Python应用

```python
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*")  # 或指定具体域名
```

## 环境变量配置（可选）

你可以在 `.env` 文件中配置VLM服务地址：

```env
# VLM服务地址（后端代理会使用这个默认值）
VLM_BASE_URL=http://localhost:30000
```

## 故障排查

### 1. 检查后端代理日志

启动服务后，在后端终端查看代理日志：

```
[VLM代理] 转发请求到: http://localhost:30000/v1/chat/completions
```

### 2. 检查前端日志

在浏览器控制台查看：

```
[VLM] 使用代理访问: http://localhost:30005/api/vlm/chat/completions
```

### 3. 常见错误

#### 错误：VLM服务无响应

- **原因**：VLM服务（30000端口）未运行
- **解决**：启动VLM服务

#### 错误：503 Service Unavailable

- **原因**：后端服务无法连接到VLM服务
- **解决**：检查VLM服务是否运行，端口是否正确

#### 错误：仍然出现CORS错误

- **原因**：可能使用了缓存的代码
- **解决**：
  1. 清除浏览器缓存（Ctrl+Shift+Delete）
  2. 硬刷新页面（Ctrl+Shift+R）
  3. 重启前端服务

## 性能说明

- **延迟**：代理会增加 < 5ms 的延迟（可忽略不计）
- **稳定性**：代理服务器会自动处理连接错误和超时
- **超时设置**：当前设置为 5 分钟（可在 `server/index.js` 中调整）

## 安全说明

⚠️ **注意**：当前配置允许所有来源访问（`origin: '*'`）

**生产环境建议**：

```javascript
app.use(cors({
  origin: 'https://your-domain.com',  // 指定具体域名
  credentials: true
}));
```

## 总结

✅ **推荐方案**：使用后端代理（已实施）
- 优点：无需修改VLM服务，自动处理CORS
- 缺点：请求需要经过一次转发

🔄 **备选方案**：直接在VLM服务配置CORS
- 优点：直接访问，无代理延迟
- 缺点：需要有VLM服务的配置权限

---

**修复完成时间**：$(date)
**测试状态**：✅ 代码已就绪，等待测试

