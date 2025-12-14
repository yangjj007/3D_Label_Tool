/**
 * 离屏渲染模型类
 * 
 * 用于批量打标的独立3D场景渲染器
 * 基于 OffscreenCanvas 实现真正的并行渲染
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// 相机视角预设（与主应用保持一致）
export const CAMERA_VIEW_PRESETS = {
  main: {
    label: "主视",
    position: new THREE.Vector3(0, 2, 6),
    target: new THREE.Vector3(0, 0, 0)
  },
  top: {
    label: "俯视",
    position: new THREE.Vector3(0, 10, 0.5),
    target: new THREE.Vector3(0, 0, 0)
  },
  side: {
    label: "侧视",
    position: new THREE.Vector3(8, 1, 0),
    target: new THREE.Vector3(0, 0, 0)
  },
  axial: {
    label: "轴侧",
    position: new THREE.Vector3(6, 6, 6),
    target: new THREE.Vector3(0, 0, 0)
  }
};

class OffscreenRenderModel {
  // 静态 GPU 操作信号量（所有实例共享）
  // 限制同时进行的 GPU 读回操作数量，防止 GPU 过载
  // SwiftShader 软件渲染时建议设为 4，硬件 GPU 可设为 8-16
  static gpuSemaphore = {
    max: 4, // SwiftShader 模式下更保守
    current: 0,
    queue: []
  };
  
  /**
   * 获取 GPU 操作许可
   * @returns {Promise<Function>} 返回释放函数
   */
  static async acquireGpuPermit() {
    const sem = OffscreenRenderModel.gpuSemaphore;
    
    if (sem.current < sem.max) {
      sem.current++;
      return () => OffscreenRenderModel.releaseGpuPermit();
    }
    
    // 需要等待
    return new Promise((resolve) => {
      sem.queue.push(() => {
        sem.current++;
        resolve(() => OffscreenRenderModel.releaseGpuPermit());
      });
    });
  }
  
  /**
   * 释放 GPU 操作许可
   */
  static releaseGpuPermit() {
    const sem = OffscreenRenderModel.gpuSemaphore;
    sem.current--;
    
    // 如果有等待的操作，立即分配
    if (sem.queue.length > 0) {
      const next = sem.queue.shift();
      next();
    }
  }
  
  constructor(width = 1200, height = 900, enableDebugScreenshots = false) {
    // 提高分辨率以改善渲染质量
    this.width = width;
    this.height = height;
    
    // 调试开关：是否保存截图到本地（默认关闭）
    this.enableDebugScreenshots = enableDebugScreenshots;
    
    // 核心组件
    this.canvas = null;
    this.renderer = null;
    this.gl = null; // WebGL 上下文
    this.scene = null;
    this.camera = null;
    this.model = null;
    
    // 模型材质列表
    this.modelMaterialList = [];
    
    // 后期处理
    this.effectComposer = null;
    this.outlinePass = null;
    
    // 加载器
    this.loadingManager = new THREE.LoadingManager();
    this.fileLoaderMap = {
      glb: new GLTFLoader(),
      fbx: new FBXLoader(this.loadingManager),
      gltf: new GLTFLoader(),
      obj: new OBJLoader(this.loadingManager),
      stl: new STLLoader()
    };
    
    // 语义标签缓存
    this.semanticLabels = {};
    
    // 标记是否已初始化
    this.initialized = false;
  }

  /**
   * 初始化离屏渲染器
   */
  async init() {
    try {
      // 创建 OffscreenCanvas
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('OffscreenCanvas not supported in this browser');
      }
      
      this.canvas = new OffscreenCanvas(this.width, this.height);
      
      // 创建渲染器
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true, // 启用抗锯齿以提升渲染质量
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance' // 强制使用高性能 GPU
      });
      
      // 获取 WebGL 上下文进行诊断
      this.gl = this.renderer.getContext();
      
      // 检查是否真的在使用 GPU 硬件加速
      const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = this.gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        console.log('[OffscreenRenderModel] 🎮 GPU 信息:');
        console.log(`  - 厂商: ${vendor}`);
        console.log(`  - 渲染器: ${renderer}`);
        
        // 检查是否是软件渲染
        const isSoftwareRenderer = 
          renderer.includes('SwiftShader') || 
          renderer.includes('llvmpipe') || 
          renderer.includes('Software') ||
          renderer.includes('Microsoft');
        
        if (isSoftwareRenderer) {
          console.warn('[OffscreenRenderModel] ⚠️ 警告：正在使用软件渲染，没有 GPU 加速！');
          console.warn('[OffscreenRenderModel] ⚠️ 这可能导致性能问题和 convertToBlob 失败');
        } else {
          console.log('[OffscreenRenderModel] ✅ 正在使用 GPU 硬件加速');
        }
      } else {
        console.warn('[OffscreenRenderModel] ⚠️ 无法获取 GPU 调试信息');
      }
      
      // 检查 WebGL 版本
      const glVersion = this.gl.getParameter(this.gl.VERSION);
      console.log(`[OffscreenRenderModel] WebGL 版本: ${glVersion}`);
      
      // 第三个参数 false 很重要：OffscreenCanvas 没有 style 属性
      this.renderer.setSize(this.width, this.height, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ReinhardToneMapping;
      this.renderer.toneMappingExposure = 2;
      this.renderer.shadowMap.enabled = false; // 关闭阴影以提升性能
      
      // 创建场景
      this.scene = new THREE.Scene();
      // 设置浅灰色背景，便于看清模型
      this.scene.background = new THREE.Color(0xeeeeee);
      console.log('[OffscreenRenderModel] 场景背景颜色: #eeeeee');
      
      // 创建相机
      this.camera = new THREE.PerspectiveCamera(
        45,
        this.width / this.height,
        0.25,
        2000
      );
      this.camera.position.set(0, 2, 6);
      this.camera.lookAt(0, 0, 0);
      
      // 添加光源
      this.setupLights();
      
      // 初始化后期处理（需要在场景和相机创建之后）
      this.setupPostProcessing();
      
      // 执行一次测试渲染来验证 GPU 是否工作
      console.log('[OffscreenRenderModel] 执行 GPU 测试渲染...');
      const testStart = performance.now();
      
      // 创建一个简单的测试几何体
      const testGeometry = new THREE.BoxGeometry(1, 1, 1);
      const testMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const testMesh = new THREE.Mesh(testGeometry, testMaterial);
      this.scene.add(testMesh);
      
      // 渲染几帧
      for (let i = 0; i < 10; i++) {
        this.renderer.render(this.scene, this.camera);
      }
      
      // 强制 GPU 完成
      this.gl.finish();
      
      const testEnd = performance.now();
      const testTime = testEnd - testStart;
      
      // 清理测试对象
      this.scene.remove(testMesh);
      testGeometry.dispose();
      testMaterial.dispose();
      
      console.log(`[OffscreenRenderModel] GPU 测试完成，10帧耗时: ${testTime.toFixed(2)}ms`);
      
      // 如果渲染太慢，可能是软件渲染
      if (testTime > 500) {
        console.warn('[OffscreenRenderModel] ⚠️ 渲染性能异常慢，可能使用了软件渲染！');
      } else if (testTime < 50) {
        console.log('[OffscreenRenderModel] ✅ 渲染性能良好，GPU 加速正常工作');
      }
      
      this.initialized = true;
      console.log('[OffscreenRenderModel] 初始化成功');
      
      return true;
    } catch (error) {
      console.error('[OffscreenRenderModel] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置光源
   */
  setupLights() {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    // 平行光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
    
    // 补充平行光（从另一侧）
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, 3, -5);
    this.scene.add(directionalLight2);
  }

  /**
   * 设置后期处理效果（OutlinePass 用于高亮材质）
   */
  setupPostProcessing() {
    console.log('[OffscreenRenderModel] 设置后期处理...');
    
    // 创建 EffectComposer
    this.effectComposer = new EffectComposer(this.renderer);
    
    // 添加渲染通道
    const renderPass = new RenderPass(this.scene, this.camera);
    this.effectComposer.addPass(renderPass);
    
    // 添加 OutlinePass（用于高亮选中的材质）
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(this.width, this.height),
      this.scene,
      this.camera
    );
    
    // 配置 OutlinePass（参考主应用的配置）
    this.outlinePass.visibleEdgeColor = new THREE.Color('#FFFF00'); // 黄色边框
    this.outlinePass.hiddenEdgeColor = new THREE.Color('#FFFF00'); // 黄色边框
    this.outlinePass.edgeGlow = 2.0; // 发光强度
    this.outlinePass.edgeThickness = 2.0; // 边缘浓度（加粗）
    this.outlinePass.edgeStrength = 5.0; // 边缘强度（增强）
    this.outlinePass.pulsePeriod = 0; // 不闪烁
    this.outlinePass.usePatternTexture = false;
    
    this.effectComposer.addPass(this.outlinePass);
    
    // 添加输出通道
    const outputPass = new OutputPass();
    this.effectComposer.addPass(outputPass);
    
    console.log('[OffscreenRenderModel] 后期处理设置完成');
  }

  /**
   * 从 Blob 加载模型
   * @param {Blob} fileBlob - 模型文件Blob
   * @param {String} fileName - 文件名
   */
  async loadModel(fileBlob, fileName) {
    if (!this.initialized) {
      throw new Error('Renderer not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      // 清理之前的模型
      if (this.model) {
        this.scene.remove(this.model);
        this.disposeModel(this.model);
        this.model = null;
      }

      // 获取文件类型
      const fileType = fileName.split('.').pop().toLowerCase();
      
      // 创建 URL
      const fileURL = URL.createObjectURL(fileBlob);
      
      let loader;
      
      // 根据文件类型选择加载器
      if (['glb', 'gltf'].includes(fileType)) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        dracoLoader.preload();
        loader = new GLTFLoader().setDRACOLoader(dracoLoader);
      } else {
        loader = this.fileLoaderMap[fileType];
      }

      if (!loader) {
        URL.revokeObjectURL(fileURL);
        reject(new Error(`Unsupported file type: ${fileType}`));
        return;
      }

      loader.load(
        fileURL,
        (result) => {
          URL.revokeObjectURL(fileURL);
          
          try {
            // 根据文件类型处理模型
            switch (fileType) {
              case 'glb':
              case 'gltf':
                this.model = result.scene;
                this.parseGLTFSemanticLabels(result);
                break;
              case 'fbx':
                this.model = result;
                break;
              case 'obj':
                this.model = result;
                this.parseObjSemanticLabels(result);
                break;
              case 'stl':
                const material = new THREE.MeshStandardMaterial();
                const mesh = new THREE.Mesh(result, material);
                this.model = mesh;
                break;
              default:
                throw new Error(`Unsupported file type: ${fileType}`);
            }

            // 获取材质列表
            this.extractMaterialList();
            
            // 调整模型位置和大小
            this.adjustModelTransform();
            
            // 添加到场景
            this.scene.add(this.model);
            
            console.log(`[OffscreenRenderModel] 模型加载成功: ${fileName}, 材质数: ${this.modelMaterialList.length}`);
            console.log('[OffscreenRenderModel] 场景子对象数量:', this.scene.children.length);
            console.log('[OffscreenRenderModel] 模型在场景中:', this.scene.children.includes(this.model));
            
            // 渲染一次测试
            this.render();
            console.log('[OffscreenRenderModel] 已进行首次渲染');
            
            resolve(true);
          } catch (error) {
            URL.revokeObjectURL(fileURL);
            console.error('[OffscreenRenderModel] 模型处理失败:', error);
            reject(error);
          }
        },
        undefined,
        (error) => {
          URL.revokeObjectURL(fileURL);
          console.error('[OffscreenRenderModel] 模型加载失败:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * 解析 GLTF/GLB 模型的语义标签
   */
  parseGLTFSemanticLabels(result) {
    let foundLabels = 0;
    
    // 从 parser.json 中读取 extras
    if (result.parser && result.parser.json) {
      const gltfJson = result.parser.json;
      
      const normalizeName = (name) => {
        if (!name) return '';
        return name.replace(/[_\->]/g, ' ').replace(/\s+/g, ' ').trim();
      };
      
      const nodeExtrasMap = new Map();
      if (gltfJson.nodes) {
        gltfJson.nodes.forEach((node) => {
          if (node.extras && node.extras.semanticLabel) {
            if (node.name) {
              nodeExtrasMap.set(node.name, node.extras.semanticLabel);
              const normalized = normalizeName(node.name);
              if (normalized && normalized !== node.name) {
                nodeExtrasMap.set(normalized, node.extras.semanticLabel);
              }
            }
          }
        });
      }
      
      // 应用到场景中的对象
      result.scene.traverse(child => {
        const normalizedChildName = normalizeName(child.name);
        const label = nodeExtrasMap.get(child.name) || nodeExtrasMap.get(normalizedChildName);
        
        if (label) {
          child.userData = child.userData || {};
          child.userData.semanticLabel = label;
          this.semanticLabels[child.uuid] = label;
          foundLabels++;
        }
      });
    }
    
    // 备用：从 userData 中查找
    result.scene.traverse(child => {
      if (child.userData) {
        if (child.userData.semanticLabel) {
          this.semanticLabels[child.uuid] = child.userData.semanticLabel;
          foundLabels++;
        } else if (child.userData.label) {
          child.userData.semanticLabel = child.userData.label;
          this.semanticLabels[child.uuid] = child.userData.label;
          foundLabels++;
        }
      }
    });
    
    console.log(`[OffscreenRenderModel] 解析到 ${foundLabels} 个语义标签`);
  }

  /**
   * 解析 OBJ 模型的语义标签
   */
  parseObjSemanticLabels(objModel) {
    if (!objModel || typeof objModel.traverse !== 'function') return;
    
    objModel.traverse(child => {
      if (!child.isMesh) return;
      
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        const label = this.extractLabelFromMaterial(material?.name);
        if (label) {
          child.userData = child.userData || {};
          child.userData.semanticLabel = label;
          this.semanticLabels[child.uuid] = label;
        }
      });
    });
  }

  /**
   * 从材质名称提取标签
   */
  extractLabelFromMaterial(materialName) {
    if (!materialName) return null;
    const match = materialName.match(/\[LABEL:(.*?)\]/);
    return match ? match[1].trim() : null;
  }

  /**
   * 提取材质列表
   */
  extractMaterialList() {
    this.modelMaterialList = [];
    
    if (!this.model) return;
    
    this.model.traverse(child => {
      if (child.isMesh && child.material) {
        // 只添加有材质的网格
        this.modelMaterialList.push(child);
      }
    });
    
    console.log(`[OffscreenRenderModel] 提取到 ${this.modelMaterialList.length} 个材质对象`);
  }

  /**
   * 调整模型变换（位置、缩放）
   */
  adjustModelTransform() {
    if (!this.model) return;

    console.log('[OffscreenRenderModel] 开始调整模型变换...');

    // 计算模型边界框
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    console.log('[OffscreenRenderModel] 模型边界框:', {
      center: { x: center.x.toFixed(2), y: center.y.toFixed(2), z: center.z.toFixed(2) },
      size: { x: size.x.toFixed(2), y: size.y.toFixed(2), z: size.z.toFixed(2) }
    });

    // 居中模型
    this.model.position.x = -center.x;
    this.model.position.y = -center.y;
    this.model.position.z = -center.z;

    console.log('[OffscreenRenderModel] 模型已居中到:', {
      x: this.model.position.x.toFixed(2),
      y: this.model.position.y.toFixed(2),
      z: this.model.position.z.toFixed(2)
    });

    // 计算适当的缩放
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 4; // 目标大小
    if (maxDim > 0) {
      const scale = targetSize / maxDim;
      this.model.scale.setScalar(scale);
      console.log('[OffscreenRenderModel] 模型缩放:', scale.toFixed(4), '目标大小:', targetSize);
    } else {
      console.warn('[OffscreenRenderModel] 模型尺寸为0，无法计算缩放');
    }
    
    console.log('[OffscreenRenderModel] 模型最终变换:', {
      position: { x: this.model.position.x.toFixed(2), y: this.model.position.y.toFixed(2), z: this.model.position.z.toFixed(2) },
      scale: this.model.scale.x.toFixed(4)
    });
  }

  /**
   * 获取材质列表
   */
  getMaterialList() {
    return this.modelMaterialList;
  }

  /**
   * 设置相机视角
   * @param {String} viewKey - 视角标识 (main/top/side/axial)
   */
  setCameraView(viewKey) {
    const preset = CAMERA_VIEW_PRESETS[viewKey];
    if (!preset || !this.camera) return;
    
    this.camera.position.copy(preset.position);
    this.camera.lookAt(preset.target);
    this.camera.updateProjectionMatrix();
  }

  /**
   * 渲染当前场景（使用后期处理）
   */
  render() {
    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('[OffscreenRenderModel] 渲染失败: 缺少必要组件', {
        hasRenderer: !!this.renderer,
        hasScene: !!this.scene,
        hasCamera: !!this.camera
      });
      return;
    }
    
    // 使用 EffectComposer 渲染（包含 OutlinePass）
    if (this.effectComposer) {
      this.effectComposer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * 捕获当前视图为 Blob（带重试机制和 GPU 信号量）
   * @returns {Promise<Blob>}
   */
  async captureToBlob() {
    if (!this.canvas) {
      throw new Error('Canvas not available');
    }
    
    // 渲染场景
    this.render();
    
    // 等待 GPU 完成渲染（增加延迟，避免读回失败）
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // 获取 GPU 操作许可（限制并发，防止 GPU 过载）
    const releaseGpu = await OffscreenRenderModel.acquireGpuPermit();
    
    try {
      // OffscreenCanvas 支持 convertToBlob，带重试机制
      const maxRetries = 5;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const blob = await this.canvas.convertToBlob({
            type: 'image/png',
            quality: 0.92
          });
          
          if (attempt > 1) {
            console.log(`[OffscreenRenderModel] convertToBlob 重试第 ${attempt - 1} 次成功`);
          }
          
          return blob;
        } catch (error) {
          lastError = error;
          
          if (attempt < maxRetries) {
            // 指数退避：等待时间随重试次数增加
            const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
            console.warn(`[OffscreenRenderModel] convertToBlob 失败 (尝试 ${attempt}/${maxRetries})，${delay}ms 后重试:`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // 重新渲染
            this.render();
            await new Promise(resolve => setTimeout(resolve, 150));
          } else {
            console.error(`[OffscreenRenderModel] convertToBlob 失败，已重试 ${maxRetries} 次:`, error);
          }
        }
      }
      
      throw lastError;
    } finally {
      // 确保释放 GPU 许可
      releaseGpu();
    }
  }

  /**
   * 捕获当前视图为 DataURL
   * @returns {Promise<String>}
   */
  async captureToDataURL() {
    const blob = await this.captureToBlob();
    return this.blobToDataURL(blob);
  }

  /**
   * 为单个材质捕获多视角图像
   * @param {THREE.Mesh} mesh - 材质网格对象
   * @param {Array<String>} viewKeys - 视角列表
   * @returns {Promise<Array<String>>} DataURL数组
   */
  async captureMultiAngleMaterial(mesh, viewKeys = ['main']) {
    if (!mesh || !mesh.isMesh) {
      throw new Error('Invalid mesh object');
    }

    console.log(`[OffscreenRenderModel] ===== 开始捕获材质: ${mesh.name || mesh.uuid} =====`);
    console.log(`[OffscreenRenderModel] 视角列表:`, viewKeys);
    console.log(`[OffscreenRenderModel] 材质可见性:`, mesh.visible);
    console.log(`[OffscreenRenderModel] 场景子对象数量:`, this.scene.children.length);
    console.log(`[OffscreenRenderModel] 模型是否在场景中:`, this.scene.children.includes(this.model));

    const images = [];
    
    // 保存原始可见性
    const originalVisibility = new Map();
    this.modelMaterialList.forEach(m => {
      originalVisibility.set(m.uuid, m.visible);
    });
    
    // 确保所有材质可见
    this.modelMaterialList.forEach(m => {
      m.visible = true;
    });
    
    // 设置 OutlinePass 高亮当前材质（黄色边框）
    if (this.outlinePass) {
      this.outlinePass.selectedObjects = [mesh];
      console.log(`[OffscreenRenderModel] 已设置 OutlinePass 高亮:`, mesh.name || mesh.uuid);
    } else {
      console.warn(`[OffscreenRenderModel] OutlinePass 未初始化`);
    }

    try {
      // 对每个视角拍照
      for (let i = 0; i < viewKeys.length; i++) {
        const viewKey = viewKeys[i];
        console.log(`[OffscreenRenderModel] 设置视角 [${i + 1}/${viewKeys.length}]: ${viewKey}`);
        
        this.setCameraView(viewKey);
        
        // 打印相机信息
        console.log(`[OffscreenRenderModel] 相机位置:`, {
          x: this.camera.position.x.toFixed(2),
          y: this.camera.position.y.toFixed(2),
          z: this.camera.position.z.toFixed(2)
        });
        
        // 等待渲染
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 强制渲染一次
        this.render();
        console.log(`[OffscreenRenderModel] 已渲染场景`);
        
        const dataURL = await this.captureToDataURL();
        console.log(`[OffscreenRenderModel] 截图大小:`, dataURL.length, 'bytes');
        
        images.push(dataURL);
        
        // 保存截图到本地（用于调试，需要开启开关）
        if (this.enableDebugScreenshots) {
          await this.saveDebugImage(dataURL, `${mesh.name || mesh.uuid}_${viewKey}_${i}.png`);
        }
      }
      
      console.log(`[OffscreenRenderModel] 成功捕获 ${images.length} 张图片`);
    } finally {
      // 清除 OutlinePass 选择
      if (this.outlinePass) {
        this.outlinePass.selectedObjects = [];
        console.log(`[OffscreenRenderModel] 已清除 OutlinePass 选择`);
      }
      
      // 恢复材质可见性
      this.modelMaterialList.forEach(m => {
        const originalVis = originalVisibility.get(m.uuid);
        if (originalVis !== undefined) {
          m.visible = originalVis;
        }
      });
      console.log(`[OffscreenRenderModel] 已恢复材质可见性`);
    }

    return images;
  }
  
  /**
   * 保存调试图像到浏览器下载（仅当 enableDebugScreenshots = true 时启用）
   * @param {String} dataURL - 图像DataURL
   * @param {String} filename - 文件名
   */
  async saveDebugImage(dataURL, filename) {
    try {
      // 创建下载链接
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `debug_${Date.now()}_${filename}`;
      
      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`[OffscreenRenderModel] 调试图片已保存: ${link.download}`);
    } catch (error) {
      console.warn(`[OffscreenRenderModel] 保存调试图片失败:`, error);
    }
  }
  
  /**
   * 启用/禁用调试截图保存
   * @param {Boolean} enable - 是否启用
   */
  setDebugScreenshots(enable) {
    this.enableDebugScreenshots = enable;
    console.log(`[OffscreenRenderModel] 调试截图保存: ${enable ? '已启用' : '已禁用'}`);
  }

  /**
   * 应用语义标签到模型
   * @param {Array} batchResults - 批量标注结果 [{materialName, targetMaterialName, label}, ...]
   */
  applySemanticLabels(batchResults) {
    if (!batchResults || !Array.isArray(batchResults)) return;

    batchResults.forEach(({ materialName, targetMaterialName, label }) => {
      if (!label) return;

      // 查找对应的网格对象
      const mesh = this.modelMaterialList.find(
        m => (m.name === materialName) || (m.uuid === materialName)
      );

      if (mesh) {
        mesh.userData = mesh.userData || {};
        mesh.userData.semanticLabel = label;
        this.semanticLabels[mesh.uuid] = label;
        
        console.log(`[OffscreenRenderModel] 应用标签: ${mesh.name || mesh.uuid} -> ${label.substring(0, 50)}...`);
      }
    });
  }

  /**
   * 导出场景为 GLB Blob
   * @returns {Promise<Blob>}
   */
  async exportToGlbBlob() {
    return new Promise((resolve, reject) => {
      const target = this.model || this.scene;
      if (!target) {
        reject(new Error('No model to export'));
        return;
      }

      console.log('[OffscreenRenderModel] 开始导出 GLB...');
      
      // 收集标签映射
      const labelMapByUuid = new Map();
      target.traverse(child => {
        const label = child.userData?.semanticLabel || child.material?.userData?.label;
        if (label) {
          labelMapByUuid.set(child.uuid, label);
        }
      });

      console.log(`[OffscreenRenderModel] 准备导出 ${labelMapByUuid.size} 个带标签的对象`);

      const exporter = new GLTFExporter();
      
      exporter.parse(
        target,
        async (gltf) => {
          try {
            // gltf 是 ArrayBuffer (binary GLB)
            let glbBlob = new Blob([gltf], { type: 'model/gltf-binary' });
            
            // 如果有标签，则写入
            if (labelMapByUuid.size > 0) {
              try {
                glbBlob = await this.addSemanticLabelsToGLB(glbBlob, labelMapByUuid);
                console.log(`[OffscreenRenderModel] 导出成功，已写入 ${labelMapByUuid.size} 个标签`);
              } catch (err) {
                console.error('[OffscreenRenderModel] 添加标签失败，使用原始文件:', err);
              }
            }

            resolve(glbBlob);
          } catch (error) {
            console.error('[OffscreenRenderModel] 处理导出结果失败:', error);
            reject(error);
          }
        },
        (error) => {
          console.error('[OffscreenRenderModel] GLB 导出失败:', error);
          reject(error);
        },
        {
          binary: true,
          includeCustomExtensions: true
        }
      );
    });
  }

  /**
   * 添加语义标签到 GLB 文件
   * @param {Blob} glbBlob - 原始 GLB Blob
   * @param {Map} labelMap - UUID到标签的映射
   * @returns {Promise<Blob>}
   */
  async addSemanticLabelsToGLB(glbBlob, labelMap) {
    const arrayBuffer = await glbBlob.arrayBuffer();
    const dataView = new DataView(arrayBuffer);
    
    // GLB 格式：12字节头 + JSON chunk + BIN chunk
    const magic = dataView.getUint32(0, true);
    if (magic !== 0x46546C67) { // "glTF"
      throw new Error('Invalid GLB file');
    }
    
    const version = dataView.getUint32(4, true);
    const length = dataView.getUint32(8, true);
    
    // 读取 JSON chunk
    const jsonChunkLength = dataView.getUint32(12, true);
    const jsonChunkType = dataView.getUint32(16, true);
    
    if (jsonChunkType !== 0x4E4F534A) { // "JSON"
      throw new Error('Invalid JSON chunk');
    }
    
    const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
    const jsonString = new TextDecoder().decode(jsonBytes);
    const gltfJson = JSON.parse(jsonString);
    
    // 添加 extras 到节点
    if (!gltfJson.nodes) {
      gltfJson.nodes = [];
    }
    
    // 构建名称到标签的映射
    const nodesByName = new Map();
    this.model.traverse(child => {
      const label = labelMap.get(child.uuid);
      if (label && child.name) {
        nodesByName.set(child.name, label);
      }
    });
    
    // 应用标签到 GLTF 节点
    gltfJson.nodes.forEach(node => {
      const label = nodesByName.get(node.name);
      if (label) {
        node.extras = node.extras || {};
        node.extras.semanticLabel = label;
      }
    });
    
    // 重新编码 JSON
    const newJsonString = JSON.stringify(gltfJson);
    const newJsonBytes = new TextEncoder().encode(newJsonString);
    
    // 补齐到 4 字节对齐
    const jsonPadding = (4 - (newJsonBytes.length % 4)) % 4;
    const newJsonLength = newJsonBytes.length + jsonPadding;
    
    // 读取 BIN chunk（如果有）
    const binChunkStart = 20 + jsonChunkLength;
    let binChunkLength = 0;
    let binChunkData = null;
    
    if (binChunkStart < arrayBuffer.byteLength) {
      binChunkLength = dataView.getUint32(binChunkStart, true);
      binChunkData = new Uint8Array(arrayBuffer, binChunkStart + 8, binChunkLength);
    }
    
    // 构建新的 GLB
    const newLength = 12 + 8 + newJsonLength + (binChunkData ? 8 + binChunkLength : 0);
    const newBuffer = new ArrayBuffer(newLength);
    const newView = new DataView(newBuffer);
    const newBytes = new Uint8Array(newBuffer);
    
    // 写入头部
    newView.setUint32(0, 0x46546C67, true); // magic
    newView.setUint32(4, version, true);
    newView.setUint32(8, newLength, true);
    
    // 写入 JSON chunk
    newView.setUint32(12, newJsonLength, true);
    newView.setUint32(16, 0x4E4F534A, true); // "JSON"
    newBytes.set(newJsonBytes, 20);
    // 填充空格
    for (let i = 0; i < jsonPadding; i++) {
      newBytes[20 + newJsonBytes.length + i] = 0x20;
    }
    
    // 写入 BIN chunk（如果有）
    if (binChunkData) {
      const binStart = 20 + newJsonLength;
      newView.setUint32(binStart, binChunkLength, true);
      newView.setUint32(binStart + 4, 0x004E4942, true); // "BIN\0"
      newBytes.set(binChunkData, binStart + 8);
    }
    
    return new Blob([newBuffer], { type: 'model/gltf-binary' });
  }

  /**
   * Blob 转 DataURL
   */
  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 释放模型资源
   */
  disposeModel(obj) {
    if (!obj) return;

    if (obj.geometry) {
      obj.geometry.dispose();
    }

    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(material => {
        if (material.map) material.map.dispose();
        if (material.lightMap) material.lightMap.dispose();
        if (material.bumpMap) material.bumpMap.dispose();
        if (material.normalMap) material.normalMap.dispose();
        if (material.specularMap) material.specularMap.dispose();
        if (material.envMap) material.envMap.dispose();
        material.dispose();
      });
    }

    if (obj.children) {
      obj.children.forEach(child => this.disposeModel(child));
    }
  }

  /**
   * 清理所有资源
   */
  dispose() {
    console.log('[OffscreenRenderModel] 开始清理资源...');
    
    // 清理模型
    if (this.model) {
      this.scene.remove(this.model);
      this.disposeModel(this.model);
      this.model = null;
    }

    // 清理场景
    if (this.scene) {
      this.scene.traverse(obj => {
        if (obj !== this.scene) {
          this.disposeModel(obj);
        }
      });
      this.scene.clear();
    }

    // 清理后期处理
    if (this.effectComposer) {
      this.effectComposer.dispose();
      this.effectComposer = null;
    }
    if (this.outlinePass) {
      this.outlinePass.dispose();
      this.outlinePass = null;
    }

    // 清理渲染器
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }

    // 清理其他引用
    this.canvas = null;
    this.gl = null;
    this.camera = null;
    this.scene = null;
    this.modelMaterialList = [];
    this.semanticLabels = {};
    this.initialized = false;

    console.log('[OffscreenRenderModel] 资源清理完成');
  }
}

export default OffscreenRenderModel;

