<template>
  <div class="model-choose">
    <el-scrollbar max-height="calc(100vh - 75px)">
      <div class="header">
        <span>当前场景编辑模式:{{ modelEditMap[reactiveData.modeEditType].text }}</span>
        <el-tooltip effect="dark" :content="modelEditMap[reactiveData.modeEditType].tooltip" placement="top">
          <el-button
            type="primary"
            icon="Switch"
            @click="
              switchActiveModelEdit(modelEditMap[reactiveData.modeEditType] && modelEditMap[reactiveData.modeEditType].switchType)
            "
          >
            切换场景
          </el-button>
        </el-tooltip>
      </div>
      <!-- 普通模型 -->
      <div class="options">
        <div class="option">
          <el-space>
            <el-icon>
              <Orange />
            </el-icon>
            <span>普通模型</span>
          </el-space>
        </div>
        <!-- 模型列表 -->
        <el-scrollbar max-height="210px">
          <el-row>
            <el-col
              :draggable="(modelEditMap[reactiveData.modeEditType] && modelEditMap[reactiveData.modeEditType].draggable) || false"
              :style="modelTypeStyle"
              :span="12"
              v-for="model in ordinaryModelList"
              @dragstart="e => onDragModelStart(model)"
              @drag="e => onDrag(e)"
              :key="model.id"
            >
              <el-image
                draggable="false"
                @click.prevent="onChangeModel(model)"
                class="el-img"
                :class="reactiveData.activeModelId == model.id ? 'active-model' : ''"
                :src="model.icon"
                fit="cover"
              />
            </el-col>
          </el-row>
        </el-scrollbar>
      </div>
      <!-- 动画模型 -->
      <div class="options">
        <div class="option">
          <el-space>
            <el-icon>
              <Paperclip />
            </el-icon>
            <span>动画模型</span>
          </el-space>
        </div>
        <!-- 模型列表 -->
        <el-scrollbar max-height="210px">
          <el-row>
            <el-col
              :draggable="modelEditMap[reactiveData.modeEditType].draggable"
              :style="modelTypeStyle"
              :span="12"
              v-for="model in animationModelList"
              @dragstart="e => onDragModelStart(model)"
              @drag="e => onDrag(e)"
              :key="model.id"
            >
              <el-image
                draggable="false"
                @click="onChangeModel(model)"
                class="el-img"
                :class="reactiveData.activeModelId == model.id ? 'active-model' : ''"
                :src="model.icon"
                fit="cover"
              />
            </el-col>
          </el-row>
        </el-scrollbar>
      </div>
      <!-- 几何体模型 -->
      <div class="options">
        <div class="option">
          <el-space>
            <el-icon>
              <SwitchFilled />
            </el-icon>
            <span>几何体模型</span>
            <span :style="{ color: '#18c174 ' }" v-if="reactiveData.geometryVisible">(可拖拽添加多个)</span>
          </el-space>
        </div>
        <!-- 模型列表 -->
        <el-scrollbar max-height="120px">
          <el-row v-if="reactiveData.geometryVisible">
            <el-col :style="{ textAlign: 'center' }" :span="8" v-for="model in geometryModelList" :key="model.type">
              <div
                class="geometry"
                :class="reactiveData.activeModelId == model.id ? 'active-model' : ''"
                draggable="true"
                @dragstart="e => onDragstart(e, model)"
                @drag="e => onDrag(e)"
              >
                <div class="geometry-name">
                  <el-tooltip effect="dark" :content="`${model.name}:${model.type}`" placement="top">
                    <b> {{ model.name }}</b>
                  </el-tooltip>
                </div>
              </div>
            </el-col>
          </el-row>
          <div class="geometry-box" v-else>
            <div class="geometry-add" @click="onAddGeometry">
              <div class="icon">
                <el-icon :size="44">
                  <Plus />
                </el-icon>
                <div><span>添加几何体模型</span></div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
      <!-- 外部模型 -->
      <div class="options">
        <div class="option">
          <el-space>
            <el-icon>
              <UploadFilled />
            </el-icon>
            <span>外部模型</span>
          </el-space>
        </div>
        <!-- 模型内容 -->
        <div class="file-name">
          <span>当前模型:</span>
          <el-tooltip effect="dark" :content="reactiveData.localModelName" placement="top">
            <b>{{ reactiveData.localModelName }}</b>
          </el-tooltip>
        </div>
        <el-upload
          action=""
          accept=".glb,.obj,.gltf,.fbx,.stl"
          class="file-box"
          :show-file-list="false"
          :auto-upload="false"
          :on-change="onUpload"
        >
          <div class="upload">
            <div class="icon">
              <el-icon :size="44">
                <Plus />
              </el-icon>
              <div><span>请选择(目前仅支持.glb, .obj, .gltf, .fbx, .stl格式)</span></div>
            </div>
          </div>
        </el-upload>
        <input
          ref="batchInputRef"
          type="file"
          accept=".glb,.obj,.gltf,.fbx,.stl"
          multiple
          class="batch-file-input"
          @change="handleBatchFiles"
        />
        <div class="batch-upload">
          <el-button type="primary" size="small" @click="openBatchUploadDialog">批量上传</el-button>
          <span v-if="batchUploading">文件批量处理中…</span>
          <span v-else-if="processingCount">当前处理中 {{ processingCount }} 个文件</span>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, computed, getCurrentInstance, reactive } from "vue";
import { modelList, geometryModelList } from "@/config/model.js";
import { useMeshEditStore } from "@/store/meshEditStore";
import { useFileStore } from "@/store/fileStore";
import { getFileType, getAssetsFile } from "@/utils/utilityFunction.js";
import { saveModelFile, STORAGE_FOLDER } from "@/utils/filePersistence";
import { uploadModelToServer } from "@/utils/serverApi";
import { ElMessage, ElMessageBox } from "element-plus";
import { UPDATE_MODEL, PAGE_LOADING } from "@/config/constant";

const modelEditMap = {
  oneModel: {
    text: "单模型",
    tooltip: "当前为单模型编辑模式，通过点击加载不同模型",
    draggable: false,
    switchType: "many"
  },
  many: {
    text: "多模型",
    tooltip: "当前为多模型编辑模式：通过拖拽添加多个模型",
    draggable: true,
    switchType: "oneModel"
  },
  geometry: {
    text: "几何体",
    tooltip: "当前为几何体模型编辑模式：通过拖拽添加多个几何体模型",
    draggable: false,
    switchType: "oneModel"
  }
};
const store = useMeshEditStore();
const { $bus } = getCurrentInstance().proxy;
const fileStore = useFileStore();

//普通模型
const ordinaryModelList = computed(() => {
  return modelList.filter(v => !v.animation);
});
// 动画模型
const animationModelList = computed(() => {
  return modelList.filter(v => v.animation);
});

// 不同编辑模式鼠标style
const modelTypeStyle = computed(() => {
  return reactiveData.modeEditType == "many"
    ? { textAlign: "center", cursor: "all-scroll" }
    : { textAlign: "center", cursor: "pointer" };
});

const reactiveData = reactive({
  // 当前模型ID
  activeModelId: 7,
  geometryVisible: false,
  // 当前模型编辑模式:oneModel 单模型 many 多模型 geometry 几何体模型
  modeEditType: "oneModel",
  localModelName: null
});

// 当前模型信息
const activeModel = ref({
  name: "su7",
  fileType: "glb",
  id: 7,
  animation: false,
  filePath: "threeFile/glb/glb-7.glb",
  icon: getAssetsFile("model-icon/4.png"),
  decomposeName: "transformers_3",
  key: "transformers-3"
});

// 切换当前模型编辑模式
const switchActiveModelEdit = async switchType => {
  if (switchType == "many") {
    ElMessageBox.confirm("通过拖拽添加多个模型", "切换为多模型编辑模式?", {
      confirmButtonText: "确定",
      cancelButtonText: "取消"
    }).then(() => {
      Object.assign(reactiveData, {
        modeEditType: switchType,
        localModelName: null,
        geometryVisible: false
      });
      store.setActiveEditModelType("manyModel");
      store.modelApi.clearSceneModel();
      ElMessage.success("切换成功：当前为多模型编辑模式");
    });
  } else if (["geometry", "oneModel"].includes(switchType)) {
    // 加载单模型
    $bus.emit(PAGE_LOADING, true);
    try {
      const { load } = await store.modelApi.onSwitchModel(activeModel.value);
      if (load) {
        Object.assign(reactiveData, {
          modeEditType: "oneModel",
          activeModelId: activeModel.value.id,
          localModelName: null,
          geometryVisible: false
        });
        $bus.emit(UPDATE_MODEL);
        $bus.emit(PAGE_LOADING, false);
        store.setActiveEditModelType("oneModel");
        ElMessage.success("切换成功：当前为单模型编辑模式");
      }
    } catch (err) {
      $bus.emit(PAGE_LOADING, false);
    }
  }
};
//选择模型
const onChangeModel = async model => {
  if (model.id == reactiveData.activeModelId || reactiveData.modeEditType == "many") return false;
  activeModel.value = model;
  store.setActiveEditModelType("oneModel");
  Object.assign(reactiveData, {
    activeModelId: model.id,
    localModelName: null,
    modeEditType: "oneModel",
    geometryVisible: false
  });

  $bus.emit(PAGE_LOADING, true);
  try {
    const { load } = await store.modelApi.onSwitchModel(model);
    if (load) {
      $bus.emit(UPDATE_MODEL);
      $bus.emit(PAGE_LOADING, false);
    }
  } catch (err) {
    $bus.emit(PAGE_LOADING, false);
  }
};

// 添加几何模型
const onAddGeometry = async () => {
  Object.assign(reactiveData, {
    activeModelId: null,
    localModelName: null,
    modeEditType: "geometry",
    geometryVisible: true
  });
  store.modelApi.clearSceneModel();
};

// 拖拽几何模型开始
const onDragstart = (e, model) => {
  store.modelApi.setDragGeometryModel(model);
  store.setActiveEditModelType("geometry");
};
// 拖拽中
const onDrag = event => {
  event.preventDefault();
};

// 拖拽模型开始
const onDragModelStart = model => {
  store.setActiveEditModelType("manyModel");
  store.modelApi.setDragManyModel(model);
};

const batchInputRef = ref(null);
const batchUploading = ref(false);
const processingCount = computed(() => fileStore.files.filter(file => file.status === "processing").length);

const openBatchUploadDialog = () => {
  batchInputRef.value?.click();
};

const onUpload = async file => {
  const fileId = fileStore.addUploadedFile({
    name: file.name,
    size: file.raw.size,
    type: getFileType(file.name)
  });
  await processLocalFile(file.raw, fileId);
  
  // 单个上传完成后，通知文件列表刷新
  $bus.emit('REFRESH_FILE_LIST');
};

const handleBatchFiles = async event => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  batchUploading.value = true;
  $bus.emit(PAGE_LOADING, true);
  try {
    for (const rawFile of files) {
      const fileId = fileStore.addUploadedFile({
        name: rawFile.name,
        size: rawFile.size,
        type: getFileType(rawFile.name)
      });
      await processLocalFile(rawFile, fileId, { renderModel: false, suppressGlobalLoading: true });
    }
    
    // 上传完成后，通知文件列表刷新
    $bus.emit('REFRESH_FILE_LIST');
    ElMessage.success(`成功上传 ${files.length} 个文件`);
  } finally {
    batchUploading.value = false;
    $bus.emit(PAGE_LOADING, false);
    event.target.value = "";
  }
};

const persistUploadedFile = async (fileId, rawFile) => {
  try {
    // 上传到服务器
    await uploadModelToServer(
      rawFile,
      {
        id: fileId,
        name: rawFile.name,
        size: rawFile.size,
        type: getFileType(rawFile.name)
      },
      (progress) => {
        // 更新上传进度（如果需要）
        const uploadProgress = Math.floor(progress.overall * 30); // 分配30%进度给上传
        fileStore.setFileProgress(fileId, 70 + uploadProgress);
      }
    );
    
    // 上传成功后，暂不保存到IndexedDB（由FileList组件按需下载）
    console.log(`文件 ${rawFile.name} 已上传到服务器`);
  } catch (err) {
    console.error("上传模型文件到服务器失败", err);
    ElMessage.error(`上传失败: ${err.message}`);
  }
};

const processLocalFile = async (rawFile, fileId, options = {}) => {
  fileStore.setFileStatus(fileId, "processing");
  fileStore.setFileProgress(fileId, 10);
  reactiveData.localModelName = rawFile.name;
  const { renderModel = true, suppressGlobalLoading = false } = options;
  let objectUrl = null;
  if (renderModel) {
    objectUrl = URL.createObjectURL(rawFile);
  }
  const model = renderModel
    ? {
        filePath: objectUrl,
        fileType: getFileType(rawFile.name)
      }
    : null;
  let success = false;
  let returnedPath = "";
  const shouldEmitLoading = renderModel && !suppressGlobalLoading;
  if (shouldEmitLoading) {
    $bus.emit(PAGE_LOADING, true);
  }
  try {
    if (renderModel) {
      const { load, filePath } = await store.modelApi.onSwitchModel(model);
      returnedPath = filePath;
      if (load) {
        success = true;
        $bus.emit(UPDATE_MODEL);
        Object.assign(reactiveData, {
          activeModelId: null,
          geometryVisible: false
        });
        fileStore.setFileProgress(fileId, 70);
      }
    } else {
      success = true;
      fileStore.setFileProgress(fileId, 70);
    }
  } catch (err) {
    console.error("加载模型失败", err);
  } finally {
    if (returnedPath) {
      URL.revokeObjectURL(returnedPath);
    } else if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    fileStore.setFileProgress(fileId, success ? 100 : 0);
    fileStore.setFileStatus(fileId, success ? "done" : "error");
    if (!success) {
      reactiveData.localModelName = null;
    }
    if (shouldEmitLoading) {
      $bus.emit(PAGE_LOADING, false);
    }
  }
  if (success) {
    await persistUploadedFile(fileId, rawFile);
  }
  return success;
};

defineExpose({
  activeModel,
  openBatchUploadDialog
});
</script>

<style lang="scss">
.model-choose {
  min-width: 305px;
  height: 100%;
  background-color: #1b1c23;
  .el-img {
    box-sizing: border-box;
    width: 145px;
    height: 88px;
    margin-bottom: 4px;
    opacity: 0.5;
  }
  .active-model {
    border: 3px solid #18c174 !important;
    opacity: 1;
  }
  .geometry {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 70px;
    margin: 4px 2px;
    font-size: 12px;
    color: #ffffff;
    text-align: center;
    cursor: all-scroll;
    border: 1px solid #dcdfe6;
  }
  .geometry-box {
    position: relative;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    padding: 0 20px;
    overflow: hidden;
    color: #8c939d;
    text-align: center;
    .geometry-add {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 228px;
      height: 108px;
      cursor: pointer;
      border: 1px dashed #dcdfe6;
      border-radius: 6px;
      .icon {
        span {
          font-size: 14px;
        }
      }
      &:hover {
        color: #409eff;
        border-color: #409eff;
      }
    }
  }
  .file-box {
    position: relative;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    padding: 10px 20px;
    overflow: hidden;
    color: #8c939d;
    text-align: center;
    cursor: pointer;
    .upload {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 228px;
      height: 100px;
      border: 1px dashed #dcdfe6;
      border-radius: 6px;
      .icon {
        span {
          font-size: 14px;
        }
      }
      &:hover {
        color: #409eff;
        border-color: #409eff;
      }
    }
  }
  .file-name {
    overflow: hidden;
    font-size: 14px;
    color: #ffffff;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .batch-upload {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #8c94a7;
  }
  .batch-file-input {
    display: none;
  }
}
</style>
