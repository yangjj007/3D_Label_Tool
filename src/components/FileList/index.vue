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
            <el-option label="已过滤" value="filtered" />
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
          
          <el-button 
            size="small" 
            type="primary" 
            @click="triggerBatchUpload"
            :disabled="fileType === 'labeled'"
          >
            批量上传
          </el-button>
          <el-button 
            size="small"
            type="warning" 
            @click="showBatchTagDialog = true"
            :disabled="fileType !== 'raw' || totalFiles === 0"
          >
            批量打标({{ totalFiles }})
          </el-button>
          <el-button 
            size="small"
            type="success" 
            @click="showFilterDialog"
            :disabled="fileType !== 'labeled' || totalFiles === 0"
          >
            批量过滤({{ totalFiles }})
          </el-button>
        </div>
      </div>
    </div>

    <!-- 过滤对话框 -->
    <FilterDialog ref="filterDialogRef" />

    <!-- 指标详情弹窗 -->
    <el-dialog 
      v-model="showMetricsDetailDialog" 
      title="模型指标详情" 
      width="600px" 
      append-to-body
    >
      <div v-if="selectedFileForMetrics" class="metrics-detail">
        <div class="metrics-section">
          <h4 class="section-title">基本信息</h4>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">文件名:</span>
              <span class="metric-value">{{ selectedFileForMetrics.name }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">文件大小:</span>
              <span class="metric-value">{{ formatFileSize(selectedFileForMetrics.size) }}</span>
            </div>
          </div>
        </div>

        <div class="metrics-section" v-if="selectedFileForMetrics.filterMetrics">
          <h4 class="section-title">几何统计</h4>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">顶点数量:</span>
              <span class="metric-value">{{ formatNumber(selectedFileForMetrics.filterMetrics.vertexCount) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">面片数量:</span>
              <span class="metric-value">{{ formatNumber(selectedFileForMetrics.filterMetrics.faceCount) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">网格数量:</span>
              <span class="metric-value">{{ selectedFileForMetrics.filterMetrics.meshCount || 'N/A' }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">材质数量:</span>
              <span class="metric-value">{{ selectedFileForMetrics.filterMetrics.materialCount || 'N/A' }}</span>
            </div>
          </div>
        </div>

        <div class="metrics-section" v-if="selectedFileForMetrics.filterMetrics">
          <h4 class="section-title">体素化信息</h4>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">体素分辨率:</span>
              <span class="metric-value">{{ selectedFileForMetrics.filterMetrics.voxelResolution || 'N/A' }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">占用体素数:</span>
              <span class="metric-value">{{ formatNumber(selectedFileForMetrics.filterMetrics.occupiedVoxels) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">表面体素数:</span>
              <span class="metric-value">{{ formatNumber(selectedFileForMetrics.filterMetrics.surfaceVoxels) }}</span>
            </div>
          </div>
        </div>

        <div class="metrics-section" v-if="selectedFileForMetrics.filterMetrics">
          <h4 class="section-title">复杂度指标</h4>
          <div class="metrics-grid">
            <div class="metric-item highlight">
              <span class="metric-label">
                <el-tooltip content="体素顶点密度 - 表示模型的几何细节丰富度" placement="top">
                  <span>VVD <el-icon><QuestionFilled /></el-icon></span>
                </el-tooltip>
              </span>
              <span class="metric-value">{{ formatMetric(selectedFileForMetrics.filterMetrics.VVD) }}</span>
            </div>
            <div class="metric-item highlight">
              <span class="metric-label">
                <el-tooltip content="体素面片复杂度 - 反映模型的面片分布密度" placement="top">
                  <span>VFC <el-icon><QuestionFilled /></el-icon></span>
                </el-tooltip>
              </span>
              <span class="metric-value">{{ formatMetric(selectedFileForMetrics.filterMetrics.VFC) }}</span>
            </div>
            <div class="metric-item highlight">
              <span class="metric-label">
                <el-tooltip content="体素表面复杂度 - 衡量模型表面的复杂程度" placement="top">
                  <span>VSC <el-icon><QuestionFilled /></el-icon></span>
                </el-tooltip>
              </span>
              <span class="metric-value">{{ formatMetric(selectedFileForMetrics.filterMetrics.VSC) }}</span>
            </div>
          </div>
        </div>

        <div class="metrics-section" v-if="selectedFileForMetrics.filterMetrics">
          <h4 class="section-title">计算信息</h4>
          <div class="metrics-grid">
            <div class="metric-item">
              <span class="metric-label">计算时间:</span>
              <span class="metric-value">{{ formatDate(selectedFileForMetrics.filterMetrics.computedAt) }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">最后更新:</span>
              <span class="metric-value">{{ formatDate(selectedFileForMetrics.filterMetrics.lastUpdated) }}</span>
            </div>
            <div class="metric-item" v-if="selectedFileForMetrics.filteredAt">
              <span class="metric-label">过滤时间:</span>
              <span class="metric-value">{{ formatDate(selectedFileForMetrics.filteredAt) }}</span>
            </div>
            <div class="metric-item" v-if="selectedFileForMetrics.sourceType">
              <span class="metric-label">来源类型:</span>
              <span class="metric-value">{{ selectedFileForMetrics.sourceType === 'labeled' ? '已打标' : selectedFileForMetrics.sourceType }}</span>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showMetricsDetailDialog = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 批量打标弹窗 -->
    <el-dialog v-model="showBatchTagDialog" title="批量打标配置" width="450px" append-to-body>
      <div class="batch-tag-config">
        <div class="config-item">
          <span class="label">最大并行数 (1-64):</span>
          <el-slider v-model="batchConcurrency" :min="1" :max="64" show-input />
        </div>
        <div class="config-item">
          <span class="label">GPU 并发数 (1-16):</span>
          <el-slider v-model="gpuConcurrency" :min="1" :max="16" show-input />
          <div class="config-sub-tip">
            控制同时进行截图的材质数量，降低此值可提高稳定性
          </div>
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
          ⚠️ 注意：并行数和GPU并发数过高可能导致浏览器卡顿、接口限流或GPU过载
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
              <!-- 统计按钮 - 仅在已过滤文件且有指标时显示 -->
              <el-button 
                v-if="fileType === 'filtered' && file.filterMetrics"
                size="small" 
                type="info" 
                icon="DataAnalysis" 
                @click.stop="showMetricsDialog(file)"
                title="查看指标详情"
              />
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
import { Loading, QuestionFilled, DataAnalysis } from '@element-plus/icons-vue';
import { getServerFileList, downloadModelFromServer } from '@/utils/serverApi';
import { listFolderFiles, getAllFiles } from '@/utils/filePersistence';
import FilterDialog from '@/components/FilterDialog/index.vue';

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
const batchConcurrency = ref(10);
const gpuConcurrency = ref(10); // GPU 并发数
const selectedViewKeys = ref(["axial"]);

// 过滤对话框引用
const filterDialogRef = ref(null);

// 指标详情弹窗
const showMetricsDetailDialog = ref(false);
const selectedFileForMetrics = ref(null);

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

// 选择文件（合并加载逻辑）
async function onSelectFile(file) {
  // 根据当前fileType，为文件添加hasLabels标记
  const fileWithLabels = {
    ...file,
    hasLabels: fileType.value === 'labeled' || file.hasLabels,
    isFromServer: true
  };
  
  // 如果文件不在工作区，需要先加载
  if (!file.isInWorkspace) {
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
      
    } catch (error) {
      ElMessage.error('加载失败: ' + error.message);
      return;
    }
  }
  
  // 打开文件
  emit("select", fileWithLabels);
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
    gpuConcurrency: gpuConcurrency.value,
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

// 显示过滤对话框
const showFilterDialog = () => {
  if (filterDialogRef.value) {
    filterDialogRef.value.openDialog();
  }
};

// 显示指标详情弹窗
const showMetricsDialog = (file) => {
  selectedFileForMetrics.value = file;
  showMetricsDetailDialog.value = true;
};

// 格式化数字
const formatNumber = (num) => {
  if (num === undefined || num === null) return 'N/A';
  return num.toLocaleString();
};

// 格式化指标值（保留2位小数）
const formatMetric = (value) => {
  if (value === undefined || value === null) return 'N/A';
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  return value;
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return dateString;
  }
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

// 切换到已打标视图
const switchToLabeled = async () => {
  fileType.value = 'labeled';
  currentPage.value = 1;
  await loadFileList();
};

// 暴露方法给父组件
defineExpose({
  currentPage,
  pageSize,
  fileType,
  loadFileList,
  switchToLabeled,
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

.config-sub-tip {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

/* 指标详情弹窗样式 */
.metrics-detail {
  max-height: 60vh;
  overflow-y: auto;
}

.metrics-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.metrics-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  border-bottom: 2px solid #409eff;
  padding-bottom: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background-color: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
  transition: all 0.2s;
}

.metric-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.1);
}

.metric-item.highlight {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}

.metric-item.highlight .metric-label,
.metric-item.highlight .metric-value {
  color: #fff;
}

.metric-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.metric-value {
  font-size: 14px;
  color: #303133;
  font-weight: 600;
  text-align: right;
}

.metric-label .el-icon {
  font-size: 14px;
  cursor: help;
}
</style>
