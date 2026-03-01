<template>
  <div class="model-page">
    <!-- 头部操作栏 -->
    <header class="model-header">
      <div class="header-lf">
        <span> 3d模型语义标签生成系统 </span>
        <!-- <span>当前Three.js版本:{{ THREE.REVISION }}</span> -->
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
          <div class="semantic-label-header">
            <div class="semantic-label-title">语义标签</div>
            <el-icon class="edit-icon" @click="handleEditSemanticLabel" title="编辑语义标签">
              <Edit />
            </el-icon>
          </div>
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
    <!-- 语义标签编辑弹窗 -->
    <semantic-label-edit-dialog ref="semanticLabelEditDialog"></semantic-label-edit-dialog>
  </div>
</template>

<script setup name="modelEdit">
import { ModelEditPanel, ModelChoose, ImplantCodeDialog, FileList } from "@/components/index";
import SemanticLabelEditDialog from "@/components/SemanticLabelEditDialog/index.vue";
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
import {
  getServerFileList,
  downloadModelFromServer,
  moveToLabeled,
  clearBatchFiles,
  deleteServerFile,
  saveLabeledFolder,
  saveModelLabels,
  triggerSegmentation,
  getSegmentFaceLabels,
  getSegmentStatus,
  updateMetadata
} from "@/utils/serverApi";
import * as THREE from "three";

import MultiImageVLM from "@/utils/vlmService";
import RenderPool from "@/utils/RenderPool";
import OffscreenRenderModel from "@/utils/OffscreenRenderModel";

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
const semanticLabelEditDialog = ref(null);
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

const handleBatchTagging = async ({ concurrency, gpuConcurrency, viewKeys, numClusters = 0, method = 'agglomerative', useMaterialCountAsK = false }, sessionProcessedIds = new Set(), recursionDepth = 0) => {
  const MAX_RECURSION_DEPTH = 5; // 防止因服务端状态未及时更新导致的无限递归
  // 1. 从服务器获取当前页的raw文件列表
  // 使用 unref 解包可能为 Ref 的属性
  const currentPageVal = unref(fileListRef.value?.currentPage) || 1;
  const pageSizeVal = unref(fileListRef.value?.pageSize) || 10;
  // 处理已分割（segmented）或未分割（raw）的文件
  const fileTypeVal = 'segmented';
  
  let response; // 将 response 提升到函数作用域
  let labeledFilesSet = new Set(); // 存储已打标文件 ID（用于断点续传）
  
  try {
    // 优先获取已分割的文件；若为空则降级获取 raw 文件
    response = await getServerFileList(fileTypeVal, currentPageVal, pageSizeVal);
    let rawFiles = response.files || [];
    if (!rawFiles.length) {
      const rawResponse = await getServerFileList('raw', currentPageVal, pageSizeVal);
      rawFiles = rawResponse.files || [];
    }
    
    if (!rawFiles.length) {
      ElMessage.info("当前页没有可打标的文件（请先上传并分割）");
      return;
    }

    // 2. 获取已打标文件 ID 集合（用于断点续传）
    console.log(`[批量打标] 检查已存在的已打标文件...`);
    try {
      const labeledResponse = await getServerFileList('labeled', 1, 10000);
      labeledResponse.files.forEach(file => {
        labeledFilesSet.add(file.id);
        labeledFilesSet.add(file.name); // 兼容旧数据
      });
      console.log(`[批量打标] 已打标文件共 ${labeledFilesSet.size} 个`);
    } catch (labeledErr) {
      console.warn(`[批量打标] 获取已打标列表失败，将继续处理:`, labeledErr);
    }

    // 3. 在下载前过滤掉已打标的文件（含本会话已处理的，防止递归死循环）
    const filesToDownload = rawFiles.filter(file => {
      if (sessionProcessedIds.has(file.id) || sessionProcessedIds.has(file.name)) {
        console.log(`[批量打标] 跳过下载文件 ${file.name}: 本会话已处理`);
        return false;
      }
      if (labeledFilesSet.has(file.id) || labeledFilesSet.has(file.name)) {
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

    // 如果所有文件都已打标，重新查询是否还有剩余未处理文件
    if (filesToDownload.length === 0) {
      // 处理后文件已离开 segmented 列表，必须重新从第 1 页查询剩余文件
      const nextSegResp = await getServerFileList('segmented', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }));
      const nextRawResp = nextSegResp.total === 0
        ? await getServerFileList('raw', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }))
        : { total: 0, files: [] };
      const totalRemaining = nextSegResp.total + nextRawResp.total;

      console.log(`[批量打标] 当前页所有文件都已打标，剩余未处理: ${totalRemaining}`);

      if (totalRemaining > 0 && recursionDepth < MAX_RECURSION_DEPTH) {
        ElMessage.info(`当前页已完成，继续处理剩余 ${totalRemaining} 个文件...`);
        if (fileListRef.value) {
          fileListRef.value.fileType = nextSegResp.total > 0 ? 'segmented' : 'raw';
          fileListRef.value.currentPage = 1;
          await fileListRef.value.loadFileList();
        }
        await handleBatchTagging({ concurrency, gpuConcurrency, viewKeys, numClusters, method, useMaterialCountAsK }, sessionProcessedIds, recursionDepth + 1);
        return;
      } else if (recursionDepth >= MAX_RECURSION_DEPTH && totalRemaining > 0) {
        console.warn(`[批量打标] 已达最大递归深度 ${MAX_RECURSION_DEPTH}，停止继续处理，剩余 ${totalRemaining} 个文件可能需刷新后重试`);
        ElMessage.warning('批次处理已暂停，请刷新页面后查看剩余文件');
        return;
      } else {
        ElMessage.success("🎉 所有文件都已打标完成！");
        console.log(`[批量打标] 所有文件都已打标完成`);
        if (fileListRef.value && fileListRef.value.switchToLabeled) {
          await fileListRef.value.switchToLabeled();
        }
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
    
    // 5. 后台触发下一批 raw 文件的预分割（流水线：不阻塞当前打标）
    // useMaterialCountAsK 时无法预知各模型材质数，跳过预分割；处理时按模型动态触发
    if (!useMaterialCountAsK) {
      preSegmentNextBatch(1, pageSizeVal, numClusters, method);
    }

    // 6. 更新fileStore，使用IndexedDB中的文件
    // 重要：只处理本批次刚下载的文件，避免 IndexedDB 中其他 batchNumber 相同的旧文件被重复处理
    const downloadedIds = new Set(filesToDownload.map(f => f.id));
    console.log(`[批量打标] 从 IndexedDB 读取文件，批次号: ${currentPageVal}，本批次下载的 ID: ${[...downloadedIds].join(', ')}`);
    const workspaceFiles = await getAllFiles();
    console.log(`[批量打标] IndexedDB 中总文件数: ${workspaceFiles.length}`);
    
    const batchFiles = workspaceFiles.filter(f => downloadedIds.has(f.id));
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
    // 兜底检查：重新从第 1 页查询剩余未处理文件
    const nextSegResp = await getServerFileList('segmented', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }));
    const nextRawResp = nextSegResp.total === 0
      ? await getServerFileList('raw', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }))
      : { total: 0, files: [] };
    const totalRemaining = nextSegResp.total + nextRawResp.total;

    console.log(`[批量打标] 当前页所有文件都已打标，剩余未处理: ${totalRemaining}`);

    if (totalRemaining > 0 && recursionDepth < MAX_RECURSION_DEPTH) {
      ElMessage.info(`当前页已完成，继续处理剩余 ${totalRemaining} 个文件...`);
      if (fileListRef.value) {
        fileListRef.value.fileType = nextSegResp.total > 0 ? 'segmented' : 'raw';
        fileListRef.value.currentPage = 1;
        await fileListRef.value.loadFileList();
      }
      await handleBatchTagging({ concurrency, gpuConcurrency, viewKeys, numClusters, method, useMaterialCountAsK }, sessionProcessedIds, recursionDepth + 1);
      return;
    } else if (recursionDepth >= MAX_RECURSION_DEPTH && totalRemaining > 0) {
      console.warn(`[批量打标] 已达最大递归深度 ${MAX_RECURSION_DEPTH}，停止`);
      ElMessage.warning('批次处理已暂停，请刷新页面后查看剩余文件');
      return;
    } else {
      ElMessage.success("🎉 所有文件都已打标完成！");
      console.log(`[批量打标] 所有文件都已打标完成`);
      if (fileListRef.value && fileListRef.value.switchToLabeled) {
        await fileListRef.value.switchToLabeled();
      }
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

  // 设置 GPU 并发数（全局配置）
  const actualGpuConcurrency = gpuConcurrency || 3; // 如果没有传入，默认为 3
  OffscreenRenderModel.setGpuConcurrency(actualGpuConcurrency);
  console.log(`[批量打标] GPU 并发数已设置为: ${actualGpuConcurrency}`);
  
  // 检查 OffscreenCanvas 支持并初始化渲染池
  let renderPool = null;
  const useOffscreenRendering = RenderPool.isSupported();
  
  if (useOffscreenRendering) {
    console.log('[批量打标] ✓ 支持 OffscreenCanvas，使用并行渲染模式');
    // 让池大小等于并发数，最大支持100个（避免过度消耗系统资源）
    const poolSize = Math.min(concurrency, 100);
    console.log(`[批量打标] 创建渲染池，并发数: ${concurrency}, 实际池大小: ${poolSize}`);
    renderPool = new RenderPool(poolSize);
    
    try {
      await renderPool.initialize();
      console.log(`[批量打标] 渲染池初始化成功，池大小: ${poolSize}`);
      renderPool.printStatus(); // 打印初始状态
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
    const fileStartTime = Date.now();
    console.log(`[批量打标] 开始处理文件: ${file.name}`);
    let offscreenRenderer = null;
    let acquireStartTime = 0;
    
    try {
      file.status = 'processing';
      
      let images = [];
      let segmentIds = []; // 记录每组截图对应的 segId（替代原 materialNames）
      
      // 使用离屏渲染模式
      if (renderPool) {
        console.log(`[批量打标] 使用离屏渲染模式处理`);
        
        // 1. 获取渲染器（增加超时时间和日志）
        console.log(`[批量打标] 等待获取离屏渲染器...`);
        acquireStartTime = Date.now();
        renderPool.printStatus(); // 打印当前池状态
        
        // 增加超时时间到5分钟
        offscreenRenderer = await renderPool.acquire(300000);
        const acquireTime = Date.now() - acquireStartTime;
        console.log(`[批量打标] 已获取离屏渲染器 (等待时间: ${acquireTime}ms)`);
        
        try {
          // 2. 加载模型
          console.log(`[批量打标] 开始加载模型...`);
          const loadStartTime = Date.now();
          
          const fileData = await getModelFile(file.id);
          if (!fileData || !fileData.fileBlob) {
            throw new Error("无法获取文件数据");
          }
          
          // 添加模型加载超时控制（3分钟）
          const loadTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('模型加载超时（3分钟）')), 180000)
          );
          
          await Promise.race([
            offscreenRenderer.loadModel(fileData.fileBlob, file.name),
            loadTimeout
          ]);
          
          const loadTime = Date.now() - loadStartTime;
          console.log(`[批量打标] 模型加载成功 (耗时: ${loadTime}ms)`);
          
          // 3. 确保模型已分割（若未分割则自动触发并等待完成）
          const serverFileId = file.serverFileId || file.id;
          let effectiveNumClusters = numClusters;
          if (useMaterialCountAsK) {
            const materials = offscreenRenderer.getMaterialList?.() || [];
            effectiveNumClusters = Math.max(2, materials.length);
            console.log(`[批量打标] 自动（贴图数量）：${file.name} 材质数=${materials.length}，K=${effectiveNumClusters}`);
          }
          console.log(`[批量打标] 确保分割完成，serverFileId: ${serverFileId}`);
          await waitForSegmentation(serverFileId, effectiveNumClusters, method);

          // 4. 获取分割掩码
          console.log(`[批量打标] 获取分割掩码`);
          const faceLabels = await getSegmentFaceLabels(serverFileId);
          if (!faceLabels || !faceLabels.length) {
            throw new Error("未找到分割掩码，请先完成模型分割");
          }
          console.log(`[批量打标] 分割掩码已加载，面数: ${faceLabels.length}`);

          // 应用分割掩码到离屏渲染器（写入顶点色）
          offscreenRenderer.applyFaceSegmentation(faceLabels);

          // 获取所有唯一 segId 并逐个截图
          const uniqueSegIds = [...new Set(faceLabels)].sort((a, b) => a - b);
          console.log(`[批量打标] 分割块数: ${uniqueSegIds.length}，开始截图，视角: ${viewKeys.join(', ')}`);

          for (const segId of uniqueSegIds) {
            console.log(`[批量打标] 正在为分割块 segId=${segId} 截图...`);
            const imgs = await offscreenRenderer.captureSegmentWithViews(segId, viewKeys);
            
            if (imgs && imgs.length > 0) {
              console.log(`[批量打标] 分割块 segId=${segId} 截图成功，共 ${imgs.length} 张`);
              images.push(imgs);
              segmentIds.push(segId);
            } else {
              console.warn(`[批量打标] 分割块 segId=${segId} 截图为空`);
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
      
      console.log(`[批量打标] 准备 VLM 请求，共 ${images.length} 个分割块`);
      const requests = images.map(imgs => [selectPrompt(), imgs, {}]);
      
      console.log(`[批量打标] 开始调用 VLM API...`);
      const vlmStartTime = Date.now();
      
      // 添加VLM调用超时控制（5分钟）
      const vlmTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('VLM API 调用超时（5分钟）')), 300000)
      );
      
      const results = await Promise.race([
        vlmClient.generateBatch(requests, 4),
        vlmTimeout
      ]);
      
      const vlmTime = Date.now() - vlmStartTime;
      console.log(`[批量打标] VLM API 调用完成，收到 ${results.length} 个结果 (耗时: ${vlmTime}ms)`);
      
      const batchResults = results.map((res, idx) => ({
        ...res,
        segId: segmentIds[idx],
        label: res.text // 确保有 label 字段
      }));

      // 检查VLM生成结果的有效性
      const successCount = batchResults.filter(res => !res.error && res.text).length;
      const totalMatCount = batchResults.length;
      const failureCount = totalMatCount - successCount;
      
      console.log(`[批量打标] VLM结果统计: 成功 ${successCount}/${totalMatCount}, 失败 ${failureCount}`);
      
      if (successCount === 0) {
        console.warn(`[批量打标] ⚠️ 文件 ${file.name} 所有分割块标签生成失败，跳过处理`);
        ElMessage.warning(`文件 ${file.name} 所有分割块标签生成失败，已跳过`);
        
        await deleteModelFile(file.id);
        file.status = 'skipped';
        fileStore.addOrUpdateFile({ ...file, status: 'skipped' });
        return;
      }
      
      if (failureCount > 0) {
        console.warn(`[批量打标] ⚠️ 文件 ${file.name} 有 ${failureCount} 个分割块标签生成失败，仍继续处理成功的 ${successCount} 个`);
        ElMessage.warning(`文件 ${file.name}: ${failureCount} 个分割块失败，${successCount} 个成功`);
      }

      // 3. 渲染整体模型多视角图（新格式）
      console.log(`[批量打标] 开始渲染整体模型视角...`);
      let overallImages = [];
      if (offscreenRenderer) {
        overallImages = await offscreenRenderer.captureOverallModelViews(viewKeys);
        console.log(`[批量打标] 整体模型视角渲染完成，共 ${overallImages.length} 张`);
      }
      
      // 4. 生成整体标签（使用overallPrompt）
      console.log(`[批量打标] 开始生成整体标签...`);
      let overallLabel = '';
      try {
        // 从服务器加载提示词库
        const promptsResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/prompts-library`);
        if (promptsResponse.ok) {
          const promptsResult = await promptsResponse.json();
          if (promptsResult.success && promptsResult.data?.overallPrompt) {
            const overallPrompt = promptsResult.data.overallPrompt.content;
            console.log(`[批量打标] 使用整体提示词，长度: ${overallPrompt.length} 字符`);
            
            const overallResult = await vlmClient.generateOverallLabel(overallPrompt, overallImages, {});
            if (overallResult.success) {
              overallLabel = overallResult.label;
              console.log(`[批量打标] 整体标签生成成功，长度: ${overallLabel.length} 字符`);
            } else {
              console.warn(`[批量打标] 整体标签生成失败: ${overallResult.error}`);
            }
          } else {
            console.warn(`[批量打标] 提示词库中未找到整体提示词`);
          }
        }
      } catch (err) {
        console.error(`[批量打标] 生成整体标签异常:`, err);
      }
      
      // 5. 构建 info.json 数据结构
      const isGlb = /\.(glb|gltf)$/i.test(file.name);
      console.log(`[批量打标] 文件类型: ${isGlb ? 'GLB/GLTF' : 'OBJ'}`);
      
      if (isGlb && offscreenRenderer) {
        console.log(`[批量打标] 构建 info.json 数据...`);
        
        // 获取原始文件数据
        const fileData = await getModelFile(file.id);
        const originalBlob = fileData.fileBlob;
        
        const validResults = batchResults.filter(res => !res.error && res.text);
        const infoData = {
          modelName: file.name,
          fileSize: originalBlob.size,
          createdAt: new Date().toISOString(),
          overallLabel: overallLabel || '未生成整体标签',
          // segments 按 segId 索引（来自分割掩码）
          segments: validResults.map(res => ({
            id: res.segId,
            name: `segment_${res.segId}`,
            label: res.text || '',
            color: '#888888'
          })),
          metadata: {
            hasLabels: true,
            updatedAt: new Date().toISOString(),
            viewKeys: viewKeys,
            segmentCount: validResults.length,
            sourceMask: true // 标记为掩码来源
          }
        };
        
        console.log(`[批量打标] info.json 构建完成，分割块数: ${infoData.segments.length}`);
        
        // 6. 准备图片数据
        console.log(`[批量打标] 准备图片数据...`);
        const imageData = {
          overall: overallImages.map((dataURL, idx) => ({
            viewKey: viewKeys[idx] || `view_${idx}`,
            dataURL
          })),
          segments: []
        };
        
        // 添加分割块多视角图（键名：image_segments_{segId}_{viewKey}）
        for (let i = 0; i < images.length; i++) {
          const segId = segmentIds[i];
          const segImages = images[i];
          
          for (let j = 0; j < segImages.length; j++) {
            imageData.segments.push({
              segId: segId,
              viewKey: viewKeys[j] || `view_${j}`,
              dataURL: segImages[j]
            });
          }
        }
        
        console.log(`[批量打标] 图片数据准备完成，整体: ${imageData.overall.length} 张，分割块: ${imageData.segments.length} 张`);
        
        // 7. 上传文件夹数据到服务器（必须使用 serverFileId 确保写入正确的模型目录）
        const serverModelId = file.serverFileId || file.id;
        console.log(`[批量打标] 开始上传文件夹结构到服务器 (modelId: ${serverModelId})...`);
        await saveLabeledFolder(`${serverModelId}.glb`, originalBlob, infoData, imageData);
        console.log(`[批量打标] 文件夹结构上传成功`);
        sessionProcessedIds.add(file.id);
        sessionProcessedIds.add(file.name);
        
        // 8. 删除 IndexedDB 临时文件
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
      const fileProcessTime = Date.now() - fileStartTime;
      console.error(`[批量打标] ❌ 文件 ${file.name} 处理失败 (已耗时: ${fileProcessTime}ms):`, error);
      if (error && error.stack) {
        console.error(`[批量打标] 错误堆栈:`, error.stack);
      }
      
      // 特别标记超时错误
      if (error?.message?.includes('timeout') || error?.message?.includes('超时')) {
        console.error(`[批量打标] ⚠️ 超时错误，可能需要增加超时时间或优化处理流程`);
      }
      
      // 检查是否是 GPU 错误，显示友好提示
      if (error?.isGpuError || error?.message?.includes('convertToBlob') || error?.message?.includes('GPU')) {
        const currentGpuMax = OffscreenRenderModel.getGpuConcurrency();
        ElMessage.error({
          message: `❌ GPU 截图失败！\n\n💡 建议操作：\n1. 降低 GPU 并发数（当前: ${currentGpuMax}，建议: ${Math.max(1, Math.floor(currentGpuMax / 2))}）\n2. 降低最大并行数\n3. 关闭其他占用 GPU 的程序\n\n详细信息: ${error?.message || '未知错误'}`,
          duration: 8000,
          showClose: true,
          dangerouslyUseHTMLString: true
        });
      } else {
        ElMessage.error(`文件 ${file.name} 处理失败: ${error?.message || error || '未知错误'}`);
      }
      
      file.status = 'error';
      fileStore.addOrUpdateFile({ ...file, status: 'error' });
    } finally {
      const fileProcessTime = Date.now() - fileStartTime;
      
      // 释放渲染器
      if (offscreenRenderer && renderPool) {
        console.log(`[批量打标] 准备释放离屏渲染器...`);
        renderPool.release(offscreenRenderer);
        console.log(`[批量打标] ✓ 已释放离屏渲染器`);
        renderPool.printStatus(); // 打印释放后的池状态
      } else if (renderPool) {
        console.warn(`[批量打标] ⚠️ 渲染器未被获取，跳过释放`);
      }
      
      processedCount.value++;
      updateProgress();
      console.log(`[批量打标] 进度: ${processedCount.value}/${totalCount.value}, 文件 ${file.name} 总耗时: ${fileProcessTime}ms`);
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

  // 批处理完成，打印统计信息
  const batchEndTime = Date.now();
  const totalTime = batchEndTime - batchStartTime.value;
  const avgTimePerFile = totalTime / processedCount.value;
  
  console.log('[批量打标] ========== 批次处理完成 ==========');
  console.log(`[批量打标] 总文件数: ${totalCount.value}`);
  console.log(`[批量打标] 已处理: ${processedCount.value}`);
  console.log(`[批量打标] 总耗时: ${Math.round(totalTime / 1000)}秒`);
  console.log(`[批量打标] 平均每文件: ${Math.round(avgTimePerFile / 1000)}秒`);

  // 清理渲染池
  if (renderPool) {
    console.log('[批量打标] 最终渲染池状态:');
    renderPool.printStatus();
    
    console.log('[批量打标] 开始清理渲染池...');
    await renderPool.cleanup();
    console.log('[批量打标] 渲染池清理完成');
    renderPool = null;
  }

  // 批次完成后，清理IndexedDB
  console.log(`[批量打标] 清理批次 ${currentPageVal} 的临时文件...`);
  await clearBatchFiles(currentPageVal);
  
  isBatchProcessing.value = false;
  ElMessage.success(`批次 ${currentPageVal} 打标完成`);

  // 处理后文件已离开 segmented 列表，必须重新从第 1 页查询剩余未处理文件
  const nextSegResp = await getServerFileList('segmented', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }));
  const nextRawResp = nextSegResp.total === 0
    ? await getServerFileList('raw', 1, pageSizeVal).catch(() => ({ total: 0, files: [] }))
    : { total: 0, files: [] };
  const totalRemaining = nextSegResp.total + nextRawResp.total;

  if (totalRemaining > 0) {
    ElMessage.info(`当前批次已完成，继续处理剩余 ${totalRemaining} 个文件...`);
    if (fileListRef.value) {
      fileListRef.value.fileType = nextSegResp.total > 0 ? 'segmented' : 'raw';
      fileListRef.value.currentPage = 1;
      await fileListRef.value.loadFileList();
    }
    // 本批次已处理完成，重置递归深度（避免误触发深度限制）
    await handleBatchTagging({ concurrency, gpuConcurrency, viewKeys, numClusters, method, useMaterialCountAsK }, sessionProcessedIds, 0);
  } else {
    ElMessage.success('🎉 所有文件打标完成！');
    if (fileListRef.value && fileListRef.value.switchToLabeled) {
      await fileListRef.value.switchToLabeled();
    }
  }

  await loadPersistedFiles();
};

// 预分割下一批次（流水线：打标当前页时，后台触发下一页的服务端分割）
/**
 * 确保模型已完成分割。若尚未分割则自动触发，然后轮询直到完成。
 * @param {string} modelId
 * @param {number} numClusters
 * @param {string} method
 * @param {number} timeoutMs  最长等待时间（默认 10 分钟）
 * @returns {Promise<void>}  resolve 表示分割完成，reject 表示超时或分割失败
 */
const waitForSegmentation = async (modelId, numClusters = 10, method = 'agglomerative', timeoutMs = 600000) => {
  const POLL_INTERVAL = 5000;
  const deadline = Date.now() + timeoutMs;

  // 先查询当前状态
  let statusData;
  try {
    statusData = await getSegmentStatus(modelId);
  } catch (err) {
    throw new Error(`获取分割状态失败: ${err.message}`);
  }

  // 如果已有分割结果，直接返回
  if (statusData.hasSegments || statusData.status === 'segmented') {
    console.log(`[分割等待] ${modelId} 已有分割数据，跳过`);
    return;
  }

  // 若未在进行中，则触发分割
  if (statusData.status !== 'segmenting') {
    console.log(`[分割等待] ${modelId} 状态为 "${statusData.status}"，触发分割...`);
    try {
      await triggerSegmentation(modelId, numClusters, method);
    } catch (err) {
      // 409 = 已在进行中，视为正常
      if (err?.response?.status !== 409) {
        throw new Error(`触发分割失败: ${err.message}`);
      }
    }
  } else {
    console.log(`[分割等待] ${modelId} 已在分割中，等待完成...`);
  }

  // 轮询直到完成或超时
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    try {
      const s = await getSegmentStatus(modelId);
      console.log(`[分割等待] ${modelId} 状态: ${s.status}, hasSegments: ${s.hasSegments}`);
      if (s.hasSegments || s.status === 'segmented') return;
    } catch (pollErr) {
      if (pollErr.message?.includes('分割失败')) throw pollErr;
      console.warn(`[分割等待] 轮询状态失败，继续重试:`, pollErr.message);
    }
  }
  throw new Error(`模型 ${modelId} 分割超时（${timeoutMs / 60000} 分钟）`);
};

const preSegmentNextBatch = async (batchNumber, pageSize, numClusters = 10, method = 'agglomerative') => {
  try {
    const response = await getServerFileList('raw', batchNumber, pageSize);
    const rawFiles = response.files || [];
    if (!rawFiles.length) return;
    console.log(`[流水线分割] 触发第 ${batchNumber} 页 ${rawFiles.length} 个文件的后台分割`);
    // fire-and-forget：不等待完成，让服务端后台处理
    rawFiles.forEach(file => {
      triggerSegmentation(file.id, numClusters, method).catch(err => {
        console.warn(`[流水线分割] 文件 ${file.name} 分割触发失败:`, err.message || err);
      });
    });
  } catch (error) {
    console.warn('[流水线分割] 获取下一页文件列表失败，跳过预分割:', error.message || error);
  }
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

// 编辑语义标签
const handleEditSemanticLabel = () => {
  const mesh = store.selectMesh;
  if (!mesh) {
    ElMessage.warning('未选中材质对象');
    return;
  }
  
  const model = store.modelApi?.model;
  if (!model) {
    ElMessage.warning('模型未加载');
    return;
  }
  
  // 获取当前文件信息
  const currentFile = fileStore.files.find(f => f.id === fileStore.selectedFileId);
  const fileInfo = {
    name: currentFile?.name || 'model.glb',
    fileName: currentFile?.name || 'model.glb'
  };
  
  const fileId = fileStore.selectedFileId;
  
  console.log('[编辑语义标签] 打开编辑弹窗:', {
    meshName: mesh.name || mesh.uuid,
    hasLabel: !!mesh.userData?.semanticLabel,
    fileName: fileInfo.name,
    fileId
  });
  
  // 打开编辑弹窗
  semanticLabelEditDialog.value?.showDialog(
    mesh,
    model,
    fileInfo,
    fileId,
    (updatedMesh, newLabel) => {
      // 保存成功的回调
      console.log('[编辑语义标签] 保存成功:', {
        meshName: updatedMesh.name || updatedMesh.uuid,
        newLabel: newLabel.substring(0, 50) + '...'
      });
      
      // 更新文件状态标记为已打标
      if (currentFile) {
        currentFile.hasLabels = true;
        fileStore.addOrUpdateFile(currentFile);
      }
      
      // 触发界面更新（Vue 的响应式会自动更新 semanticLabelInfo）
      ElMessage.success('语义标签已更新');
    }
  );
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

  // 暴露全局API给自动化脚本使用
  if (typeof window !== 'undefined') {
    // 暴露批量打标函数
    window.startBatchLabeling = async (options = {}) => {
      console.log('[Global API] 接收到批量打标请求:', options);
      try {
        await handleBatchTagging({
          concurrency: options.concurrency || 4,
          gpuConcurrency: options.gpuConcurrency || 3,
          viewKeys: options.viewKeys || ['axial']
        });
        return { success: true };
      } catch (error) {
        console.error('[Global API] 批量打标失败:', error);
        return { success: false, error: error.message };
      }
    };
    
    // 暴露Vue实例用于状态监控
    window.__VUE_APP__ = getCurrentInstance();
    
    // 暴露批量处理状态（用于自动化脚本监控）
    const updateBatchStatus = () => {
      window.__BATCH_STATUS__ = {
        processed: processedCount.value,
        total: totalCount.value,
        isProcessing: isBatchProcessing.value
      };
    };
    
    // 监听状态变化并更新
    const statusWatcher = setInterval(updateBatchStatus, 1000);
    
    // 在卸载时清理定时器
    onBeforeUnmount(() => {
      clearInterval(statusWatcher);
    });
    
    console.log('[Global API] 自动化接口已就绪 ✅');
  }
});
onBeforeUnmount(() => {
  store.modelApi.onClearModelData();
  document.removeEventListener("fullscreenchange", addEventListenerFullscreen);
  clearTimeout(loadingTimeout.value);
  
  // 清理全局变量
  if (typeof window !== 'undefined') {
    delete window.startBatchLabeling;
    delete window.__VUE_APP__;
    delete window.__BATCH_STATUS__;
  }
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
      .semantic-label-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .semantic-label-title {
        font-size: 11px;
        color: #8fa3ff;
      }
      .edit-icon {
        font-size: 14px;
        color: #8fa3ff;
        cursor: pointer;
        transition: all 0.3s;
        padding: 2px;
        border-radius: 3px;
      }
      .edit-icon:hover {
        color: #fff;
        background-color: rgba(143, 163, 255, 0.2);
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
