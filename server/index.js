// 加载 .env 文件中的环境变量
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// 强制要求从环境变量读取端口配置
if (!process.env.PORT) {
  console.error('❌ 错误: 未设置环境变量 PORT');
  console.error('请在启动前设置 PORT 环境变量，例如:');
  console.error('  export PORT=30005');
  console.error('  或在 .env 文件中配置 PORT=30005');
  process.exit(1);
}
const PORT = process.env.PORT;

// 配置CORS - 允许所有来源（开发环境）
// 生产环境建议配置具体的允许来源
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: false
}));

// 配置中间件
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 配置存储目录 - 使用绝对路径
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FILES_DIR = path.join(PROJECT_ROOT, 'files');
const RAW_FILES_DIR = path.join(FILES_DIR, 'raw_files');
const LABELED_FILES_DIR = path.join(FILES_DIR, 'labeled_files');
const FILTERED_FILES_DIR = path.join(FILES_DIR, 'filtered_files');
const TEMP_CHUNKS_DIR = path.join(PROJECT_ROOT, 'temp-chunks');

// 确保目录存在
[FILES_DIR, RAW_FILES_DIR, LABELED_FILES_DIR, FILTERED_FILES_DIR, TEMP_CHUNKS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 输出目录信息（用于调试）
console.log('📂 服务器目录配置:');
console.log(`   工作目录: ${process.cwd()}`);
console.log(`   服务器文件: ${__dirname}`);
console.log(`   RAW_FILES目录: ${RAW_FILES_DIR}`);
console.log(`   LABELED_FILES目录: ${LABELED_FILES_DIR}`);
console.log(`   FILTERED_FILES目录: ${FILTERED_FILES_DIR}`);

// 分块上传配置 - 使用内存存储，然后手动写入文件
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 每块最大100MB
});

// 获取文件列表（分页）
app.get('/api/files', (req, res) => {
  try {
    const { type = 'all', page = 1, pageSize = 10 } = req.query;
    
    let targetDir;
    if (type === 'raw') {
      targetDir = RAW_FILES_DIR;
    } else if (type === 'labeled') {
      targetDir = LABELED_FILES_DIR;
    } else if (type === 'filtered') {
      targetDir = FILTERED_FILES_DIR;
    } else {
      // 合并所有目录的文件
      const rawFiles = getFilesFromDirectory(RAW_FILES_DIR, 'raw');
      const labeledFiles = getFilesFromDirectory(LABELED_FILES_DIR, 'labeled');
      const filteredFiles = getFilesFromDirectory(FILTERED_FILES_DIR, 'filtered');
      const allFiles = [...rawFiles, ...labeledFiles, ...filteredFiles];
      
      return sendPaginatedResponse(allFiles, page, pageSize, res);
    }
    
    const files = getFilesFromDirectory(targetDir, type);
    sendPaginatedResponse(files, page, pageSize, res);
    
  } catch (error) {
    console.error('获取文件列表失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 辅助函数：从目录获取文件列表
function getFilesFromDirectory(dir, type) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  目录不存在: ${dir}`);
    return files;
  }
  
  const allFiles = fs.readdirSync(dir);
  const fileNames = allFiles.filter(name => !name.endsWith('.json'));
  console.log(`📁 扫描目录 ${path.basename(dir)}: 总文件=${allFiles.length}, 非JSON文件=${fileNames.length}`);
  
  for (const fileName of fileNames) {
    const filePath = path.join(dir, fileName);
    const stats = fs.statSync(filePath);
    const metadataPath = `${filePath}.json`;
    
    let metadata = {
      name: fileName,
      size: stats.size,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime
    };
    
    // 读取元数据
    if (fs.existsSync(metadataPath)) {
      try {
        const metaContent = fs.readFileSync(metadataPath, 'utf8');
        const savedMeta = JSON.parse(metaContent);
        metadata = { ...metadata, ...savedMeta };
      } catch (err) {
        console.warn(`读取元数据失败: ${metadataPath}`, err);
      }
    }
    
    files.push({
      id: fileName,
      name: fileName,
      size: stats.size,
      type: type || 'unknown',
      status: metadata.hasLabels ? 'labeled' : 'raw',
      createdAt: stats.birthtime,
      updatedAt: metadata.updatedAt || stats.mtime,
      labels: metadata.labels || [],
      hasLabels: metadata.hasLabels || false,
      filterMetrics: metadata.filterMetrics || null,  // 包含过滤指标数据
      filteredAt: metadata.filteredAt || null,  // 包含过滤时间
      sourceType: metadata.sourceType || null,  // 包含来源类型
      isFromServer: true,  // 标记为来自服务器
      serverFileId: fileName  // 服务器文件ID
    });
  }
  
  // 按创建时间降序排序
  files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  return files;
}

// 辅助函数：发送分页响应
function sendPaginatedResponse(files, page, pageSize, res) {
  const pageNum = parseInt(page);
  const pageSizeNum = parseInt(pageSize);
  const total = files.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedFiles = files.slice(start, end);
  
  res.json({
    success: true,
    total,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.ceil(total / pageSizeNum),
    files: paginatedFiles
  });
}

// 上传文件块
app.post('/api/upload-chunk', uploadChunk.single('chunk'), (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: '没有接收到文件块' });
    }
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId参数缺失' });
    }
    
    // 创建临时块目录
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    
    // 将内存中的文件写入磁盘
    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.file.buffer);
    
    res.json({
      success: true,
      message: `块 ${parseInt(chunkIndex) + 1}/${totalChunks} 上传成功`,
      chunkIndex: parseInt(chunkIndex)
    });
  } catch (error) {
    console.error('上传块失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 检查已上传的块
app.post('/api/check-chunks', (req, res) => {
  try {
    const { fileId, totalChunks } = req.body;
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    
    const uploadedChunks = [];
    if (fs.existsSync(chunkDir)) {
      for (let i = 0; i < totalChunks; i++) {
        if (fs.existsSync(path.join(chunkDir, `chunk-${i}`))) {
          uploadedChunks.push(i);
        }
      }
    }
    
    res.json({
      success: true,
      uploadedChunks,
      shouldResume: uploadedChunks.length > 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 合并文件块
app.post('/api/merge-chunks', async (req, res) => {
  try {
    const { fileId, filename, totalChunks, metadata = {} } = req.body;
    
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    const finalPath = path.join(RAW_FILES_DIR, filename);
    
    // 创建写入流
    const writeStream = fs.createWriteStream(finalPath);
    
    // 按顺序合并所有块
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk-${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`缺少块 ${i}`);
      }
      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
    }
    
    writeStream.end();
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // 清理临时块文件
    fs.rmSync(chunkDir, { recursive: true, force: true });
    
    // 保存元数据
    const fileStats = fs.statSync(finalPath);
    const metadataToSave = {
      ...metadata,
      filename,
      size: fileStats.size,
      uploadTime: new Date().toISOString(),
      fileId
    };
    
    const metadataPath = finalPath + '.json';
    fs.writeFileSync(metadataPath, JSON.stringify(metadataToSave, null, 2));
    
    res.json({
      success: true,
      message: '文件合并成功',
      filename,
      size: fileStats.size,
      path: finalPath
    });
    
  } catch (error) {
    console.error('合并块失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 下载文件（支持分块下载）
app.get('/api/download/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    
    // 按优先级查找：filtered -> labeled -> raw
    let filePath;
    let fileSource;
    
    if (fs.existsSync(path.join(FILTERED_FILES_DIR, fileId))) {
      filePath = path.join(FILTERED_FILES_DIR, fileId);
      fileSource = 'filtered_files';
    } else if (fs.existsSync(path.join(LABELED_FILES_DIR, fileId))) {
      filePath = path.join(LABELED_FILES_DIR, fileId);
      fileSource = 'labeled_files';
    } else if (fs.existsSync(path.join(RAW_FILES_DIR, fileId))) {
      filePath = path.join(RAW_FILES_DIR, fileId);
      fileSource = 'raw_files';
    } else {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    console.log(`[下载] 文件: ${fileId}, 来源: ${fileSource}, 大小: ${fs.statSync(filePath).size} bytes`);
    
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const range = req.headers.range;
    
    if (range) {
      // 支持分块下载
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      
      const fileStream = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream'
      });
      
      fileStream.pipe(res);
    } else {
      // 完整下载
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileId}"`
      });
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    }
    
  } catch (error) {
    console.error('下载文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 批量下载文件信息
app.post('/api/batch-download', (req, res) => {
  try {
    const { fileIds } = req.body;
    
    if (!Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'fileIds必须是数组' });
    }
    
    const filesInfo = fileIds.map(fileId => {
      // 按优先级查找：filtered -> labeled -> raw
      let filePath;
      let type;
      
      if (fs.existsSync(path.join(FILTERED_FILES_DIR, fileId))) {
        filePath = path.join(FILTERED_FILES_DIR, fileId);
        type = 'filtered';
      } else if (fs.existsSync(path.join(LABELED_FILES_DIR, fileId))) {
        filePath = path.join(LABELED_FILES_DIR, fileId);
        type = 'labeled';
      } else if (fs.existsSync(path.join(RAW_FILES_DIR, fileId))) {
        filePath = path.join(RAW_FILES_DIR, fileId);
        type = 'raw';
      } else {
        return { id: fileId, error: '文件不存在' };
      }
      
      const stats = fs.statSync(filePath);
      
      return {
        id: fileId,
        name: fileId,
        size: stats.size,
        type,
        downloadUrl: `/api/download/${fileId}`
      };
    });
    
    res.json({
      success: true,
      files: filesInfo
    });
    
  } catch (error) {
    console.error('批量下载信息获取失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 移动到已打标
app.post('/api/move-to-labeled', uploadChunk.single('file'), async (req, res) => {
  try {
    const { fileId, metadata: metadataStr } = req.body;
    const metadata = metadataStr ? JSON.parse(metadataStr) : {};
    
    const rawPath = path.join(RAW_FILES_DIR, fileId);
    const labeledPath = path.join(LABELED_FILES_DIR, fileId);
    
    console.log(`[move-to-labeled] 开始处理文件: ${fileId}`);
    console.log(`[move-to-labeled] 是否上传了新文件: ${!!req.file}, 文件大小: ${req.file?.size || 'N/A'} bytes`);
    
    if (req.file) {
      // 如果上传了新文件（已打标的版本），使用新文件
      fs.writeFileSync(labeledPath, req.file.buffer);
      console.log(`[move-to-labeled] 新文件已写入 labeled_files: ${labeledPath}, 大小: ${req.file.size} bytes`);
      console.log(`[move-to-labeled] raw_files 中的原文件已保留: ${rawPath}`);
      
      // 不再删除raw目录中的旧文件，保留原始文件
    } else if (fs.existsSync(rawPath)) {
      // 否则复制原文件（而不是移动）
      fs.copyFileSync(rawPath, labeledPath);
      console.log(`[move-to-labeled] 原文件已复制到 labeled_files: ${labeledPath}`);
      console.log(`[move-to-labeled] raw_files 中的原文件已保留: ${rawPath}`);
      
      // 复制元数据文件
      const rawMetaPath = rawPath + '.json';
      const labeledMetaPath = labeledPath + '.json';
      if (fs.existsSync(rawMetaPath)) {
        fs.copyFileSync(rawMetaPath, labeledMetaPath);
      }
    } else {
      console.error(`[move-to-labeled] 错误: 源文件不存在 - ${rawPath}`);
      return res.status(404).json({ error: '源文件不存在' });
    }
    
    // 更新元数据
    const metadataPath = labeledPath + '.json';
    const updatedMetadata = {
      ...metadata,
      filename: fileId,
      hasLabels: true,
      movedAt: new Date().toISOString()
    };
    fs.writeFileSync(metadataPath, JSON.stringify(updatedMetadata, null, 2));
    
    // 确认最终文件大小
    const finalFileStats = fs.statSync(labeledPath);
    console.log(`[move-to-labeled] 完成! labeled_files中的文件大小: ${finalFileStats.size} bytes`);
    
    res.json({
      success: true,
      message: '文件已移动到已打标目录',
      filename: fileId,
      size: finalFileStats.size
    });
    
  } catch (error) {
    console.error('[move-to-labeled] 移动文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除文件
app.delete('/api/files/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    
    // 尝试在三个目录中删除
    let deleted = false;
    
    for (const dir of [RAW_FILES_DIR, LABELED_FILES_DIR, FILTERED_FILES_DIR]) {
      const filePath = path.join(dir, fileId);
      const metadataPath = filePath + '.json';
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }
      
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }
    }
    
    if (!deleted) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    res.json({
      success: true,
      message: '文件删除成功'
    });
    
  } catch (error) {
    console.error('删除文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 取消上传
app.post('/api/cancel-upload', (req, res) => {
  try {
    const { fileId } = req.body;
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    
    if (fs.existsSync(chunkDir)) {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    }
    
    res.json({ success: true, message: '上传已取消' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 提示词库配置文件路径
const PROMPTS_LIBRARY_PATH = path.join(__dirname, '../prompts-library.json');

// 获取提示词库
app.get('/api/prompts-library', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_LIBRARY_PATH)) {
      return res.status(404).json({ error: '提示词库配置文件不存在' });
    }
    
    const data = fs.readFileSync(PROMPTS_LIBRARY_PATH, 'utf8');
    const promptsLibrary = JSON.parse(data);
    
    res.json({
      success: true,
      data: promptsLibrary
    });
  } catch (error) {
    console.error('读取提示词库失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 保存提示词库
app.post('/api/prompts-library', (req, res) => {
  try {
    const { prompts, selectionRule, description, ignoreKeywords } = req.body;
    
    if (!Array.isArray(prompts)) {
      return res.status(400).json({ error: 'prompts必须是数组' });
    }
    
    const promptsLibrary = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      description: description || "VLM提示词库配置文件 - 用于工业设计3D模型分析",
      selectionRule: selectionRule || "random",
      ignoreKeywords: Array.isArray(ignoreKeywords) ? ignoreKeywords : ['Unknown Object'],
      prompts: prompts.map(prompt => ({
        ...prompt,
        updatedAt: new Date().toISOString()
      }))
    };
    
    // 写入文件（格式化JSON，便于阅读和版本控制）
    fs.writeFileSync(
      PROMPTS_LIBRARY_PATH, 
      JSON.stringify(promptsLibrary, null, 2),
      'utf8'
    );
    
    const keywordCount = promptsLibrary.ignoreKeywords.length;
    console.log(`✅ 提示词库已保存: ${prompts.length} 个提示词, ${keywordCount} 个过滤关键词`);
    
    res.json({
      success: true,
      message: '提示词库保存成功',
      count: prompts.length,
      keywordCount: keywordCount,
      lastUpdated: promptsLibrary.lastUpdated
    });
  } catch (error) {
    console.error('保存提示词库失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// VLM API 代理 - 解决CORS问题
app.post('/api/vlm-proxy', async (req, res) => {
  try {
    const { baseUrl, apiKey, requestBody, headers: customHeaders = {} } = req.body;
    
    if (!baseUrl) {
      return res.status(400).json({ error: 'baseUrl参数缺失' });
    }
    
    // 准备请求头
    const proxyHeaders = {
      'Content-Type': 'application/json',
      ...customHeaders
    };
    
    if (apiKey) {
      proxyHeaders['Authorization'] = `Bearer ${apiKey}`;
    }
    
    console.log(`[VLM Proxy] 转发请求到: ${baseUrl}/v1/chat/completions`);
    
    // 使用axios转发请求
    const axios = require('axios');
    const response = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      requestBody,
      {
        headers: proxyHeaders,
        timeout: 300000, // 5分钟超时
        validateStatus: () => true // 接受所有状态码
      }
    );
    
    // 返回响应
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('[VLM Proxy] 代理请求失败:', error.message);
    
    if (error.response) {
      // API返回了错误响应
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      // 请求发送但没有响应
      res.status(503).json({ 
        error: '无法连接到VLM API服务',
        message: error.message 
      });
    } else {
      // 其他错误
      res.status(500).json({ 
        error: '代理请求失败',
        message: error.message 
      });
    }
  }
});

// 更新元数据
app.post('/api/update-metadata', (req, res) => {
  try {
    const { fileId, metadata, fileType = 'labeled' } = req.body;
    
    if (!fileId || !metadata) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 确定目标目录
    let targetDir;
    if (fileType === 'raw') {
      targetDir = RAW_FILES_DIR;
    } else if (fileType === 'labeled') {
      targetDir = LABELED_FILES_DIR;
    } else if (fileType === 'filtered') {
      targetDir = FILTERED_FILES_DIR;
    } else {
      return res.status(400).json({ error: '无效的fileType' });
    }
    
    const metadataPath = path.join(targetDir, `${fileId}.json`);
    
    console.log(`[update-metadata] 更新元数据: ${fileId} (${fileType})`);
    
    // 写入元数据
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    res.json({
      success: true,
      message: '元数据已更新',
      fileId
    });
    
  } catch (error) {
    console.error('[update-metadata] 更新元数据失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 复制文件到filtered_files
app.post('/api/copy-to-filtered', (req, res) => {
  try {
    const { fileId, sourceType = 'labeled' } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId参数缺失' });
    }
    
    // 确定源目录
    let sourceDir;
    if (sourceType === 'raw') {
      sourceDir = RAW_FILES_DIR;
    } else if (sourceType === 'labeled') {
      sourceDir = LABELED_FILES_DIR;
    } else {
      return res.status(400).json({ error: '无效的sourceType' });
    }
    
    const sourcePath = path.join(sourceDir, fileId);
    const sourceMetaPath = sourcePath + '.json';
    const targetPath = path.join(FILTERED_FILES_DIR, fileId);
    const targetMetaPath = targetPath + '.json';
    
    console.log(`[copy-to-filtered] 复制文件: ${fileId} (${sourceType} -> filtered)`);
    
    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: '源文件不存在' });
    }
    
    // 复制文件
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`[copy-to-filtered] 文件已复制: ${sourcePath} -> ${targetPath}`);
    
    // 复制元数据
    if (fs.existsSync(sourceMetaPath)) {
      const metadata = JSON.parse(fs.readFileSync(sourceMetaPath, 'utf8'));
      metadata.filteredAt = new Date().toISOString();
      metadata.sourceType = sourceType;
      fs.writeFileSync(targetMetaPath, JSON.stringify(metadata, null, 2));
      console.log(`[copy-to-filtered] 元数据已复制并更新`);
    }
    
    const fileStats = fs.statSync(targetPath);
    
    res.json({
      success: true,
      message: '文件已复制到filtered_files',
      fileId,
      size: fileStats.size
    });
    
  } catch (error) {
    console.error('[copy-to-filtered] 复制文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    directories: {
      rawFiles: fs.existsSync(RAW_FILES_DIR),
      labeledFiles: fs.existsSync(LABELED_FILES_DIR),
      filteredFiles: fs.existsSync(FILTERED_FILES_DIR),
      tempChunks: fs.existsSync(TEMP_CHUNKS_DIR)
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`📁 原始文件目录: ${RAW_FILES_DIR}`);
  console.log(`📁 已打标文件目录: ${LABELED_FILES_DIR}`);
  console.log(`📁 过滤文件目录: ${FILTERED_FILES_DIR}`);
  console.log(`📁 临时块目录: ${TEMP_CHUNKS_DIR}`);
  console.log(`🔄 VLM代理已启用，解决CORS问题`);
});

