<template>
  <div class="model-page">
    <!-- 头部操作栏 -->
    <header class="model-header">
      <div class="header-lf">
        <span> 3d模型可视化打标系统 </span>
        <span>当前Three.js版本:{{ THREE.REVISION }}</span>
      </div>
      <div class="header-lr">
        <el-space>
          <el-button type="primary" icon="View" v-if="handleConfigBtn" @click="onPreview">效果预览</el-button>
          <el-dropdown trigger="click">
            <el-button type="primary" icon="Download"> 下载/导出<el-icon class="el-icon--right"></el-icon> </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="onDownloadCover">下载封面</el-dropdown-item>
                <el-dropdown-item @click="onExportModelFile('glb')">导出模型(.glb)格式</el-dropdown-item>
                <el-dropdown-item @click="onExportModelFile('gltf')">导出模型(.gltf)格式</el-dropdown-item>
                <el-dropdown-item @click="onExportModelFile('usdz')">导出模型(.usdz)格式</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" icon="FullScreen" @click="onFullScreen">
            {{ fullscreenStatus ? "取消全屏" : "全屏" }}
          </el-button>
        </el-space>
      </div>
    </header>
    <div class="model-container">
      <div class="left-panel">
        <div class="left-panel-tabs">
          <div
            class="tab-item"
            :class="{ active: activeLeftTab === 'fileList' }"
            @click="activeLeftTab = 'fileList'"
          >
            模型文件列表
          </div>
          <div
            class="tab-item"
            :class="{ active: activeLeftTab === 'modelChoose' }"
            @click="activeLeftTab = 'modelChoose'"
          >
            场景/模型库
          </div>
        </div>
        <div class="left-panel-content">
          <div v-show="activeLeftTab === 'fileList'" class="panel-content">
            <file-list
              ref="fileListRef"
              :files="fileStore.files"
              :selected-file-id="fileStore.selectedFileId"
              :is-batch-processing="isBatchProcessing"
              :processed-count="processedCount"
              :total-count="totalCount"
              :remaining-time="remainingTime"
              @select="handleSelectFile"
              @delete="handleDeleteFile"
              @rename="handleRenameFile"
              @export="handleExportFile"
              @view-labels="handleViewLabels"
              @generate-labels="handleGenerateLabels"
              @batch-upload="handleBatchUploadTrigger"
              @batch-download="handleBatchDownload"
              @batch-delete="handleBatchDelete"
              @batch-tag="handleBatchTagging"
            />
          </div>
          <div v-show="activeLeftTab === 'modelChoose'" class="panel-content">
            <model-choose ref="choosePanel"></model-choose>
          </div>
        </div>
      </div>
      <!-- 模型视图 -->
      <div id="model" @drop="onDragDrop" ref="model" @dragover.prevent>
        <div class="camera-icon">
          <el-tooltip effect="dark" content="居中" placement="top">
            <el-icon :size="18" color="#fff" @click="onResetCamera">
              <Aim />
            </el-icon>
          </el-tooltip>
        </div>
        <div v-if="semanticLabelInfo.show" class="semantic-label-panel">
          <div class="semantic-label-title">语义标签</div>
          <div class="semantic-label-value">{{ semanticLabelInfo.text }}</div>
        </div>
        <div id="mesh-txt"></div>
      </div>
      <!-- 右侧编辑栏 -->
      <div class="edit-panel" :style="{ minWidth: '380px' }">
        <model-edit-panel ref="editPanel" v-if="store.modelApi.model"></model-edit-panel>
      </div>
    </div>
    <!-- 视频背景video -->
    <video id="video" loop="loop" playsinline autoplay style="display: none"></video>
    <page-loading :loading="loading" :percentage="progress"></page-loading>
    <!-- 嵌入代码弹框 -->
    <implant-code-dialog ref="implantDialog"></implant-code-dialog>
  </div>
</template>

<script setup name="modelEdit">
import { ModelEditPanel, ModelChoose, ImplantCodeDialog, FileList } from "@/components/index";
import { onMounted, ref, getCurrentInstance, onBeforeUnmount, computed, unref, isRef } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { getFileType } from "@/utils/utilityFunction";
import renderModel from "@/utils/renderModel";
import { parseObjLabels } from "@/utils/objLabelUtils";
import { modelList } from "@/config/model";
import PageLoading from "@/components/Loading/PageLoading.vue";
import { MODEL_PREVIEW_CONFIG, MODEL_BASE_DATA, MODEL_DEFAULT_CONFIG, UPDATE_MODEL, PAGE_LOADING } from "@/config/constant";
import { useMeshEditStore } from "@/store/meshEditStore";
import { useFileStore } from "@/store/fileStore";
import { deleteModelFile, listFolderFiles, getModelFile, clearModelFiles, STORAGE_FOLDER, getAllFiles } from "@/utils/filePersistence";
import { getServerFileList, downloadModelFromServer, moveToLabeled, clearBatchFiles, deleteServerFile } from "@/utils/serverApi";
import * as THREE from "three";

import MultiImageVLM from "@/utils/vlmService";
import RenderPool from "@/utils/RenderPool";

const store = useMeshEditStore();
const fileStore = useFileStore();
const router = useRouter();
const { $bus, $local } = getCurrentInstance().proxy;

const vlmClient = new MultiImageVLM();

const loading = ref(false);
const progress = ref(0);
const editPanel = ref(null);
const choosePanel = ref(null);
const fileListRef = ref(null);
const implantDialog = ref(null);
const fullscreenStatus = ref(false);
const loadingTimeout = ref(null);
const activeLeftTab = ref("fileList");

// 批量处理状态
const isBatchProcessing = ref(false);
const processedCount = ref(0);
const totalCount = ref(0);
const batchStartTime = ref(0);
const remainingTime = ref("");

const handleConfigBtn = computed(() => {
  if (editPanel.value) {
    const fileInfo = choosePanel.value?.activeModel;
    return fileInfo?.filePath && ["oneModel", "tags"].includes(store.modelType) ? true : false;
  }
  return false;
});

const semanticLabelInfo = computed(() => {
  const mesh = store.selectMesh;
  if (!mesh) return { show: false, text: "" };
  const label =
    mesh.userData?.semanticLabel ||
    mesh.material?.userData?.label ||
    store.modelApi?.semanticLabels?.[mesh.uuid];
  if (!label) return { show: false, text: "" };
  return { show: true, text: label };
});

const loadPersistedModelFile = async (file, silent = false) => {
  console.log(`[loadPersistedModelFile] 尝试加载文件:`, { id: file.id, name: file.name, silent, hasLabels: file.hasLabels, isFromServer: file.isFromServer });
  
  if (!store.modelApi?.onSwitchModel) {
    console.error(`[loadPersistedModelFile] modelApi.onSwitchModel 不存在`);
    if (!silent) ElMessage.warning("模型初始化尚未完成，请稍后再试");
    return false;
  }

  // 如果文件标记为已打标，优先从服务器的labeled_files下载最新版本
  if (file.hasLabels || file.isFromServer) {
    console.log(`[loadPersistedModelFile] 文件已打标，从服务器加载最新版本...`);
    try {
      const blob = await downloadModelFromServer(file.id, {
        ...file,
        id: file.id,
        name: file.name,
        hasLabels: true
      });
      console.log(`[loadPersistedModelFile] 从服务器下载完成，文件大小: ${blob?.size || 'unknown'} bytes`);
    } catch (err) {
      console.warn(`[loadPersistedModelFile] 从服务器下载失败，尝试使用本地缓存:`, err);
      // 继续使用本地缓存
    }
  }

  let record;
  try {
    console.log(`[loadPersistedModelFile] 从 IndexedDB 读取文件，ID: ${file.id}`);
    record = await getModelFile(file.id);
    console.log(`[loadPersistedModelFile] IndexedDB 返回:`, record ? { 
      id: record.id, 
      name: record.name, 
      hasBlob: !!record.fileBlob,
      blobSize: record.fileBlob?.size 
    } : null);
  } catch (err) {
    console.error(`[loadPersistedModelFile] 读取模型数据失败:`, err);
    if (!silent) ElMessage.error("读取模型文件失败");
    return false;
  }

  if (!record || !record.fileBlob) {
    console.error(`[loadPersistedModelFile] 记录为空或缺少 fileBlob:`, { 
      hasRecord: !!record, 
      hasBlob: !!record?.fileBlob 
    });
    if (!silent) ElMessage.warning("当前文件未保存模型数据，请重新上传");
    return false;
  }

  // 从文件名提取真实的文件格式（不使用 record.type，因为它可能是 'raw'/'labeled' 状态而非格式）
  const fileType = getFileType(record.name || file.name);
  const normalizedFileType = (fileType || "").toLowerCase();
  const fileName = record.name || file.name;
  console.log(`[loadPersistedModelFile] 文件类型: ${fileType}，文件名: ${fileName}`);
  let objLabelMap = {};
  const shouldParseObj =
    normalizedFileType === "obj" || (fileName && fileName.toLowerCase().endsWith(".obj"));
  if (shouldParseObj) {
    try {
      const rawText = await record.fileBlob.text();
      objLabelMap = parseObjLabels(rawText);
    } catch (err) {
      console.error("解析 OBJ 文件标签失败", err);
    }
  }
  const tempUrl = URL.createObjectURL(record.fileBlob);
  const model = {
    filePath: tempUrl,
    fileType
  };

  if (!silent) $bus.emit(PAGE_LOADING, true);

  let success = false;
  let returnedPath = "";
  try {
    console.log(`[loadPersistedModelFile] 调用 onSwitchModel，文件类型: ${fileType}`);
    store.modelApi.objLabelMap = objLabelMap;
    const { load, filePath } = await store.modelApi.onSwitchModel(model);
    returnedPath = filePath;
    console.log(`[loadPersistedModelFile] onSwitchModel 返回:`, { load, filePath });
    if (load) {
      success = true;
      store.setActiveEditModelType("oneModel");
      $bus.emit(UPDATE_MODEL);
      console.log(`[loadPersistedModelFile] 模型加载成功`);
    } else {
      console.error(`[loadPersistedModelFile] onSwitchModel 返回 load=false`);
    }
  } catch (err) {
    console.error(`[loadPersistedModelFile] 加载模型异常:`, err);
    if (err && err.stack) {
      console.error(`[loadPersistedModelFile] 错误堆栈:`, err.stack);
    }
  } finally {
    if (!silent) $bus.emit(PAGE_LOADING, false);
    if (returnedPath) {
      URL.revokeObjectURL(returnedPath);
    } else {
      URL.revokeObjectURL(tempUrl);
    }
  }

  if (!success) {
    console.error(`[loadPersistedModelFile] 最终返回 false，文件: ${file.name}`);
    if (!silent) ElMessage.error("模型渲染失败，请重试");
  }
  return success;
};

const handleSelectFile = async file => {
  fileStore.setSelectedFile(file.id);
  ElMessage.info(`已选择 ${file.name}`);
  await loadPersistedModelFile(file);
};

const handleDeleteFile = async file => {
  try {
    await ElMessageBox.confirm(`确认删除"${file.name}"？`, "提示", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch (err) {
    return;
  }
  
  try {
    // 如果文件来自服务器（从文件列表组件），先删除服务器文件
    if (file.isFromServer || file.serverFileId) {
      try {
        await deleteServerFile(file.serverFileId || file.id || file.name);
        console.log('服务器文件已删除:', file.name);
      } catch (serverErr) {
        console.error('删除服务器文件失败:', serverErr);
        // 继续删除本地文件
      }
    }
    
    // 删除IndexedDB中的文件（如果存在）
    try {
      await deleteModelFile(file.id);
    } catch (dbErr) {
      // IndexedDB中可能不存在，忽略错误
      console.log('IndexedDB中不存在该文件:', file.id);
    }
    
    fileStore.removeFile(file.id);
    ElMessage.success("删除成功");
    
    // 触发文件列表刷新
    $bus.emit('REFRESH_FILE_LIST');
  } catch (err) {
    console.error("删除文件失败", err);
    ElMessage.error("删除失败：" + err.message);
  }
};

const handleRenameFile = file => {
  ElMessage.info(`重命名暂不支持: ${file.name}`);
};

const handleExportFile = file => {
  ElMessage.info(`导出暂不支持: ${file.name}`);
};

const handleViewLabels = file => {
  if (!file.labels || !file.labels.length) {
    ElMessage.warning("当前文件暂无语义标签");
  } else {
    ElMessage.success("已展示语义标签（mock）");
  }
};

const handleGenerateLabels = file => {
  ElMessage.info(`标签生成功能还在规划中: ${file.name}`);
};

const handleBatchUploadTrigger = () => {
  choosePanel.value?.openBatchUploadDialog?.();
};

const downloadRecordViaLink = record => {
  if (!record?.fileBlob || typeof document === "undefined") return;
  const url = URL.createObjectURL(record.fileBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = record.name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const saveRecordToDirectory = async (dirHandle, record) => {
  if (!record?.fileBlob) return;
  const fileHandle = await dirHandle.getFileHandle(record.name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(record.fileBlob);
  await writable.close();
};

const handleBatchDownload = async () => {
  if (!fileStore.files.length) {
    ElMessage.warning("当前没有可下载的模型文件");
    return;
  }
  const records = await Promise.all(fileStore.files.map(file => getModelFile(file.id)));
  const downloadable = records.filter(record => record?.fileBlob);
  if (!downloadable.length) {
    ElMessage.warning("无法获取文件内容，请重新上传或稍后再试");
    return;
  }
  const supportsDirectory =
    typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  if (supportsDirectory) {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({
        id: "model-files",
        mode: "readwrite",
        startIn: "downloads"
      });
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("选择目录失败", err);
        ElMessage.warning("目录选择失败，将使用默认下载方式");
      }
    }
    if (dirHandle) {
      try {
        for (const record of downloadable) {
          await saveRecordToDirectory(dirHandle, record);
        }
        ElMessage.success("已保存到选定的文件夹");
        return;
      } catch (err) {
        console.error("写入选定目录失败", err);
        ElMessage.warning("写入目录失败，已回退到默认下载方式");
      }
    }
  }
  downloadable.forEach(downloadRecordViaLink);
  ElMessage.success("文件已加入浏览器下载队列");
};

const handleBatchDelete = async () => {
  if (!fileStore.files.length) {
    ElMessage.warning("当前没有模型文件可删除");
    return;
  }
  try {
    await ElMessageBox.confirm("确认清空所有模型文件？", "提示", {
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  try {
    await clearModelFiles(STORAGE_FOLDER);
    fileStore.setFiles([]);
    fileStore.setSelectedFile(null);
    ElMessage.success("已清空所有模型文件");
  } catch (err) {
    console.error("清空文件失败", err);
    ElMessage.error("清空文件失败");
  }
};

const handleBatchTagging = async ({ concurrency, viewKeys }) => {
  // 1. 从服务器获取当前页的raw文件列表
  // 使用 unref 解包可能为 Ref 的属性
  const currentPageVal = unref(fileListRef.value?.currentPage) || 1;
  const pageSizeVal = unref(fileListRef.value?.pageSize) || 10;
  const fileTypeVal = unref(fileListRef.value?.fileType) || 'raw';
  
  let response; // 将 response 提升到函数作用域
  let labeledFilesSet = new Set(); // 存储已打标文件名
  
  try {
    response = await getServerFileList(fileTypeVal, currentPageVal, pageSizeVal);
    const rawFiles = response.files || [];
    
    if (!rawFiles.length) {
      ElMessage.info("当前页没有未打标文件");
      return;
    }

    // 2. 从服务器获取labeled_files文件夹中的所有文件名（用于断点续传）
    console.log(`[批量打标] 检查 labeled_files 中已存在的文件...`);
    try {
      const labeledResponse = await getServerFileList('labeled', 1, 10000); // 获取大量文件
      labeledResponse.files.forEach(file => {
        labeledFilesSet.add(file.name);
      });
      console.log(`[批量打标] labeled_files 中已有 ${labeledFilesSet.size} 个文件`);
    } catch (labeledErr) {
      console.warn(`[批量打标] 获取 labeled_files 列表失败，将继续处理:`, labeledErr);
    }

    // 3. 在下载前过滤掉已打标的文件
    const filesToDownload = rawFiles.filter(file => {
      if (labeledFilesSet.has(file.name)) {
        console.log(`[批量打标] 跳过下载文件 ${file.name}: labeled_files中已存在`);
        return false;
      }
      return true;
    });

    const skippedBeforeDownload = rawFiles.length - filesToDownload.length;
    if (skippedBeforeDownload > 0) {
      console.log(`[批量打标] 跳过下载 ${skippedBeforeDownload} 个已打标文件`);
      ElMessage.info(`跳过 ${skippedBeforeDownload} 个已打标文件，仅下载 ${filesToDownload.length} 个文件`);
    }

    // 如果所有文件都已打标，直接跳转到下一页
    if (filesToDownload.length === 0) {
      const totalPages = Math.ceil(response.total / pageSizeVal);
      const hasNextPage = currentPageVal < totalPages;
      
      console.log(`[批量打标] 当前页所有文件都已打标，当前页: ${currentPageVal}/${totalPages}`);
      
      if (hasNextPage) {
        // 有下一页，自动跳转到下一页继续处理
        const remainingFiles = response.total - currentPageVal * pageSizeVal;
        ElMessage.info(`当前页已完成，自动跳转到第 ${currentPageVal + 1} 页继续处理剩余 ${remainingFiles} 个文件...`);
        console.log(`[批量打标] 自动跳转到第 ${currentPageVal + 1} 页`);
        
        // 更新文件列表组件的当前页码并刷新列表
        if (fileListRef.value) {
          fileListRef.value.currentPage = currentPageVal + 1;
          await fileListRef.value.loadFileList();
        }
        
        // 递归调用处理下一页
        await handleBatchTagging({ concurrency, viewKeys });
        return;
      } else {
        // 没有下一页了，所有文件都已打标完成
        ElMessage.success("🎉 所有文件都已打标完成！");
        console.log(`[批量打标] 所有文件都已打标完成`);
        return;
      }
    }

    // 4. 下载当前批次文件到IndexedDB（仅下载需要的文件）
    console.log(`[批量打标] 开始下载文件:`, filesToDownload.map(f => ({ id: f.id, name: f.name })));
    ElMessage.info(`正在加载 ${filesToDownload.length} 个文件到工作区...`);
    
    const downloadResults = await Promise.allSettled(
      filesToDownload.map(file => 
        downloadModelFromServer(file.id, {
          ...file,
          isTemporary: true,
          serverFileId: file.id,
          batchNumber: currentPageVal
        }).catch(err => {
          console.error(`[批量打标] 文件 ${file.name} 下载失败:`, err);
          throw err;
        })
      )
    );
    
    // 检查下载结果
    const failedDownloads = downloadResults.filter(r => r.status === 'rejected');
    if (failedDownloads.length > 0) {
      console.error(`[批量打标] ${failedDownloads.length} 个文件下载失败`);
      failedDownloads.forEach((result, idx) => {
        console.error(`[批量打标] 失败文件 ${idx + 1}:`, result.reason);
      });
    }
    console.log(`[批量打标] 下载完成，成功: ${downloadResults.filter(r => r.status === 'fulfilled').length}/${filesToDownload.length}`);
    
    // 5. 立即预加载下一页（如果存在）
    const currentBatchNumber = currentPageVal;
    if (response.total > currentPageVal * pageSizeVal) {
      preloadNextBatch(currentPageVal + 1, pageSizeVal);
    }

    // 6. 更新fileStore，使用IndexedDB中的文件
    console.log(`[批量打标] 从 IndexedDB 读取文件，批次号: ${currentPageVal}`);
    const workspaceFiles = await getAllFiles();
    console.log(`[批量打标] IndexedDB 中总文件数: ${workspaceFiles.length}`);
    console.log(`[批量打标] IndexedDB 文件列表:`, workspaceFiles.map(f => ({ 
      id: f.id, 
      name: f.name, 
      batchNumber: f.batchNumber,
      hasBlob: !!f.fileBlob 
    })));
    
    const batchFiles = workspaceFiles.filter(f => f.batchNumber === currentPageVal);
    console.log(`[批量打标] 当前批次文件数: ${batchFiles.length}`);
    console.log(`[批量打标] 批次文件:`, batchFiles.map(f => ({ id: f.id, name: f.name })));
    fileStore.setFiles(batchFiles);
    
  } catch (error) {
    ElMessage.error(`加载文件失败: ${error.message}`);
    return;
  }

  if (!fileStore.files.length) {
    ElMessage.warning("没有文件可处理");
    return;
  }

  // 二次过滤：检查本地标记（服务器端已在下载前过滤）
  const untaggedFiles = fileStore.files.filter(file => {
    // 如果本地已标记为已打标，跳过
    if (file.hasLabels || (file.labels && file.labels.length > 0)) {
      console.log(`[批量打标] 跳过文件 ${file.name}: 本地已标记为已打标`);
      return false;
    }
    
    return true;
  });

  const skippedCount = fileStore.files.length - untaggedFiles.length;
  if (skippedCount > 0) {
    console.log(`[批量打标] 跳过 ${skippedCount} 个本地已标记的文件`);
    ElMessage.info(`跳过 ${skippedCount} 个本地已标记的文件`);
  }

  if (!untaggedFiles.length) {
    // 当前页所有文件都已打标，检查是否还有下一页（理论上不会到这里，因为已在下载前判断）
    const totalPages = Math.ceil(response.total / pageSizeVal);
    const hasNextPage = currentPageVal < totalPages;
    
    console.log(`[批量打标] 当前页所有文件都已打标，当前页: ${currentPageVal}/${totalPages}`);
    
    if (hasNextPage) {
      // 有下一页，自动跳转到下一页继续处理
      const remainingFiles = response.total - currentPageVal * pageSizeVal;
      ElMessage.info(`当前页已完成，自动跳转到第 ${currentPageVal + 1} 页继续处理剩余 ${remainingFiles} 个文件...`);
      console.log(`[批量打标] 自动跳转到第 ${currentPageVal + 1} 页`);
      
      // 更新文件列表组件的当前页码并刷新列表
      if (fileListRef.value) {
        fileListRef.value.currentPage = currentPageVal + 1;
        await fileListRef.value.loadFileList();
      }
      
      
      // 递归调用处理下一页
      await handleBatchTagging({ concurrency, viewKeys });
      return;
    } else {
      // 没有下一页了，所有文件都已打标完成
      ElMessage.success("🎉 所有文件都已打标完成！");
      console.log(`[批量打标] 所有文件都已打标完成`);
      return;
    }
  }

  const config = editPanel.value?.getPanelConfig();
  const vlmConfig = config?.vlm;

  if (!vlmConfig?.apiConfig?.baseUrl || !vlmConfig?.apiConfig?.apiKey) {
    ElMessage.warning("请先配置右边api");
    return;
  }
  if (!vlmConfig?.promptList || vlmConfig.promptList.length === 0) {
    ElMessage.warning("请先在右侧配置提示词");
    return;
  }

  if (!viewKeys || viewKeys.length === 0) {
    ElMessage.warning("请选择至少一个截图视角");
    return;
  }

  // 初始化状态
  isBatchProcessing.value = true;
  processedCount.value = 0;
  totalCount.value = untaggedFiles.length;
  batchStartTime.value = Date.now();
  remainingTime.value = "计算中...";

  console.log(`[批量打标] ========== 开始批量打标 ==========`);
  console.log(`[批量打标] 文件数量: ${untaggedFiles.length}`);
  console.log(`[批量打标] 并发数: ${concurrency}`);
  console.log(`[批量打标] 截图视角: ${viewKeys.join(', ')}`);
  console.log(`[批量打标] API配置:`, {
    baseUrl: vlmConfig.apiConfig.baseUrl,
    modelName: vlmConfig.apiConfig.modelName || "qwen3-vl-235b-a22b-instruct"
  });
  console.log(`[批量打标] editPanel 存在:`, !!editPanel.value);
  console.log(`[批量打标] captureMaterialWithViews 存在:`, !!editPanel.value?.captureMaterialWithViews);
  console.log(`[批量打标] writeAutoTags 存在:`, !!editPanel.value?.writeAutoTags);

  ElMessage.success(`找到 ${untaggedFiles.length} 个未打标文件，开始处理...`);
  
  vlmClient.init({
    baseUrl: vlmConfig.apiConfig.baseUrl,
    apiKey: vlmConfig.apiConfig.apiKey,
    modelName: vlmConfig.apiConfig.modelName || "qwen3-vl-235b-a22b-instruct"
  });

  // 检查 OffscreenCanvas 支持并初始化渲染池
  let renderPool = null;
  const useOffscreenRendering = RenderPool.isSupported();
  
  if (useOffscreenRendering) {
    console.log('[批量打标] ✓ 支持 OffscreenCanvas，使用并行渲染模式');
    const poolSize = Math.min(concurrency, 10);
    renderPool = new RenderPool(poolSize);
    
    try {
      await renderPool.initialize();
      console.log(`[批量打标] 渲染池初始化成功，池大小: ${poolSize}`);
    } catch (error) {
      console.error('[批量打标] 渲染池初始化失败，降级到传统模式:', error);
      renderPool = null;
      ElMessage.warning('并行渲染初始化失败，将使用传统模式（速度较慢）');
    }
  } else {
    console.log('[批量打标] ✗ 不支持 OffscreenCanvas，使用传统串行模式');
    ElMessage.info('浏览器不支持高性能并行渲染，将使用传统模式');
  }

  const queue = [...untaggedFiles];
  const activeWorkers = Array(concurrency).fill(null);

  const processFile = async (file) => {
    console.log(`[批量打标] 开始处理文件: ${file.name}`);
    let offscreenRenderer = null;
    
    try {
      file.status = 'processing';
      
      let images = [];
      let materialNames = [];
      let targetMaterialNames = [];
      
      // 使用离屏渲染模式
      if (renderPool) {
        console.log(`[批量打标] 使用离屏渲染模式处理`);
        
        // 1. 获取渲染器
        console.log(`[批量打标] 等待获取离屏渲染器...`);
        offscreenRenderer = await renderPool.acquire();
        console.log(`[批量打标] 已获取离屏渲染器`);
        
        try {
          // 2. 加载模型
          console.log(`[批量打标] 开始加载模型...`);
          const fileData = await getModelFile(file.id);
          if (!fileData || !fileData.fileBlob) {
            throw new Error("无法获取文件数据");
          }
          
          await offscreenRenderer.loadModel(fileData.fileBlob, file.name);
          console.log(`[批量打标] 模型加载成功`);
          
          // 3. 获取材质列表并截图
          const materials = offscreenRenderer.getMaterialList();
          console.log(`[批量打标] 找到 ${materials.length} 个材质`);
          if (!materials.length) throw new Error("未找到材质");
          
          console.log(`[批量打标] 开始截图，视角: ${viewKeys.join(', ')}`);
          for (const mesh of materials) {
            console.log(`[批量打标] 正在为材质 ${mesh.name || mesh.uuid} 截图...`);
            const imgs = await offscreenRenderer.captureMultiAngleMaterial(mesh, viewKeys);
            
            if (imgs && imgs.length > 0) {
              console.log(`[批量打标] 材质 ${mesh.name || mesh.uuid} 截图成功，共 ${imgs.length} 张`);
              images.push(imgs);
              materialNames.push(mesh.name || mesh.uuid);
              targetMaterialNames.push(mesh.material?.name);
            } else {
              console.warn(`[批量打标] 材质 ${mesh.name || mesh.uuid} 截图为空`);
            }
          }
        } finally {
          // 注意：不在这里释放渲染器，要等到导出完成后
        }
        
      } else {
        // 降级：使用传统屏幕渲染模式（不实现场景锁，因为已移除）
        throw new Error("传统渲染模式已不支持，请使用支持 OffscreenCanvas 的浏览器");
      }
      
      console.log(`[批量打标] 截图完成，共 ${images.length} 组图片`);
      if (!images.length) throw new Error("截图失败");

      // 2. 发送 VLM 请求 (并行)
      const selectPrompt = () => {
        if (vlmConfig.promptList.length === 1) return vlmConfig.promptList[0].content;
        
        if (vlmConfig.selectionRule === 'random') {
          const randomIndex = Math.floor(Math.random() * vlmConfig.promptList.length);
          return vlmConfig.promptList[randomIndex].content;
        } else {
          const totalWeight = vlmConfig.promptList.reduce((sum, p) => sum + (p.weight || 1), 0);
          let random = Math.random() * totalWeight;
          
          for (const prompt of vlmConfig.promptList) {
            random -= (prompt.weight || 1);
            if (random <= 0) {
              return prompt.content;
            }
          }
          
          return vlmConfig.promptList[0].content;
        }
      };
      
      console.log(`[批量打标] 准备 VLM 请求，共 ${images.length} 个材质`);
      const requests = images.map(imgs => [selectPrompt(), imgs, {}]);
      
      console.log(`[批量打标] 开始调用 VLM API...`);
      const results = await vlmClient.generateBatch(requests, 4);
      console.log(`[批量打标] VLM API 调用完成，收到 ${results.length} 个结果`);
      
      const batchResults = results.map((res, idx) => ({
        ...res,
        materialName: materialNames[idx],
        targetMaterialName: targetMaterialNames[idx],
        label: res.text // 确保有 label 字段
      }));

      // 检查VLM生成结果的有效性
      const successCount = batchResults.filter(res => !res.error && res.text).length;
      const totalMatCount = batchResults.length;
      const failureCount = totalMatCount - successCount;
      
      console.log(`[批量打标] VLM结果统计: 成功 ${successCount}/${totalMatCount}, 失败 ${failureCount}`);
      
      if (successCount === 0) {
        console.warn(`[批量打标] ⚠️ 文件 ${file.name} 所有材质标签生成失败，跳过处理`);
        ElMessage.warning(`文件 ${file.name} 所有材质标签生成失败，已跳过`);
        
        await deleteModelFile(file.id);
        file.status = 'skipped';
        fileStore.addOrUpdateFile({ ...file, status: 'skipped' });
        return;
      }
      
      if (failureCount > 0) {
        console.warn(`[批量打标] ⚠️ 文件 ${file.name} 有 ${failureCount} 个材质标签生成失败，仍继续处理成功的 ${successCount} 个`);
        ElMessage.warning(`文件 ${file.name}: ${failureCount} 个材质失败，${successCount} 个成功`);
      }

      // 3. 写入标签并导出
      const isGlb = /\.(glb|gltf)$/i.test(file.name);
      console.log(`[批量打标] 文件类型: ${isGlb ? 'GLB/GLTF' : 'OBJ'}`);
      
      if (isGlb && offscreenRenderer) {
        // 使用离屏渲染器导出 GLB
        console.log(`[批量打标] 应用标签到离屏模型...`);
        offscreenRenderer.applySemanticLabels(batchResults);
        
        console.log(`[批量打标] 导出 GLB 文件...`);
        const modelBlob = await offscreenRenderer.exportToGlbBlob();
        console.log(`[批量打标] 导出完成，文件大小: ${modelBlob.size} bytes`);
        
        console.log(`[批量打标] 上传到服务器 labeled_files...`);
        await moveToLabeled(file.serverFileId || file.id, modelBlob, {
          name: file.name,
          hasLabels: true,
          size: modelBlob.size,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`[批量打标] 删除 IndexedDB 临时文件...`);
        await deleteModelFile(file.id);
        
      } else if (!isGlb) {
        // OBJ 文件处理（需要使用原有方法）
        throw new Error("OBJ 文件暂不支持离屏渲染模式");
      }

      console.log(`[批量打标] 文件 ${file.name} 处理完成`);
      file.status = 'done';
      fileStore.addOrUpdateFile({ ...file, status: 'done', hasLabels: true });
      
    } catch (error) {
      console.error(`[批量打标] ❌ 文件 ${file.name} 处理失败:`, error);
      if (error && error.stack) {
        console.error(`[批量打标] 错误堆栈:`, error.stack);
      }
      ElMessage.error(`文件 ${file.name} 处理失败: ${error?.message || error || '未知错误'}`);
      file.status = 'error';
      fileStore.addOrUpdateFile({ ...file, status: 'error' });
    } finally {
      // 释放渲染器
      if (offscreenRenderer && renderPool) {
        renderPool.release(offscreenRenderer);
        console.log(`[批量打标] 已释放离屏渲染器`);
      }
      
      processedCount.value++;
      updateProgress();
      console.log(`[批量打标] 进度: ${processedCount.value}/${totalCount.value}`);
    }
  };

  const updateProgress = () => {
    const now = Date.now();
    const elapsed = now - batchStartTime.value;
    const avgTime = elapsed / processedCount.value;
    const remaining = totalCount.value - processedCount.value;
    const remainingMs = avgTime * remaining;
    
    if (processedCount.value > 0) {
       const minutes = Math.floor(remainingMs / 60000);
       const seconds = Math.floor((remainingMs % 60000) / 1000);
       remainingTime.value = `${minutes}分${seconds}秒`;
    }
  };

  // 执行队列
  const runWorker = async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      if (file) await processFile(file);
    }
  };

  await Promise.all(activeWorkers.map(() => runWorker()));

  // 清理渲染池
  if (renderPool) {
    console.log('[批量打标] 清理渲染池...');
    await renderPool.cleanup();
    renderPool.printStatus();
    renderPool = null;
  }

  // 批次完成后，清理IndexedDB
  console.log(`[批量打标] 清理批次 ${currentPageVal} 的临时文件...`);
  await clearBatchFiles(currentPageVal);
  
  isBatchProcessing.value = false;
  ElMessage.success(`批次 ${currentPageVal} 打标完成`);
  
  // 批量打标完成后，切换到已打标视图
  if (fileListRef.value && fileListRef.value.switchToLabeled) {
    await fileListRef.value.switchToLabeled();
  }
  
  // 如果还有下一页，自动继续处理下一批次
  if (response && response.total > currentPageVal * pageSizeVal) {
    const remainingFiles = (response?.total || 0) - currentPageVal * pageSizeVal;
    ElMessage.info(`当前批次已完成，继续处理剩余 ${remainingFiles} 个文件...`);
    
    // 继续下一批次
    if (fileListRef.value) {
      fileListRef.value.currentPage++;
      await fileListRef.value.loadFileList();
    }
    
    // 递归调用，处理下一批次
    await handleBatchTagging({ concurrency, viewKeys });
  } else {
    ElMessage.success('所有文件打标完成！');
  }
  
  // 刷新文件列表状态（如果需要）
  await loadPersistedFiles();
};

// 预加载下一批次
const isPreloadingNextBatch = ref(false);
const preloadNextBatch = async (batchNumber, pageSize) => {
  if (isPreloadingNextBatch.value) return;
  
  isPreloadingNextBatch.value = true;
  
  try {
    const response = await getServerFileList('raw', batchNumber, pageSize);
    if (response.files && response.files.length > 0) {
      console.log(`开始预加载批次 ${batchNumber}，共 ${response.files.length} 个文件`);
      await Promise.all(
        response.files.map(file =>
          downloadModelFromServer(file.id, {
            ...file,
            isTemporary: true,
            serverFileId: file.id,
            batchNumber: batchNumber
          })
        )
      );
      console.log(`批次 ${batchNumber} 预加载完成`);
    }
  } catch (error) {
    console.error('预加载失败:', error);
  } finally {
    isPreloadingNextBatch.value = false;
  }
};

const loadPersistedFiles = async () => {
  try {
    const persistedFiles = await listFolderFiles(STORAGE_FOLDER);
    persistedFiles.forEach(file => {
      fileStore.addOrUpdateFile({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        labels: file.labels,
        status: "done",
        progress: 100,
        folder: file.folder,
        updatedAt: file.updatedAt
      });
    });
  } catch (err) {
    console.error("读取本地模型文件失败", err);
  }
};

// 重置相机位置
const onResetCamera = () => {
  store.modelApi.onResetModelCamera();
};
// 初始化模型库数据
const initModelBaseData = () => {
  const modelBase = $local.get(MODEL_BASE_DATA);
  // 如果是首次加载需要设置模型库初始数据值
  if (!Array.isArray(modelBase)) {
    let modelBaseData = [];
    modelList.forEach(v => {
      modelBaseData.push({
        ...MODEL_DEFAULT_CONFIG,
        fileInfo: { ...v }
      });
    });

    $local.set(MODEL_BASE_DATA, modelBaseData);
  }
};

// 处理拖拽结束事件
const onDragDrop = async e => {
  const { dragGeometryModel, activeDragManyModel, dragTag } = store.modelApi;
  const { clientX, clientY } = e;

  // 更新拖拽位置
  const updateDragPosition = model => {
    model.clientX = clientX;
    model.clientY = clientY;
  };

  // 处理几何体模型
  if (dragGeometryModel.id && store.modelType === "geometry") {
    updateDragPosition(dragGeometryModel);
    store.modelApi.onSwitchModel(dragGeometryModel);
    $bus.emit("update-tab", "EditGeometry");
  }

  // 处理3D标签
  if (dragTag?.id && store.modelType === "tags") {
    updateDragPosition(dragTag);
    store.modelApi.create3dTags(dragTag);
  }

  // 处理多模型
  if (store.modelType === "manyModel") {
    updateDragPosition(activeDragManyModel);

    try {
      $bus.emit(PAGE_LOADING, true);
      const { load } = await store.modelApi.onLoadManyModel(activeDragManyModel);

      if (load) {
        $bus.emit(UPDATE_MODEL);
        $bus.emit("update-tab", "EditMoreModel");
      }
    } catch (error) {
      console.error("加载多模型失败:", error);
    } finally {
      $bus.emit(PAGE_LOADING, false);
    }
  }

  // 处理着色器
  if (store.modelType === "shader") {
    store.modelApi.shaderModules.createShader({ clientX, clientY });
  }
};
// 预览
const onPreview = () => {
  const modelConfig = editPanel.value.getPanelConfig();
  modelConfig.camera = store.modelApi.onGetModelCamera();
  modelConfig.fileInfo = choosePanel.value?.activeModel;
  //判断是否是外部模型
  if (modelConfig.fileInfo.filePath) {
    $local.set(MODEL_PREVIEW_CONFIG, modelConfig);
    const { href } = router.resolve({ path: "/preview" });
    window.open(href, "_blank");
  } else {
    ElMessage.warning("当前模型暂不支持“效果预览”");
  }
};

const onImportantCode = () => {
  const modelConfig = editPanel.value.getPanelConfig();
  modelConfig.camera = store.modelApi.onGetModelCamera();
  modelConfig.fileInfo = choosePanel.value?.activeModel;
  implantDialog.value.showDialog(modelConfig);
};

// 全屏
const onFullScreen = () => {
  const element = document.documentElement;
  if (!fullscreenStatus.value) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
      // 适用于旧版WebKit浏览器
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
};

// 保存配置
const onSaveConfig = () => {
  ElMessageBox.confirm(" 确认要更新当前模型数据至“模板库”?", "提示", {
    confirmButtonText: "确认",
    cancelButtonText: "取消",
    type: "success"
  })
    .then(() => {
      const modelConfig = editPanel.value.getPanelConfig();
      modelConfig.camera = store.modelApi.onGetModelCamera();
      modelConfig.fileInfo = choosePanel.value?.activeModel;
      // 判断是否是外部模型
      if (modelConfig.fileInfo.filePath) {
        const modelBaseData = $local.get(MODEL_BASE_DATA) || [];
        const { id } = modelConfig.fileInfo;
        // 更新缓存数据
        Object.assign(modelBaseData.filter(v => id === v.fileInfo.id)[0], modelConfig);
        $local.set(MODEL_BASE_DATA, modelBaseData);
        ElMessage.success("更新成功");
      } else {
        ElMessage.warning("当前模型暂不支持“数据保存”");
      }
    })
    .catch(() => {});
};

// 下载封面
const onDownloadCover = () => {
  store.modelApi.onDownloadSceneCover();
};
// 导出模型
const onExportModelFile = type => {
  store.modelApi.onExporterModel(type);
};

// 全屏监听事件
const addEventListenerFullscreen = e => {
  const status = document.fullscreenElement || document.webkitFullscreenElement;
  fullscreenStatus.value = !!status;
};

onMounted(async () => {
  loading.value = true;
  const modelApi = new renderModel("#model");
  store.setModelApi(modelApi);

  $bus.on(PAGE_LOADING, value => {
    clearTimeout(loadingTimeout.value);
    if (value) {
      loading.value = value;
    } else {
      loadingTimeout.value = setTimeout(() => {
        loading.value = value;
        progress.value = 0;
      }, 500);
    }
  });
  // 模型加载进度条
  store.modelApi.onProgress((progressNum, totalSize) => {
    progress.value = Number(((progressNum / totalSize) * 100).toFixed(0));
  });

  const load = await modelApi.init();

  if (load) {
    loading.value = false;
    progress.value = 0;
  }
  // 初始化模型库数据
  initModelBaseData();
  await loadPersistedFiles();
  // 全屏监听事件
  document.addEventListener("fullscreenchange", addEventListenerFullscreen);
});
onBeforeUnmount(() => {
  store.modelApi.onClearModelData();
  document.removeEventListener("fullscreenchange", addEventListenerFullscreen);
  clearTimeout(loadingTimeout.value);
});
</script>

<style lang="scss" scoped>
.model-page {
  width: 100%;
  background-color: #1b1c23;
  .model-header {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 35px;
    padding: 0 10px;
    font-weight: 500;
    color: #ffffff;
    text-align: center;
    text-shadow: 5px 3px 5px #c11212;
    background-color: #010c1d;
    box-shadow: 0 2px 8px 0 rgb(0 0 0 / 10%);
    .header-lf {
      font-size: 14px;
    }
  }
  .model-container {
    display: flex;
    min-height: calc(100vh - 35px);
    .left-panel {
      width: 360px;
      min-width: 360px;
      display: flex;
      flex-direction: column;
      background-color: #1b1c23;
      border-right: 1px solid #000;
    }
    .left-panel-tabs {
      display: flex;
      height: 40px;
      background-color: #151a25;
      border-bottom: 1px solid #1e2230;
    }
    .tab-item {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #8c94a7;
      font-size: 14px;
      transition: all 0.3s;
      background-color: #010c1d;
    }
    .tab-item:hover {
      background-color: #1b1c23;
    }
    .tab-item.active {
      color: #fff;
      background-color: #1b1c23;
      border-top: 2px solid #18c174;
    }
    .left-panel-content {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .panel-content {
      height: 100%;
    }
    #model {
      flex: 1;
      position: relative;
      height: calc(100vh - 35px);
      .camera-icon {
        position: absolute;
        top: 10px;
        left: calc(100% - 50%);
        cursor: pointer;
      }
      .semantic-label-panel {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 200px;
        padding: 10px 12px;
        background-color: rgba(17, 19, 28, 0.9);
        border: 1px solid #2a2b34;
        border-radius: 6px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
        z-index: 12;
        font-size: 12px;
        color: #fff;
      }
      .semantic-label-title {
        font-size: 11px;
        color: #8fa3ff;
        margin-bottom: 4px;
      }
      .semantic-label-value {
        font-size: 13px;
        line-height: 1.5;
        min-height: 32px;
        word-break: break-word;
      }
    }
  }
}
</style>

<style lang="scss">
.edit-box {
  height: calc(100vh - 90px);
}
.edit-box,
.model-choose {
  .header {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 35px;
    padding: 0 20px;
    color: #cccccc;
    background-color: #33343f;
    border-top: 1px solid #1b1c23;
    border-bottom: 1px solid #1b1c23;
  }
  .disabled {
    pointer-events: none;
    opacity: 0.3;
  }
  .options {
    box-sizing: border-box;
    max-width: 380px;
    background-color: #1b1c23;
    .option-active {
      background-color: #27282f;
    }
    .space-between {
      justify-content: space-between;
    }
    .option {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      height: 33px;
      padding: 0 18px;
      font-size: 14px;
      color: #cccccc;
      cursor: pointer;
      .icon-name {
        display: flex;
        align-items: center;
      }
    }
  }
}
.el-input-number {
  width: 90px !important;
}
</style>
