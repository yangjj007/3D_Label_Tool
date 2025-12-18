/**
 * @file 过滤服务模块
 * @description 管理模型过滤的主要业务逻辑，包括指标计算和过滤判断
 */

import axios from 'axios';
import {
  loadModelFromBlob,
  computeComplexityMetrics,
  analyzeMetricsStatus,
  mergeMetrics,
  checkFilterCriteria,
  disposeModel
} from './modelComplexity.js';
import { downloadModelFromServer } from './serverApi.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * 模型过滤服务类
 */
class ModelFilterService {
  constructor() {
    this.isRunning = false;
    this.currentTask = null;
    this.abortController = null;
  }

  /**
   * 分页获取所有labeled_files
   * @private
   * @returns {Promise<Array>} 所有已打标文件
   */
  async getAllLabeledFiles() {
    let allFiles = [];
    let page = 1;
    const pageSize = 1000;
    
    console.log('[FilterService] 开始分页获取所有labeled_files...');
    
    while (true) {
      const response = await axios.get(`${API_BASE_URL}/files`, {
        params: { type: 'labeled', page, pageSize }
      });
      
      const files = response.data.files || [];
      allFiles = allFiles.concat(files);
      
      console.log(`[FilterService] 第${page}页: 获取${files.length}个文件, 累计${allFiles.length}个`);
      
      // 如果返回的文件数少于pageSize，说明已经是最后一页
      if (files.length < pageSize) {
        break;
      }
      
      page++;
    }
    
    console.log(`[FilterService] 分页获取完成，共${allFiles.length}个已打标文件`);
    return allFiles;
  }

  /**
   * 批量计算模型指标
   * @param {Object} config - 配置
   * @param {number} config.voxelResolution - 体素分辨率
   * @param {Array<string>} config.metricsToCompute - 需要计算的指标
   * @param {number} config.concurrency - 并发数
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 计算结果统计
   */
  async computeMetricsForAllModels(config, onProgress) {
    console.log('[FilterService] 开始批量计算指标');
    this.isRunning = true;
    this.abortController = new AbortController();
    
    const {
      voxelResolution = 64,
      metricsToCompute = ['VVD', 'VFC', 'VSC'],
      concurrency = 3
    } = config;
    
    try {
      // 1. 获取labeled_files列表（分页获取所有文件）
      const files = await this.getAllLabeledFiles();
      console.log(`[FilterService] 获取到 ${files.length} 个已打标文件`);
      
      if (files.length === 0) {
        return {
          total: 0,
          computed: 0,
          skipped: 0,
          failed: 0,
          results: []
        };
      }
      
      // 2. 分析每个文件的指标状态
      const tasks = [];
      for (const file of files) {
        const metadataStatus = analyzeMetricsStatus(
          file,
          metricsToCompute,
          voxelResolution
        );
        
        tasks.push({
          file,
          metadataStatus,
          needsCompute: metadataStatus.needsCompute
        });
      }
      
      const needsComputeCount = tasks.filter(t => t.needsCompute).length;
      console.log(`[FilterService] 需要计算: ${needsComputeCount}/${files.length} 个文件`);
      
      // 3. 按批次处理
      const results = {
        total: files.length,
        computed: 0,
        skipped: 0,
        failed: 0,
        details: []
      };
      
      let processed = 0;
      const startTime = Date.now();
      
      // 处理每个文件（控制并发）
      for (let i = 0; i < tasks.length; i += concurrency) {
        if (this.abortController.signal.aborted) {
          console.log('[FilterService] 任务被中止');
          break;
        }
        
        const batch = tasks.slice(i, i + concurrency);
        const batchPromises = batch.map(task => 
          this.computeMetricsForSingleModel(task, voxelResolution, metricsToCompute)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // 统计结果
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const task = batch[j];
          
          if (result.status === 'fulfilled') {
            const { computed, skipped } = result.value;
            if (computed) {
              results.computed++;
            } else if (skipped) {
              results.skipped++;
            }
            results.details.push(result.value);
          } else {
            results.failed++;
            results.details.push({
              fileName: task.file.name,
              error: result.reason?.message || '未知错误',
              computed: false,
              skipped: false
            });
          }
          
          processed++;
          
          // 计算进度和预计时间
          const progress = {
            total: files.length,
            processed,
            computed: results.computed,
            skipped: results.skipped,
            failed: results.failed,
            percentage: Math.round((processed / files.length) * 100)
          };
          
          // 估算剩余时间
          if (processed > 0) {
            const elapsed = Date.now() - startTime;
            const avgTimePerFile = elapsed / processed;
            const remaining = files.length - processed;
            progress.estimatedTimeRemaining = Math.round(avgTimePerFile * remaining / 1000); // 秒
          }
          
          if (onProgress) {
            onProgress(progress);
          }
        }
        
        // 每处理10批后，添加短暂延迟让浏览器有机会进行垃圾回收
        if (i > 0 && (i / concurrency) % 10 === 0) {
          console.log(`[FilterService] 已处理 ${processed}/${files.length} 个文件，短暂暂停以释放内存...`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[FilterService] 计算完成，总耗时: ${totalTime}秒`);
      console.log(`[FilterService] 统计: 总数=${results.total}, 计算=${results.computed}, 跳过=${results.skipped}, 失败=${results.failed}`);
      
      return results;
      
    } catch (error) {
      console.error('[FilterService] 批量计算失败:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * 为单个模型计算指标
   * @private
   */
  async computeMetricsForSingleModel(task, voxelResolution, metricsToCompute) {
    const { file, metadataStatus } = task;
    const fileName = file.name;
    
    console.log(`[FilterService] 处理文件: ${fileName}`);
    
    // 如果不需要计算，跳过
    if (!metadataStatus.needsCompute) {
      console.log(`[FilterService] 跳过 ${fileName}: 指标已存在`);
      return {
        fileName,
        computed: false,
        skipped: true,
        reason: 'metrics_already_exist'
      };
    }
    
    let model = null;
    let blob = null;
    
    try {
      // 1. 下载模型文件
      console.log(`[FilterService] 下载模型: ${fileName}`);
      const downloadResult = await downloadModelFromServer(file.id, { name: fileName });
      blob = downloadResult.blob;
      
      // 2. 加载模型
      console.log(`[FilterService] 加载模型: ${fileName}`);
      model = await loadModelFromBlob(blob, fileName);
      
      // 3. 计算指标
      console.log(`[FilterService] 计算指标: ${fileName}`);
      const metrics = computeComplexityMetrics(model, {
        voxelResolution,
        metricsToCompute
      });
      
      // 4. 保存到服务器JSON
      console.log(`[FilterService] 保存指标: ${fileName}`);
      const updatedMetadata = mergeMetrics(file, metrics);
      
      await axios.post(`${API_BASE_URL}/update-metadata`, {
        fileId: file.id,
        metadata: updatedMetadata,
        fileType: 'labeled'
      });
      
      console.log(`[FilterService] ✓ 完成: ${fileName}`);
      
      return {
        fileName,
        computed: true,
        skipped: false,
        metrics
      };
      
    } catch (error) {
      console.error(`[FilterService] ✗ 失败: ${fileName}`, error);
      throw new Error(`计算${fileName}失败: ${error.message}`);
    } finally {
      // 彻底清理模型资源
      if (model) {
        disposeModel(model);
        model = null;
      }
      // 清除blob引用
      blob = null;
    }
  }

  /**
   * 批量过滤模型并复制到filtered_files
   * @param {Object} filterConfig - 过滤配置
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 过滤结果统计
   */
  async filterModels(filterConfig, onProgress) {
    console.log('[FilterService] 开始批量过滤');
    console.log('[FilterService] 过滤配置:', filterConfig);
    
    this.isRunning = true;
    this.abortController = new AbortController();
    
    try {
      // 1. 获取labeled_files列表（分页获取所有文件）
      const files = await this.getAllLabeledFiles();
      console.log(`[FilterService] 获取到 ${files.length} 个已打标文件`);
      
      if (files.length === 0) {
        return {
          total: 0,
          passed: 0,
          failed: 0,
          results: []
        };
      }
      
      // 2. 检查每个文件是否符合过滤条件
      const results = {
        total: files.length,
        passed: 0,
        failed: 0,
        missingMetrics: 0,
        details: []
      };
      
      let processed = 0;
      const startTime = Date.now();
      
      for (const file of files) {
        if (this.abortController.signal.aborted) {
          console.log('[FilterService] 过滤任务被中止');
          break;
        }
        
        const fileName = file.name;
        console.log(`[FilterService] 检查文件: ${fileName}`);
        
        // 检查是否有必要的指标数据
        if (!file.filterMetrics) {
          console.log(`[FilterService] ✗ ${fileName}: 缺少指标数据`);
          results.missingMetrics++;
          results.details.push({
            fileName,
            passed: false,
            reason: 'missing_metrics'
          });
          processed++;
          continue;
        }
        
        // 检查过滤条件
        const checkResult = checkFilterCriteria(file, filterConfig);
        
        if (checkResult.passed) {
          console.log(`[FilterService] ✓ ${fileName}: 通过过滤`);
          
          // 复制到filtered_files
          try {
            await axios.post(`${API_BASE_URL}/copy-to-filtered`, {
              fileId: file.id,
              sourceType: 'labeled'
            });
            
            results.passed++;
            results.details.push({
              fileName,
              passed: true,
              metrics: file.filterMetrics
            });
          } catch (error) {
            console.error(`[FilterService] ✗ ${fileName}: 复制失败`, error);
            results.failed++;
            results.details.push({
              fileName,
              passed: false,
              reason: 'copy_failed',
              error: error.message
            });
          }
        } else {
          console.log(`[FilterService] ✗ ${fileName}: 未通过过滤 - ${checkResult.failures.join(', ')}`);
          results.failed++;
          results.details.push({
            fileName,
            passed: false,
            reason: 'criteria_not_met',
            failures: checkResult.failures,
            details: checkResult.details
          });
        }
        
        processed++;
        
        // 更新进度
        const progress = {
          total: files.length,
          processed,
          passed: results.passed,
          failed: results.failed,
          missingMetrics: results.missingMetrics,
          percentage: Math.round((processed / files.length) * 100)
        };
        
        if (processed > 0) {
          const elapsed = Date.now() - startTime;
          const avgTimePerFile = elapsed / processed;
          const remaining = files.length - processed;
          progress.estimatedTimeRemaining = Math.round(avgTimePerFile * remaining / 1000);
        }
        
        if (onProgress) {
          onProgress(progress);
        }
      }
      
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`[FilterService] 过滤完成，总耗时: ${totalTime}秒`);
      console.log(`[FilterService] 统计: 总数=${results.total}, 通过=${results.passed}, 失败=${results.failed}, 缺少指标=${results.missingMetrics}`);
      
      return results;
      
    } catch (error) {
      console.error('[FilterService] 批量过滤失败:', error);
      throw error;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * 统计已有指标数据
   * @returns {Promise<Object>} 统计结果
   */
  async getMetricsStatistics() {
    console.log('[FilterService] 开始统计指标数据');
    
    try {
      // 获取labeled_files列表（分页获取所有文件）
      const files = await this.getAllLabeledFiles();
      console.log(`[FilterService] 获取到 ${files.length} 个已打标文件`);
      
      // 收集所有指标数据
      const allMetrics = {
        materialCount: [],
        VVD: [],
        VFC: [],
        VSC: [],
        vertexCount: [],
        faceCount: [],
        occupiedVoxels: []
      };
      
      let filesWithMetrics = 0;
      
      for (const file of files) {
        if (file.filterMetrics) {
          filesWithMetrics++;
          const fm = file.filterMetrics;
          
          if (fm.materialCount !== undefined) allMetrics.materialCount.push(fm.materialCount);
          if (fm.VVD !== undefined) allMetrics.VVD.push(fm.VVD);
          if (fm.VFC !== undefined) allMetrics.VFC.push(fm.VFC);
          if (fm.VSC !== undefined) allMetrics.VSC.push(fm.VSC);
          if (fm.vertexCount !== undefined) allMetrics.vertexCount.push(fm.vertexCount);
          if (fm.faceCount !== undefined) allMetrics.faceCount.push(fm.faceCount);
          if (fm.occupiedVoxels !== undefined) allMetrics.occupiedVoxels.push(fm.occupiedVoxels);
        }
      }
      
      // 计算统计量
      const statistics = {};
      
      for (const [key, values] of Object.entries(allMetrics)) {
        if (values.length > 0) {
          const sorted = [...values].sort((a, b) => a - b);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);
          
          statistics[key] = {
            count: values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean,
            stdDev,
            median: sorted[Math.floor(sorted.length / 2)],
            q25: sorted[Math.floor(sorted.length * 0.25)],
            q75: sorted[Math.floor(sorted.length * 0.75)],
            values: sorted // 用于绘图
          };
        }
      }
      
      console.log(`[FilterService] 统计完成: ${filesWithMetrics}/${files.length} 个文件有指标数据`);
      
      return {
        totalFiles: files.length,
        filesWithMetrics,
        statistics
      };
      
    } catch (error) {
      console.error('[FilterService] 统计失败:', error);
      throw error;
    }
  }

  /**
   * 中止当前任务
   */
  abort() {
    if (this.abortController) {
      console.log('[FilterService] 中止任务');
      this.abortController.abort();
    }
  }
}

// 导出单例
export default new ModelFilterService();

