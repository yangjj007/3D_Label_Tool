# SwiftShader 软件渲染解决方案

## 🔍 问题确认

你的系统正在使用 **SwiftShader 软件渲染器**：

```
渲染器: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
```

### SwiftShader 是什么？
- **CPU 软件渲染器**，不是真正的 GPU
- 完全运行在 CPU 上，模拟 GPU 行为
- 不占用 GPU 显存（这就是为什么 GPU 内存不变）
- 性能比真实 GPU 慢 10-100 倍
- `convertToBlob` 更容易失败

### 为什么会这样？

你的启动脚本中有这些参数：
```bash
--disable-gpu              # 禁用 GPU
--enable-unsafe-swiftshader  # 启用 SwiftShader
--use-gl=swiftshader        # 强制使用 SwiftShader
```

这些参数**强制使用软件渲染**。

---

## 解决方案

### 方案 1：启用硬件 GPU 加速（推荐）⭐

#### 前提条件
服务器必须有 GPU（NVIDIA/AMD/Intel）

#### 1.1 检查服务器 GPU

```bash
# NVIDIA GPU
nvidia-smi

# 所有 GPU
lspci | grep -i vga

# 输出示例：
# 01:00.0 VGA compatible controller: NVIDIA Corporation Device 2204 (rev a1)
```

#### 1.2 安装必要驱动

**NVIDIA GPU:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nvidia-driver-535 nvidia-utils-535

# 验证
nvidia-smi
```

**Intel GPU:**
```bash
# Ubuntu/Debian
sudo apt install intel-gpu-tools mesa-vulkan-drivers

# 验证
intel_gpu_top
```

#### 1.3 修改 Chrome 启动脚本

保存为 `start_chrome_gpu.sh`：

```bash
#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}启动 Chrome - GPU 硬件加速模式${NC}"
echo -e "${GREEN}===========================================${NC}"

# 清理旧进程
OLD_PID=$(pgrep -f "chrome.*remote-debugging-port=30000")
if [ ! -z "$OLD_PID" ]; then
    echo -e "${YELLOW}⚠️  发现旧进程 PID: $OLD_PID，正在关闭...${NC}"
    kill $OLD_PID 2>/dev/null
    sleep 2
fi

# 清理临时数据
rm -rf /tmp/chrome-batch-labeling 2>/dev/null

# 启动 Chrome - GPU 加速版本
echo -e "${GREEN}🚀 启动 Chrome (GPU 加速)...${NC}"
nohup google-chrome \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --use-gl=angle \
  --use-angle=vulkan \
  --enable-features=Vulkan \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --enable-native-gpu-memory-buffers \
  --remote-debugging-port=30000 \
  --window-size=1920,1080 \
  --user-data-dir=/tmp/chrome-batch-labeling \
  --disable-sync \
  --disable-extensions \
  --no-first-run \
  --mute-audio \
  http://localhost:29999 \
  > /tmp/chrome.log 2>&1 &

CHROME_PID=$!
sleep 3

# 检查是否启动成功
if ps -p $CHROME_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 启动成功！${NC}"
    echo -e "   PID: ${GREEN}$CHROME_PID${NC}"
    echo ""
    echo -e "${YELLOW}🎮 GPU 模式：硬件加速${NC}"
    echo ""
    echo -e "${YELLOW}📊 验证 GPU 状态:${NC}"
    echo -e "   1. 打开应用，开始批量打标"
    echo -e "   2. 查看控制台日志，应显示实际 GPU 型号"
    echo -e "   3. 运行 'nvidia-smi' 查看 GPU 使用率"
    echo ""
    echo -e "${YELLOW}📊 查看日志:${NC}"
    echo -e "   tail -f /tmp/chrome.log"
else
    echo -e "${RED}❌ Chrome 启动失败${NC}"
    echo -e "查看详细日志: tail -50 /tmp/chrome.log"
    exit 1
fi
```

#### 1.4 运行并验证

```bash
chmod +x start_chrome_gpu.sh
./start_chrome_gpu.sh
```

启动批量打标后，控制台应显示：
```
[OffscreenRenderModel] 🎮 GPU 信息:
  - 厂商: NVIDIA Corporation
  - 渲染器: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 ...)
[OffscreenRenderModel] ✅ 正在使用 GPU 硬件加速
```

**不再是 SwiftShader！**

---

### 方案 2：优化 SwiftShader 使用（服务器无 GPU）

如果服务器**没有 GPU**，只能使用 SwiftShader，但需要严格限制并发。

#### 2.1 我已经为你自动优化了代码

- ✅ 自动检测 SwiftShader
- ✅ SwiftShader 模式下强制限制并发为 **8**
- ✅ GPU 信号量降低到 **4**
- ✅ 增加重试机制

#### 2.2 使用建议

**SwiftShader 模式下的最佳配置：**

| 配置项 | 推荐值 | 说明 |
|-------|-------|------|
| 并发数 | **4-8** | 系统会自动限制到 8 |
| CPU 核心数 | **16+** | SwiftShader 吃 CPU |
| 内存 | **32GB+** | 每个渲染器约 500MB |
| 单文件超时 | **5 分钟** | 已在代码中设置 |

#### 2.3 性能预期

**SwiftShader vs 硬件 GPU:**

| 操作 | SwiftShader | 硬件 GPU | 速度对比 |
|------|------------|----------|---------|
| 单文件处理 | 30-60 秒 | 5-10 秒 | **6-10x 慢** |
| 64 并发（理论） | 不可用 | 可用 | **无法比较** |
| 8 并发 | 4-8 分钟/批次 | 30-60 秒/批次 | **5-8x 慢** |
| 稳定性 | ⚠️ 中等 | ✅ 很好 | - |

#### 2.4 SwiftShader 常见问题

**Q: convertToBlob 仍然失败怎么办？**

A: 进一步降低并发数到 **4** 或 **2**，修改并发设置对话框的默认值。

**Q: CPU 使用率 100% 怎么办？**

A: 正常！SwiftShader 是 CPU 渲染。确保服务器有足够的 CPU 核心。

**Q: 内存不足怎么办？**

A: 每个渲染器约占 500MB，8 个并发需要 4GB+。降低并发数或升级内存。

---

### 方案 3：混合方案（推荐）⭐⭐⭐

**在本地使用硬件 GPU，通过 API 调用远程服务器！**

#### 3.1 架构

```
本地电脑 (有GPU)          远程服务器 (无GPU)
┌──────────────┐          ┌──────────────┐
│  前端界面    │          │  后端 API    │
│  批量打标    │ ───────> │  VLM 服务    │
│  GPU 渲染    │          │  文件存储    │
└──────────────┘          └──────────────┘
     ↓ GPU 加速                 ↓ 只处理 API
     ✅ 快速稳定              ✅ 不需要渲染
```

#### 3.2 优势

- ✅ 本地使用真实 GPU，速度快 10 倍
- ✅ 支持 64 个真并发
- ✅ `convertToBlob` 稳定
- ✅ 服务器只负责 VLM API 和文件存储
- ✅ 可以多台本地电脑同时工作

#### 3.3 配置方法

1. **在本地启动前端**：
```bash
# 在本地电脑
npm run dev
```

2. **配置 API 地址为远程服务器**：
```javascript
// 在前端配置中
baseUrl: 'http://远程服务器IP:端口'
```

3. **SSH 端口转发**（如果需要）：
```bash
ssh -L 8080:localhost:8080 root@远程服务器 -p 30397
```

4. **在本地批量打标**，享受 GPU 加速！

---

## 性能对比总结

| 方案 | 速度 | 稳定性 | 成本 | 难度 |
|------|------|--------|------|------|
| 远程服务器 GPU 加速 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 高 | 中 |
| 远程 SwiftShader | ⭐ | ⭐⭐ | 低 | 低 |
| 本地 GPU + 远程 API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 | 低 |

---

## 推荐方案

### 如果服务器有 GPU
→ **使用方案 1**：启用硬件 GPU 加速

### 如果服务器无 GPU
→ **使用方案 3**：本地 GPU + 远程 API（最优）
→ 或**方案 2**：优化 SwiftShader（次优，速度慢）

---

## 验证方法

### 启动后查看控制台日志

**✅ 硬件 GPU（正常）：**
```
渲染器: ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 ...)
或: ANGLE (Intel, Intel(R) UHD Graphics ...)
✅ 正在使用 GPU 硬件加速
GPU 测试完成，10帧耗时: 15-40ms
```

**❌ SwiftShader（软件渲染）：**
```
渲染器: ANGLE (..., SwiftShader Device ...)
⚠️ 警告：正在使用软件渲染
GPU 测试完成，10帧耗时: 30-50ms
```

---

## 总结

1. **SwiftShader 不是 GPU**，是 CPU 软件渲染
2. **性能差距巨大**：硬件 GPU 比 SwiftShader 快 10-100 倍
3. **最佳方案**：本地使用 GPU，远程只做 API 服务
4. **如果必须用 SwiftShader**：并发数限制在 4-8，耐心等待

现在代码已经优化，会自动检测并限制 SwiftShader 的并发数。建议你尝试方案 1 或方案 3！

