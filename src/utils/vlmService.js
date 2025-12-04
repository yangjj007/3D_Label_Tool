import axios from 'axios';

// 多图像视觉语言模型客户端
class MultiImageVLM {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl?.trim() || 'https://aihubmix.com';
    this.modelName = config.modelName || 'gpt-4o';
    this.temperature = config.temperature || 0.3;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 2000; // 毫秒
    this.siteUrl = config.siteUrl || '';
    this.siteName = config.siteName || '';
  }

  // 初始化配置
  init(config) {
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.baseUrl) this.baseUrl = config.baseUrl.trim();
    if (config.modelName) this.modelName = config.modelName;
    if (config.temperature !== undefined) this.temperature = config.temperature;
    if (config.maxRetries) this.maxRetries = config.maxRetries;
    if (config.retryDelay) this.retryDelay = config.retryDelay;
    if (config.siteUrl) this.siteUrl = config.siteUrl;
    if (config.siteName) this.siteName = config.siteName;
    return this;
  }

  // 将图片转换为base64
  static async encodeImage(imageData) {
    if (typeof imageData === 'string') {
      // 如果已经是base64字符串
      if (imageData.startsWith('data:')) {
        return imageData.split(',')[1];
      }
      return imageData;
    } else if (imageData instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageData);
      });
    } else if (imageData instanceof ArrayBuffer) {
      const bytes = new Uint8Array(imageData);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    } else if (imageData instanceof Uint8Array) {
      let binary = '';
      for (let i = 0; i < imageData.length; i++) {
        binary += String.fromCharCode(imageData[i]);
      }
      return btoa(binary);
    }
    throw new Error('不支持的图片输入类型');
  }

  // 获取MIME类型
  static getMimeType(imagePath) {
    if (typeof imagePath !== 'string') return 'image/png';

    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp'
    };

    return mimeTypes[ext] || 'image/png';
  }

  // 生成视觉语言模型响应
  async generateWithImages(
    prompt,
    imageInputs,
    options = {}
  ) {
    if (!this.apiKey) {
      throw new Error('未配置API Key');
    }

    const temperature = options.temperature || this.temperature;
    const maxTokens = options.maxTokens || 4096;

    // 准备图片内容
    const imageContents = [];
    for (const imageInput of imageInputs) {
      let base64Data;
      
      // 处理不同类型的图片输入
      if (imageInput instanceof Blob || 
          imageInput instanceof ArrayBuffer || 
          imageInput instanceof Uint8Array) {
        base64Data = await MultiImageVLM.encodeImage(imageInput);
      } else if (typeof imageInput === 'string') {
        if (imageInput.startsWith('data:')) {
          // 已经是data URL
          base64Data = imageInput.split(',')[1];
        } else if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
          // URL，直接使用
          imageContents.push({
            type: 'image_url',
            image_url: {
              url: imageInput
            }
          });
          continue;
        } else {
          // 假设是base64字符串
          base64Data = imageInput;
        }
      } else {
        // 尝试从对象中提取数据
        if (imageInput.data) {
          base64Data = await MultiImageVLM.encodeImage(imageInput.data);
        } else {
          throw new Error(`不支持的图片输入格式: ${typeof imageInput}`);
        }
      }

      // 获取MIME类型 - 优先从对象属性获取，其次是文件名
      let mimeType = 'image/png';
      if (typeof imageInput === 'object' && imageInput.mimeType) {
        mimeType = imageInput.mimeType;
      } else if (typeof imageInput === 'object' && imageInput.filename) {
        mimeType = MultiImageVLM.getMimeType(imageInput.filename);
      } else if (typeof imageInput === 'string' && !imageInput.startsWith('data:')) {
        mimeType = MultiImageVLM.getMimeType(imageInput);
      }

      imageContents.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`
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

    // 准备请求头
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
    if (this.siteName) headers['X-Title'] = this.siteName;

    let retries = 0;
    let lastError = null;

    while (retries < this.maxRetries) {
      try {
        const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, {
          model: this.modelName,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false
        }, { headers });

        return this._parseResponse(response.data);
      } catch (error) {
        retries++;
        lastError = error;
        console.error(`[VLM] 调用失败 (${retries}/${this.maxRetries}): ${error.message || error}`);

        if (retries >= this.maxRetries) break;

        // 指数退避 + 随机抖动
        const delay = this.retryDelay * Math.pow(2, retries - 1) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      error: `调用失败: ${lastError ? (lastError.message || lastError.toString()) : '未知错误'}`,
      text: '',
      usage: {}
    };
  }

  // 解析API响应
  _parseResponse(response) {
    if (!response.choices || response.choices.length === 0) {
      throw new Error('无效的API响应: 无choices字段或为空');
    }

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

    console.log(`[VLM] ${this.modelName} 调用成功, 使用量:`, usage);

    return {
      text: textContent,
      usage,
      raw: response
    };
  }

  // 批量生成响应
  async generateBatch(
    requests,
    concurrency = 5
  ) {
    const results = new Array(requests.length);

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
    const processRequest = async (idx, [prompt, imageInputs, options]) => {
      await semaphore.acquire();
      try {
        return {
          idx,
          result: await this.generateWithImages(prompt, imageInputs, options)
        };
      } finally {
        semaphore.release();
      }
    };

    // 创建所有任务
    const tasks = requests.map((req, idx) => processRequest(idx, req));

    // 按原始顺序收集结果
    for (const task of tasks) {
      const { idx, result } = await task;
      results[idx] = result;
    }

    return results;
  }
}

export default MultiImageVLM;