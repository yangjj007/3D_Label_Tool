<template>
  <div class="file-list">
    <div class="file-list-header">
      <!-- 修改1：添加 flex 布局容器 -->
      <div class="header-container">
        <div class="header-title">
          <!-- 修改2：添加标题截断处理 -->
          <h3 class="title-text">模型文件列表</h3>
        </div>
        <div class="header-actions">
          <el-button @click="triggerBatchDownload">批量下载</el-button>
          <el-button type="danger" @click="triggerBatchDelete">批量删除</el-button>
          <el-button type="primary" @click="triggerBatchUpload">批量上传</el-button>
          <el-button type="warning" @click="showBatchTagDialog = true">批量打标</el-button>
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

    <el-scrollbar max-height="calc(100vh - 180px)">
      <div class="file-items">
        <div
          v-for="file in files"
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
            <el-button size="small" type="danger" icon="Delete" circle @click.stop="emitDeleteFile(file)" />
            <div @click.stop>
              <el-dropdown @command="command => handleCommand(command, file)" trigger="click">
                <el-button size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">重命名</el-dropdown-item>
                    <el-dropdown-item command="export">导出</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
        <div v-if="!files.length" class="empty-state">
          暂无文件，先上传一个模型吧
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, computed } from "vue";

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  selectedFileId: {
    type: String,
    default: ""
  },
  // 接收父组件传入的批量处理状态
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

const emit = defineEmits(["select", "delete", "view-labels", "generate-labels", "batch-upload", "batch-download", "batch-delete", "batch-tag"]);

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

const toggleViewSelection = (viewKey) => {
  const index = selectedViewKeys.value.indexOf(viewKey);
  if (index > -1) {
    selectedViewKeys.value = selectedViewKeys.value.filter(key => key !== viewKey);
  } else {
    selectedViewKeys.value = [...selectedViewKeys.value, viewKey];
  }
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
  // 只根据 labels 数组或 hasLabels 标记判断是否已打标
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

const onSelectFile = file => emit("select", file);
const emitViewLabels = file => emit("view-labels", file);
const emitGenerateLabels = file => emit("generate-labels", file);
const triggerBatchUpload = () => emit("batch-upload");
const triggerBatchDownload = () => emit("batch-download");
const triggerBatchDelete = () => emit("batch-delete");
const emitDeleteFile = file => emit("delete", file);

const handleCommand = (command, file) => {
  if (command === "delete") {
    emit("delete", file);
  } else if (command === "rename") {
    emit("rename", file);
  } else if (command === "export") {
    emit("export", file);
  }
};

const truncateFileName = (name, frontChars = 4, backChars = 8) => {
  if (!name || name.length <= frontChars + backChars + 4) {
    return name;
  }
  return `${name.slice(0, frontChars)}......${name.slice(name.length - backChars)}`;
};
</script>

<script>
import { ElMessage } from "element-plus";
</script>

<style scoped>
.file-list {
  width: 100%;
  background-color: #10141d;
  /* border-right: 1px solid #1e2230; */
  padding: 16px;
  box-sizing: border-box;
  color: #c6cbd8;
}
.file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.file-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-item {
  padding: 10px;
  border-radius: 6px;
  background-color: #151a25;
  border: 1px solid transparent;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
}
.file-item.active {
  border-color: #18c174;
}
.file-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  word-break: break-all;
}
.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.file-size {
  color: #8c94a7;
}
.file-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-left: 16px;
}
.file-labels {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.label-tag {
  margin: 0;
}
.more-labels {
  font-size: 12px;
  color: #8c94a7;
}
.empty-state {
  text-align: center;
  margin-top: 40px;
  color: #6f7380;
  font-size: 12px;
}
.file-list-header {
  margin-bottom: 14px; /* 整体底部留白 */
}

.header-container {
  display: flex;
  flex-direction: column;
  gap: 10px; /* 标题与按钮间距 */
}

.batch-tag-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-item .label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.view-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.config-tip {
  padding: 8px 12px;
  background-color: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 4px;
  color: #e6a23c;
  font-size: 12px;
  line-height: 1.5;
}

.batch-progress-area {
  padding: 12px 16px;
  background-color: #151a25;
  border-bottom: 1px solid #1e2230;
  margin-bottom: 8px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: #c6cbd8;
}

</style>

