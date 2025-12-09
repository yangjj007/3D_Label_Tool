# 提示词库功能说明

## 功能概述

提示词库功能允许您在3D标签工具中管理和持久化VLM（视觉语言模型）提示词。提示词可以保存到项目文件中，并同步到GitHub供团队成员共享使用。

## 功能特性

### 1. 提示词管理
- **添加提示词**：点击"添加提示词"按钮创建新的提示词
- **编辑提示词**：点击提示词内容或编辑按钮进行修改
- **删除提示词**：点击删除按钮移除不需要的提示词（至少保留一个）
- **权重设置**：在"加权"模式下可以为每个提示词设置权重（1-100）

### 2. 选择规则
- **随机模式**：从提示词库中随机选择一个提示词
- **加权模式**：根据设置的权重进行加权随机选择

### 3. 文件持久化

#### 保存到文件
点击"保存到文件"按钮，将当前所有提示词保存到项目根目录的 `prompts-library.json` 文件中。

**保存内容包括：**
- 所有提示词的内容
- 每个提示词的唯一ID
- 权重值
- 选择规则（随机/加权）
- 更新时间戳

#### 从文件加载
点击"从文件加载"按钮，从 `prompts-library.json` 文件中读取提示词配置。

**加载行为：**
- 替换当前内存中的所有提示词
- 同时更新浏览器本地存储（localStorage）
- 保持选择规则的同步

#### 自动加载
应用启动时会自动尝试从服务器文件加载提示词：
1. 优先从 `prompts-library.json` 文件加载
2. 如果文件不存在或加载失败，则从浏览器本地存储加载
3. 确保始终有可用的提示词配置

## 文件格式

### prompts-library.json 结构

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-12-09T00:00:00.000Z",
  "description": "VLM提示词库配置文件 - 用于工业设计3D模型分析",
  "selectionRule": "random",
  "prompts": [
    {
      "id": "default-prompt-1",
      "content": "提示词内容...",
      "weight": 1,
      "description": "提示词描述",
      "createdAt": "2025-12-09T00:00:00.000Z",
      "updatedAt": "2025-12-09T00:00:00.000Z"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| version | string | 配置文件版本号 |
| lastUpdated | string | 最后更新时间（ISO 8601格式） |
| description | string | 配置文件描述 |
| selectionRule | string | 选择规则："random"（随机）或 "weighted"（加权） |
| prompts | array | 提示词数组 |
| prompts[].id | string | 提示词唯一标识符 |
| prompts[].content | string | 提示词内容 |
| prompts[].weight | number | 权重值（1-100），仅在加权模式下使用 |
| prompts[].description | string | 提示词描述（可选） |
| prompts[].createdAt | string | 创建时间（可选） |
| prompts[].updatedAt | string | 更新时间 |

## API 接口

### 获取提示词库
```
GET http://localhost:3001/api/prompts-library
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "prompts": [...],
    "selectionRule": "random"
  }
}
```

### 保存提示词库
```
POST http://localhost:3001/api/prompts-library
Content-Type: application/json

{
  "prompts": [...],
  "selectionRule": "random",
  "description": "描述"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "提示词库保存成功",
  "count": 5,
  "lastUpdated": "2025-12-09T12:00:00.000Z"
}
```

## 使用流程

### 首次使用
1. 启动应用时，系统会自动从 `prompts-library.json` 加载默认提示词
2. 如果需要，可以在界面中添加或修改提示词
3. 点击"保存到文件"按钮，将修改保存到文件
4. 提交到 Git 仓库，与团队共享

### 团队协作
1. 团队成员拉取最新代码，获取最新的 `prompts-library.json`
2. 启动应用时自动加载团队共享的提示词配置
3. 如需修改，编辑后保存到文件
4. 通过 Git 提交和推送，分享给其他团队成员

### 本地测试
1. 可以在本地随意添加、修改、删除提示词
2. 不保存到文件，修改仅在浏览器 localStorage 中
3. 需要持久化时再点击"保存到文件"

## 注意事项

1. **Git 同步**：`prompts-library.json` 文件未添加到 `.gitignore`，会被提交到 Git 仓库
2. **服务器依赖**：保存和加载功能需要 Node.js 服务器运行（默认端口：3001）
3. **权限管理**：所有用户都可以保存提示词，建议通过 Git 分支管理来控制权限
4. **版本冲突**：多人同时修改可能导致 Git 冲突，需要手动解决
5. **备份建议**：重要提示词建议定期备份或通过 Git tag 标记重要版本

## 故障排除

### 保存失败
- 确认 Node.js 服务器正在运行（`npm run server` 或 `node server/index.js`）
- 检查服务器端口是否为 3001
- 查看浏览器控制台和服务器日志

### 加载失败
- 确认 `prompts-library.json` 文件存在于项目根目录
- 检查 JSON 文件格式是否正确
- 尝试手动访问：`http://localhost:3001/api/prompts-library`

### 提示词丢失
- 检查浏览器 localStorage 是否被清除
- 从 `prompts-library.json` 重新加载
- 如果文件也丢失，可以从 Git 历史恢复

## 开发者信息

### 相关文件
- **前端组件**：`src/components/ModelEditPanel/EditVlm.vue`
- **服务器API**：`server/index.js`
- **配置文件**：`prompts-library.json`

### 扩展功能建议
- 添加提示词分类功能
- 实现提示词导入/导出（支持多种格式）
- 添加提示词版本管理
- 支持提示词模板和变量替换
- 实现提示词使用统计和推荐

