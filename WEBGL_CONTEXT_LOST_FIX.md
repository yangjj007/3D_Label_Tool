# WebGL 上下文丢失问题 - 紧急修复指南

## 问题症状

```
⚠️ WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost
📄 THREE.WebGLRenderer: Context Lost.
❌ WebGL 不可用! 错误: WebGL context is null
│ ⚠️  无法获取状态信息，继续等待...
```

## 根本原因

**WebGL 上下文丢失** 通常由以下原因引起：

1. **并发数过高** ⚠️ **最常见原因**
   - SwiftShader (CPU 软件渲染) 内存有限
   - 多个 Three.js 场景同时渲染导致内存耗尽
   - 默认并发 16 对 SwiftShader 来说太高

2. **内存不足**
   - Chrome 进程内存限制
   - 系统可用内存不足

3. **Shader 编译失败**
   - SwiftShader 对某些 Shader 支持有限
   - Three.js 后处理效果（FXAA 等）导致问题

## 🚀 快速修复（推荐）

### 方法 1: 使用自动修复脚本

```bash
bash restart-with-fix.sh
```

这个脚本会：
- ✅ 停止所有服务
- ✅ 清理临时文件
- ✅ 使用优化配置重启（并发数 2）
- ✅ 自动执行批量打标

### 方法 2: 手动降低并发数

```bash
# 1. 停止所有服务
pkill -f "chrome.*remote-debugging-port"
pm2 stop all

# 2. 清理临时文件
rm -rf /tmp/chrome-batch-labeling*

# 3. 使用低并发重启
CONCURRENCY=2 bash start-batch-labeling.sh
```

### 方法 3: 使用最小并发（最保守）

```bash
CONCURRENCY=1 bash start-batch-labeling.sh
```

## 并发数选择指南

### SwiftShader 模式（CPU 软件渲染）

| 并发数 | 状态 | 说明 |
|--------|------|------|
| 1 | ✅ **最安全** | 不会出现上下文丢失，但最慢 |
| 2 | ✅ **推荐** | 平衡安全性和速度 |
| 4 | ⚠️ 风险 | 可能导致上下文丢失 |
| 8+ | ❌ 危险 | 几乎肯定会失败 |

**命令：**
```bash
CONCURRENCY=2 bash start-batch-labeling.sh
```

### GPU 模式（Xvfb + 硬件加速）

| 并发数 | 状态 | 说明 |
|--------|------|------|
| 4 | ✅ 安全 | 保守配置 |
| 8 | ✅ **推荐** | 平衡性能 |
| 16 | ✅ 高性能 | 需要较好的 GPU |
| 32+ | ⚠️ 看情况 | 取决于 GPU 性能 |

**命令：**
```bash
# 先启动 Xvfb 模式
bash start_chrome_xvfb.sh

# 然后执行批量打标
CONCURRENCY=8 bash start-batch-labeling.sh
```

## 详细修复步骤

### 步骤 1: 诊断当前状态

```bash
# 运行诊断脚本
bash diagnose.sh

# 检查 WebGL
node check-webgl.js
```

**预期输出（正常）：**
```
✅ WebGL 可用
   供应商: Google Inc. (Google)
   渲染器: ANGLE (Google, Vulkan 1.x.x (SwiftShader))
```

**如果看到错误：**
- 继续下一步

### 步骤 2: 完全清理环境

```bash
# 停止所有 Chrome 进程
pkill -f chrome
pkill -f chromium
pkill -f Xvfb

# 停止 Node 服务
pm2 stop all
pm2 delete all

# 清理临时文件
rm -rf /tmp/chrome-batch-labeling*
rm -rf /tmp/.X99-lock

# 等待端口释放
sleep 3
```

### 步骤 3: 使用优化参数启动 Chrome

```bash
# 编辑 start_chrome_swiftshader.sh
# 确保包含以下参数：

--single-process              # 单进程模式（重要！）
--no-zygote                   # 禁用 zygote（避免多进程问题）
--js-flags="--max-old-space-size=8192"  # 增加 JS 堆内存
--disable-dev-shm-usage       # 避免共享内存问题
```

已经包含在最新版本的脚本中。

### 步骤 4: 启动并测试

```bash
# 1. 启动 Chrome
bash start_chrome_swiftshader.sh

# 2. 等待 10 秒
sleep 10

# 3. 验证 WebGL
node check-webgl.js

# 4. 如果 WebGL 可用，执行批量打标
CONCURRENCY=2 bash start-batch-labeling.sh
```

## 前端代码修复（可选）

如果上述方法仍然失败，可能需要修改前端代码来处理 WebGL 上下文丢失：

### 修改 1: 添加上下文丢失监听

在创建 Three.js 渲染器的地方添加：

```javascript
// 创建渲染器
const renderer = new THREE.WebGLRenderer({
  antialias: false,  // 禁用抗锯齿
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false  // 即使性能差也继续
});

// 监听上下文丢失
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  console.error('[WebGL] 上下文丢失');
  event.preventDefault();  // 阻止默认行为，尝试恢复
  
  // 暂停批量处理
  if (isBatchProcessing) {
    console.log('[WebGL] 暂停批量处理...');
    // TODO: 暂停逻辑
  }
}, false);

// 监听上下文恢复
renderer.domElement.addEventListener('webglcontextrestored', () => {
  console.log('[WebGL] 上下文已恢复');
  
  // 重新初始化场景
  initScene();
  
  // 恢复批量处理
  if (wasBatchProcessing) {
    console.log('[WebGL] 恢复批量处理...');
    // TODO: 恢复逻辑
  }
}, false);
```

### 修改 2: 降低渲染质量

```javascript
// 使用更低的渲染质量
renderer.setPixelRatio(1);  // 不使用设备像素比
renderer.setSize(width, height, false);  // 不更新样式

// 禁用后处理效果（FXAA 等）
// 注释掉所有 EffectComposer 和后处理通道

// 使用更简单的材质
// 避免使用复杂的 Shader
```

## 监控和调试

### 实时查看日志

```bash
# 终端 1: Chrome 日志
tail -f logs/chrome.log

# 终端 2: 批量打标日志
tail -f logs/batch-labeling-*.log

# 终端 3: 运行批量打标
CONCURRENCY=2 bash start-batch-labeling.sh
```

### 关键日志标识

**正常运行：**
```
✅ WebGL 可用
✅ Three.js 已加载
✅ 批量打标已启动
│ ██████████░░░░░░░░░░░░░░░░░░░░  33.3% │
│ 进度: 10/30 | 耗时: 5.2min | ETA: 10.4min
```

**上下文丢失：**
```
⚠️ WebGL: CONTEXT_LOST_WEBGL
📄 THREE.WebGLRenderer: Context Lost
❌ WebGL 不可用! 错误: WebGL context is null
```

**内存不足：**
```
JavaScript heap out of memory
Allocation failed
```

## 性能对比

### 不同并发数的性能对比（SwiftShader）

假设总共 100 个文件，每个文件处理时间 10 秒：

| 并发数 | 理论时间 | 实际时间 | 成功率 | 推荐 |
|--------|----------|----------|--------|------|
| 1 | 1000s (16min) | ~1000s | 100% | ⭐⭐⭐ 最稳定 |
| 2 | 500s (8min) | ~550s | 95% | ⭐⭐⭐⭐⭐ **推荐** |
| 4 | 250s (4min) | ~300s | 60% | ⚠️ 风险 |
| 8 | 125s (2min) | 失败 | 10% | ❌ 不推荐 |
| 16 | 63s (1min) | 失败 | 0% | ❌ 会失败 |

**结论：**
- **并发 2** 是最佳选择：速度提升 2 倍，稳定性好
- **并发 1** 是最保险的选择：100% 成功率

## 终极解决方案

如果上述所有方法都失败，考虑以下方案：

### 方案 A: 使用 GPU 模式（推荐）

```bash
# 1. 安装 Xvfb
sudo apt install xvfb

# 2. 停止 SwiftShader Chrome
pkill -f chrome

# 3. 启动 GPU 模式
bash start_chrome_xvfb.sh

# 4. 使用更高并发
CONCURRENCY=8 bash start-batch-labeling.sh
```

### 方案 B: 串行处理（最稳定）

```bash
CONCURRENCY=1 VIEW_KEYS=axial bash start-batch-labeling.sh
```

虽然慢，但 100% 可靠。

### 方案 C: 分批处理

手动将文件分成多个批次，每次处理一部分：

```bash
# 批次 1: 文件 1-20
mv files/raw_files/file_021_* /tmp/backup/
CONCURRENCY=2 bash start-batch-labeling.sh

# 批次 2: 文件 21-40
mv /tmp/backup/file_021_* files/raw_files/
mv files/raw_files/file_041_* /tmp/backup/
CONCURRENCY=2 bash start-batch-labeling.sh

# 依此类推...
```

## 总结

### ✅ 立即可行的解决方案

1. **降低并发数到 2**（最重要！）
2. 使用 `restart-with-fix.sh` 脚本
3. 清理临时文件和重启服务
4. 只使用一个视图（`axial`）

### 🎯 推荐命令

```bash
# 最推荐的命令组合
bash restart-with-fix.sh
```

或者手动：

```bash
pkill -f chrome
rm -rf /tmp/chrome-batch-labeling*
CONCURRENCY=2 VIEW_KEYS=axial bash start-batch-labeling.sh
```

### 📞 如果仍然失败

提供以下信息：

1. 系统配置：
```bash
uname -a
free -h
google-chrome --version
```

2. 完整日志：
```bash
tail -100 logs/chrome.log > chrome-error.log
tail -100 logs/batch-labeling-*.log > batch-error.log
```

3. WebGL 诊断：
```bash
node check-webgl.js > webgl-status.txt
```

上传这三个文件以获取更多帮助。

