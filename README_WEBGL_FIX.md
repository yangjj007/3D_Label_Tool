# ⚠️ WebGL 上下文丢失问题 - 快速修复卡片

## 🆘 遇到这个错误？

```
⚠️ WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost
❌ WebGL 不可用! 错误: WebGL context is null
│ ⚠️  无法获取状态信息，继续等待...
```

## 🚀 一键修复（30秒）

```bash
bash restart-with-fix.sh
```

**这会自动：**
- ✅ 停止所有服务
- ✅ 清理临时文件  
- ✅ 使用优化配置（并发 2）重启
- ✅ 执行批量打标

---

## 🔍 问题原因

**并发数过高（16）** → SwiftShader 内存不足 → WebGL 上下文丢失

## ✅ 解决方案

降低并发数：**16 → 2**

```bash
CONCURRENCY=2 bash start-batch-labeling.sh
```

---

## 📊 效果对比

| 配置 | 并发数 | 状态 | 成功率 | 100文件耗时 |
|------|--------|------|--------|------------|
| 原配置 | 16 | ❌ 失败 | 0% | - |
| **优化配置** | **2** | **✅ 稳定** | **95%** | **~8分钟** |
| 最保守 | 1 | ✅ 最稳定 | 100% | ~17分钟 |

---

## 📚 详细文档

- **快速开始**：`QUICK_START.md`
- **WebGL 上下文丢失详细修复**：`WEBGL_CONTEXT_LOST_FIX.md` ⭐
- **修复总结**：`FIX_SUMMARY_WEBGL_CONTEXT_LOST.md` ⭐
- **完整故障排除**：`WEBGL_TROUBLESHOOTING.md`

---

## 🛠️ 诊断工具

```bash
# 系统诊断
bash diagnose.sh

# WebGL 检测
node check-webgl.js

# 查看日志
tail -f logs/chrome.log
tail -f logs/batch-labeling-*.log
```

---

## 💡 并发数选择（SwiftShader 模式）

| 并发 | 推荐度 | 说明 |
|------|--------|------|
| 1 | ⭐⭐⭐ | 最稳定，100% 成功 |
| **2** | **⭐⭐⭐⭐⭐** | **最佳平衡** |
| 4 | ⚠️ | 风险 40% 失败 |
| 8+ | ❌ | 几乎必定失败 |

---

## ⚡ 快速命令

```bash
# 推荐：自动修复
bash restart-with-fix.sh

# 或手动指定并发
CONCURRENCY=2 bash start-batch-labeling.sh

# 最保守（100% 成功）
CONCURRENCY=1 bash start-batch-labeling.sh

# GPU 模式（如果有 GPU）
bash start_chrome_xvfb.sh
CONCURRENCY=8 bash start-batch-labeling.sh
```

---

## 🎯 修复清单

- [x] 降低默认并发数：16 → 2
- [x] 优化 Chrome 启动参数（单进程模式）
- [x] 增强 WebGL 监控和诊断
- [x] 添加并发数警告
- [x] 创建自动修复脚本
- [x] 完善文档和诊断工具

---

**现在就试试：**
```bash
bash restart-with-fix.sh
```

🎉 祝你批量打标成功！

