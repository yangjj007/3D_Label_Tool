# 3D模型语义标记系统改进方案

## 项目概述

基于 Three.js+Vue3+Element-Plus 开发的3D模型可视化编辑系统，现计划通过语义标记技术提升模型的智能化程度，实现不同模型部分的自动识别和标注。

## 前端UI改进思路

### 1. 批量上传文件功能

**目标**: 在UI中新增批量上传文件功能，支持一次性上传多个OBJ文件，并提供文件管理界面。

**具体实现**:

- **上传组件增强**: 在`ModelChoose/index.vue`的"外部模型"区域添加批量上传功能
- **文件存储策略**: 所有处理完毕的文件直接覆盖原文件，避免重复存储
- **进度显示**: 支持显示批量上传进度和单个文件处理状态

**代码位置**: `src/components/ModelChoose/index.vue`

```javascript
// 批量上传功能示例
const onBatchUpload = async (files) => {
  const fileList = Array.from(files);
  for (const file of fileList) {
    // 处理单个文件
    await processObjFile(file);
    // 覆盖原文件
    await saveProcessedFile(file);
  }
};
```

### 2. 文件列表展示

**目标**: 在主界面UI左边加入列表，展示所有已上传和处理的文件。

**具体实现**:

- **列表组件**: 新增文件列表组件，显示文件名、处理状态、文件大小等信息
- **交互功能**: 支持文件选择、删除、重命名等操作
- **状态管理**: 使用Pinia管理文件列表状态

**UI布局调整**:

```vue
<template>
  <div class="model-page">
    <!-- 文件列表侧边栏 -->
    <div class="file-list-sidebar">
      <FileList
        :files="processedFiles"
        @select="onSelectFile"
        @delete="onDeleteFile"
      />
    </div>

    <!-- 原有模型选择面板 -->
    <model-choose ref="choosePanel"></model-choose>

    <!-- 模型视图区域 -->
    <div id="model" ref="model">
      <!-- 模型展示区域 -->
    </div>

    <!-- 右侧编辑栏 -->
    <div class="edit-panel">
      <model-edit-panel ref="editPanel" v-if="store.modelApi.model"></model-edit-panel>
    </div>
  </div>
</template>
```

## 不同模型部分的语义标记实现思路

### 1. OBJ文件打标签思路

**目标**: 在OBJ文件中嵌入语义标签信息，用于标识不同模型部分的语义含义。

**标签格式设计**:

```obj
usemtl wood  # label: wood chair leg
f 1/1/1 2/2/2 3/3/3

usemtl metal  # label: metal chair frame
f 4/4/4 5/5/5 6/6/6

```

**标签规范**:
- 使用`# label:`作为标签标识符
- 标签内容全英文
- 标签紧跟在usemtl行之后，保证关联性

### 2. OBJ解析器修改

**目标**: 修改OBJ解析器，使其能够读取和解析语义标签信息。

**实现方案**:

在`renderModel.js`中的OBJ加载部分添加标签解析功能：

**修改位置**: `src/utils/renderModel.js` 第290-292行 OBJ加载部分

```javascript
// 修改OBJ加载器部分
case "obj":
  this.model = result;
  // 解析OBJ文件中的语义标签
  this.parseObjSemanticLabels(result);
  break;

// 新增语义标签解析方法
parseObjSemanticLabels(objModel) {
  const labels = {};
  // 解析OBJ文件的原始文本内容
  // 提取usemtl行中的label信息
  objModel.traverse((child) => {
    if (child.userData && child.userData.material) {
      const materialName = child.userData.material.name;
      // 从材质名称中提取标签信息
      const label = this.extractLabelFromMaterial(materialName);
      if (label) {
        labels[child.uuid] = label;
      }
    }
  });
  this.semanticLabels = labels;
  return labels;
}

// 从材质名称中提取标签
extractLabelFromMaterial(materialName) {
  // 解析类似 "wood # label: wood chair leg" 的格式
  const labelMatch = materialName.match(/# label:\s*(.+)$/);
  return labelMatch ? labelMatch[1].trim() : null;
}
```

### 3. glb文件打标签思路
关键点：
一个 Mesh 可包含多个 Primitive（图元，即模型的独立部分，如轮胎、车门）。 
每个 Primitive 引用一个 Material（材质），但同一个材质可被多个图元共享（如四个轮胎共用同一材质）。
语义标签描述的是模型部分（图元），而非材质本身。
因此，标签必须存储在 Primitive 的 extras 中，而非材质的 extras（避免标签歧义）。

为每个 Primitive 的 extras 添加标签："label": "wood chair leg"

## VLM自动生成标签

**目标**: 利用Vision-Language Model（视觉语言模型）自动为模型不同部分生成语义标签。

**实现方案**:

利用框架现有的高亮部分模型截图功能，通过outlinePass实现模型高亮，然后按照材质对多个模型部分从多个角度截图发给VLM生成语义标签。

**核心流程**:

```javascript
// VLM标签生成流程
async generateVLMLabels() {
  // 1. 获取模型的不同部分（基于材质分组）
  const modelParts = this.getModelPartsByMaterial();

  for (const part of modelParts) {
    // 2. 高亮当前部分
    this.highlightModelPart(part);

    // 3. 从不同视角截图
    const screenshots = await this.captureMultiViewScreenshots(part);

    // 4. 调用VLM API生成标签
    const labels = await this.callVLMForLabels(screenshots, part);

    // 5. 将标签写入OBJ文件
    await this.writeLabelsToObjFile(part, labels);
  }
}

// 高亮模型部分并截图
async captureMultiViewScreenshots(part) {
  const views = ['front', 'side', 'top', 'perspective'];
  const screenshots = [];

  for (const view of views) {
    // 调整相机角度到指定视角
    this.adjustCameraForView(view);

    // 使用outlinePass高亮当前部分
    this.outlinePass.selectedObjects = [part.mesh];

    // 等待渲染完成
    await this.waitForRender();

    // 截取当前视角的屏幕截图
    const screenshot = this.captureScreenshot();
    screenshots.push(screenshot);
  }

  return screenshots;
}

// 调用VLM生成语义标签
async callVLMForLabels(screenshots, part) {
  const prompt = `
    请分析这些图片中的3D模型部分，从不同角度观察。
    这是一个3D模型的部件，请为它生成合适的语义标签。
    标签应该描述这个部分：
    1. 是什么材料（wood, metal, plastic, fabric等）
    2. 属于什么物体部件（chair leg, table top, door handle等）
    3. 功能描述

    请用以下格式回答：
    英文标签: [英文描述]
    中文标签: [中文描述]
    置信度: [0-1之间的数值]
  `;

  // 调用VLM API (需要集成具体的VLM服务)
  const response = await this.vlmAPI.generateLabels(screenshots, prompt);

  return this.parseVLMResponse(response);
}

// 将标签写入OBJ文件
async writeLabelsToObjFile(part, labels) {
  // 读取原始OBJ文件内容
  const objContent = await this.readObjFile(part.filePath);

  // 在对应的usemtl行后添加标签注释
  const updatedContent = this.insertLabelsIntoObj(objContent, part.materialName, labels);

  // 覆盖保存文件
  await this.saveObjFile(part.filePath, updatedContent);
}
```

## 技术实现细节

### 1. 文件存储和管理

**IndexedDB集成**: 使用现有的IndexedDB存储机制管理批量上传的文件和标签信息。

```javascript
// 文件存储服务
class FileStorageService {
  constructor() {
    this.db = null;
    this.initDB();
  }

  // 初始化IndexedDB
  async initDB() {
    this.db = await indexedDB.open('ModelFilesDB', 1);
    // 创建存储对象
    const store = this.db.createObjectStore('files', { keyPath: 'id' });
    store.createIndex('name', 'name', { unique: false });
    store.createIndex('processed', 'processed', { unique: false });
  }

  // 存储处理后的文件
  async saveProcessedFile(fileData) {
    const transaction = this.db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    await store.put({
      ...fileData,
      processed: true,
      processedAt: new Date(),
      semanticLabels: fileData.labels || []
    });
  }

  // 获取所有文件列表
  async getFileList() {
    const transaction = this.db.transaction(['files'], 'readonly');
    const store = transaction.objectStore('files');
    return await store.getAll();
  }
}
```


### 2. UI组件设计

**文件列表组件** (`FileList.vue`):

```vue
<template>
  <div class="file-list">
    <div class="file-list-header">
      <h3>模型文件列表</h3>
      <el-button type="primary" @click="onBatchUpload">
        <UploadFilled /> 批量上传
      </el-button>
    </div>

    <el-scrollbar max-height="calc(100vh - 120px)">
      <div class="file-items">
        <div
          v-for="file in files"
          :key="file.id"
          class="file-item"
          :class="{ active: selectedFileId === file.id }"
          @click="onSelectFile(file)"
        >
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              <span class="file-size">{{ formatFileSize(file.size) }}</span>
              <el-tag :type="getStatusType(file.status)" size="small">
                {{ getStatusText(file.status) }}
              </el-tag>
            </div>
            <div class="file-labels" v-if="file.labels && file.labels.length">
              <el-tag
                v-for="label in file.labels.slice(0, 3)"
                :key="label.id"
                size="small"
                class="label-tag"
              >
                {{ label.description }}
              </el-tag>
              <span v-if="file.labels.length > 3" class="more-labels">
                +{{ file.labels.length - 3 }}个标签
              </span>
            </div>
          </div>

          <div class="file-actions">
            <el-button size="small" @click.stop="onViewLabels(file)">
              <CollectionTag /> 标签
            </el-button>
            <el-button size="small" @click.stop="onGenerateLabels(file)">
              <MagicStick /> 生成标签
            </el-button>
            <el-dropdown @command="handleCommand" trigger="click">
              <el-button size="small">
                <MoreFilled />
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                  <el-dropdown-item command="export">导出</el-dropdown-item>
                  <el-dropdown-item command="delete" class="danger">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
```

## 实施计划

### Phase 1: 基础功能实现
1. ✅ 实现批量上传文件功能
   - 修改 `ModelChoose/index.vue` 添加批量上传组件
   - 添加上传进度显示

2. ✅ 添加文件列表展示
   - 创建 `FileList.vue` 组件
   - 集成到主界面左侧
   - 实现文件选择、删除等基础操作

3. ✅ 修改OBJ解析器支持标签读取
   - 扩展 `renderModel.js` 中的OBJ加载逻辑
   - 添加语义标签解析功能
   - 存储标签信息到模型文件中

### Phase 2: VLM集成
1. 🔄 集成VLM API服务

2. 🔄 实现多视角截图功能

3. 🔄 开发标签生成功能




### VLM服务集成

一个向给定的api网站发送vlm请求的函数。包含批量并行，错误重试等。

'''
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const mime = require('mime-types');
const { OpenAI } = require('openai');

class MultiImageVLM {
    constructor(
        configPath = './api/config.yaml',
        model_name = null,
        base_url = null,
        api_key = null
    ) {
        this.configPath = configPath;
        this.userProvidedModel = model_name;
        this.userProvidedBaseURL = base_url;
        this.userProvidedAPIKey = api_key;
        this.initialized = false;
    }

    async init() {
        try {
            await fs.access(this.configPath);
        } catch (err) {
            throw new Error(`配置文件不存在: ${this.configPath}`);
        }

        const configContent = await fs.readFile(this.configPath, 'utf8');
        this.config = yaml.load(configContent);

        // 合并配置：用户参数 > 配置文件 > 默认值
        this.api_key = this.userProvidedAPIKey || this.config.api_key;
        this.base_url = this.userProvidedBaseURL || this.config.base_url || 'https://aihubmix.com';
        this.model_name = this.userProvidedModel || this.config.model_name;
        this.temperature = this.config.temperature || 0.3;
        this.max_retries = parseInt(this.config.max_retries) || 3;
        this.retry_delay = parseFloat(this.config.retry_delay) || 2.0;
        
        // 站点信息（可选）
        this.site_url = this.config.site_url || '';
        this.site_name = this.config.site_name || '';

        if (!this.model_name) {
            throw new Error('❌ 未指定模型名称');
        }
        if (!this.api_key) {
            throw new Error('缺少 api_key，请在配置文件中设置 api_key');
        }

        // 创建 OpenAI 客户端
        this.client = new OpenAI({
            apiKey: this.api_key,
            baseURL: this.base_url,
            dangerouslyAllowBrowser: true
        });

        console.log(`[${this.model_name}] 初始化完成，模型: ${this.model_name}，网关: ${this.base_url}`);
        this.initialized = true;
        return this;
    }

    static async encodeImage(imageInput) {
        if (typeof imageInput === 'string') {
            try {
                await fs.access(imageInput);
            } catch (err) {
                throw new Error(`图片文件不存在: ${imageInput}`);
            }
            const buffer = await fs.readFile(imageInput);
            return buffer.toString('base64');
        } else if (Buffer.isBuffer(imageInput)) {
            return imageInput.toString('base64');
        } else {
            throw new TypeError(`不支持的图片输入类型: ${typeof imageInput}`);
        }
    }

    static guessMimeType(imagePath) {
        if (typeof imagePath !== 'string') return 'image/png';
        
        const mimeType = mime.lookup(path.extname(imagePath));
        return mimeType && mimeType.startsWith('image/') ? mimeType : 'image/png';
    }

    async generateWithImagesAsync(
        prompt,
        imagePaths,
        temperature = null,
        max_tokens = null
    ) {
        if (!this.initialized) {
            throw new Error('客户端未初始化，请先调用 init() 方法');
        }

        temperature = temperature !== null ? temperature : this.temperature;
        max_tokens = max_tokens || 4096;

        // 准备多张图片内容
        const imageContents = [];
        for (const imgPath of imagePaths) {
            const base64Img = await MultiImageVLM.encodeImage(imgPath);
            const mime_type = MultiImageVLM.guessMimeType(imgPath);
            imageContents.push({
                type: 'image_url',
                image_url: {
                    url: `data:${mime_type};base64,${base64Img}`
                }
            });
        }

        const messages = [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                ...imageContents
            ]
        }];

        // 准备自定义 headers
        const extraHeaders = {};
        if (this.site_url) extraHeaders['HTTP-Referer'] = this.site_url;
        if (this.site_name) extraHeaders['X-Title'] = this.site_name;

        let retries = 0;
        let lastError = null;

        while (retries < this.max_retries) {
            try {
                const response = await this.client.chat.completions.create({
                    model: this.model_name,
                    messages,
                    temperature,
                    max_tokens,
                    stream: false,
                    headers: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined
                });

                return this._parseResponse(response);
            } catch (error) {
                retries++;
                lastError = error;
                console.error(`[ERROR] 调用失败 (${retries}/${this.max_retries}): ${error.message}`);
                
                if (retries >= this.max_retries) break;
                
                // 指数退避 + 随机抖动
                const delay = this.retry_delay * Math.pow(2, retries - 1) + Math.random() * 0.5;
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        return {
            error: `调用失败: ${lastError ? lastError.message : '未知错误'}`,
            text: '',
            usage: {}
        };
    }

    _parseResponse(response) {
        const msg = response.choices[0].message;
        let textContent = '';

        if (msg.content) {
            if (typeof msg.content === 'string') {
                textContent = msg.content.trim();
            } else if (Array.isArray(msg.content)) {
                textContent = msg.content
                    .filter(c => c.type === 'text' && c.text)
                    .map(c => c.text)
                    .join('')
                    .trim();
            }
        }

        const usage = {
            prompt_tokens: response.usage?.prompt_tokens || 0,
            completion_tokens: response.usage?.completion_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0
        };

        console.log(`[${this.model_name}] created: ${response.created}, usage:`, usage);
        console.log(`响应内容: ${textContent}`);
        
        return {
            text: textContent,
            usage,
            raw: response
        };
    }

    async generateBatch(
        requests,
        concurrency = 8
    ) {
        if (!this.initialized) {
            throw new Error('客户端未初始化，请先调用 init() 方法');
        }

        // 信号量控制并发
        const semaphore = {
            permits: concurrency,
            queue: [],
            
            acquire() {
                return new Promise(resolve => {
                    if (this.permits > 0) {
                        this.permits--;
                        resolve();
                    } else {
                        this.queue.push(resolve);
                    }
                });
            },
            
            release() {
                if (this.queue.length > 0) {
                    const resolve = this.queue.shift();
                    resolve();
                } else {
                    this.permits++;
                }
            }
        };

        // 处理单个请求
        const processRequest = async (idx, [prompt, imagePaths, temp, maxTokens]) => {
            await semaphore.acquire();
            try {
                return {
                    idx,
                    result: await this.generateWithImagesAsync(prompt, imagePaths, temp, maxTokens)
                };
            } finally {
                semaphore.release();
            }
        };

        // 创建所有任务
        const tasks = requests.map((req, idx) => processRequest(idx, req));
        
        // 按原始顺序收集结果
        const results = new Array(requests.length);
        for (const task of tasks) {
            const { idx, result } = await task;
            results[idx] = result;
        }

        return results;
    }
}

module.exports = MultiImageVLM;
'''