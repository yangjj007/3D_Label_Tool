# 批量打标故障排除指南

## 问题：显示"待处理文件总数: 0"但文件确实存在

### 问题原因

当批量打标脚本显示待处理文件为0，但 `files/raw_files/` 目录下确实有 `.glb` 文件时，通常是因为：

1. **后端工作目录不正确**：后端服务不是从项目根目录启动的，导致相对路径指向错误的位置
2. **后端进程陈旧**：后端服务在之前从错误的目录启动，一直在运行

### 解决方案

#### 方案1：使用修复后的批量打标脚本（推荐）

修复后的 `start-batch-labeling.sh` 脚本会自动重启后端服务，确保工作目录正确：

```bash
bash start-batch-labeling.sh
```

#### 方案2：手动重启后端

1. **停止现有后端服务**

   如果使用 pm2：
   ```bash
   pm2 stop all
   pm2 delete all
   ```

   如果使用 nohup：
   ```bash
   # 查找进程
   ps aux | grep "node server/index.js"
   # 杀死进程
   kill <PID>
   ```

2. **从项目根目录重新启动后端**

   ```bash
   cd /data2/wangchangmiao/yjj/3D_Label_Tool
   node server/index.js
   ```

   或使用 pm2：
   ```bash
   cd /data2/wangchangmiao/yjj/3D_Label_Tool
   pm2 start server/index.js --name "3d-label-server" --cwd $(pwd)
   ```

#### 方案3：使用诊断脚本检查

运行诊断脚本查看详细信息：

```bash
bash check-backend-files.sh
```

这个脚本会检查：
- 本地文件系统中的文件数量
- 后端API是否能看到这些文件
- 给出具体的错误原因和建议

### 验证修复

1. 启动后端后，检查后端日志，应该看到类似输出：

   ```
   📂 服务器目录配置:
      工作目录: /data2/wangchangmiao/yjj/3D_Label_Tool
      服务器文件: /data2/wangchangmiao/yjj/3D_Label_Tool/server
      RAW_FILES目录: /data2/wangchangmiao/yjj/3D_Label_Tool/files/raw_files
      LABELED_FILES目录: /data2/wangchangmiao/yjj/3D_Label_Tool/files/labeled_files
   ```

2. 访问后端API测试：

   ```bash
   curl "http://localhost:30005/api/files?type=raw&page=1&pageSize=1"
   ```

   应该返回包含文件的JSON，类似：
   ```json
   {
     "success": true,
     "total": 123,
     "page": 1,
     "pageSize": 1,
     "files": [...]
   }
   ```

3. 再次运行批量打标脚本，应该能看到正确的文件数量

### 技术说明

修复包含以下改进：

1. **后端使用绝对路径**：`server/index.js` 现在使用 `path.resolve(__dirname, '..')` 计算项目根目录，然后用绝对路径访问文件目录

2. **启动脚本强制重启后端**：`start-batch-labeling.sh` 会先停止现有的后端服务，然后从正确的目录重新启动

3. **详细的调试日志**：
   - 后端启动时输出目录配置
   - 扫描目录时输出文件数量
   - 批量打标脚本获取文件列表时输出详细信息

4. **诊断工具**：`check-backend-files.sh` 可以快速诊断问题

### 常见问题

**Q: 为什么不能像浏览器打开前端那样自动初始化？**

A: 浏览器中打开前端时，前端会从后端API获取文件列表。后端会返回所有 `.glb` 文件，即使它们没有对应的 `.json` 元数据文件。批量打标脚本也是一样的逻辑。问题的关键不是初始化，而是后端能否正确扫描到文件目录。

**Q: 需要为每个 .glb 文件创建 .json 文件吗？**

A: 不需要。后端会自动处理没有 .json 的文件，为它们生成默认的元数据。

**Q: 批量打标会跳过已打标的文件吗？**

A: 是的。前端代码会检查 `labeled_files` 目录，跳过已经打标的文件，实现断点续传。

