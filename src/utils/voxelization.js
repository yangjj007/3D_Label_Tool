/**
 * @file 体素化算法模块
 * @description 将3D模型转换为体素网格，用于计算复杂度指标
 * 参考 ShapeLLM-Omni 的体素化实现
 */

import * as THREE from 'three';

/**
 * 体素化3D模型
 * @param {THREE.Object3D} model - Three.js模型对象
 * @param {number} resolution - 体素分辨率 (默认64，表示64x64x64网格)
 * @returns {Object} 体素化结果
 * @returns {Set<string>} occupiedVoxels - 被占用的体素集合 (格式: "x,y,z")
 * @returns {Set<string>} surfaceVoxels - 表面体素集合
 * @returns {number} occupiedCount - 被占用体素数量
 * @returns {number} surfaceCount - 表面体素数量
 * @returns {Object} boundingBox - 模型包围盒
 */
export function voxelizeModel(model, resolution = 64) {
  console.log(`[Voxelization] 开始体素化，分辨率: ${resolution}`);
  
  // 1. 收集所有几何体和顶点
  const geometries = [];
  const matrices = [];
  
  model.traverse((child) => {
    if (child.isMesh && child.geometry) {
      geometries.push(child.geometry);
      matrices.push(child.matrixWorld);
    }
  });
  
  if (geometries.length === 0) {
    console.warn('[Voxelization] 未找到任何几何体');
    return {
      occupiedVoxels: new Set(),
      surfaceVoxels: new Set(),
      occupiedCount: 0,
      surfaceCount: 0,
      boundingBox: null
    };
  }
  
  console.log(`[Voxelization] 找到 ${geometries.length} 个几何体`);
  
  // 2. 计算整体包围盒
  const boundingBox = new THREE.Box3();
  geometries.forEach((geometry, index) => {
    const box = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position
    );
    box.applyMatrix4(matrices[index]);
    boundingBox.union(box);
  });
  
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  console.log(`[Voxelization] 包围盒大小: ${size.x.toFixed(3)}, ${size.y.toFixed(3)}, ${size.z.toFixed(3)}`);
  
  // 3. 归一化到 [-0.5, 0.5] 空间（与ShapeLLM一致）
  const maxDimension = Math.max(size.x, size.y, size.z);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  
  // 体素大小 = 1.0 / resolution (归一化空间是1.0)
  const voxelSize = 1.0 / resolution;
  
  // 4. 对每个几何体进行体素化
  const occupiedVoxels = new Set();
  
  geometries.forEach((geometry, geoIndex) => {
    const positionAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    
    if (!positionAttr) return;
    
    const matrix = matrices[geoIndex];
    const vertexCount = positionAttr.count;
    
    // 处理索引（三角形面片）
    if (indexAttr) {
      const triangleCount = indexAttr.count / 3;
      
      for (let i = 0; i < triangleCount; i++) {
        const i0 = indexAttr.getX(i * 3);
        const i1 = indexAttr.getX(i * 3 + 1);
        const i2 = indexAttr.getX(i * 3 + 2);
        
        const v0 = new THREE.Vector3(
          positionAttr.getX(i0),
          positionAttr.getY(i0),
          positionAttr.getZ(i0)
        ).applyMatrix4(matrix);
        
        const v1 = new THREE.Vector3(
          positionAttr.getX(i1),
          positionAttr.getY(i1),
          positionAttr.getZ(i1)
        ).applyMatrix4(matrix);
        
        const v2 = new THREE.Vector3(
          positionAttr.getX(i2),
          positionAttr.getY(i2),
          positionAttr.getZ(i2)
        ).applyMatrix4(matrix);
        
        // 体素化三角形
        voxelizeTriangle(v0, v1, v2, center, maxDimension, resolution, voxelSize, occupiedVoxels);
      }
    } else {
      // 无索引几何体，按顺序处理三角形
      const triangleCount = Math.floor(vertexCount / 3);
      
      for (let i = 0; i < triangleCount; i++) {
        const v0 = new THREE.Vector3(
          positionAttr.getX(i * 3),
          positionAttr.getY(i * 3),
          positionAttr.getZ(i * 3)
        ).applyMatrix4(matrix);
        
        const v1 = new THREE.Vector3(
          positionAttr.getX(i * 3 + 1),
          positionAttr.getY(i * 3 + 1),
          positionAttr.getZ(i * 3 + 1)
        ).applyMatrix4(matrix);
        
        const v2 = new THREE.Vector3(
          positionAttr.getX(i * 3 + 2),
          positionAttr.getY(i * 3 + 2),
          positionAttr.getZ(i * 3 + 2)
        ).applyMatrix4(matrix);
        
        voxelizeTriangle(v0, v1, v2, center, maxDimension, resolution, voxelSize, occupiedVoxels);
      }
    }
  });
  
  console.log(`[Voxelization] 被占用体素数: ${occupiedVoxels.size}`);
  
  // 5. 识别表面体素
  const surfaceVoxels = identifySurfaceVoxels(occupiedVoxels, resolution);
  console.log(`[Voxelization] 表面体素数: ${surfaceVoxels.size}`);
  
  return {
    occupiedVoxels,
    surfaceVoxels,
    occupiedCount: occupiedVoxels.size,
    surfaceCount: surfaceVoxels.size,
    boundingBox: {
      min: boundingBox.min.toArray(),
      max: boundingBox.max.toArray(),
      center: center.toArray(),
      size: size.toArray()
    }
  };
}

/**
 * 体素化单个三角形
 * 使用保守体素化方法：三角形与体素有任何重叠都标记为占用
 */
function voxelizeTriangle(v0, v1, v2, center, maxDimension, resolution, voxelSize, occupiedVoxels) {
  // 归一化顶点到 [-0.5, 0.5] 空间
  const nv0 = normalizeVertex(v0, center, maxDimension);
  const nv1 = normalizeVertex(v1, center, maxDimension);
  const nv2 = normalizeVertex(v2, center, maxDimension);
  
  // 计算三角形包围盒
  const minX = Math.min(nv0.x, nv1.x, nv2.x);
  const minY = Math.min(nv0.y, nv1.y, nv2.y);
  const minZ = Math.min(nv0.z, nv1.z, nv2.z);
  const maxX = Math.max(nv0.x, nv1.x, nv2.x);
  const maxY = Math.max(nv0.y, nv1.y, nv2.y);
  const maxZ = Math.max(nv0.z, nv1.z, nv2.z);
  
  // 转换为体素索引范围
  const minVoxelX = Math.max(0, Math.floor((minX + 0.5) * resolution));
  const minVoxelY = Math.max(0, Math.floor((minY + 0.5) * resolution));
  const minVoxelZ = Math.max(0, Math.floor((minZ + 0.5) * resolution));
  const maxVoxelX = Math.min(resolution - 1, Math.floor((maxX + 0.5) * resolution));
  const maxVoxelY = Math.min(resolution - 1, Math.floor((maxY + 0.5) * resolution));
  const maxVoxelZ = Math.min(resolution - 1, Math.floor((maxZ + 0.5) * resolution));
  
  // 遍历三角形包围盒内的所有体素
  for (let x = minVoxelX; x <= maxVoxelX; x++) {
    for (let y = minVoxelY; y <= maxVoxelY; y++) {
      for (let z = minVoxelZ; z <= maxVoxelZ; z++) {
        // 体素中心点（归一化空间）
        const voxelCenter = new THREE.Vector3(
          (x + 0.5) / resolution - 0.5,
          (y + 0.5) / resolution - 0.5,
          (z + 0.5) / resolution - 0.5
        );
        
        // 检查三角形是否与体素相交
        if (triangleIntersectsVoxel(nv0, nv1, nv2, voxelCenter, voxelSize)) {
          occupiedVoxels.add(`${x},${y},${z}`);
        }
      }
    }
  }
}

/**
 * 归一化顶点到 [-0.5, 0.5] 空间
 */
function normalizeVertex(vertex, center, maxDimension) {
  return new THREE.Vector3(
    (vertex.x - center.x) / maxDimension,
    (vertex.y - center.y) / maxDimension,
    (vertex.z - center.z) / maxDimension
  );
}

/**
 * 检查三角形是否与体素相交
 * 使用简化的相交测试：检查三角形是否与体素包围盒重叠
 */
function triangleIntersectsVoxel(v0, v1, v2, voxelCenter, voxelSize) {
  const halfSize = voxelSize / 2;
  
  // 体素包围盒
  const voxelMin = new THREE.Vector3(
    voxelCenter.x - halfSize,
    voxelCenter.y - halfSize,
    voxelCenter.z - halfSize
  );
  const voxelMax = new THREE.Vector3(
    voxelCenter.x + halfSize,
    voxelCenter.y + halfSize,
    voxelCenter.z + halfSize
  );
  
  // 快速检查：三角形顶点是否在体素内
  if (pointInBox(v0, voxelMin, voxelMax) ||
      pointInBox(v1, voxelMin, voxelMax) ||
      pointInBox(v2, voxelMin, voxelMax)) {
    return true;
  }
  
  // 检查三角形平面是否与体素相交
  // 使用分离轴定理 (SAT)
  const triangle = new THREE.Triangle(v0, v1, v2);
  const voxelBox = new THREE.Box3(voxelMin, voxelMax);
  
  // 简化判断：检查三角形包围盒是否与体素包围盒重叠
  const triangleBox = new THREE.Box3().setFromPoints([v0, v1, v2]);
  return voxelBox.intersectsBox(triangleBox);
}

/**
 * 检查点是否在包围盒内
 */
function pointInBox(point, boxMin, boxMax) {
  return point.x >= boxMin.x && point.x <= boxMax.x &&
         point.y >= boxMin.y && point.y <= boxMax.y &&
         point.z >= boxMin.z && point.z <= boxMax.z;
}

/**
 * 识别表面体素
 * 表面体素定义：至少有一个相邻体素是空的
 * @param {Set<string>} occupiedVoxels - 被占用体素集合
 * @param {number} resolution - 体素分辨率
 * @returns {Set<string>} 表面体素集合
 */
function identifySurfaceVoxels(occupiedVoxels, resolution) {
  const surfaceVoxels = new Set();
  
  // 6个方向的邻居偏移
  const neighbors = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ];
  
  for (const voxelKey of occupiedVoxels) {
    const [x, y, z] = voxelKey.split(',').map(Number);
    
    // 检查是否在边界上
    if (x === 0 || x === resolution - 1 ||
        y === 0 || y === resolution - 1 ||
        z === 0 || z === resolution - 1) {
      surfaceVoxels.add(voxelKey);
      continue;
    }
    
    // 检查6个邻居
    let hasEmptyNeighbor = false;
    for (const [dx, dy, dz] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      
      // 检查邻居是否在范围内且为空
      if (nx >= 0 && nx < resolution &&
          ny >= 0 && ny < resolution &&
          nz >= 0 && nz < resolution) {
        const neighborKey = `${nx},${ny},${nz}`;
        if (!occupiedVoxels.has(neighborKey)) {
          hasEmptyNeighbor = true;
          break;
        }
      }
    }
    
    if (hasEmptyNeighbor) {
      surfaceVoxels.add(voxelKey);
    }
  }
  
  return surfaceVoxels;
}

/**
 * 统计模型的顶点和面片数
 * @param {THREE.Object3D} model - Three.js模型对象
 * @returns {Object} 统计结果
 */
export function getModelGeometryStats(model) {
  let totalVertices = 0;
  let totalFaces = 0;
  let meshCount = 0;
  
  model.traverse((child) => {
    if (child.isMesh && child.geometry) {
      meshCount++;
      const geometry = child.geometry;
      
      if (geometry.attributes.position) {
        totalVertices += geometry.attributes.position.count;
      }
      
      if (geometry.index) {
        totalFaces += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        totalFaces += geometry.attributes.position.count / 3;
      }
    }
  });
  
  return {
    vertexCount: totalVertices,
    faceCount: Math.floor(totalFaces),
    meshCount
  };
}

/**
 * 统计材质数量
 * @param {THREE.Object3D} model - Three.js模型对象
 * @returns {number} 材质数量
 */
export function getMaterialCount(model) {
  const materials = new Set();
  
  model.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(mat => {
          if (mat && mat.uuid) {
            materials.add(mat.uuid);
          }
        });
      } else if (child.material.uuid) {
        materials.add(child.material.uuid);
      }
    }
  });
  
  return materials.size;
}

