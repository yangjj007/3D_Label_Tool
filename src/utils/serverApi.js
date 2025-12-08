import axios from 'axios';
import { ChunkedUploader } from './chunkedUpload';
import { ChunkedDownloader } from './chunkedDownload';
import { saveModelFile, deleteModelFile, listFolderFiles } from './filePersistence';
import { getFileType } from './utilityFunction';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

/**
 * 获取服务器文件列表（分页）
 * @param {string} type - 文件类型：raw, labeled, all
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Promise<{total, page, pageSize, files}>}
 */
export async function getServerFileList(type = 'raw', page = 1, pageSize = 10) {
  try {
    const response = await axios.get(`${API_BASE_URL}/files`, {
      params: { type, page, pageSize }
    });
    return response.data;
  } catch (error) {
    console.error('获取服务器文件列表失败:', error);
    throw error;
  }
}

/**
 * 上传模型文件到服务器（支持分块上传）
 * @param {Blob} fileBlob - 文件Blob对象
 * @param {Object} metadata - 文件元数据
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise}
 */
export async function uploadModelToServer(fileBlob, metadata, onProgress) {
  try {
    const uploader = new ChunkedUploader(fileBlob, metadata);
    const result = await uploader.upload(onProgress);
    return result;
  } catch (error) {
    console.error('上传到服务器失败:', error);
    throw error;
  }
}

/**
 * 从服务器下载模型文件到IndexedDB
 * @param {string} fileId - 文件ID
 * @param {Object} metadata - 文件元数据
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise}
 */
export async function downloadModelFromServer(fileId, metadata, onProgress) {
  try {
    // 先获取文件信息
    const fileList = await getServerFileList('all', 1, 1000);
    const fileInfo = fileList.files.find(f => f.id === fileId || f.name === fileId);
    
    if (!fileInfo) {
      throw new Error('文件不存在');
    }
    
    // 判断文件是否已打标（来自labeled_files目录）
    const isFromLabeledDir = fileInfo.type === 'labeled' || metadata.hasLabels;
    console.log(`[downloadModelFromServer] 下载文件: ${fileInfo.name}, 文件大小: ${fileInfo.size} bytes, 从labeled_files: ${isFromLabeledDir}`);
    
    // 创建下载器
    const downloader = new ChunkedDownloader(
      fileId,
      fileInfo.name,
      fileInfo.size
    );
    
    // 下载文件
    const fileBlob = await downloader.download(onProgress);
    console.log(`[downloadModelFromServer] 下载完成，文件大小: ${fileBlob.size} bytes, 从labeled_files: ${isFromLabeledDir}`);
    
    // 从文件名提取真实的文件格式（不使用服务器的 type，它表示 raw/labeled 状态）
    const actualFileType = getFileType(fileInfo.name);
    
    // 保存到IndexedDB
    await saveModelFile({
      ...metadata,
      id: metadata.id || fileId,
      name: metadata.name || fileInfo.name,
      size: fileInfo.size,
      type: actualFileType, // 使用从文件名提取的真实文件类型
      hasLabels: isFromLabeledDir || metadata.hasLabels, // 保存hasLabels标记
      isTemporary: metadata.isTemporary ?? true,
      serverFileId: metadata.serverFileId || fileId,
      batchNumber: metadata.batchNumber || null,
      isFromServer: true
    }, fileBlob);
    
    return { success: true, fileId, size: fileInfo.size, blob: fileBlob };
  } catch (error) {
    console.error('从服务器下载失败:', error);
    throw error;
  }
}

/**
 * 批量下载文件到IndexedDB
 * @param {Array<string>} fileIds - 文件ID数组
 * @param {Function} onProgress - 进度回调函数
 * @returns {Promise}
 */
export async function batchDownloadFiles(fileIds, onProgress) {
  try {
    const results = [];
    let completed = 0;
    
    for (const fileId of fileIds) {
      try {
        await downloadModelFromServer(fileId, { serverFileId: fileId }, (progress) => {
          if (onProgress) {
            onProgress({
              fileId,
              progress: progress.overall,
              completed,
              total: fileIds.length,
              overall: (completed + progress.overall) / fileIds.length
            });
          }
        });
        
        results.push({ fileId, success: true });
      } catch (error) {
        results.push({ fileId, success: false, error: error.message });
      }
      
      completed++;
    }
    
    return results;
  } catch (error) {
    console.error('批量下载失败:', error);
    throw error;
  }
}

/**
 * 将文件移动到已打标目录
 * @param {string} fileId - 服务器文件ID
 * @param {Blob} labeledBlob - 已打标的模型文件Blob
 * @param {Object} metadata - 元数据（包含标签信息）
 * @returns {Promise}
 */
export async function moveToLabeled(fileId, labeledBlob, metadata) {
  try {
    console.log(`[moveToLabeled] 开始上传，fileId: ${fileId}, blob大小: ${labeledBlob.size} bytes`);
    
    const formData = new FormData();
    formData.append('file', labeledBlob, metadata.name || fileId);
    formData.append('fileId', fileId);
    formData.append('metadata', JSON.stringify({
      ...metadata,
      hasLabels: true,
      updatedAt: new Date().toISOString()
    }));
    
    console.log(`[moveToLabeled] FormData已构建，准备POST到 ${API_BASE_URL}/move-to-labeled`);
    
    const response = await axios.post(`${API_BASE_URL}/move-to-labeled`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        console.log(`[moveToLabeled] 上传进度: ${percentCompleted}%`);
      }
    });
    
    console.log(`[moveToLabeled] 上传成功，服务器响应:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[moveToLabeled] 移动到已打标目录失败:', error);
    if (error.response) {
      console.error('[moveToLabeled] 服务器响应错误:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    throw error;
  }
}

/**
 * 删除服务器文件
 * @param {string} fileId - 文件ID
 * @returns {Promise}
 */
export async function deleteServerFile(fileId) {
  try {
    const response = await axios.delete(`${API_BASE_URL}/files/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('删除服务器文件失败:', error);
    throw error;
  }
}

/**
 * 清除指定批次的IndexedDB文件
 * @param {number} batchNumber - 批次号
 * @returns {Promise}
 */
export async function clearBatchFiles(batchNumber) {
  try {
    const allFiles = await listFolderFiles();
    const batchFiles = allFiles.filter(f => f.batchNumber === batchNumber);
    
    for (const file of batchFiles) {
      await deleteModelFile(file.id);
    }
    
    console.log(`批次 ${batchNumber} 的 ${batchFiles.length} 个文件已从IndexedDB清除`);
    return { success: true, count: batchFiles.length };
  } catch (error) {
    console.error('清除批次文件失败:', error);
    throw error;
  }
}

/**
 * 清除所有临时文件
 * @returns {Promise}
 */
export async function clearTemporaryFiles() {
  try {
    const allFiles = await listFolderFiles();
    const tempFiles = allFiles.filter(f => f.isTemporary === true);
    
    for (const file of tempFiles) {
      await deleteModelFile(file.id);
    }
    
    console.log(`${tempFiles.length} 个临时文件已从IndexedDB清除`);
    return { success: true, count: tempFiles.length };
  } catch (error) {
    console.error('清除临时文件失败:', error);
    throw error;
  }
}

/**
 * 健康检查
 * @returns {Promise}
 */
export async function healthCheck() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  } catch (error) {
    console.error('健康检查失败:', error);
    throw error;
  }
}

