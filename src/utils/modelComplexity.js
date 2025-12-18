/**
 * @file 模型复杂度计算模块
 * @description 计算3D模型的复杂度指标，支持断点续传
 */

import { voxelizeModel, getModelGeometryStats, getMaterialCount } from './voxelization.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

/**
 * 从Blob加载3D模型
 * @param {Blob} blob - 模型文件Blob
 * @param {string} fileName - 文件名
 * @returns {Promise<THREE.Object3D>} 加载的模型
 */
export async function loadModelFromBlob(blob, fileName) {
  const fileExt = fileName.split('.').pop().toLowerCase();
  const objectURL = URL.createObjectURL(blob);
  
  try {
    let loader;
    
    switch (fileExt) {
      case 'glb':
      case 'gltf':
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        dracoLoader.preload();
        
        loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        
        return new Promise((resolve, reject) => {
          loader.load(
            objectURL,
            (gltf) => {
              URL.revokeObjectURL(objectURL);
              resolve(gltf.scene);
            },
            undefined,
            (error) => {
              URL.revokeObjectURL(objectURL);
              reject(error);
            }
          );
        });
        
      case 'fbx':
        loader = new FBXLoader();
        return new Promise((resolve, reject) => {
          loader.load(objectURL, resolve, undefined, reject);
        }).finally(() => URL.revokeObjectURL(objectURL));
        
      case 'obj':
        loader = new OBJLoader();
        return new Promise((resolve, reject) => {
          loader.load(objectURL, resolve, undefined, reject);
        }).finally(() => URL.revokeObjectURL(objectURL));
        
      case 'stl':
        loader = new STLLoader();
        return new Promise((resolve, reject) => {
          loader.load(
            objectURL,
            (geometry) => {
              URL.revokeObjectURL(objectURL);
              const material = new THREE.MeshStandardMaterial();
              const mesh = new THREE.Mesh(geometry, material);
              resolve(mesh);
            },
            undefined,
            (error) => {
              URL.revokeObjectURL(objectURL);
              reject(error);
            }
          );
        });
        
      default:
        URL.revokeObjectURL(objectURL);
        throw new Error(`不支持的文件格式: ${fileExt}`);
    }
  } catch (error) {
    URL.revokeObjectURL(objectURL);
    throw error;
  }
}

/**
 * 计算模型的所有复杂度指标
 * @param {THREE.Object3D} model - Three.js模型对象
 * @param {Object} options - 配置选项
 * @param {number} options.voxelResolution - 体素分辨率
 * @param {Array<string>} options.metricsToCompute - 需要计算的指标列表 ['VVD', 'VFC', 'VSC']
 * @returns {Object} 复杂度指标结果
 */
export function computeComplexityMetrics(model, options = {}) {
  const {
    voxelResolution = 64,
    metricsToCompute = ['VVD', 'VFC', 'VSC']
  } = options;
  
  console.log(`[ComplexityMetrics] 开始计算复杂度指标: ${metricsToCompute.join(', ')}`);
  const startTime = Date.now();
  
  // 1. 统计材质数量
  const materialCount = getMaterialCount(model);
  console.log(`[ComplexityMetrics] 材质数量: ${materialCount}`);
  
  // 2. 统计几何数据
  const geometryStats = getModelGeometryStats(model);
  console.log(`[ComplexityMetrics] 顶点数: ${geometryStats.vertexCount}, 面片数: ${geometryStats.faceCount}`);
  
  // 3. 体素化模型
  const voxelData = voxelizeModel(model, voxelResolution);
  const occupiedVoxels = voxelData.occupiedCount;
  const surfaceVoxels = voxelData.surfaceCount;
  
  if (occupiedVoxels === 0) {
    console.warn('[ComplexityMetrics] 警告: 体素化结果为空');
    return {
      materialCount,
      voxelResolution,
      vertexCount: geometryStats.vertexCount,
      faceCount: geometryStats.faceCount,
      occupiedVoxels: 0,
      surfaceVoxels: 0,
      VVD: null,
      VFC: null,
      VSC: null,
      computedAt: new Date().toISOString(),
      error: 'voxelization_failed'
    };
  }
  
  // 4. 计算各项指标
  const metrics = {
    materialCount,
    voxelResolution,
    vertexCount: geometryStats.vertexCount,
    faceCount: geometryStats.faceCount,
    meshCount: geometryStats.meshCount,
    occupiedVoxels,
    surfaceVoxels,
    computedAt: new Date().toISOString()
  };
  
  // VVD - 体素化顶点密度
  if (metricsToCompute.includes('VVD')) {
    metrics.VVD = geometryStats.vertexCount / occupiedVoxels;
    console.log(`[ComplexityMetrics] VVD: ${metrics.VVD.toFixed(4)}`);
  }
  
  // VFC - 体素化面片复杂度
  if (metricsToCompute.includes('VFC')) {
    metrics.VFC = geometryStats.faceCount / occupiedVoxels;
    console.log(`[ComplexityMetrics] VFC: ${metrics.VFC.toFixed(4)}`);
  }
  
  // VSC - 体素表面复杂度
  if (metricsToCompute.includes('VSC')) {
    metrics.VSC = surfaceVoxels / occupiedVoxels;
    console.log(`[ComplexityMetrics] VSC: ${metrics.VSC.toFixed(4)}`);
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`[ComplexityMetrics] 计算完成，耗时: ${elapsed}ms`);
  
  return metrics;
}

/**
 * 检查元数据中哪些指标需要重新计算
 * @param {Object} existingMetrics - 现有的指标数据
 * @param {Array<string>} requiredMetrics - 需要的指标列表
 * @param {number} requiredResolution - 需要的体素分辨率
 * @returns {Object} 分析结果
 */
export function analyzeMetricsStatus(existingMetrics, requiredMetrics, requiredResolution) {
  if (!existingMetrics || !existingMetrics.filterMetrics) {
    return {
      needsCompute: true,
      missingMetrics: requiredMetrics,
      resolutionMismatch: false,
      reason: 'no_existing_metrics'
    };
  }
  
  const fm = existingMetrics.filterMetrics;
  
  // 检查分辨率是否匹配
  if (fm.voxelResolution !== requiredResolution) {
    return {
      needsCompute: true,
      missingMetrics: requiredMetrics,
      resolutionMismatch: true,
      reason: 'resolution_mismatch',
      existing: fm.voxelResolution,
      required: requiredResolution
    };
  }
  
  // 检查哪些指标缺失
  const missingMetrics = [];
  const availableMetrics = [];
  
  for (const metric of requiredMetrics) {
    if (fm[metric] === undefined || fm[metric] === null) {
      missingMetrics.push(metric);
    } else {
      availableMetrics.push(metric);
    }
  }
  
  // 材质数量总是需要的
  const needsMaterialCount = fm.materialCount === undefined;
  
  return {
    needsCompute: missingMetrics.length > 0 || needsMaterialCount,
    missingMetrics,
    availableMetrics,
    needsMaterialCount,
    resolutionMismatch: false,
    reason: missingMetrics.length > 0 ? 'missing_metrics' : (needsMaterialCount ? 'missing_material_count' : 'complete')
  };
}

/**
 * 合并新旧指标数据
 * @param {Object} existingMetrics - 现有的元数据
 * @param {Object} newMetrics - 新计算的指标
 * @returns {Object} 合并后的元数据
 */
export function mergeMetrics(existingMetrics, newMetrics) {
  const merged = { ...existingMetrics };
  
  if (!merged.filterMetrics) {
    merged.filterMetrics = {};
  }
  
  // 合并所有指标
  Object.assign(merged.filterMetrics, newMetrics);
  
  // 更新时间戳
  merged.filterMetrics.lastUpdated = new Date().toISOString();
  
  return merged;
}

/**
 * 检查模型是否符合过滤条件
 * @param {Object} metrics - 模型指标
 * @param {Object} filterConfig - 过滤配置
 * @returns {Object} 检查结果
 */
export function checkFilterCriteria(metrics, filterConfig) {
  const results = {
    passed: true,
    failures: [],
    details: {}
  };
  
  const fm = metrics.filterMetrics || metrics;
  
  // 1. 材质个数过滤
  if (filterConfig.materialCount) {
    const { min, max } = filterConfig.materialCount;
    const materialCount = fm.materialCount;
    
    if (materialCount !== undefined && materialCount !== null) {
      const inRange = materialCount >= min && materialCount <= max;
      results.details.materialCount = {
        value: materialCount,
        min,
        max,
        passed: inRange
      };
      
      if (!inRange) {
        results.passed = false;
        results.failures.push(`材质数量${materialCount}不在范围[${min}, ${max}]内`);
      }
    } else {
      results.passed = false;
      results.failures.push('缺少材质数量数据');
    }
  }
  
  // 2. VVD 过滤
  if (filterConfig.VVD) {
    const { min, max } = filterConfig.VVD;
    const vvd = fm.VVD;
    
    if (vvd !== undefined && vvd !== null) {
      const inRange = vvd >= min && vvd <= max;
      results.details.VVD = {
        value: vvd,
        min,
        max,
        passed: inRange
      };
      
      if (!inRange) {
        results.passed = false;
        results.failures.push(`VVD值${vvd.toFixed(4)}不在范围[${min}, ${max}]内`);
      }
    } else {
      results.passed = false;
      results.failures.push('缺少VVD数据');
    }
  }
  
  // 3. VFC 过滤
  if (filterConfig.VFC) {
    const { min, max } = filterConfig.VFC;
    const vfc = fm.VFC;
    
    if (vfc !== undefined && vfc !== null) {
      const inRange = vfc >= min && vfc <= max;
      results.details.VFC = {
        value: vfc,
        min,
        max,
        passed: inRange
      };
      
      if (!inRange) {
        results.passed = false;
        results.failures.push(`VFC值${vfc.toFixed(4)}不在范围[${min}, ${max}]内`);
      }
    } else {
      results.passed = false;
      results.failures.push('缺少VFC数据');
    }
  }
  
  // 4. VSC 过滤
  if (filterConfig.VSC) {
    const { min, max } = filterConfig.VSC;
    const vsc = fm.VSC;
    
    if (vsc !== undefined && vsc !== null) {
      const inRange = vsc >= min && vsc <= max;
      results.details.VSC = {
        value: vsc,
        min,
        max,
        passed: inRange
      };
      
      if (!inRange) {
        results.passed = false;
        results.failures.push(`VSC值${vsc.toFixed(4)}不在范围[${min}, ${max}]内`);
      }
    } else {
      results.passed = false;
      results.failures.push('缺少VSC数据');
    }
  }
  
  return results;
}

/**
 * 清理模型资源
 * @param {THREE.Object3D} model - 要清理的模型
 */
export function disposeModel(model) {
  if (!model) return;
  
  model.traverse((child) => {
    if (child.isMesh) {
      // 清理几何体
      if (child.geometry) {
        child.geometry.dispose();
      }
      
      // 清理材质
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => {
            if (mat.map) mat.map.dispose();
            if (mat.lightMap) mat.lightMap.dispose();
            if (mat.bumpMap) mat.bumpMap.dispose();
            if (mat.normalMap) mat.normalMap.dispose();
            if (mat.specularMap) mat.specularMap.dispose();
            if (mat.envMap) mat.envMap.dispose();
            mat.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          if (child.material.lightMap) child.material.lightMap.dispose();
          if (child.material.bumpMap) child.material.bumpMap.dispose();
          if (child.material.normalMap) child.material.normalMap.dispose();
          if (child.material.specularMap) child.material.specularMap.dispose();
          if (child.material.envMap) child.material.envMap.dispose();
          child.material.dispose();
        }
      }
    }
  });
}

