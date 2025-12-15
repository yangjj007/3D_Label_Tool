# VLM API 配置指南

## 概述

批量打标功能需要调用视觉语言模型(VLM) API来分析3D模型。在使用前，您需要配置API参数。

## 配置方法

### 方法1：交互式配置（推荐）

```bash
# Bash版本
bash configure-vlm-api.sh

# Node.js版本
node automation/configure-vlm-api.js

# 或使用npm脚本
pnpm config-vlm
```

脚本会提示您输入：
1. **API地址** - VLM服务的基础URL
2. **API Key** - 认证密钥
3. **模型名称** - 使用的模型标识符

### 方法2：环境变量配置（自动化）

```bash
export VLM_API_URL="https://api.openai.com/v1"
export VLM_API_KEY="sk-your-api-key-here"
export VLM_MODEL="gpt-4-vision-preview"

bash configure-vlm-api.sh --auto
```

## 支持的API服务

### OpenAI

```
API地址: https://api.openai.com/v1
模型: gpt-4-vision-preview, gpt-4o, gpt-4o-mini
```

### Azure OpenAI

```
API地址: https://your-resource.openai.azure.com/openai/deployments/your-deployment
模型: gpt-4-vision (或您的部署名称)
注意: 需要在API Key中添加Azure特定的认证头
```

### 其他兼容服务

任何OpenAI Chat Completions API兼容的服务都可以使用。

## 测试流程

配置脚本会自动执行以下测试：

1. **连接测试** - 验证API地址可访问
2. **认证测试** - 验证API Key有效性
3. **模型测试** - 发送测试请求验证模型可用

### 测试成功示例

```
✅ API连接测试通过！

  状态码: 200
  响应时间: 1.23秒
  使用模型: gpt-4-vision-preview

✅ 配置已保存到: /path/to/vlm-config.json
```

### 测试失败示例

```
❌ API连接测试失败

  状态码: 401
  响应时间: 0.45秒
  错误信息: Invalid API Key
  详细信息: INVALID_API_KEY
```

## 常见错误及解决方法

### 错误1: 401 Unauthorized

**原因**: API Key无效或已过期

**解决**:
- 检查API Key是否正确
- 确认API Key未过期
- 验证API Key的权限

### 错误2: 404 Not Found

**原因**: API地址或端点不正确

**解决**:
- 确认API地址格式正确
- OpenAI标准格式: `https://api.openai.com/v1`
- 结尾不要添加 `/chat/completions`

### 错误3: 429 Too Many Requests

**原因**: 超出速率限制

**解决**:
- 降低并发数 (CONCURRENCY)
- 升级API账户套餐
- 等待后重试

### 错误4: 网络连接失败

**原因**: 无法连接到API服务器

**解决**:
- 检查网络连接
- 确认服务器可以访问外网
- 检查防火墙设置
- 尝试使用代理

### 错误5: 请求超时

**原因**: API响应时间过长

**解决**:
- 检查网络质量
- 选择延迟较低的API服务
- 增加超时时间（修改脚本）

## 配置文件

配置保存在 `vlm-config.json`：

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-xxxxx",
  "modelName": "gpt-4-vision-preview",
  "lastTested": "2025-01-15T10:00:00.000Z",
  "testPassed": true
}
```

**重要**: 此文件包含敏感信息，已添加到 `.gitignore`，不会被Git追踪。

## 查看配置

```bash
# 查看当前配置
bash show-vlm-config.sh
# 或
pnpm show-config
```

输出示例：

```
========================================
VLM API 配置信息
========================================

配置文件路径:
  /path/to/vlm-config.json

API配置:
  地址: https://api.openai.com/v1
  Key:  sk-proj1234567...xyz
  模型: gpt-4-vision-preview

测试状态:
  最后测试: 2025-01-15T10:00:00.000Z
  测试结果: ✅ 通过
```

## 重新配置

如果需要更改配置，直接运行配置脚本即可：

```bash
bash configure-vlm-api.sh
```

脚本会显示当前配置，您可以选择保留或修改。

## 环境变量优先级

配置优先级（从高到低）：
1. 命令行环境变量 (`VLM_API_URL`, `VLM_API_KEY`, `VLM_MODEL`)
2. 配置文件 (`vlm-config.json`)
3. 默认值

## 安全建议

1. **不要将API Key提交到Git仓库**
   - `vlm-config.json` 已加入 `.gitignore`
   - 使用示例文件 `vlm-config.example.json`

2. **使用环境变量（生产环境）**
   ```bash
   # 在 .bashrc 或 .profile 中设置
   export VLM_API_KEY="your-key"
   ```

3. **定期轮换API Key**

4. **限制API Key权限**
   - 仅授予必要的权限
   - 设置使用配额

5. **监控API使用**
   - 定期检查API使用情况
   - 设置预算告警

## 批量打标中的使用

配置完成后，批量打标流程会自动读取 `vlm-config.json`：

```bash
# 启动批量打标
bash start-batch-labeling.sh
```

如果配置有问题，批量打标会在开始前提示您重新配置。

## 故障排查

### 检查配置是否存在

```bash
ls -lh vlm-config.json
```

### 验证配置文件格式

```bash
cat vlm-config.json | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'))"
```

### 手动测试API

```bash
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VLM_API_KEY" \
  -d '{
    "model": "gpt-4-vision-preview",
    "messages": [{"role": "user", "content": "test"}],
    "max_tokens": 10
  }'
```

## 更多帮助

- 查看主文档: [automation/README.md](./README.md)
- OpenAI API文档: https://platform.openai.com/docs
- 提交问题: GitHub Issues

