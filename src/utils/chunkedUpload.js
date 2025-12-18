import axios from 'axios';

// 强制要求从环境变量读取后端API地址配置
if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error(
    '❌ 错误: 未设置环境变量 VITE_API_BASE_URL\n' +
    '请在项目根目录创建 .env 文件并配置:\n' +
    'VITE_API_BASE_URL=http://localhost:10000/api'
  );
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const CHUNK_SIZE = parseInt(import.meta.env.VITE_CHUNK_SIZE) || 10 * 1024 * 1024; // 10MB 默认

// 创建用于文件上传的axios实例，设置较长超时时间
const axiosUpload = axios.create({
  timeout: 120000, // 每个分块上传2分钟超时
});

/**
 * 分块上传器类
 */
export class ChunkedUploader {
  constructor(file, metadata = {}, chunkSize = CHUNK_SIZE) {
    this.file = file;
    this.metadata = metadata;
    this.fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.chunkSize = chunkSize;
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    this.uploadedChunks = new Set();
    this.aborted = false;
  }

  /**
   * 检查已上传的块（支持断点续传）
   */
  async checkExistingChunks() {
    try {
      const response = await axiosUpload.post(`${API_BASE_URL}/check-chunks`, {
        fileId: this.fileId,
        totalChunks: this.totalChunks
      });
      
      if (response.data.success && response.data.uploadedChunks) {
        response.data.uploadedChunks.forEach(index => {
          this.uploadedChunks.add(index);
        });
      }
      
      return this.uploadedChunks.size;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error('检查已上传块超时');
      } else {
        console.error('检查已上传块失败:', error);
      }
      return 0;
    }
  }

  /**
   * 上传单个块
   */
  async uploadChunk(chunkIndex, onProgress) {
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const chunk = this.file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('fileId', this.fileId);
    formData.append('chunkIndex', chunkIndex);
    formData.append('totalChunks', this.totalChunks);

    try {
      await axiosUpload.post(`${API_BASE_URL}/upload-chunk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const chunkProgress = progressEvent.loaded / progressEvent.total;
            onProgress(chunkIndex, chunkProgress);
          }
        }
      });

      this.uploadedChunks.add(chunkIndex);
      return true;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error(`上传块 ${chunkIndex} 超时`);
        throw new Error(`上传块 ${chunkIndex} 超时，请检查网络连接`);
      }
      console.error(`上传块 ${chunkIndex} 失败:`, error);
      throw error;
    }
  }

  /**
   * 上传所有块（支持并发）
   */
  async uploadAll(onProgress, maxConcurrent = 3) {
    const pendingChunks = [];
    
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.uploadedChunks.has(i)) {
        pendingChunks.push(i);
      }
    }

    let completed = this.uploadedChunks.size;
    let activeUploads = 0;
    let currentIndex = 0;

    const uploadNext = async () => {
      if (this.aborted || currentIndex >= pendingChunks.length) {
        return;
      }

      const chunkIndex = pendingChunks[currentIndex++];
      activeUploads++;

      try {
        await this.uploadChunk(chunkIndex, (index, progress) => {
          if (onProgress) {
            const overallProgress = (completed + progress) / this.totalChunks;
            onProgress({
              overall: overallProgress,
              current: completed + 1,
              total: this.totalChunks,
              currentChunkProgress: progress
            });
          }
        });

        completed++;
        
        if (onProgress) {
          onProgress({
            overall: completed / this.totalChunks,
            current: completed,
            total: this.totalChunks,
            currentChunkProgress: 1
          });
        }
      } catch (error) {
        throw error;
      } finally {
        activeUploads--;
        if (currentIndex < pendingChunks.length && !this.aborted) {
          await uploadNext();
        }
      }
    };

    // 启动并发上传
    const uploaders = [];
    for (let i = 0; i < Math.min(maxConcurrent, pendingChunks.length); i++) {
      uploaders.push(uploadNext());
    }

    await Promise.all(uploaders);

    if (this.aborted) {
      throw new Error('上传已取消');
    }
  }

  /**
   * 合并块
   */
  async mergeChunks() {
    try {
      const response = await axiosUpload.post(`${API_BASE_URL}/merge-chunks`, {
        fileId: this.fileId,
        filename: this.metadata.name || this.file.name,
        totalChunks: this.totalChunks,
        metadata: this.metadata
      });

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error('合并块超时');
        throw new Error('合并文件块超时，请重试');
      }
      console.error('合并块失败:', error);
      throw error;
    }
  }

  /**
   * 取消上传
   */
  async abort() {
    this.aborted = true;
    try {
      await axiosUpload.post(`${API_BASE_URL}/cancel-upload`, {
        fileId: this.fileId
      });
    } catch (error) {
      if (error.code !== 'ECONNABORTED') {
        console.error('取消上传失败:', error);
      }
    }
  }

  /**
   * 完整上传流程
   */
  async upload(onProgress) {
    try {
      // 检查断点续传
      await this.checkExistingChunks();
      
      // 上传所有块
      await this.uploadAll(onProgress);
      
      // 合并块
      const result = await this.mergeChunks();
      
      return result;
    } catch (error) {
      console.error('上传失败:', error);
      throw error;
    }
  }
}

/**
 * 便捷函数：上传文件到服务器
 */
export const uploadLargeFile = async (file, metadata, onProgress) => {
  const uploader = new ChunkedUploader(file, metadata);
  return await uploader.upload(onProgress);
};

