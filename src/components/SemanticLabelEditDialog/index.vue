<template>
  <el-dialog
    v-model="dialogVisible"
    title="编辑语义标签"
    width="600px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form :model="formData" label-width="100px">
      <el-form-item label="材质名称">
        <el-input v-model="formData.meshName" disabled />
      </el-form-item>
      <el-form-item label="语义标签">
        <el-input
          v-model="formData.label"
          type="textarea"
          :rows="8"
          placeholder="请输入语义标签内容"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>
    </el-form>
    
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">
          保存并写入模型
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup name="SemanticLabelEditDialog">
import { ref, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import { saveModelFile, getModelFile } from '@/utils/filePersistence';
import { moveToLabeled } from '@/utils/serverApi';

const dialogVisible = ref(false);
const saving = ref(false);

const formData = reactive({
  meshName: '',
  label: '',
  mesh: null,
  model: null,
  fileInfo: null,
  fileId: null
});

let onSaveCallback = null;

/**
 * 打开编辑弹窗
 */
const showDialog = (mesh, model, fileInfo, fileId, callback) => {
  if (!mesh) {
    ElMessage.warning('未选中材质对象');
    return;
  }
  
  formData.mesh = mesh;
  formData.model = model;
  formData.fileInfo = fileInfo;
  formData.fileId = fileId;
  formData.meshName = mesh.name || mesh.uuid;
  formData.label = mesh.userData?.semanticLabel || '';
  onSaveCallback = callback;
  
  dialogVisible.value = true;
};

/**
 * 取消编辑
 */
const handleCancel = () => {
  dialogVisible.value = false;
};

/**
 * 保存语义标签
 */
const handleSave = async () => {
  if (!formData.label || !formData.label.trim()) {
    ElMessage.warning('请输入语义标签内容');
    return;
  }

  try {
    saving.value = true;
    
    // 1. 更新 mesh 的 userData
    if (!formData.mesh.userData) {
      formData.mesh.userData = {};
    }
    formData.mesh.userData.semanticLabel = formData.label.trim();
    
    console.log('[语义标签编辑] 已更新 mesh.userData.semanticLabel:', formData.meshName);
    
    // 2. 检测文件格式并保存
    const fileName = formData.fileInfo.name || formData.fileInfo.fileName || '';
    const isFolder = formData.fileInfo.isFolder === true;
    
    if (isFolder) {
      console.log('[语义标签编辑] 检测到文件夹格式，更新 info.json');
      await updateInfoJson();
    } else {
      console.log('[语义标签编辑] 检测到传统格式，导出并写入 GLB');
      await exportModelWithLabels();
    }
    
    ElMessage.success('语义标签已保存');
    dialogVisible.value = false;
    
    // 3. 调用回调函数通知父组件
    if (onSaveCallback) {
      onSaveCallback(formData.mesh, formData.label);
    }
    
  } catch (error) {
    console.error('[语义标签编辑] 保存失败:', error);
    ElMessage.error('保存失败: ' + (error.message || '未知错误'));
  } finally {
    saving.value = false;
  }
};

/**
 * 更新文件夹格式的 info.json
 */
const updateInfoJson = async () => {
  if (!formData.fileInfo) {
    throw new Error('文件信息不存在');
  }
  
  const fileName = formData.fileInfo.name || formData.fileInfo.fileName || '';
  // 移除扩展名得到文件夹名
  const folderName = fileName.replace(/\.(glb|gltf)$/i, '');
  
  console.log('[语义标签编辑] 开始更新 info.json，文件夹:', folderName);
  
  // 1. 从服务器读取现有的 info.json
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const response = await fetch(`${API_BASE_URL}/get-info-json/${folderName}`);
  
  if (!response.ok) {
    throw new Error('无法读取 info.json: ' + response.statusText);
  }
  
  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error('info.json 数据无效');
  }
  
  const infoData = result.data;
  console.log('[语义标签编辑] 成功读取 info.json，材质数:', infoData.materials?.length || 0);
  
  // 2. 更新对应材质的标签
  const meshName = formData.meshName;
  const meshUuid = formData.mesh?.uuid;
  
  let updated = false;
  if (infoData.materials && Array.isArray(infoData.materials)) {
    for (const material of infoData.materials) {
      if (material.name === meshName || material.uuid === meshUuid) {
        material.label = formData.label.trim();
        updated = true;
        console.log('[语义标签编辑] 更新材质标签:', material.name);
        break;
      }
    }
  }
  
  if (!updated) {
    console.warn('[语义标签编辑] 未找到匹配的材质，添加新材质');
    if (!infoData.materials) {
      infoData.materials = [];
    }
    infoData.materials.push({
      name: meshName,
      uuid: meshUuid || '',
      label: formData.label.trim()
    });
  }
  
  // 3. 将更新后的 info.json 保存回服务器
  const updateResponse = await fetch(`${API_BASE_URL}/update-info-json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      folderName: folderName,
      infoData: infoData
    })
  });
  
  if (!updateResponse.ok) {
    throw new Error('保存 info.json 失败: ' + updateResponse.statusText);
  }
  
  const updateResult = await updateResponse.json();
  if (!updateResult.success) {
    throw new Error('保存 info.json 失败: ' + updateResult.error);
  }
  
  console.log('[语义标签编辑] info.json 更新成功');
};

/**
 * 导出模型并写入语义标签到 GLB 文件（旧格式兼容）
 */
const exportModelWithLabels = async () => {
  if (!formData.model || !formData.fileInfo) {
    throw new Error('模型或文件信息不存在');
  }
  
  // 检查是否是 GLB/GLTF 格式
  const fileName = formData.fileInfo.name || formData.fileInfo.fileName || '';
  const isGlb = /\.(glb|gltf)$/i.test(fileName);
  
  if (!isGlb) {
    ElMessage.warning('当前仅支持 GLB/GLTF 格式的模型保存语义标签');
    return;
  }
  
  console.log('[语义标签编辑] 开始导出模型...');
  
  // 收集所有语义标签
  const labelMapByUuid = new Map();
  formData.model.traverse(child => {
    const label = child.userData?.semanticLabel;
    if (label) {
      labelMapByUuid.set(child.uuid, label);
    }
  });
  
  console.log(`[语义标签编辑] 共有 ${labelMapByUuid.size} 个对象包含语义标签`);
  
  // 使用 GLTFExporter 导出
  const exporter = new GLTFExporter();
  
  return new Promise((resolve, reject) => {
    exporter.parse(
      formData.model,
      async (gltf) => {
        try {
          // gltf 是 ArrayBuffer (binary GLB)
          let glbBlob = new Blob([gltf], { type: 'model/gltf-binary' });
          
          // 写入标签到 GLB
          if (labelMapByUuid.size > 0) {
            try {
              glbBlob = await addSemanticLabelsToGLB(glbBlob, labelMapByUuid, formData.model);
              console.log(`[语义标签编辑] 成功写入 ${labelMapByUuid.size} 个标签到 GLB`);
            } catch (err) {
              console.error('[语义标签编辑] 写入标签失败:', err);
              throw err;
            }
          }
          
          // 保存文件
          await saveGlbFile(glbBlob, fileName);
          resolve();
          
        } catch (error) {
          console.error('[语义标签编辑] 处理导出结果失败:', error);
          reject(error);
        }
      },
      (error) => {
        console.error('[语义标签编辑] GLB 导出失败:', error);
        reject(error);
      },
      {
        binary: true,
        includeCustomExtensions: true
      }
    );
  });
};

/**
 * 添加语义标签到 GLB 文件
 * @param {Blob} glbBlob - 原始 GLB Blob
 * @param {Map} labelMap - UUID到标签的映射
 * @param {THREE.Object3D} model - 模型对象
 * @returns {Promise<Blob>}
 */
const addSemanticLabelsToGLB = async (glbBlob, labelMap, model) => {
  const arrayBuffer = await glbBlob.arrayBuffer();
  const dataView = new DataView(arrayBuffer);
  
  // GLB 格式：12字节头 + JSON chunk + BIN chunk
  const magic = dataView.getUint32(0, true);
  if (magic !== 0x46546C67) { // "glTF"
    throw new Error('Invalid GLB file');
  }
  
  const version = dataView.getUint32(4, true);
  const length = dataView.getUint32(8, true);
  
  // 读取 JSON chunk
  const jsonChunkLength = dataView.getUint32(12, true);
  const jsonChunkType = dataView.getUint32(16, true);
  
  if (jsonChunkType !== 0x4E4F534A) { // "JSON"
    throw new Error('Invalid JSON chunk');
  }
  
  const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
  const jsonString = new TextDecoder().decode(jsonBytes);
  const gltfJson = JSON.parse(jsonString);
  
  // 添加 extras 到节点
  if (!gltfJson.nodes) {
    gltfJson.nodes = [];
  }
  
  // 构建名称到标签的映射
  const nodesByName = new Map();
  model.traverse(child => {
    const label = labelMap.get(child.uuid);
    if (label && child.name) {
      nodesByName.set(child.name, label);
    }
  });
  
  // 应用标签到 GLTF 节点
  gltfJson.nodes.forEach(node => {
    const label = nodesByName.get(node.name);
    if (label) {
      node.extras = node.extras || {};
      node.extras.semanticLabel = label;
      console.log(`[语义标签编辑] 写入标签到节点: ${node.name}`);
    }
  });
  
  // 同样写入到 meshes（如果存在）
  if (gltfJson.meshes) {
    gltfJson.meshes.forEach(mesh => {
      const label = nodesByName.get(mesh.name);
      if (label) {
        mesh.extras = mesh.extras || {};
        mesh.extras.semanticLabel = label;
        console.log(`[语义标签编辑] 写入标签到mesh: ${mesh.name}`);
      }
    });
  }
  
  // 重新编码 JSON
  const newJsonString = JSON.stringify(gltfJson);
  const newJsonBytes = new TextEncoder().encode(newJsonString);
  
  // 补齐到 4 字节对齐
  const jsonPadding = (4 - (newJsonBytes.length % 4)) % 4;
  const newJsonLength = newJsonBytes.length + jsonPadding;
  
  // 读取 BIN chunk（如果有）
  const binChunkStart = 20 + jsonChunkLength;
  let binChunkLength = 0;
  let binChunkData = null;
  
  if (binChunkStart < arrayBuffer.byteLength) {
    binChunkLength = dataView.getUint32(binChunkStart, true);
    binChunkData = new Uint8Array(arrayBuffer, binChunkStart + 8, binChunkLength);
  }
  
  // 构建新的 GLB
  const newLength = 12 + 8 + newJsonLength + (binChunkData ? 8 + binChunkLength : 0);
  const newBuffer = new ArrayBuffer(newLength);
  const newView = new DataView(newBuffer);
  const newBytes = new Uint8Array(newBuffer);
  
  // 写入头部
  newView.setUint32(0, 0x46546C67, true); // magic
  newView.setUint32(4, version, true);
  newView.setUint32(8, newLength, true);
  
  // 写入 JSON chunk
  newView.setUint32(12, newJsonLength, true);
  newView.setUint32(16, 0x4E4F534A, true); // "JSON"
  newBytes.set(newJsonBytes, 20);
  // 填充空格
  for (let i = 0; i < jsonPadding; i++) {
    newBytes[20 + newJsonBytes.length + i] = 0x20;
  }
  
  // 写入 BIN chunk（如果有）
  if (binChunkData) {
    const binStart = 20 + newJsonLength;
    newView.setUint32(binStart, binChunkLength, true);
    newView.setUint32(binStart + 4, 0x004E4942, true); // "BIN\0"
    newBytes.set(binChunkData, binStart + 8);
  }
  
  return new Blob([newBuffer], { type: 'model/gltf-binary' });
};

/**
 * 保存 GLB 文件
 */
const saveGlbFile = async (blob, fileName) => {
  try {
    // 1. 先获取原文件信息
    let originalFileRecord = null;
    if (formData.fileId) {
      try {
        originalFileRecord = await getModelFile(formData.fileId);
      } catch (err) {
        console.warn('[语义标签编辑] 无法获取原文件记录:', err);
      }
    }
    
    // 2. 保存到 IndexedDB（更新原文件）
    if (formData.fileId) {
      const metadata = {
        id: formData.fileId,
        name: fileName,
        size: blob.size,
        type: originalFileRecord?.type || 'labeled',
        folder: originalFileRecord?.folder || 'labeled',
        hasLabels: true,
        labels: [], // 可以在这里添加标签摘要
        updatedAt: new Date().toISOString()
      };
      
      await saveModelFile(metadata, blob);
      console.log('[语义标签编辑] 已保存到 IndexedDB:', fileName);
    }
    
    // 3. 如果文件来自服务器，同时上传到服务器的 labeled_files 文件夹
    if (originalFileRecord?.isFromServer || originalFileRecord?.serverFileId) {
      try {
        const serverFileId = originalFileRecord.serverFileId || formData.fileId;
        await moveToLabeled(serverFileId, blob, {
          name: fileName,
          hasLabels: true,
          size: blob.size,
          updatedAt: new Date().toISOString()
        });
        console.log('[语义标签编辑] 已上传到服务器 labeled_files:', fileName);
      } catch (serverErr) {
        console.error('[语义标签编辑] 上传到服务器失败:', serverErr);
        ElMessage.warning('文件已保存到本地，但上传到服务器失败');
      }
    }
    
    // 4. 可选：触发浏览器下载（备份）
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = fileName;
    // a.style.display = 'none';
    // document.body.appendChild(a);
    // a.click();
    // document.body.removeChild(a);
    // URL.revokeObjectURL(url);
    
    console.log('[语义标签编辑] 文件保存完成:', fileName);
  } catch (error) {
    console.error('[语义标签编辑] 保存文件失败:', error);
    throw error;
  }
};

// 导出方法供父组件调用
defineExpose({
  showDialog
});
</script>

<style lang="scss" scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

:deep(.el-textarea__inner) {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

:deep(.el-form-item__label) {
  color: #ccc;
}
</style>

