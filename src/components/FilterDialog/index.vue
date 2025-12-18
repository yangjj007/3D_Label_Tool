<template>
  <el-dialog
    v-model="dialogVisible"
    title="模型过滤与统计"
    width="800px"
    :close-on-click-modal="false"
    append-to-body
  >
    <el-tabs v-model="activeTab" type="border-card">
      <!-- 指标配置选项卡 -->
      <el-tab-pane label="指标配置" name="config">
        <div class="filter-config">
          <!-- 材质个数过滤 -->
          <div class="config-section">
            <h4>材质个数过滤</h4>
            <div class="config-row">
              <span class="label">最小值:</span>
              <el-input-number v-model="filterConfig.materialCount.min" :min="1" :max="100" size="small" />
              <span class="label" style="margin-left: 20px;">最大值:</span>
              <el-input-number v-model="filterConfig.materialCount.max" :min="1" :max="100" size="small" />
            </div>
          </div>

          <!-- 复杂度指标选择 -->
          <div class="config-section">
            <h4>复杂度指标选择</h4>
            <div class="config-row">
              <span class="label">体素分辨率:</span>
              <el-input-number 
                v-model="filterConfig.voxelResolution" 
                :min="16" 
                :max="512" 
                :step="16"
                size="small" 
              />
              <span class="config-tip">（将空间分为n^3的体素格子）</span>
            </div>
            
            <div class="config-row">
              <span class="label">并发量:</span>
              <el-input-number 
                v-model="filterConfig.concurrency" 
                :min="1" 
                :max="100" 
                :step="5"
                size="small" 
              />
              <span class="config-tip">（同时计算指标的模型数量）</span>
            </div>
            
            <el-collapse class="metrics-collapse">
              <el-collapse-item title="点击查看指标说明" name="metrics-info">
                <div class="metrics-info">
                  <div class="metric-desc">
                    <strong>VVD (体素化顶点密度)</strong>
                    <p>定义: 原始顶点数 / 被占用体素数量</p>
                    <p>意义: 衡量每个体素格子内平均包含的原始顶点数。植株的VVD通常远高于枕头，因为植物表面有更多褶皱和细节。</p>
                  </div>
                  <div class="metric-desc">
                    <strong>VFC (体素化面片复杂度)</strong>
                    <p>定义: 原始面片数 / 被占用体素数量</p>
                    <p>意义: 同等占用率下，面片密度更高的模型得分更高。</p>
                  </div>
                  <div class="metric-desc">
                    <strong>VSC (体素表面复杂度)</strong>
                    <p>定义: 表面体素数量 / 被占用体素总数</p>
                    <p>意义: 反映模型的"表面积/体积"比，植物等纤细复杂模型通常接近1.0，规则的大几何体接近0。</p>
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>

            <div class="metrics-selection">
              <el-checkbox-group v-model="selectedMetrics">
                <el-checkbox label="VVD">VVD (顶点密度)</el-checkbox>
                <el-checkbox label="VFC">VFC (面片复杂度)</el-checkbox>
                <el-checkbox label="VSC">VSC (表面复杂度)</el-checkbox>
              </el-checkbox-group>
            </div>
          </div>

          <!-- 阈值配置 -->
          <div class="config-section" v-if="selectedMetrics.length > 0">
            <h4>过滤阈值配置</h4>
            <div v-for="metric in selectedMetrics" :key="metric" class="threshold-config">
              <span class="metric-label">{{ metric }}:</span>
              <span class="label">最小值</span>
              <el-input-number 
                v-model="filterConfig[metric].min" 
                :min="0" 
                :max="1000" 
                :step="0.1"
                :precision="2"
                size="small" 
              />
              <span class="label" style="margin-left: 20px;">最大值</span>
              <el-input-number 
                v-model="filterConfig[metric].max" 
                :min="0" 
                :max="1000" 
                :step="0.1"
                :precision="2"
                size="small" 
              />
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-buttons">
            <el-button 
              type="primary" 
              @click="startComputeMetrics"
              :loading="computing"
              :disabled="selectedMetrics.length === 0"
            >
              {{ computing ? '计算中...' : '开始计算指标' }}
            </el-button>
            <el-button 
              type="success" 
              @click="startFilter"
              :loading="filtering"
              :disabled="selectedMetrics.length === 0"
            >
              {{ filtering ? '过滤中...' : '开始过滤' }}
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 统计绘图选项卡 -->
      <el-tab-pane label="统计分析" name="statistics">
        <div class="statistics-panel">
          <el-button type="primary" @click="loadStatistics" :loading="loadingStats">
            加载统计数据
          </el-button>

          <div v-if="statistics" class="stats-container">
            <h4>数据概览</h4>
            <p>总文件数: {{ statistics.totalFiles }}</p>
            <p>有指标数据的文件数: {{ statistics.filesWithMetrics }}</p>

            <!-- 统计表格 -->
            <el-table :data="statisticsTableData" style="margin-top: 20px;">
              <el-table-column prop="metric" label="指标" width="120" />
              <el-table-column prop="count" label="样本数" width="80" />
              <el-table-column prop="min" label="最小值" width="100" />
              <el-table-column prop="max" label="最大值" width="100" />
              <el-table-column prop="mean" label="均值" width="100" />
              <el-table-column prop="stdDev" label="标准差" width="100" />
              <el-table-column prop="median" label="中位数" width="100" />
            </el-table>

            <!-- 密度图 -->
            <div class="density-charts">
              <h4>密度分布图</h4>
              <div 
                v-for="metricKey in Object.keys(statistics.statistics)" 
                :key="metricKey"
                class="chart-container"
              >
                <h5>{{ getMetricLabel(metricKey) }}</h5>
                <div class="chart-wrapper">
                  <canvas :ref="el => chartRefs[metricKey] = el" class="density-chart"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 进度条 -->
    <div v-if="computing || filtering" class="progress-section">
      <div class="progress-info">
        <span>{{ progressText }}</span>
        <span v-if="progressData.estimatedTimeRemaining">
          预计剩余: {{ formatTime(progressData.estimatedTimeRemaining) }}
        </span>
      </div>
      <el-progress 
        :percentage="progressData.percentage || 0" 
        :status="progressStatus"
      />
      <div class="progress-stats">
        <span v-if="computing">
          已计算: {{ progressData.computed || 0 }} | 
          已跳过: {{ progressData.skipped || 0 }} | 
          失败: {{ progressData.failed || 0 }}
        </span>
        <span v-if="filtering">
          通过: {{ progressData.passed || 0 }} | 
          未通过: {{ progressData.failed || 0 }} | 
          缺少指标: {{ progressData.missingMetrics || 0 }}
        </span>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="closeDialog">关闭</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import filterService from '@/utils/filterService';
import Chart from 'chart.js/auto';

const dialogVisible = ref(false);
const activeTab = ref('config');

// 过滤配置
const filterConfig = ref({
  materialCount: {
    min: 2,
    max: 5
  },
  voxelResolution: 64,
  concurrency: 3,
  VVD: {
    min: 0,
    max: 100
  },
  VFC: {
    min: 0,
    max: 50
  },
  VSC: {
    min: 0,
    max: 1
  }
});

const selectedMetrics = ref(['VVD', 'VFC', 'VSC']);

// 计算和过滤状态
const computing = ref(false);
const filtering = ref(false);
const progressData = ref({});
const progressText = computed(() => {
  if (computing.value) {
    return `正在计算指标... ${progressData.value.processed || 0}/${progressData.value.total || 0}`;
  }
  if (filtering.value) {
    return `正在过滤模型... ${progressData.value.processed || 0}/${progressData.value.total || 0}`;
  }
  return '';
});

const progressStatus = computed(() => {
  if (progressData.value.percentage === 100) return 'success';
  return '';
});

// 统计相关
const loadingStats = ref(false);
const statistics = ref(null);
const chartRefs = ref({});
const chartInstances = ref({});

const statisticsTableData = computed(() => {
  if (!statistics.value || !statistics.value.statistics) return [];
  
  return Object.entries(statistics.value.statistics).map(([key, stats]) => ({
    metric: getMetricLabel(key),
    count: stats.count,
    min: stats.min.toFixed(3),
    max: stats.max.toFixed(3),
    mean: stats.mean.toFixed(3),
    stdDev: stats.stdDev.toFixed(3),
    median: stats.median.toFixed(3)
  }));
});

// 开始计算指标
const startComputeMetrics = async () => {
  try {
    await ElMessageBox.confirm(
      '开始计算所有labeled_files中模型的指标数据，已有指标的文件将被跳过。是否继续？',
      '确认计算',
      {
        confirmButtonText: '开始计算',
        cancelButtonText: '取消',
        type: 'info'
      }
    );

    computing.value = true;
    progressData.value = {};

    const config = {
      voxelResolution: filterConfig.value.voxelResolution,
      metricsToCompute: selectedMetrics.value,
      concurrency: filterConfig.value.concurrency
    };

    const result = await filterService.computeMetricsForAllModels(config, (progress) => {
      progressData.value = progress;
    });

    computing.value = false;

    ElMessage.success(
      `计算完成！总数: ${result.total}, 计算: ${result.computed}, 跳过: ${result.skipped}, 失败: ${result.failed}`
    );

  } catch (error) {
    computing.value = false;
    if (error !== 'cancel') {
      console.error('计算指标失败:', error);
      ElMessage.error('计算失败: ' + (error.message || '未知错误'));
    }
  }
};

// 开始过滤
const startFilter = async () => {
  try {
    await ElMessageBox.confirm(
      '开始根据设置的阈值过滤模型，符合条件的文件将被复制到filtered_files。是否继续？',
      '确认过滤',
      {
        confirmButtonText: '开始过滤',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    filtering.value = true;
    progressData.value = {};

    // 构建过滤配置
    const config = {
      materialCount: filterConfig.value.materialCount
    };

    // 添加选中的指标阈值
    for (const metric of selectedMetrics.value) {
      config[metric] = filterConfig.value[metric];
    }

    const result = await filterService.filterModels(config, (progress) => {
      progressData.value = progress;
    });

    filtering.value = false;

    ElMessage.success(
      `过滤完成！总数: ${result.total}, 通过: ${result.passed}, 未通过: ${result.failed}, 缺少指标: ${result.missingMetrics || 0}`
    );

  } catch (error) {
    filtering.value = false;
    if (error !== 'cancel') {
      console.error('过滤失败:', error);
      ElMessage.error('过滤失败: ' + (error.message || '未知错误'));
    }
  }
};

// 加载统计数据
const loadStatistics = async () => {
  try {
    loadingStats.value = true;
    statistics.value = await filterService.getMetricsStatistics();
    
    ElMessage.success('统计数据加载成功');
    
    // 等待DOM更新后绘制图表
    await nextTick();
    drawDensityCharts();
    
  } catch (error) {
    console.error('加载统计数据失败:', error);
    ElMessage.error('加载失败: ' + (error.message || '未知错误'));
  } finally {
    loadingStats.value = false;
  }
};

// 绘制密度图
const drawDensityCharts = () => {
  if (!statistics.value || !statistics.value.statistics) return;
  
  // 清除旧图表
  Object.values(chartInstances.value).forEach(chart => {
    if (chart) chart.destroy();
  });
  chartInstances.value = {};
  
  // 绘制每个指标的密度图
  for (const [metricKey, stats] of Object.entries(statistics.value.statistics)) {
    const canvas = chartRefs.value[metricKey];
    if (!canvas) continue;
    
    const ctx = canvas.getContext('2d');
    
    // 计算直方图数据
    const bins = 50;
    const values = stats.values;
    
    const Range = stats.max - stats.min;
    // const bins = Math.round(Range * 0.05);
    const min = Math.floor(stats.min - Range * 0.1);
    const max = Math.ceil(stats.max + Range * 0.1);
    const binWidth = (max - min) / bins;
    
    const histogram = new Array(bins).fill(0);
    const binCenters = [];
    
    for (let i = 0; i < bins; i++) {
      binCenters.push(min + (i + 0.5) * binWidth);
    }
    
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      if (binIndex >= 0) {
        histogram[binIndex]++;
      }
    });
    
    // 归一化为密度(不除区间宽度)
    // const density = histogram.map(count => count / values.length / binWidth);
    const density = histogram.map(count => count / values.length);
    
    // 创建图表
    chartInstances.value[metricKey] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: binCenters.map(x => x.toFixed(2)),
        datasets: [{
          label: getMetricLabel(metricKey),
          data: density,
          borderColor: getMetricColor(metricKey),
          backgroundColor: getMetricColor(metricKey, 0.2),
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: getMetricLabel(metricKey)
            },
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            title: {
              display: true,
              text: '密度'
            },
            beginAtZero: true
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }
};

// 工具函数
const getMetricLabel = (key) => {
  const labels = {
    materialCount: '材质个数',
    VVD: 'VVD (顶点密度)',
    VFC: 'VFC (面片复杂度)',
    VSC: 'VSC (表面复杂度)',
    vertexCount: '顶点数',
    faceCount: '面片数',
    occupiedVoxels: '占用体素数'
  };
  return labels[key] || key;
};

const getMetricColor = (key, alpha = 1) => {
  const colors = {
    materialCount: `rgba(255, 99, 132, ${alpha})`,
    VVD: `rgba(54, 162, 235, ${alpha})`,
    VFC: `rgba(75, 192, 192, ${alpha})`,
    VSC: `rgba(255, 206, 86, ${alpha})`,
    vertexCount: `rgba(153, 102, 255, ${alpha})`,
    faceCount: `rgba(255, 159, 64, ${alpha})`,
    occupiedVoxels: `rgba(201, 203, 207, ${alpha})`
  };
  return colors[key] || `rgba(100, 100, 100, ${alpha})`;
};

const formatTime = (seconds) => {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}分${secs}秒`;
};

const closeDialog = () => {
  dialogVisible.value = false;
};

const openDialog = () => {
  dialogVisible.value = true;
};

// 暴露方法
defineExpose({
  openDialog
});
</script>

<style scoped>
.filter-config {
  padding: 20px;
}

.config-section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.config-section:last-child {
  border-bottom: none;
}

.config-section h4 {
  margin-bottom: 15px;
  color: #333;
  font-size: 16px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.label {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

.metric-label {
  font-weight: bold;
  min-width: 60px;
  color: #409EFF;
}

.config-tip {
  font-size: 12px;
  color: #999;
}

.metrics-collapse {
  margin: 15px 0;
}

.metrics-info {
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.metric-desc {
  margin-bottom: 15px;
}

.metric-desc:last-child {
  margin-bottom: 0;
}

.metric-desc strong {
  color: #409EFF;
  display: block;
  margin-bottom: 8px;
}

.metric-desc p {
  margin: 5px 0;
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.metrics-selection {
  margin-top: 15px;
}

.threshold-config {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.progress-section {
  margin-top: 20px;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  color: #606266;
}

.progress-stats {
  margin-top: 10px;
  font-size: 13px;
  color: #909399;
  text-align: center;
}

.statistics-panel {
  padding: 20px;
}

.stats-container {
  margin-top: 20px;
}

.stats-container h4 {
  margin: 20px 0 10px 0;
  color: #333;
  font-size: 16px;
}

.stats-container p {
  margin: 5px 0;
  color: #666;
}

.density-charts {
  margin-top: 30px;
}

.chart-container {
  margin-bottom: 30px;
  padding: 15px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 4px;
}

.chart-container h5 {
  margin-bottom: 15px;
  color: #409EFF;
  font-size: 14px;
}

.chart-wrapper {
  position: relative;
  width: 100%;
  height: 300px;
}

.density-chart {
  max-width: 100%;
  max-height: 100%;
}
</style>

