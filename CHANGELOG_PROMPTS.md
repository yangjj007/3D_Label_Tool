# 提示词库功能更新日志

## [2025-12-09] 提示词持久化功能

### 新增功能

#### 1. 文件持久化
- ✅ 添加"保存到文件"按钮，可将提示词保存到 `prompts-library.json`
- ✅ 添加"从文件加载"按钮，可从文件重新加载提示词
- ✅ 应用启动时自动从文件加载提示词（优先于 localStorage）

#### 2. 结构化存储
- ✅ JSON格式存储，包含版本号、时间戳、描述等元数据
- ✅ 支持提示词的完整信息：id、content、weight、description
- ✅ 自动记录更新时间，便于追踪变更

#### 3. Git 同步支持
- ✅ `prompts-library.json` 不在 `.gitignore` 中
- ✅ 可以通过 Git 提交和推送，与团队成员共享提示词库
- ✅ 支持版本控制和历史追踪

### 文件变更

#### 新增文件
1. `prompts-library.json` - 提示词库配置文件（项目根目录）
2. `prompts-library-guide.md` - 功能使用指南
3. `CHANGELOG_PROMPTS.md` - 更新日志（本文件）

#### 修改文件
1. `server/index.js`
   - 新增 `GET /api/prompts-library` - 获取提示词库
   - 新增 `POST /api/prompts-library` - 保存提示词库
   
2. `src/components/ModelEditPanel/EditVlm.vue`
   - 新增"保存到文件"按钮和 `savePromptsToServer()` 函数
   - 新增"从文件加载"按钮和 `loadPromptsFromServer()` 函数
   - 修改 `onMounted()` 钩子，支持启动时从文件加载
   - 新增 loading 状态管理：`savingPrompts`、`loadingPrompts`
   - 新增 CSS 样式：`.prompt-actions-row`

### 技术实现

#### 前端
- 使用 `fetch` API 与服务器通信
- 支持 loading 状态显示
- 错误处理和用户提示
- 自动同步到 localStorage

#### 后端
- Express.js RESTful API
- 文件系统操作（fs模块）
- JSON格式化输出（便于版本控制）
- 完整的错误处理

### 使用方法

#### 保存提示词
1. 在界面中添加、编辑或删除提示词
2. 点击"保存到文件"按钮
3. 看到成功提示："提示词库已保存到文件 (N 个提示词)"
4. `prompts-library.json` 文件已更新

#### 加载提示词
1. 点击"从文件加载"按钮
2. 看到成功提示："已从文件加载 N 个提示词"
3. 界面中的提示词列表已更新

#### Git 同步
```bash
# 保存提示词后提交到 Git
git add prompts-library.json
git commit -m "更新提示词库"
git push origin main

# 其他成员拉取更新
git pull origin main
# 重启应用，自动加载最新的提示词
```

### 配置说明

#### 服务器地址
默认：`http://localhost:30001`

如需修改，请在以下位置更新：
- `src/components/ModelEditPanel/EditVlm.vue` 第 1183、1220、677 行

#### 文件路径
默认：项目根目录 `prompts-library.json`

如需修改，请在以下位置更新：
- `server/index.js` 第 484 行

### 注意事项

1. **服务器要求**
   - 必须启动 Node.js 服务器才能使用保存/加载功能
   - 启动命令：`node server/index.js` 或 `npm run server`

2. **Git 冲突处理**
   - 多人同时修改提示词可能导致冲突
   - 建议：通过 Git 分支进行修改，合并时仔细审查

3. **数据安全**
   - 提示词保存在本地文件和 localStorage 中
   - 删除操作不可恢复（除非从 Git 历史恢复）
   - 建议定期备份重要提示词

4. **浏览器兼容性**
   - 使用 Fetch API，需要现代浏览器支持
   - localStorage 需要浏览器启用

### 未来改进计划

- [ ] 添加提示词导出功能（导出为单独的 JSON 文件）
- [ ] 支持提示词导入（从外部 JSON 文件导入）
- [ ] 添加提示词分类和标签
- [ ] 实现提示词版本历史查看
- [ ] 添加提示词搜索和过滤功能
- [ ] 支持提示词模板和变量
- [ ] 实现云端同步（可选）

### 问题反馈

如遇到问题或有改进建议，请通过以下方式反馈：
- 在 GitHub 上创建 Issue
- 查看 `prompts-library-guide.md` 中的故障排除章节

---

**作者**: AI Assistant  
**日期**: 2025-12-09  
**版本**: 1.0.0

