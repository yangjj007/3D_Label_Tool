<template>
  <div class="file-list">
    <div class="file-list-header">
      <div class="header-container">
        <div class="header-title">
          <h3 class="title-text">模型文件列表</h3>
        </div>
        <div class="header-controls">
          <el-select v-model="fileType" @change="loadFileList" size="small" style="width: 120px;">
            <el-option label="未打标" value="raw" />
            <el-option label="已打标" value="labeled" />
            <el-option label="全部" value="all" />
          </el-select>
          
          <el-input-number 
            v-model="pageSize" 
            :min="5" 
            :max="50" 
            size="small"
            style="width: 140px;"
            @change="handlePageSizeChange"
          />
          
          <el-button size="small" type="primary" @click="triggerBatchUpload">批量上传</el-button>
          <el-button 
            size="small"
            type="warning" 
            @click="showBatchTagDialog = true"
            :disabled="fileType !== 'raw' || totalFiles === 0"
          >
            批量打标({{ totalFiles }})
          </el-button>
        </div>
      </div>
    </div>

    <!-- 批量打标弹窗 -->
    <el-dialog v-model="showBatchTagDialog" title="批量打标配置" width="400px" append-to-body>
      <div class="batch-tag-config">
        <div class="config-item">
          <span class="label">最大并行数 (1-8):</span>
          <el-slider v-model="batchConcurrency" :min="1" :max="8" show-input />
        </div>
        <div class="config-item">
          <span class="label">截图视角选择:</span>
          <div class="view-selector">
            <el-button
              v-for="viewKey in MULTI_VIEW_ORDER"
              :key="viewKey"
              size="small"
              :type="selectedViewKeys.includes(viewKey) ? 'primary' : 'default'"
              @click="toggleViewSelection(viewKey)"
            >
              {{ CAMERA_VIEW_LABELS[viewKey] }}
            </el-button>
          </div>
        </div>
        <div class="config-tip">
          注意：并行数过高可能会导致浏览器卡顿或接口限流
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showBatchTagDialog = false">取消</el-button>
          <el-button type="primary" @click="startBatchTagging">开始生成</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 进度条区域 -->
    <div v-if="isBatchProcessing" class="batch-progress-area">
      <div class="progress-info">
        <span>正在批量处理... {{ processedCount }}/{{ totalCount }}</span>
        <span v-if="remainingTime">预计剩余: {{ remainingTime }}</span>
      </div>
      <el-progress 
        :percentage="progressPercentage" 
        :status="progressStatus"
        :format="progressFormat"
      />
    </div>

    <!-- 文件列表 -->
    <div class="file-list-content">
      <el-scrollbar max-height="calc(100vh - 260px)">
        <div class="file-items">
          <div
            v-for="file in currentPageFiles"
            :key="file.id"
            class="file-item"
            :class="{ active: selectedFileId === file.id }"
            @click="onSelectFile(file)"
          >
            <div class="file-info">
              <div class="file-name" :title="file.name">{{ truncateFileName(file.name) }}</div>
              <div class="file-meta">
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <el-tag :type="getLabelStatusType(file)" size="small">
                  {{ getLabelStatusText(file) }}
                </el-tag>
                <!-- 如果在IndexedDB中，显示"工作区"标记 -->
                <el-tag v-if="file.isInWorkspace" size="small" type="success">
                  工作区
                </el-tag>
              </div>
              <el-progress
                v-if="file.progress != null && file.progress > 0 && file.progress < 100"
                :percentage="file.progress"
                status="active"
                :stroke-width="6"
              />
              <div class="file-labels" v-if="file.labels && file.labels.length">
                <el-tag
                  v-for="label in file.labels.slice(0, 3)"
                  :key="label.id || label"
                  size="small"
                  class="label-tag"
                >
                  {{ label.description || label }}
                </el-tag>
                <span v-if="file.labels.length > 3" class="more-labels">
                  +{{ file.labels.length - 3 }}个标签
                </span>
              </div>
            </div>

            <div class="file-actions">
              <el-button 
                size="small" 
                :type="file.isInWorkspace ? 'primary' : 'default'" 
                @click.stop="handleSelectFile(file)"
              >
                {{ file.isInWorkspace ? '打开' : '加载' }}
              </el-button>
              <el-button size="small" type="danger" icon="Delete" @click.stop="emitDeleteFile(file)" />
            </div>
          </div>
          <div v-if="!currentPageFiles.length && !loading" class="empty-state">
            暂无文件，先上传一个模型吧
          </div>
          <div v-if="loading" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载中...</span>
          </div>
        </div>
      </el-scrollbar>
    </div>

    <!-- 分页器 -->
    <div class="pagination-container" v-if="totalFiles > 0">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="totalFiles"
        :page-sizes="[5, 10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="handlePageChange"
        @size-change="handlePageSizeChange"
        small
      />
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, computed, onMounted, onUnmounted, getCurrentInstance, watch, defineExpose } from "vue";
import { ElMessage, ElLoading } from "element-plus";
import { Loading } from '@element-plus/icons-vue';
import { getServerFileList, downloadModelFromServer } from '@/utils/serverApi';
import { listFolderFiles, getAllFiles } from '@/utils/filePersistence';

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  selectedFileId: {
    type: String,
    default: ""
  },
  isBatchProcessing: {
    type: Boolean,
    default: false
  },
  processedCount: {
    type: Number,
    default: 0
  },
  totalCount: {
    type: Number,
    default: 0
  },
  remainingTime: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["select", "delete", "batch-upload", "batch-tag", "refresh"]);

// 分页相关状态
const fileType = ref('raw');
const currentPage = ref(1);
const pageSize = ref(10);
const totalFiles = ref(0);
const serverFiles = ref([]);
const workspaceFiles = ref([]);
const loading = ref(false);

// 批量打标相关
const showBatchTagDialog = ref(false);
const batchConcurrency = ref(1);
const selectedViewKeys = ref(["axial"]);

// 视图配置
const MULTI_VIEW_ORDER = ["main", "top", "side", "axial"];
const CAMERA_VIEW_LABELS = {
  main: "主视",
  top: "俯视",
  side: "侧视",
  axial: "轴视"
};

// 计算当前页文件（合并服务器文件和工作区状态）
const currentPageFiles = computed(() => {
  return serverFiles.value.map(file => ({
    ...file,
    isInWorkspace: workspaceFiles.value.some(wf => 
      wf.serverFileId === file.id || wf.serverFileId === file.name || wf.id === file.id
    )
  }));
});

// 加载文件列表
async function loadFileList() {
  try {
    loading.value = true;
    
    // 从服务器加载当前页文件列表
    const response = await getServerFileList(fileType.value, currentPage.value, pageSize.value);
    serverFiles.value = response.files || [];
    totalFiles.value = response.total || 0;
    
    // 检查哪些文件在IndexedDB中
    workspaceFiles.value = await getAllFiles();
    
  } catch (error) {
    console.error('加载文件列表失败:', error);
    ElMessage.error('加载文件列表失败: ' + error.message);
  } finally {
    loading.value = false;
  }
}

// 分页处理
function handlePageChange(page) {
  currentPage.value = page;
  loadFileList();
}

function handlePageSizeChange(size) {
  pageSize.value = size;
  currentPage.value = 1;
  loadFileList();
}

// 选择文件
function onSelectFile(file) {
  // 根据当前fileType，为文件添加hasLabels标记
  const fileWithLabels = {
    ...file,
    hasLabels: fileType.value === 'labeled' || file.hasLabels,
    isFromServer: true
  };
  emit("select", fileWithLabels);
}

// 处理文件选择（加载到工作区或打开）
async function handleSelectFile(file) {
  if (file.isInWorkspace) {
    // 已在工作区，直接打开
    emit("select", file);
  } else {
    // 不在工作区，需要加载
    try {
      const loadingInstance = ElLoading.service({
        lock: true,
        text: '正在从服务器加载文件到工作区...',
        background: 'rgba(0, 0, 0, 0.7)'
      });
      
      await downloadModelFromServer(file.id, {
        id: file.id,
        name: file.name,
        isTemporary: true,
        serverFileId: file.id,
        batchNumber: currentPage.value
      }, (progress) => {
        loadingInstance.setText(`加载中: ${(progress.overall * 100).toFixed(1)}%`);
      });
      
      loadingInstance.close();
      ElMessage.success('文件已加载到工作区');
      
      // 刷新工作区文件列表
      workspaceFiles.value = await getAllFiles();
      
      // 加载完成后打开
      emit("select", file);
      
    } catch (error) {
      ElMessage.error('加载失败: ' + error.message);
    }
  }
}

// 批量打标相关
const toggleViewSelection = (viewKey) => {
  const index = selectedViewKeys.value.indexOf(viewKey);
  if (index > -1) {
    selectedViewKeys.value = selectedViewKeys.value.filter(key => key !== viewKey);
  } else {
    selectedViewKeys.value = [...selectedViewKeys.value, viewKey];
  }
};

const startBatchTagging = () => {
  if (selectedViewKeys.value.length === 0) {
    ElMessage.warning("请至少选择一个截图视角");
    return;
  }
  showBatchTagDialog.value = false;
  emit("batch-tag", { 
    concurrency: batchConcurrency.value,
    viewKeys: selectedViewKeys.value
  });
};

const progressPercentage = computed(() => {
  if (!props.totalCount) return 0;
  return Math.floor((props.processedCount / props.totalCount) * 100);
});

const progressStatus = computed(() => {
  if (progressPercentage.value === 100) return "success";
  return "";
});

const progressFormat = (percentage) => {
  return percentage === 100 ? "完成" : `${percentage}%`;
};

// 工具函数
const formatFileSize = size => {
  if (!size && size !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let idx = 0;
  while (value > 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(1)} ${units[idx]}`;
};

const getLabelStatusText = file => {
  if ((file.labels && file.labels.length > 0) || file.hasLabels) return "已打标";
  if (file.status === 'processing') return "处理中";
  if (file.status === 'error') return "失败";
  return "未打标";
};

const getLabelStatusType = file => {
  if ((file.labels && file.labels.length > 0) || file.hasLabels) return "success";
  if (file.status === 'processing') return "warning";
  if (file.status === 'error') return "danger";
  return "info";
};

const truncateFileName = (name, frontChars = 4, backChars = 8) => {
  if (!name || name.length <= frontChars + backChars + 4) {
    return name;
  }
  return `${name.slice(0, frontChars)}......${name.slice(name.length - backChars)}`;
};

// 事件触发
const triggerBatchUpload = () => emit("batch-upload");
const emitDeleteFile = async (file) => {
  emit("delete", file);
  // 删除后刷新列表
  setTimeout(() => loadFileList(), 500);
};

// 组件挂载时加载列表
onMounted(() => {
  loadFileList();
  
  // 监听刷新事件
  const { appContext } = getCurrentInstance();
  const $bus = appContext.config.globalProperties.$bus;
  if ($bus) {
    $bus.on('REFRESH_FILE_LIST', loadFileList);
  }
});

// 组件卸载时取消监听
onUnmounted(() => {
  const { appContext } = getCurrentInstance();
  const $bus = appContext.config.globalProperties.$bus;
  if ($bus) {
    $bus.off('REFRESH_FILE_LIST', loadFileList);
  }
});

// 暴露方法给父组件
defineExpose({
  currentPage,
  pageSize,
  fileType,
  loadFileList,
  refreshWorkspaceStatus: async () => {
    workspaceFiles.value = await getAllFiles();
  }
});
</script>

<style scoped>
.file-list {
  width: 100%;
  background-color: #10141d;
  padding: 16px;
  box-sizing: border-box;
  color: #c6cbd8;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-list-header {
  margin-bottom: 12px;
}

.header-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-title h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.file-list-content {
  flex: 1;
  overflow: hidden;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.file-item {
  padding: 12px;
  border-radius: 6px;
  background-color: #151a25;
  border: 1px solid transparent;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}

.file-item:hover {
  background-color: #1a2030;
  border-color: #2a3545;
}

.file-item.active {
  border-color: #18c174;
  background-color: #1a2830;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  color: #fff;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #8a92a6;
}

.file-size {
  color: #8a92a6;
}

.file-labels {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.label-tag {
  font-size: 11px;
}

.more-labels {
  font-size: 11px;
  color: #8a92a6;
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.empty-state,
.loading-state {
  text-align: center;
  padding: 40px 20px;
  color: #8a92a6;
  font-size: 14px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.pagination-container {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  padding: 8px 0;
  border-top: 1px solid #1e2230;
}

.batch-progress-area {
  background-color: #151a25;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
}

.batch-tag-config {
  padding: 12px 0;
}

.config-item {
  margin-bottom: 20px;
}

.config-item .label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #606266;
}

.view-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.config-tip {
  font-size: 12px;
  color: #909399;
  padding: 8px;
  background-color: #f4f4f5;
  border-radius: 4px;
}
</style>
