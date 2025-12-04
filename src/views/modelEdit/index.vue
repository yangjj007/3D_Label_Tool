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
          <el-button type="primary" icon="Film" @click="$router.push({ path: '/modelBase' })"> 模型库 </el-button>
          <el-button type="primary" icon="Document" v-if="handleConfigBtn" @click="onSaveConfig">保存数据</el-button>
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
          <el-button type="primary" icon="HelpFilled" v-if="handleConfigBtn" @click="onImportantCode"> 嵌入代码 </el-button>
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
import { onMounted, ref, getCurrentInstance, onBeforeUnmount, computed } from "vue";
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
import { deleteModelFile, listFolderFiles, getModelFile, clearModelFiles, STORAGE_FOLDER } from "@/utils/filePersistence";
import * as THREE from "three";

import MultiImageVLM from "@/utils/vlmService";

const store = useMeshEditStore();
const fileStore = useFileStore();
const router = useRouter();
const { $bus, $local } = getCurrentInstance().proxy;

const vlmClient = new MultiImageVLM();

const loading = ref(false);
const progress = ref(0);
const editPanel = ref(null);
const choosePanel = ref(null);
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
  if (!store.modelApi?.onSwitchModel) {
    if (!silent) ElMessage.warning("模型初始化尚未完成，请稍后再试");
    return false;
  }

  let record;
  try {
    record = await getModelFile(file.id);
  } catch (err) {
    console.error("读取模型数据失败", err);
    if (!silent) ElMessage.error("读取模型文件失败");
    return false;
  }

  if (!record || !record.fileBlob) {
    if (!silent) ElMessage.warning("当前文件未保存模型数据，请重新上传");
    return false;
  }

  const fileType = record.type || getFileType(record.name || file.name);
  const normalizedFileType = (fileType || "").toLowerCase();
  const fileName = record.name || file.name;
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
    store.modelApi.objLabelMap = objLabelMap;
    const { load, filePath } = await store.modelApi.onSwitchModel(model);
    returnedPath = filePath;
    if (load) {
      success = true;
      store.setActiveEditModelType("oneModel");
      $bus.emit(UPDATE_MODEL);
    }
  } catch (err) {
    console.error("加载模型失败", err);
  } finally {
    if (!silent) $bus.emit(PAGE_LOADING, false);
    if (returnedPath) {
      URL.revokeObjectURL(returnedPath);
    } else {
      URL.revokeObjectURL(tempUrl);
    }
  }

  if (!success && !silent) {
    ElMessage.error("模型渲染失败，请重试");
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
    await ElMessageBox.confirm(`确认删除“${file.name}”？`, "提示", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch (err) {
    return;
  }
  try {
    await deleteModelFile(file.id);
  } catch (err) {
    console.error("删除本地模型失败", err);
  }
  fileStore.removeFile(file.id);
  ElMessage.success("删除成功");
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
  if (!fileStore.files.length) {
    ElMessage.warning("没有文件可处理");
    return;
  }

  // 过滤出未打标的文件
  const untaggedFiles = fileStore.files.filter(file => {
    return !file.hasLabels && !(file.labels && file.labels.length > 0);
  });

  if (!untaggedFiles.length) {
    ElMessage.info("所有文件都已打标，无需处理");
    return;
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

  ElMessage.success(`找到 ${untaggedFiles.length} 个未打标文件，开始处理...`);
  
  vlmClient.init({
    baseUrl: vlmConfig.apiConfig.baseUrl,
    apiKey: vlmConfig.apiConfig.apiKey,
    modelName: vlmConfig.apiConfig.modelName || "qwen3-vl-235b-a22b-instruct"
  });

  // 场景锁，保证同一时间只有一个模型在加载/截图/GLB写入
  const sceneLock = {
    locked: false,
    async acquire() {
      while (this.locked) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.locked = true;
    },
    release() {
      this.locked = false;
    }
  };

  const queue = [...untaggedFiles];
  const activeWorkers = Array(concurrency).fill(null);

  const processFile = async (file) => {
    try {
      file.status = 'processing';
      
      // 1. 加载模型并截图 (互斥)
      let images = [];
      let materialNames = [];
      let targetMaterialNames = [];
      
      await sceneLock.acquire();
      try {
        fileStore.setSelectedFile(file.id);
        const loaded = await loadPersistedModelFile(file, true); // silent load
        if (!loaded) throw new Error("加载模型失败");
        
        // 等待渲染稳定
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 获取材质列表
        const materials = store.modelApi?.modelMaterialList || [];
        if (!materials.length) throw new Error("未找到材质");
        
        // 使用用户选择的视角截图
        for (const mesh of materials) {
           const imgs = await editPanel.value.captureMaterialWithViews(mesh, viewKeys);
           if (imgs.length) {
             images.push(imgs);
             materialNames.push(mesh.name || mesh.uuid);
             targetMaterialNames.push(mesh.material?.name);
           }
        }
      } finally {
        sceneLock.release();
      }
      
      if (!images.length) throw new Error("截图失败");

      // 2. 发送 VLM 请求 (并行)
      // 根据选择规则从提示词库中选择提示词
      const selectPrompt = () => {
        if (vlmConfig.promptList.length === 1) return vlmConfig.promptList[0].content;
        
        if (vlmConfig.selectionRule === 'random') {
          const randomIndex = Math.floor(Math.random() * vlmConfig.promptList.length);
          return vlmConfig.promptList[randomIndex].content;
        } else {
          // 加权选择
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
      
      const requests = images.map(imgs => [selectPrompt(), imgs, {}]);
      
      // 这里的 generateBatch 是针对一个文件的多个材质
      // 我们复用 vlmClient.generateBatch，它内部是并发控制的，
      // 但这里我们是文件级别的并发。
      // 为了简化，我们对单文件内的材质请求也进行并发
      
      const results = await vlmClient.generateBatch(requests, 4); // 单文件内最大4并发
      
      const batchResults = results.map((res, idx) => ({
        ...res,
        materialName: materialNames[idx],
        targetMaterialName: targetMaterialNames[idx]
      }));

      // 3. 写入标签
      const isGlb = /\.(glb|gltf)$/i.test(file.name);
      
      if (isGlb) {
        // GLB 需要重新加载场景来写入 (互斥)
        await sceneLock.acquire();
        try {
           // 再次加载确保是当前文件
           await loadPersistedModelFile(file, true);
           await editPanel.value.writeAutoTags(file.id, batchResults);
        } finally {
           sceneLock.release();
        }
      } else {
        // OBJ 可以直接写入 Blob (无需场景)
        await editPanel.value.writeAutoTags(file.id, batchResults);
      }

      file.status = 'done'; // 实际上 fileStore 是响应式的，这里修改可能不持久化，但 loadPersistedFiles 会重置
      // 应该更新 store 中的状态，并标记已打标
      fileStore.addOrUpdateFile({ ...file, status: 'done', hasLabels: true });
      
    } catch (error) {
      console.error(`文件 ${file.name} 处理失败`, error);
      file.status = 'error';
      fileStore.addOrUpdateFile({ ...file, status: 'error' });
    } finally {
      processedCount.value++;
      updateProgress();
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

  isBatchProcessing.value = false;
  ElMessage.success("批量打标完成");
  
  // 刷新文件列表状态（如果需要）
  await loadPersistedFiles();
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
