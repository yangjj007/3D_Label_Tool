import axios from 'axios';
import { saveModelFile } from './filePersistence';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
const CHUNK_SIZE = parseInt(import.meta.env.VITE_CHUNK_SIZE) || 10 * 1024 * 1024; // 10MB 默认

/**
 * 分块下载器类
 */
export class ChunkedDownloader {
  constructor(fileId, filename, fileSize, chunkSize = CHUNK_SIZE) {
    this.fileId = fileId;
    this.filename = filename;
    this.fileSize = fileSize;
    this.chunkSize = chunkSize;
    this.totalChunks = Math.ceil(fileSize / chunkSize);
    this.chunks = new Array(this.totalChunks);
    this.aborted = false;
  }

  /**
   * 下载单个块
   */
  async downloadChunk(chunkIndex, onProgress) {
    const start = chunkIndex * this.chunkSize;
    const end = Math.min(start + this.chunkSize - 1, this.fileSize - 1);

    try {
      const response = await axios.get(`${API_BASE_URL}/download/${this.fileId}`, {
        headers: {
          Range: `bytes=${start}-${end}`
        },
        responseType: 'arraybuffer',
        onDownloadProgress: (progressEvent) => {
          if (onProgress) {
            const chunkProgress = progressEvent.loaded / progressEvent.total;
            onProgress(chunkIndex, chunkProgress);
          }
        }
      });

      this.chunks[chunkIndex] = response.data;
      return true;
    } catch (error) {
      console.error(`下载块 ${chunkIndex} 失败:`, error);
      throw error;
    }
  }

  /**
   * 下载所有块（支持并发）
   */
  async downloadAll(onProgress, maxConcurrent = 3) {
    const pendingChunks = Array.from({ length: this.totalChunks }, (_, i) => i);
    
    let completed = 0;
    let activeDownloads = 0;
    let currentIndex = 0;

    const downloadNext = async () => {
      if (this.aborted || currentIndex >= pendingChunks.length) {
        return;
      }

      const chunkIndex = pendingChunks[currentIndex++];
      activeDownloads++;

      try {
        await this.downloadChunk(chunkIndex, (index, progress) => {
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
        activeDownloads--;
        if (currentIndex < pendingChunks.length && !this.aborted) {
          await downloadNext();
        }
      }
    };

    // 启动并发下载
    const downloaders = [];
    for (let i = 0; i < Math.min(maxConcurrent, pendingChunks.length); i++) {
      downloaders.push(downloadNext());
    }

    await Promise.all(downloaders);

    if (this.aborted) {
      throw new Error('下载已取消');
    }
  }

  /**
   * 合并所有块为Blob
   */
  mergeChunks() {
    return new Blob(this.chunks);
  }

  /**
   * 保存到IndexedDB
   */
  async saveToIndexedDB(metadata) {
    try {
      const fileBlob = this.mergeChunks();
      
      await saveModelFile({
        ...metadata,
        id: metadata.id || this.fileId,
        name: metadata.name || this.filename,
        size: this.fileSize
      }, fileBlob);
      
      return true;
    } catch (error) {
      console.error('保存到IndexedDB失败:', error);
      throw error;
    }
  }

  /**
   * 取消下载
   */
  abort() {
    this.aborted = true;
  }

  /**
   * 完整下载流程
   */
  async download(onProgress) {
    try {
      // 下载所有块
      await this.downloadAll(onProgress);
      
      // 返回合并后的Blob
      return this.mergeChunks();
    } catch (error) {
      console.error('下载失败:', error);
      throw error;
    }
  }
}

/**
 * 便捷函数：从服务器下载文件
 */
export const downloadLargeFile = async (fileId, filename, fileSize, onProgress) => {
  const downloader = new ChunkedDownloader(fileId, filename, fileSize);
  return await downloader.download(onProgress);
};

