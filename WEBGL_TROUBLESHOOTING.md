# WebGL 故障排除指南

## 问题描述

批量打标脚本运行时出现以下错误：

```
❌ [浏览器错误] Error creating WebGL context.
❌ 应用加载失败: Waiting failed: 30000ms exceeded
```

这表明 Chrome 无法创建 WebGL 上下文，导致 Three.js 3D 应用无法运行。

## 快速诊断

### 1. 运行 WebGL 诊断工具

```bash
node check-webgl.js
```

这个工具会：
- 连接到正在运行的 Chrome 实例
- 检查 WebGL 1.0 和 2.0 是否可用
- 显示渲染器信息（GPU 或 SwiftShader）
- 给出建议

### 2. 查看详细日志

现在所有脚本都包含了详细的日志输出：

```bash
# 查看 Chrome 日志
tail -f logs/chrome.log

# 查看批量打标日志
tail -f logs/batch-labeling-*.log

# 如果使用 Xvfb
tail -f logs/xvfb.log
```

## 常见问题和解决方案

### 问题 1: WebGL 完全不可用

**症状：**
```
❌ WebGL 不可用!
   错误: WebGL context is null
```

**原因：**
- Chrome 启动时禁用了 WebGL
- 没有可用的渲染后端（GPU 或软件渲染）

**解决方案：**

#### 方案 A: 使用 SwiftShader（推荐用于无 GPU 环境）

```bash
# 1. 停止现有的 Chrome
pkill -f "chrome.*remote-debugging-port"

# 2. 使用 SwiftShader 启动
bash start_chrome_swiftshader.sh

# 3. 验证 WebGL
node check-webgl.js
```

**注意事项：**
- SwiftShader 是 CPU 软件渲染，速度较慢
- 建议将并发数降低到 4-8
- 预计性能比 GPU 慢 10-100 倍

#### 方案 B: 使用 Xvfb + GPU（推荐用于有 GPU 的服务器）

```bash
# 1. 安装 Xvfb（如果未安装）
sudo apt install xvfb

# 2. 停止现有的 Chrome
pkill -f "chrome.*remote-debugging-port"
pkill -f "Xvfb"

# 3. 使用 Xvfb 启动
bash start_chrome_xvfb.sh

# 4. 验证 WebGL
node check-webgl.js
```

**注意事项：**
- 需要服务器有 GPU 硬件
- 性能最好，可以使用较高的并发数（16-32）

### 问题 2: 端口配置不一致

**症状：**
```
❌ 连接Chrome失败: 连接超时
```

**原因：**
Chrome 启动脚本使用的端口与批量打标脚本不一致

**解决方案：**

确保所有脚本使用相同的端口配置：

```bash
# 在 start-batch-labeling.sh 中查看端口配置
server_port=9999      # 前端服务端口
api_port=10000        # 后端服务端口
chrome_debug_port=30000  # Chrome调试端口

# 这些端口会自动传递给 Chrome 启动脚本
```

如果需要修改端口：

```bash
# 方法 1: 直接修改 start-batch-labeling.sh 开头的变量

# 方法 2: 使用环境变量
export SERVER_URL=http://localhost:9999
export API_URL=http://localhost:10000
export CHROME_DEBUG_PORT=30000
bash start-batch-labeling.sh
```

### 问题 3: Chrome 启动参数问题

**症状：**
Chrome 启动了，但是 WebGL 仍然不可用

**检查方法：**

```bash
# 查看 Chrome 进程的完整命令行
ps aux | grep chrome | grep remote-debugging-port
```

**必需的参数（SwiftShader 模式）：**
```
--use-gl=swiftshader        # 使用 SwiftShader
--enable-unsafe-swiftshader # 启用不安全的 SwiftShader（必需）
--disable-gpu               # 禁用 GPU（因为要用软件渲染）
```

**禁止使用的参数：**
```
--disable-webgl            # 这会完全禁用 WebGL！
--disable-3d-apis          # 这也会禁用 WebGL
```

### 问题 4: 前端 API 未暴露

**症状：**
```
❌ 批量打标 API 未暴露!
   请检查前端代码是否正确挂载了 window.startBatchLabeling
```

**原因：**
前端代码没有正确暴露全局 API

**检查方法：**

1. 打开前端应用，在浏览器控制台输入：
```javascript
typeof window.startBatchLabeling
// 应该返回 "function"
```

2. 查看前端代码中的 API 暴露：
```bash
grep -r "window.startBatchLabeling" src/
```

**解决方案：**

确保前端代码中有类似这样的代码：
```javascript
// 暴露给自动化脚本使用的全局 API
window.startBatchLabeling = async (config) => {
  // ... 实现
};
```

### 问题 5: 应用加载超时

**症状：**
```
❌ 应用加载失败: Waiting failed: 30000ms exceeded
```

**可能原因：**
1. 前端服务未启动或端口不对
2. Vue 应用初始化失败
3. WebGL 不可用导致 Three.js 初始化卡死

**诊断步骤：**

```bash
# 1. 检查前端服务
curl http://localhost:9999

# 2. 检查后端服务
curl http://localhost:10000/api/health

# 3. 查看浏览器日志（现在有详细输出）
# 批量打标脚本会自动输出所有浏览器控制台日志

# 4. 查看错误截图
# 失败时会自动保存截图到 logs/error-screenshot.png
```

## 完整的启动流程

### 自动启动（推荐）

```bash
# 一键启动所有服务并开始批量打标
bash start-batch-labeling.sh
```

这个脚本会自动：
1. 检查并启动后端服务
2. 检查并启动前端服务
3. 检查并启动 Chrome 浏览器
4. 运行批量打标自动化脚本
5. 生成详细的日志和报告

### 手动启动（用于调试）

```bash
# 1. 启动后端（在项目根目录）
cd /path/to/3D_Label_Tool
PORT=10000 node server/index.js

# 2. 启动前端（在项目根目录）
pnpm preview --host 0.0.0.0 --port 9999

# 3. 启动 Chrome
bash start_chrome_swiftshader.sh

# 4. 验证 WebGL
node check-webgl.js

# 5. 运行批量打标
node automation/batch-labeling.js
```

## 性能优化建议

### SwiftShader 模式（CPU 软件渲染）

```bash
# 推荐配置
export CONCURRENCY=4-8
export VIEW_KEYS=axial  # 只使用一个视图
```

**预期性能：**
- 每个文件处理时间：5-30 秒（取决于模型复杂度）
- 并发数：4-8
- CPU 使用率：高（80-100%）

### GPU 模式（Xvfb + 硬件加速）

```bash
# 推荐配置
export CONCURRENCY=16-32
export VIEW_KEYS=axial,sagittal,coronal  # 可以使用多个视图
```

**预期性能：**
- 每个文件处理时间：1-5 秒
- 并发数：16-32
- GPU 使用率：高
- CPU 使用率：中

## 日志说明

### 新增的详细日志

现在所有脚本都包含详细的日志输出：

#### 1. Chrome 连接日志
```
🔌 连接到Chrome调试端口: 30000...
🔍 调试URL: http://localhost:30000/json/version
📊 浏览器信息:
   产品: Chrome/xxx
   用户代理: Mozilla/5.0 ...
📡 WebSocket地址: ws://localhost:30000/...
✅ 已通过 Puppeteer 连接到浏览器
```

#### 2. WebGL 检查日志
```
🔍 检查 WebGL 支持...
✅ WebGL 可用
   供应商: Google Inc. (Google)
   渲染器: ANGLE (Google, Vulkan 1.x.x (SwiftShader))
   版本: WebGL 1.0 (OpenGL ES 2.0 Chromium)
```

#### 3. 浏览器控制台日志
```
📄 [浏览器-log] Application loaded
❌ [浏览器-error] Error: something went wrong
⚠️ [浏览器-warning] Performance warning
```

#### 4. API 请求/响应日志
```
🌐 [请求] GET http://localhost:10000/api/files?type=raw
✅ [响应] 200 http://localhost:10000/api/files?type=raw
```

## 常用命令

```bash
# 检查 Chrome 进程
ps aux | grep chrome | grep remote-debugging-port

# 杀死 Chrome 进程
pkill -f "chrome.*remote-debugging-port"

# 检查端口占用
lsof -i:9999   # 前端
lsof -i:10000  # 后端
lsof -i:30000  # Chrome 调试

# 查看实时日志
tail -f logs/chrome.log
tail -f logs/batch-labeling-*.log

# 运行 WebGL 诊断
node check-webgl.js

# 测试前端和后端连接
curl http://localhost:9999
curl http://localhost:10000/api/health
curl http://localhost:30000/json/version
```

## 获取帮助

如果以上方法都无法解决问题，请提供以下信息：

1. **系统信息：**
```bash
uname -a
google-chrome --version
node --version
```

2. **完整日志：**
```bash
# 上传以下文件
logs/chrome.log
logs/batch-labeling-*.log
logs/error-screenshot.png  # 如果存在
```

3. **WebGL 诊断结果：**
```bash
node check-webgl.js > webgl-diagnosis.txt 2>&1
```

4. **Chrome 启动命令：**
```bash
ps aux | grep chrome | grep remote-debugging-port
```

