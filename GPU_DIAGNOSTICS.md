# GPU 加速诊断指南

## 问题现象
批量打标时 GPU 内存使用不变，怀疑没有使用 GPU 硬件加速。

## 诊断步骤

### 1. 查看控制台日志
启动批量打标后，查看浏览器控制台，找到类似以下的日志：

```
[OffscreenRenderModel] 🎮 GPU 信息:
  - 厂商: Google Inc. (NVIDIA)
  - 渲染器: ANGLE (NVIDIA GeForce RTX 3060)
[OffscreenRenderModel] ✅ 正在使用 GPU 硬件加速
[OffscreenRenderModel] WebGL 版本: WebGL 2.0
[OffscreenRenderModel] GPU 测试完成，10帧耗时: 15.20ms
[OffscreenRenderModel] ✅ 渲染性能良好，GPU 加速正常工作
```

### 2. 判断是否使用硬件加速

#### ✅ 正常情况（GPU 加速）
- 渲染器包含实际 GPU 型号：`NVIDIA`, `AMD`, `Intel UHD`
- GPU 测试耗时 < 50ms
- 显示 "✅ 正在使用 GPU 硬件加速"

#### ❌ 异常情况（软件渲染）
- 渲染器包含：`SwiftShader`, `llvmpipe`, `Microsoft Basic Render Driver`
- GPU 测试耗时 > 500ms
- 显示 "⚠️ 警告：正在使用软件渲染"

### 3. 为什么 GPU 内存不变？

#### 可能的原因：

1. **浏览器的 GPU 内存管理策略**
   - Chrome/Edge 使用共享 GPU 内存池
   - OffscreenCanvas 的内存可能被延迟分配
   - 浏览器任务管理器显示的是**进程级别**的总 GPU 内存，不是每个 Canvas 的

2. **WebGL 内存分配方式**
   - WebGL 上下文创建时不立即分配所有内存
   - 只有在加载纹理、模型数据时才分配
   - 空的 OffscreenCanvas 只占用极少显存（几 MB）

3. **Windows GPU 内存统计问题**
   - Windows 任务管理器的 GPU 内存可能不准确
   - 需要使用专业工具（GPU-Z、MSI Afterburner）才能看到真实显存使用

### 4. 如何验证真的在使用 GPU？

#### 方法 1：查看 Chrome GPU 进程
1. 打开 Chrome，访问：`chrome://gpu`
2. 查看 "Graphics Feature Status"
3. 确认 "WebGL" 和 "WebGL2" 都是 **Hardware accelerated**

#### 方法 2：使用 GPU 监控工具
- **GPU-Z**（轻量级）：可以看到 GPU 负载百分比
- **MSI Afterburner**：可以看到详细的 GPU 使用率
- **NVIDIA GeForce Experience**（NVIDIA 显卡）

运行批量打标时，观察：
- **GPU 使用率**应该会增加（10-50%）
- **Video Encode** 或 **3D** 负载会上升

#### 方法 3：性能测试
```javascript
// 在控制台运行
performance.mark('start');
// 运行批量打标
// 等待完成后
performance.mark('end');
performance.measure('batch', 'start', 'end');
console.log(performance.getEntriesByName('batch'));
```

如果 64 个并发比 4 个并发快很多（>10倍），说明确实是并行的。

### 5. 强制启用 GPU 加速

如果检测到软件渲染，尝试以下方法：

#### Chrome/Edge 设置
1. 访问：`chrome://flags`
2. 搜索并启用：
   - `#enable-webgl2-compute-context`
   - `#enable-gpu-rasterization`
   - `#ignore-gpu-blocklist`
3. 重启浏览器

#### 启动参数
使用命令行启动 Chrome：
```bash
chrome.exe --enable-gpu-rasterization --ignore-gpu-blocklist
```

#### 更新显卡驱动
- NVIDIA: [https://www.nvidia.com/drivers](https://www.nvidia.com/drivers)
- AMD: [https://www.amd.com/support](https://www.amd.com/support)
- Intel: [https://www.intel.com/content/www/us/en/download-center/home.html](https://www.intel.com/content/www/us/en/download-center/home.html)

## 性能基准

### 预期性能（GPU 加速）
- 单个文件处理时间：5-15 秒
- 64 个并发：应该接近 4 个并发的 10-15 倍速度
- GPU 测试耗时：10-50ms

### 软件渲染（无 GPU）
- 单个文件处理时间：30-60 秒
- 64 个并发：可能比 4 个并发还慢（CPU 瓶颈）
- GPU 测试耗时：>500ms

## 真相：OffscreenCanvas 的 GPU 内存使用

OffscreenCanvas 的 GPU 内存使用特点：

1. **延迟分配**：只有在实际渲染和上传纹理时才分配显存
2. **共享机制**：多个 Canvas 可能共享某些 GPU 资源
3. **动态管理**：浏览器会根据需要动态分配和释放
4. **不可见**：某些 GPU 内存（如 Command Buffer）不会显示在监控工具中

**结论**：即使任务管理器显示 GPU 内存不变，只要：
- 控制台显示硬件加速
- GPU 使用率上升
- 处理速度符合预期

就说明 GPU 确实在工作！

## 常见问题

### Q: 为什么创建 64 个渲染器后显存只增加了几百 MB？
**A**: 正常！空的 WebGL 上下文很小（~5-10MB）。主要显存占用来自：
- 模型数据加载时（纹理、几何体）
- 截图时的帧缓冲
- 后期处理效果（OutlinePass）

### Q: 如何确认并发真的有效？
**A**: 测试 4 并发 vs 16 并发的总耗时。如果 16 并发快 3-4 倍，说明并发有效。

### Q: GPU 使用率为什么只有 20%？
**A**: 正常！WebGL 渲染不会 100% 占用 GPU。20-40% 已经说明在使用 GPU 了。

### Q: 软件渲染能用吗？
**A**: 可以，但：
- 速度极慢（10-20倍慢）
- convertToBlob 更容易失败
- 建议并发数降低到 2-4

## 总结

**不要只看显存占用！** 

判断是否使用 GPU 加速的正确方法：
1. ✅ 控制台日志显示硬件加速
2. ✅ GPU 使用率有明显变化
3. ✅ 处理速度符合预期
4. ✅ GPU 测试耗时 < 50ms

只要满足以上条件，就说明 GPU 加速正常工作！

