import axios from 'axios';
import { ChunkedUploader } from './chunkedUpload';
import { ChunkedDownloader } from './chunkedDownload';
import { saveModelFile, deleteModelFile, listFolderFiles } from './filePersistence';
import { getFileType } from './utilityFunction';

if (!import.meta.env.VITE_API_BASE_URL) {
  throw new Error(
    '❌ 错误: 未设置环境变量 VITE_API_BASE_URL\n' +
    '请在项目根目录创建 .env 文件并配置:\n' +
    'VITE_API_BASE_URL=http://localhost:30005/api'
  );
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const axiosWithTimeout = axios.create({ timeout: 60000 });
const axiosLongTimeout = axios.create({ timeout: 300000 });


// ─────────────────────────────────────────────────────────────────────────────
// 模型列表
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取服务器模型列表（分页）
 * @param {string} status - raw | segmented | labeled | filtered | all
 * @param {number} page
 * @param {number} pageSize
 */
export async function getServerFileList(status = 'all', page = 1, pageSize = 10) {
  try {
    const response = await axiosWithTimeout.get(`${API_BASE_URL}/models`, {
      params: { status, page, pageSize }
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') throw new Error('获取文件列表超时');
    console.error('获取服务器文件列表失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 单个模型信息
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取单个模型的完整信息
 * @param {string} modelId
 */
export async function getModelInfo(modelId) {
  try {
    const response = await axiosWithTimeout.get(`${API_BASE_URL}/models/${modelId}`);
    return response.data;
  } catch (error) {
    console.error('获取模型信息失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 上传
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 上传模型文件到服务器（分块上传）
 * @param {Blob} fileBlob
 * @param {Object} metadata
 * @param {Function} onProgress
 */
export async function uploadModelToServer(fileBlob, metadata, onProgress) {
  try {
    const uploader = new ChunkedUploader(fileBlob, metadata, {
      uploadChunkUrl:   `${API_BASE_URL}/models/upload-chunk`,
      checkChunksUrl:   `${API_BASE_URL}/models/check-chunks`,
      mergeChunksUrl:   `${API_BASE_URL}/models/merge-chunks`,
    });
    return await uploader.upload(onProgress);
  } catch (error) {
    console.error('上传到服务器失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 下载
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从服务器下载模型网格到 IndexedDB
 * @param {string} modelId
 * @param {Object} metadata
 * @param {Function} onProgress
 * @param {'original'|'segmented'} meshType
 */
export async function downloadModelFromServer(modelId, metadata, onProgress, meshType = 'original') {
  try {
    const downloadUrl = `${API_BASE_URL}/models/${modelId}/download?mesh=${meshType}`;
    const fileId = modelId;

    let fileSize = 0;
    let fileName = metadata.name || `${modelId}.glb`;

    try {
      const headResponse = await axiosLongTimeout.head(downloadUrl);
      fileSize = parseInt(headResponse.headers['content-length'] || '0');
    } catch {
      // 继续，让下载器处理
    }

    const downloader = new ChunkedDownloader(fileId, fileName, fileSize || 1, {
      downloadUrl
    });

    const fileBlob = await downloader.download(onProgress);

    const actualFileType = getFileType(fileName);
    await saveModelFile({
      ...metadata,
      id: metadata.id || fileId,
      name: metadata.name || fileName,
      size: fileBlob.size,
      type: actualFileType,
      hasSegments: metadata.hasSegments || false,
      hasLabels:   metadata.hasLabels   || false,
      isTemporary: metadata.isTemporary ?? true,
      serverFileId: modelId,
      isFromServer: true
    }, fileBlob);

    return { success: true, fileId, size: fileBlob.size, blob: fileBlob };
  } catch (error) {
    console.error('从服务器下载失败:', error);
    if (error.response?.status === 404) throw new Error('文件不存在于服务器');
    throw error;
  }
}

/**
 * 批量下载文件到 IndexedDB
 */
export async function batchDownloadFiles(fileIds, onProgress) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// 分割
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 触发 PartField 分割
 * @param {string} modelId
 * @param {number} numClusters
 * @param {'agglomerative'|'kmeans'} method
 */
export async function triggerSegmentation(modelId, numClusters = 10, method = 'agglomerative') {
  try {
    const response = await axiosLongTimeout.post(`${API_BASE_URL}/models/${modelId}/segment`, {
      numClusters,
      method
    });
    return response.data;
  } catch (error) {
    console.error('触发分割失败:', error);
    throw error;
  }
}

/**
 * 查询分割状态
 * @param {string} modelId
 */
export async function getSegmentStatus(modelId) {
  try {
    const response = await axiosWithTimeout.get(`${API_BASE_URL}/models/${modelId}/segment`);
    return response.data;
  } catch (error) {
    console.error('查询分割状态失败:', error);
    throw error;
  }
}

/**
 * 获取面标签 JSON
 * @param {string} modelId
 * @returns {Promise<number[]>}  face_labels 数组
 */
export async function getSegmentFaceLabels(modelId) {
  try {
    const response = await axiosWithTimeout.get(
      `${API_BASE_URL}/models/${modelId}/segment/face-labels`
    );
    return response.data.faceLabels;
  } catch (error) {
    console.error('获取面标签失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 标签
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 保存标签到服务器 (labels/info.json + 截图)
 * @param {string} modelId
 * @param {Object} infoData  - { overallLabel, segments:[{id,label,color}...] }
 * @param {Object} images    - { overview:[{viewKey,dataURL}], segments:[{segId,viewKey,dataURL}] }
 */
export async function saveModelLabels(modelId, infoData, images = {}) {
  try {
    const dataURLToBlob = (dataURL) => {
      const arr   = dataURL.split(',');
      const mime  = arr[0].match(/:(.*?);/)[1];
      const bstr  = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
      return new Blob([u8arr], { type: mime });
    };

    const formData = new FormData();
    formData.append('infoJson', JSON.stringify(infoData));

    if (images.overview) {
      for (const img of images.overview) {
        formData.append(`image_overview_${img.viewKey}`, dataURLToBlob(img.dataURL), `${img.viewKey}.png`);
      }
    }
    if (images.segments) {
      for (const img of images.segments) {
        formData.append(`image_segments_${img.segId}_${img.viewKey}`, dataURLToBlob(img.dataURL), `${img.viewKey}.png`);
      }
    }

    const response = await axiosLongTimeout.post(
      `${API_BASE_URL}/models/${modelId}/labels`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  } catch (error) {
    console.error('保存标签失败:', error);
    throw error;
  }
}

/**
 * 读取标签
 * @param {string} modelId
 */
export async function getModelLabels(modelId) {
  try {
    const response = await axiosWithTimeout.get(`${API_BASE_URL}/models/${modelId}/labels`);
    return response.data;
  } catch (error) {
    console.error('读取标签失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 过滤 & 元数据
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 标记模型为已过滤
 * @param {string} modelId
 * @param {Object} filterMetrics
 */
export async function markAsFiltered(modelId, filterMetrics = null) {
  try {
    const response = await axiosWithTimeout.post(`${API_BASE_URL}/models/${modelId}/filter`, {
      filterMetrics
    });
    return response.data;
  } catch (error) {
    console.error('标记过滤失败:', error);
    throw error;
  }
}

/**
 * 更新模型元数据
 * @param {string} modelId
 * @param {Object} updates  - 要合并的字段
 */
export async function updateMetadata(modelId, updates) {
  try {
    const response = await axiosWithTimeout.patch(
      `${API_BASE_URL}/models/${modelId}/meta`,
      updates
    );
    return response.data;
  } catch (error) {
    console.error('更新元数据失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 删除
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 删除服务器模型
 * @param {string} modelId
 */
export async function deleteServerFile(modelId) {
  try {
    const response = await axiosWithTimeout.delete(`${API_BASE_URL}/models/${modelId}`);
    return response.data;
  } catch (error) {
    console.error('删除服务器模型失败:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB 工具
// ─────────────────────────────────────────────────────────────────────────────

export async function clearBatchFiles(batchNumber) {
  const allFiles = await listFolderFiles();
  const batchFiles = allFiles.filter(f => f.batchNumber === batchNumber);
  for (const file of batchFiles) await deleteModelFile(file.id);
  return { success: true, count: batchFiles.length };
}

export async function clearTemporaryFiles() {
  const allFiles = await listFolderFiles();
  const tempFiles = allFiles.filter(f => f.isTemporary === true);
  for (const file of tempFiles) await deleteModelFile(file.id);
  return { success: true, count: tempFiles.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 健康检查 & 提示词库
// ─────────────────────────────────────────────────────────────────────────────

export async function healthCheck() {
  try {
    const response = await axiosWithTimeout.get(`${API_BASE_URL}/health`);
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') throw new Error('健康检查超时');
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 兼容旧调用名 — 以下为向后兼容的别名
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated 使用 saveModelLabels */
export async function saveLabeledFolder(modelName, _glbBlob, infoData, images) {
  const modelId = modelName.replace(/\.(glb|gltf)$/i, '');

  // 图片：优先使用新 segments 格式（来自掩码打标），回退兼容旧 materials 格式
  const convertedImages = {
    overview: images?.overall || [],
    segments: images?.segments?.length
      ? images.segments
      : (images?.materials || []).map(img => ({
          segId: img.materialName?.replace(/[^a-zA-Z0-9_-]/g, '_') || '0',
          viewKey: img.viewKey,
          dataURL: img.dataURL
        }))
  };

  // infoData：优先使用新 segments 字段，回退兼容旧 materials 字段
  const convertedInfo = {
    ...infoData,
    segments: infoData.segments?.length
      ? infoData.segments
      : (infoData.materials || []).map((m, i) => ({
          id: i,
          label: m.label || '',
          color: m.color || '#888888',
          name: m.name
        }))
  };

  return saveModelLabels(modelId, convertedInfo, convertedImages);
}

/** @deprecated 使用 markAsFiltered */
export async function copyToFiltered(fileId) {
  return markAsFiltered(fileId.replace(/\.(glb|gltf)$/i, ''));
}

/** @deprecated 使用 updateMetadata */
export async function updateMetadataLegacy(fileId, metadata) {
  return updateMetadata(fileId.replace(/\.(glb|gltf)$/i, ''), metadata);
}

/** @deprecated 使用 downloadModelFromServer */
export async function moveToLabeled(fileId, _labeledBlob, _metadata) {
  console.warn('[moveToLabeled] 已废弃，新流程不需要此操作，数据由 saveModelLabels 保存');
  return { success: true, message: '已忽略（新流程）' };
}
