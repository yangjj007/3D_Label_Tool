# 离屏渲染调试指南

## 已添加的调试功能

### 1. 详细的调试日志

在批量打标过程中，控制台会输出详细的调试信息：

#### 模型加载阶段
```
[OffscreenRenderModel] 开始调整模型变换...
[OffscreenRenderModel] 模型边界框: {center: {x, y, z}, size: {x, y, z}}
[OffscreenRenderModel] 模型已居中到: {x, y, z}
[OffscreenRenderModel] 模型缩放: X.XXXX 目标大小: 4
[OffscreenRenderModel] 模型最终变换: {position, scale}
[OffscreenRenderModel] 场景子对象数量: X
[OffscreenRenderModel] 模型在场景中: true
[OffscreenRenderModel] 已进行首次渲染
```

#### 截图阶段
```
[OffscreenRenderModel] ===== 开始捕获材质: [材质名称] =====
[OffscreenRenderModel] 视角列表: [main, top, side, axial]
[OffscreenRenderModel] 材质可见性: true
[OffscreenRenderModel] 场景子对象数量: X
[OffscreenRenderModel] 模型是否在场景中: true
[OffscreenRenderModel] 确保目标材质可见: [材质名称]
[OffscreenRenderModel] 设置视角 [1/4]: main
[OffscreenRenderModel] 相机位置: {x: 0.00, y: 2.00, z: 6.00}
[OffscreenRenderModel] 已渲染场景
[OffscreenRenderModel] 截图大小: XXXXX bytes
[OffscreenRenderModel] 调试图片已保存: debug_[timestamp]_[材质名]_[视角]_[索引].png
```

### 2. 自动保存截图

**每次截图都会自动下载到浏览器的下载文件夹！**

文件命名格式：
```
debug_[时间戳]_[材质名称]_[视角]_[索引].png
```

例如：
```
debug_1705123456789_Material_001_main_0.png
debug_1705123456789_Material_001_top_1.png
debug_1705123456789_Material_001_side_2.png
```

### 3. 关键修改

#### 修改1：移除材质隐藏逻辑
**之前**: 只显示当前材质，隐藏其他材质
**现在**: 保持所有材质可见

这样可以确保模型完整显示，不会出现空白场景。

#### 修改2：增强模型变换日志
详细输出模型的：
- 边界框（中心点和尺寸）
- 位置调整
- 缩放比例
- 最终变换参数

#### 修改3：相机和渲染状态检查
- 输出相机位置
- 检查场景、相机、渲染器是否存在
- 确认模型是否在场景中

## 使用方法

### 步骤1：启动批量打标
1. 打开浏览器控制台（F12）
2. 开始批量打标
3. 观察控制台日志

### 步骤2：查看下载的截图
1. 打开浏览器的下载文件夹
2. 查找以 `debug_` 开头的 PNG 文件
3. 检查图片内容：
   - ✓ 应该能看到 3D 模型
   - ✓ 模型应该在画面中央
   - ✓ 模型大小合适
   - ✓ 有灰色背景

### 步骤3：分析问题

#### 如果截图是空白的
**检查日志**：
```
[OffscreenRenderModel] 场景子对象数量: 0  ← 问题：模型未添加到场景
[OffscreenRenderModel] 模型在场景中: false  ← 问题：模型未添加到场景
```
**可能原因**：模型加载失败

#### 如果截图中模型太小或看不见
**检查日志**：
```
[OffscreenRenderModel] 模型缩放: 0.0001  ← 问题：缩放太小
[OffscreenRenderModel] 相机位置: {x: 100.00, y: 100.00, z: 100.00}  ← 问题：相机太远
```
**可能原因**：模型尺寸异常或相机位置不对

#### 如果截图中模型位置不对
**检查日志**：
```
[OffscreenRenderModel] 模型已居中到: {x: 10.00, y: 20.00, z: 30.00}  ← 问题：未正确居中
```
**可能原因**：模型原点不在中心

#### 如果截图有模型但VLM还是说没有黄色边框
**可能原因**：
1. 模型显示正常，但 VLM 无法识别
2. 提示词问题（期望看到黄色边框，但图中没有）
3. 图片分辨率或质量问题

## 常见问题排查

### 问题1：没有下载截图
**检查**：
- 浏览器是否阻止了自动下载？
- 查看浏览器下载设置
- 检查控制台是否有保存截图的日志

**解决**：
- 允许网站进行多个下载
- 检查下载文件夹权限

### 问题2：截图全黑或全白
**检查日志**：
```
[OffscreenRenderModel] 场景背景颜色: #eeeeee
```

**可能原因**：
- 光源问题
- 模型材质问题
- 渲染器设置问题

### 问题3：控制台日志太多
**筛选方法**：
在控制台过滤框输入：
```
OffscreenRenderModel
```
只显示离屏渲染相关的日志

## 调试检查清单

在报告问题前，请检查：

- [ ] 浏览器控制台有完整的调试日志
- [ ] 下载文件夹中有截图文件
- [ ] 已查看截图内容
- [ ] 记录了关键的日志信息（模型尺寸、相机位置、缩放比例等）
- [ ] 确认模型在场景中（`模型在场景中: true`）
- [ ] 确认进行了渲染（`已渲染场景`）

## 提供反馈时请包含

1. **浏览器信息**
   - 浏览器版本（chrome://version）
   - 是否支持 OffscreenCanvas

2. **控制台日志**
   - 完整的 OffscreenRenderModel 相关日志
   - 错误信息（如果有）

3. **截图文件**
   - 至少提供 1-2 张下载的截图
   - 说明图片内容（空白/太小/位置不对/正常等）

4. **模型信息**
   - 文件名
   - 文件大小
   - 材质数量
   - 是否能在普通模式下正常显示

## 预期的正常日志示例

```
[OffscreenRenderModel] 模型加载成功: test.glb, 材质数: 5
[OffscreenRenderModel] 场景子对象数量: 4
[OffscreenRenderModel] 模型在场景中: true
[OffscreenRenderModel] 已进行首次渲染

[OffscreenRenderModel] ===== 开始捕获材质: Material_001 =====
[OffscreenRenderModel] 视角列表: ["main", "top", "side", "axial"]
[OffscreenRenderModel] 材质可见性: true
[OffscreenRenderModel] 场景子对象数量: 4
[OffscreenRenderModel] 模型是否在场景中: true
[OffscreenRenderModel] 确保目标材质可见: Material_001

[OffscreenRenderModel] 设置视角 [1/4]: main
[OffscreenRenderModel] 相机位置: {x: 0.00, y: 2.00, z: 6.00}
[OffscreenRenderModel] 已渲染场景
[OffscreenRenderModel] 截图大小: 45678 bytes
[OffscreenRenderModel] 调试图片已保存: debug_1705123456789_Material_001_main_0.png

[OffscreenRenderModel] 成功捕获 4 张图片
```

## 下一步

1. **刷新页面**，确保加载最新代码
2. **开始批量打标**
3. **查看控制台日志**
4. **检查下载的截图文件**
5. **根据日志和截图分析问题**

如果问题持续，请提供完整的日志和截图文件！

