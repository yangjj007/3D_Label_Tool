require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();

if (!process.env.PORT) {
  console.error('❌ 错误: 未设置环境变量 PORT');
  console.error('请在 .env 文件中配置 PORT=30005');
  process.exit(1);
}
const PORT = process.env.PORT;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ────────────────────────────────────────────────────────────
// 目录常量
// ────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FILES_DIR     = path.join(PROJECT_ROOT, 'files');
const MODELS_DIR    = path.join(FILES_DIR, 'models');       // 统一模型目录
const TEMP_CHUNKS_DIR = path.join(PROJECT_ROOT, 'temp-chunks');

[FILES_DIR, MODELS_DIR, TEMP_CHUNKS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('📂 服务器目录配置:');
console.log(`   MODELS_DIR: ${MODELS_DIR}`);
console.log(`   TEMP_CHUNKS_DIR: ${TEMP_CHUNKS_DIR}`);

// ────────────────────────────────────────────────────────────
// PartField 推理服务管理（预加载模型到 GPU）
// ────────────────────────────────────────────────────────────
const INFERENCE_PORT = parseInt(process.env.PARTFIELD_PORT || '5555', 10);
const INFERENCE_URL  = `http://127.0.0.1:${INFERENCE_PORT}`;
let inferenceReady   = false;
let inferenceProcess = null;
let inferenceRestarting = false;

function startInferenceServer() {
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  const gpu       = process.env.PARTFIELD_GPU || 'auto';
  const ckptPath  = process.env.PARTFIELD_CKPT ||
    path.join(PROJECT_ROOT, 'partfield-ckpt', 'model_objaverse.ckpt');

  if (!fs.existsSync(ckptPath)) {
    console.warn(`⚠️  推理服务未启动：找不到模型权重 ${ckptPath}`);
    console.warn('   分割将使用 fallback 模式（每次启动新进程）');
    return;
  }

  console.log(`🔄 正在启动推理服务 (port=${INFERENCE_PORT}, gpu=${gpu}) ...`);

  inferenceProcess = spawn(pythonCmd, [
    path.join(PROJECT_ROOT, 'scripts', 'inference_server.py'),
    '--port', String(INFERENCE_PORT),
    '--gpu', gpu,
    '--ckpt', ckptPath,
  ], { cwd: PROJECT_ROOT });

  inferenceProcess.stdout.on('data', d =>
    process.stdout.write(`[InferenceServer] ${d}`));
  inferenceProcess.stderr.on('data', d =>
    process.stderr.write(`[InferenceServer] ${d}`));

  inferenceProcess.on('close', (code) => {
    console.error(`[InferenceServer] 进程退出 (code=${code})`);
    inferenceReady = false;
    inferenceProcess = null;
    if (!inferenceRestarting) {
      inferenceRestarting = true;
      setTimeout(() => {
        inferenceRestarting = false;
        console.log('[InferenceServer] 正在重启 ...');
        startInferenceServer();
      }, 10000);
    }
  });

  pollInferenceHealth();
}

function pollInferenceHealth() {
  const check = () => {
    http.get(`${INFERENCE_URL}/health`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.status === 'ready') {
            inferenceReady = true;
            console.log(`✅ 推理服务已就绪 (${data.device}, ${data.gpu_memory || 'N/A'})`);
            return;
          }
        } catch { /* ignore */ }
        setTimeout(check, 3000);
      });
    }).on('error', () => {
      setTimeout(check, 3000);
    });
  };
  setTimeout(check, 5000);
}

/**
 * 通过 HTTP 调用推理服务执行分割，返回 Promise。
 * resolve({ success, ... }) 或 reject(Error)
 */
function callInferenceServer(modelId, numClusters, method) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model_id: modelId,
      num_clusters: numClusters,
      method: method,
      models_dir: MODELS_DIR,
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: INFERENCE_PORT,
      path: '/segment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 600000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`推理服务响应解析失败: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('推理服务请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Fallback：以子进程方式运行 segment_mesh.py（无预加载）
 */
function spawnSegmentProcess(id, numClusters, method, meta) {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'segment_mesh.py');
  const pythonCmd  = process.env.PYTHON_CMD || 'python';
  const gpuArg     = process.env.PARTFIELD_GPU || 'auto';

  const child = spawn(pythonCmd, [
    scriptPath,
    '--model_id', id,
    '--num_clusters', String(numClusters),
    '--method', method,
    '--models_dir', MODELS_DIR,
    '--gpu', gpuArg,
  ], { cwd: PROJECT_ROOT });

  child.stdout.on('data', d => process.stdout.write(`[PartField:${id}] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[PartField:${id}] ${d}`));

  child.on('close', code => {
    const current = readMeta(id) || meta;
    if (code === 0) {
      writeMeta(id, { ...current, status: 'segmented' });
      console.log(`✅ 分割完成 (fallback): ${id}`);
    } else {
      writeMeta(id, { ...current, status: 'raw' });
      console.error(`❌ 分割失败 (fallback): ${id}, exit code ${code}`);
    }
  });
}

// multer（内存存储，用于分块上传 & 文件保存）
const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// ────────────────────────────────────────────────────────────
// 工具函数
// ────────────────────────────────────────────────────────────

/** 递归计算目录大小 */
function getFolderSize(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const item of fs.readdirSync(dirPath)) {
    const itemPath = path.join(dirPath, item);
    const st = fs.statSync(itemPath);
    total += st.isDirectory() ? getFolderSize(itemPath) : st.size;
  }
  return total;
}

/** 递归复制目录 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    fs.statSync(s).isDirectory() ? copyDirRecursive(s, d) : fs.copyFileSync(s, d);
  }
}

/** 读取 meta.json，不存在则返回默认值 */
function readMeta(modelId) {
  const metaPath = path.join(MODELS_DIR, modelId, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
  catch { return null; }
}

/** 写入 meta.json */
function writeMeta(modelId, data) {
  const dir = path.join(MODELS_DIR, modelId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(data, null, 2));
}

/** 将 meta.json + 可选的 labels/info.json 合并为 API 响应对象 */
function buildModelInfo(modelId) {
  const meta = readMeta(modelId);
  if (!meta) return null;

  const modelDir = path.join(MODELS_DIR, modelId);
  const segDir   = path.join(modelDir, 'segments');
  const labDir   = path.join(modelDir, 'labels');

  // 分割信息
  let segConfig = null;
  const segConfigPath = path.join(segDir, 'config.json');
  if (fs.existsSync(segConfigPath)) {
    try { segConfig = JSON.parse(fs.readFileSync(segConfigPath, 'utf8')); } catch {}
  }

  // 标签信息
  let labInfo = null;
  const labInfoPath = path.join(labDir, 'info.json');
  if (fs.existsSync(labInfoPath)) {
    try { labInfo = JSON.parse(fs.readFileSync(labInfoPath, 'utf8')); } catch {}
  }

  const origFile = findOriginalFile(modelId);

  return {
    id: modelId,
    name: meta.originalName || modelId,
    ext: meta.ext || '',
    size: meta.size || 0,
    folderSize: getFolderSize(modelDir),
    uploadedAt: meta.uploadedAt,
    status: meta.status || 'raw',
    hasSegments: fs.existsSync(path.join(segDir, 'face_labels.json')),
    hasLabels: fs.existsSync(labInfoPath),
    isFiltered: meta.status === 'filtered',
    filteredAt: meta.filteredAt || null,
    filterMetrics: meta.filterMetrics || null,
    overallLabel: labInfo?.overallLabel || null,
    segments: labInfo?.segments || [],
    segmentCount: labInfo?.segments?.length || 0,
    segConfig,
    isFromServer: true,
    serverFileId: modelId
  };
}

/** 查找模型的原始文件（original.* 或其他扩展名）*/
function findOriginalFile(modelId) {
  const modelDir = path.join(MODELS_DIR, modelId);
  if (!fs.existsSync(modelDir)) return null;
  const files = fs.readdirSync(modelDir).filter(f => f.startsWith('original.'));
  return files.length > 0 ? path.join(modelDir, files[0]) : null;
}

// ────────────────────────────────────────────────────────────
// 支持的 Mesh 文件扩展名
// ────────────────────────────────────────────────────────────
const MESH_EXTENSIONS = new Set(['glb', 'gltf', 'obj', 'ply', 'fbx', 'stl', '3ds', 'dae', 'off']);

/**
 * 根据模型目录现有内容推断状态
 * labeled > segmented > raw
 */
function inferStatus(modelDir) {
  if (fs.existsSync(path.join(modelDir, 'labels', 'info.json'))) return 'labeled';
  if (fs.existsSync(path.join(modelDir, 'segments', 'face_labels.json'))) return 'segmented';
  return 'raw';
}

/**
 * 为目录补全 meta.json（仅当不存在时）
 * @param {string} modelId
 * @param {string} originalName  原始文件名（含扩展名）
 * @param {string} ext           扩展名（不含点）
 * @param {number} size          文件字节数
 * @param {string} modelDir      模型目录绝对路径
 */
function ensureMeta(modelId, originalName, ext, size, modelDir) {
  const metaPath = path.join(modelDir, 'meta.json');
  if (fs.existsSync(metaPath)) return;
  const status = inferStatus(modelDir);
  const meta = {
    id: modelId,
    originalName,
    ext,
    size,
    uploadedAt: new Date().toISOString(),
    status,
    filteredAt: null,
    filterMetrics: null
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`   📝 已生成 meta.json (status=${status}): ${modelId}`);
}

/**
 * 启动时扫描 MODELS_DIR，自动整理游离的 mesh 文件：
 *
 * 场景 1：Mesh 文件直接放在 MODELS_DIR 根层（如 files/models/chair.glb）
 *   → 新建子目录 files/models/chair/，移动为 original.glb，生成 meta.json
 *
 * 场景 2：子目录内有 mesh 文件但未命名为 original.*（如 files/models/chair/chair.glb）
 *   → 重命名为 original.glb，补全 meta.json
 *
 * 场景 3：子目录内已有 original.* 文件，但缺少 meta.json
 *   → 补全 meta.json
 */
function scanAndOrganizeOrphanedFiles() {
  if (!fs.existsSync(MODELS_DIR)) return;

  console.log('\n🔍 扫描游离 Mesh 文件...');
  let organized = 0;

  const entries = fs.readdirSync(MODELS_DIR);

  // ── 场景 1：MODELS_DIR 根层的裸 mesh 文件 ──────────────────────
  for (const name of entries) {
    const fullPath = path.join(MODELS_DIR, name);
    if (fs.statSync(fullPath).isDirectory()) continue;

    const ext = path.extname(name).slice(1).toLowerCase();
    if (!MESH_EXTENSIONS.has(ext)) continue;

    const modelId  = path.basename(name, path.extname(name));
    const modelDir = path.join(MODELS_DIR, modelId);
    const destPath = path.join(modelDir, `original.${ext}`);

    // 若目标子目录已有同名 original.* 则跳过，避免覆盖
    if (fs.existsSync(destPath)) {
      console.log(`   ⚠️  跳过 ${name}（目标 ${modelId}/original.${ext} 已存在）`);
      continue;
    }

    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

    fs.renameSync(fullPath, destPath);
    console.log(`   📦 场景1 移动: ${name} → ${modelId}/original.${ext}`);

    const size = fs.statSync(destPath).size;
    ensureMeta(modelId, name, ext, size, modelDir);
    organized++;
  }

  // ── 场景 2 & 3：遍历子目录 ─────────────────────────────────────
  const dirs = fs.readdirSync(MODELS_DIR).filter(n =>
    fs.statSync(path.join(MODELS_DIR, n)).isDirectory()
  );

  for (const dirName of dirs) {
    const modelDir = path.join(MODELS_DIR, dirName);
    const modelId  = dirName;

    // 检查是否已有规范的 original.* 文件
    const existingOriginal = fs.readdirSync(modelDir).find(f => f.startsWith('original.'));

    if (!existingOriginal) {
      // 场景 2：找到子目录内的非规范 mesh 文件
      const meshFiles = fs.readdirSync(modelDir).filter(f => {
        const ext = path.extname(f).slice(1).toLowerCase();
        return MESH_EXTENSIONS.has(ext) && fs.statSync(path.join(modelDir, f)).isFile();
      });

      if (meshFiles.length === 0) continue; // 没有 mesh 文件，跳过

      // 优先使用与目录同名的文件，否则取第一个
      const chosen = meshFiles.find(f => path.basename(f, path.extname(f)) === modelId)
        || meshFiles[0];

      const ext      = path.extname(chosen).slice(1).toLowerCase();
      const srcPath  = path.join(modelDir, chosen);
      const destPath = path.join(modelDir, `original.${ext}`);

      fs.renameSync(srcPath, destPath);
      console.log(`   🔧 场景2 重命名: ${modelId}/${chosen} → original.${ext}`);

      const size = fs.statSync(destPath).size;
      ensureMeta(modelId, chosen, ext, size, modelDir);
      organized++;
    } else {
      // 场景 3：已有 original.*，只需补全 meta.json
      const ext      = path.extname(existingOriginal).slice(1).toLowerCase();
      const origPath = path.join(modelDir, existingOriginal);
      const size     = fs.statSync(origPath).size;

      const hadMeta = fs.existsSync(path.join(modelDir, 'meta.json'));
      ensureMeta(modelId, existingOriginal, ext, size, modelDir);
      if (!hadMeta) organized++;
    }
  }

  if (organized > 0) {
    console.log(`✅ 共整理 ${organized} 个游离 Mesh 文件\n`);
  } else {
    console.log('✅ 未发现游离 Mesh 文件，无需整理\n');
  }
}

/** 发送分页响应 */
function sendPaginated(items, page, pageSize, res) {
  const p = parseInt(page) || 1;
  const ps = parseInt(pageSize) || 10;
  const total = items.length;
  const paged = items.slice((p - 1) * ps, p * ps);
  res.json({ success: true, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps), files: paged });
}

// ────────────────────────────────────────────────────────────
// GET /api/models  — 获取模型列表
// 支持 ?status=raw|segmenting|segmented|labeled|filtered|all
// ────────────────────────────────────────────────────────────
app.get('/api/models', (req, res) => {
  try {
    const { status = 'all', page = 1, pageSize = 10 } = req.query;

    if (!fs.existsSync(MODELS_DIR)) return sendPaginated([], page, pageSize, res);

    let models = fs.readdirSync(MODELS_DIR)
      .filter(name => fs.statSync(path.join(MODELS_DIR, name)).isDirectory())
      .map(buildModelInfo)
      .filter(Boolean);

    if (status !== 'all') {
      models = models.filter(m => m.status === status);
    }

    // 按上传时间降序
    models.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

    sendPaginated(models, page, pageSize, res);
  } catch (err) {
    console.error('获取模型列表失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id  — 获取单个模型信息
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id', (req, res) => {
  try {
    const info = buildModelInfo(req.params.id);
    if (!info) return res.status(404).json({ error: '模型不存在' });
    res.json({ success: true, model: info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// 分块上传  upload-chunk / check-chunks / merge-chunks
// ────────────────────────────────────────────────────────────
app.post('/api/models/upload-chunk', uploadChunk.single('chunk'), (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    if (!req.file) return res.status(400).json({ error: '没有接收到文件块' });
    if (!fileId)   return res.status(400).json({ error: 'fileId参数缺失' });

    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
    fs.writeFileSync(path.join(chunkDir, `chunk-${chunkIndex}`), req.file.buffer);

    res.json({ success: true, message: `块 ${parseInt(chunkIndex) + 1}/${totalChunks} 上传成功`, chunkIndex: parseInt(chunkIndex) });
  } catch (err) {
    console.error('上传块失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/check-chunks', (req, res) => {
  try {
    const { fileId, totalChunks } = req.body;
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    const uploadedChunks = [];
    if (fs.existsSync(chunkDir)) {
      for (let i = 0; i < totalChunks; i++) {
        if (fs.existsSync(path.join(chunkDir, `chunk-${i}`))) uploadedChunks.push(i);
      }
    }
    res.json({ success: true, uploadedChunks, shouldResume: uploadedChunks.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/merge-chunks', async (req, res) => {
  try {
    const { fileId, filename, totalChunks, metadata = {} } = req.body;

    // 从文件名推断 modelId（去掉扩展名）
    const ext = path.extname(filename).slice(1);  // e.g. 'glb'
    const modelId = path.basename(filename, path.extname(filename));
    const modelDir = path.join(MODELS_DIR, modelId);
    const originalPath = path.join(modelDir, `original.${ext}`);

    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    const writeStream = fs.createWriteStream(originalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk-${i}`);
      if (!fs.existsSync(chunkPath)) throw new Error(`缺少块 ${i}`);
      writeStream.write(fs.readFileSync(chunkPath));
    }
    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    fs.rmSync(chunkDir, { recursive: true, force: true });

    const fileStats = fs.statSync(originalPath);

    // 创建 meta.json
    writeMeta(modelId, {
      id: modelId,
      originalName: filename,
      ext,
      size: fileStats.size,
      uploadedAt: new Date().toISOString(),
      status: 'raw',
      filteredAt: null,
      filterMetrics: null,
      ...metadata
    });

    res.json({ success: true, message: '文件合并成功', modelId, filename, size: fileStats.size });
  } catch (err) {
    console.error('合并块失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/cancel-upload', (req, res) => {
  try {
    const { fileId } = req.body;
    const chunkDir = path.join(TEMP_CHUNKS_DIR, fileId);
    if (fs.existsSync(chunkDir)) fs.rmSync(chunkDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id/download  — 下载网格文件
// ?mesh=original|segmented  (默认 original)
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const { mesh = 'original' } = req.query;

    let filePath;
    if (mesh === 'segmented') {
      filePath = path.join(MODELS_DIR, id, 'segments', 'mesh.ply');
    } else {
      filePath = findOriginalFile(id);
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const stats   = fs.statSync(filePath);
    const fileSize = stats.size;
    const range   = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'application/octet-stream'
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('下载文件失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// DELETE /api/models/:id
// ────────────────────────────────────────────────────────────
app.delete('/api/models/:id', (req, res) => {
  try {
    const modelDir = path.join(MODELS_DIR, req.params.id);
    if (!fs.existsSync(modelDir)) return res.status(404).json({ error: '模型不存在' });
    fs.rmSync(modelDir, { recursive: true, force: true });
    res.json({ success: true, message: '模型已删除' });
  } catch (err) {
    console.error('删除模型失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/models/:id/segment  — 触发 PartField 分割
// body: { numClusters, method }
// 优先通过预加载推理服务执行，若服务未就绪则 fallback 到子进程
// ────────────────────────────────────────────────────────────
app.post('/api/models/:id/segment', (req, res) => {
  try {
    const { id } = req.params;
    const { numClusters = 10, method = 'agglomerative' } = req.body;

    const meta = readMeta(id);
    if (!meta) return res.status(404).json({ error: '模型不存在' });

    if (meta.status === 'segmenting') {
      return res.status(409).json({ error: '分割正在进行中' });
    }

    writeMeta(id, { ...meta, status: 'segmenting' });

    const mode = inferenceReady ? 'preloaded' : 'fallback';
    console.log(`[Segment] ${id}: 使用 ${mode} 模式`);

    if (inferenceReady) {
      callInferenceServer(id, numClusters, method)
        .then(result => {
          if (result.success) {
            const current = readMeta(id) || meta;
            writeMeta(id, { ...current, status: 'segmented' });
            console.log(`✅ 分割完成: ${id} (${result.elapsed}s)`);
          } else {
            const current = readMeta(id) || meta;
            writeMeta(id, { ...current, status: 'raw' });
            console.error(`❌ 分割失败: ${id}: ${result.error}`);
          }
        })
        .catch(err => {
          const current = readMeta(id) || meta;
          writeMeta(id, { ...current, status: 'raw' });
          console.error(`❌ 推理服务调用失败: ${id}: ${err.message}`);
        });
    } else {
      spawnSegmentProcess(id, numClusters, method, meta);
    }

    res.json({
      success: true,
      message: '分割任务已启动',
      modelId: id,
      numClusters,
      method,
      mode,
    });
  } catch (err) {
    console.error('启动分割失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id/segment  — 查询分割状态 + 配置
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id/segment', (req, res) => {
  try {
    const { id } = req.params;
    const meta = readMeta(id);
    if (!meta) return res.status(404).json({ error: '模型不存在' });

    const segDir = path.join(MODELS_DIR, id, 'segments');
    let config = null;
    const configPath = path.join(segDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    }

    res.json({
      success: true,
      status: meta.status,
      hasSegments: fs.existsSync(path.join(segDir, 'face_labels.json')),
      config
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id/segment/face-labels  — 返回面标签 JSON
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id/segment/face-labels', (req, res) => {
  try {
    const labelsPath = path.join(MODELS_DIR, req.params.id, 'segments', 'face_labels.json');
    if (!fs.existsSync(labelsPath)) return res.status(404).json({ error: '面标签不存在' });
    const data = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
    res.json({ success: true, faceLabels: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id/segment/mesh  — 返回预处理后的 PLY
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id/segment/mesh', (req, res) => {
  try {
    const meshPath = path.join(MODELS_DIR, req.params.id, 'segments', 'mesh.ply');
    if (!fs.existsSync(meshPath)) return res.status(404).json({ error: '分割网格不存在' });

    const stats = fs.statSync(meshPath);
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end   = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'application/octet-stream'
      });
      fs.createReadStream(meshPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="mesh.ply"'
      });
      fs.createReadStream(meshPath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/models/:id/labels  — 保存标签（info.json + 截图）
// ────────────────────────────────────────────────────────────
app.post('/api/models/:id/labels', uploadChunk.any(), (req, res) => {
  try {
    const { id } = req.params;
    const { infoJson } = req.body;

    if (!infoJson) return res.status(400).json({ error: 'infoJson参数缺失' });

    let infoData;
    try { infoData = JSON.parse(infoJson); }
    catch (e) { return res.status(400).json({ error: 'infoJson格式错误: ' + e.message }); }

    const labDir        = path.join(MODELS_DIR, id, 'labels');
    const imagesDir     = path.join(labDir, 'images');
    const overviewDir   = path.join(imagesDir, 'overview');
    const segmentsImgDir = path.join(imagesDir, 'segments');

    [labDir, imagesDir, overviewDir, segmentsImgDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    // 保存截图文件
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // fieldname: image_overview_main  |  image_segments_0_main
        if (!file.fieldname.startsWith('image_')) continue;
        const parts = file.fieldname.split('_');
        parts.shift(); // remove 'image'

        if (parts[0] === 'overview') {
          const viewKey = parts.slice(1).join('_');
          fs.writeFileSync(path.join(overviewDir, `${viewKey}.png`), file.buffer);
        } else if (parts[0] === 'segments') {
          const segId  = parts[1];
          const viewKey = parts.slice(2).join('_');
          const segDir2 = path.join(segmentsImgDir, segId);
          if (!fs.existsSync(segDir2)) fs.mkdirSync(segDir2, { recursive: true });
          fs.writeFileSync(path.join(segDir2, `${viewKey}.png`), file.buffer);
        }
      }
    }

    // 写入 info.json（自动加上 labeledAt / updatedAt）
    const now = new Date().toISOString();
    const finalInfo = {
      ...infoData,
      labeledAt: infoData.labeledAt || now,
      updatedAt: now
    };
    fs.writeFileSync(path.join(labDir, 'info.json'), JSON.stringify(finalInfo, null, 2));

    // 更新 meta.json 状态
    const meta = readMeta(id);
    if (meta && meta.status !== 'filtered') {
      writeMeta(id, { ...meta, status: 'labeled' });
    }

    res.json({ success: true, message: '标签已保存', modelId: id });
  } catch (err) {
    console.error('[labels POST] 保存失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/models/:id/labels  — 读取标签
// ────────────────────────────────────────────────────────────
app.get('/api/models/:id/labels', (req, res) => {
  try {
    const infoPath = path.join(MODELS_DIR, req.params.id, 'labels', 'info.json');
    if (!fs.existsSync(infoPath)) return res.status(404).json({ error: '标签不存在' });
    const data = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST /api/models/:id/filter  — 标记为已过滤
// body: { filterMetrics }
// ────────────────────────────────────────────────────────────
app.post('/api/models/:id/filter', (req, res) => {
  try {
    const { id } = req.params;
    const { filterMetrics } = req.body;

    const meta = readMeta(id);
    if (!meta) return res.status(404).json({ error: '模型不存在' });

    writeMeta(id, {
      ...meta,
      status: 'filtered',
      filteredAt: new Date().toISOString(),
      filterMetrics: filterMetrics || meta.filterMetrics || null
    });

    res.json({ success: true, message: '已标记为已过滤', modelId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// PATCH /api/models/:id/meta  — 更新元数据（filterMetrics 等）
// ────────────────────────────────────────────────────────────
app.patch('/api/models/:id/meta', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const meta = readMeta(id);
    if (!meta) return res.status(404).json({ error: '模型不存在' });

    writeMeta(id, { ...meta, ...updates });

    res.json({ success: true, message: '元数据已更新', modelId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// 提示词库
// ────────────────────────────────────────────────────────────
const PROMPTS_LIBRARY_PATH = path.join(__dirname, '../prompts-library.json');

app.get('/api/prompts-library', (req, res) => {
  try {
    if (!fs.existsSync(PROMPTS_LIBRARY_PATH)) return res.status(404).json({ error: '提示词库配置文件不存在' });
    const data = JSON.parse(fs.readFileSync(PROMPTS_LIBRARY_PATH, 'utf8'));
    res.json({ success: true, data });
  } catch (err) {
    console.error('读取提示词库失败:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prompts-library', (req, res) => {
  try {
    const { prompts, selectionRule, description, ignoreKeywords } = req.body;
    if (!Array.isArray(prompts)) return res.status(400).json({ error: 'prompts必须是数组' });

    const library = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      description: description || 'VLM提示词库配置文件',
      selectionRule: selectionRule || 'random',
      ignoreKeywords: Array.isArray(ignoreKeywords) ? ignoreKeywords : ['Unknown Object'],
      prompts: prompts.map(p => ({ ...p, updatedAt: new Date().toISOString() }))
    };

    fs.writeFileSync(PROMPTS_LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, message: '提示词库保存成功', count: prompts.length });
  } catch (err) {
    console.error('保存提示词库失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// VLM 代理
// ────────────────────────────────────────────────────────────
app.post('/api/vlm-proxy', async (req, res) => {
  try {
    const { baseUrl, apiKey, requestBody, headers: customHeaders = {} } = req.body;
    if (!baseUrl) return res.status(400).json({ error: 'baseUrl参数缺失' });

    const proxyHeaders = { 'Content-Type': 'application/json', ...customHeaders };
    if (apiKey) proxyHeaders['Authorization'] = `Bearer ${apiKey}`;

    const axios = require('axios');
    const response = await axios.post(`${baseUrl}/v1/chat/completions`, requestBody, {
      headers: proxyHeaders,
      timeout: 300000,
      validateStatus: () => true
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('[VLM Proxy] 代理请求失败:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// 健康检查
// ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    inference: {
      ready: inferenceReady,
      port: INFERENCE_PORT,
      pid: inferenceProcess?.pid || null,
    },
    directories: {
      models: fs.existsSync(MODELS_DIR),
      tempChunks: fs.existsSync(TEMP_CHUNKS_DIR)
    }
  });
});

// ────────────────────────────────────────────────────────────
// 启动
// ────────────────────────────────────────────────────────────
scanAndOrganizeOrphanedFiles();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务器运行在 http://0.0.0.0:${PORT}`);
  console.log(`📁 模型目录: ${MODELS_DIR}`);
  console.log(`📁 临时块目录: ${TEMP_CHUNKS_DIR}`);

  // 在 HTTP 服务启动后，拉起推理服务（异步加载模型）
  startInferenceServer();
});

// 优雅退出：关闭推理服务子进程
process.on('SIGINT', () => {
  if (inferenceProcess) {
    console.log('\n正在关闭推理服务 ...');
    inferenceProcess.kill('SIGINT');
  }
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (inferenceProcess) inferenceProcess.kill('SIGTERM');
  process.exit(0);
});
