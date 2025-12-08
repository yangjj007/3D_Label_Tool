import * as THREE from "three"; //导入整个 three.js核心库
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"; //导入控制器模块，轨道控制器
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"; //导入GLTF模块，模型解析器,根据文件格式来定
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { ElMessage } from "element-plus";
import { onlyKey, getAssetsFile } from "@/utils/utilityFunction";
import modulesPrototype from "./modelEditClass/index";
import TWEEN from "@tweenjs/tween.js";
import { vertexShader, fragmentShader } from "@/config/constant.js";
import { findObjectInScene } from "@/utils/utilityFunction";
import shaderModules from "./modelEditClass/shaderModules";
import backgroundModules from "./modelEditClass/backgroundModules";
import lightModules from "./modelEditClass/lightModules";
import materialModules from "./modelEditClass/materialModules";

const colors = ["#FF4500", "#90EE90", "#00CED1", "#1E90FF", "#C71585", "#FF4500", "#FAD400", "#1F93FF", "#90F090", "#C71585"];
class renderModel {
  constructor(selector) {
    this.container = document.querySelector(selector);
    // 相机
    this.camera;
    // 场景
    this.scene = null;
    //渲染器
    this.renderer;
    // 控制器
    this.controls;
    // 模型
    this.model;
    // 语义标签缓存
    this.semanticLabels = {};
    // 几何体模型数组
    this.geometryGroup = new THREE.Group();
    // 多模型数组
    this.manyModelGroup = new THREE.Group();
    // 加载进度监听
    this.loadingManager = new THREE.LoadingManager();
    //文件加载器类型
    this.fileLoaderMap = {
      glb: new GLTFLoader(),
      fbx: new FBXLoader(this.loadingManager),
      gltf: new GLTFLoader(),
      obj: new OBJLoader(this.loadingManager),
      stl: new STLLoader()
    };
    //模型动画列表
    this.modelAnimation = [];
    //模型动画对象
    this.animationMixer;
    this.animationClock = new THREE.Clock();
    //动画帧
    this.animationFrame = null;
    // 轴动画帧
    this.rotationAnimationFrame = null;
    // 动画构造器
    this.animateClipAction = null;
    // 动画循环方式枚举
    this.loopMap = {
      LoopOnce: THREE.LoopOnce,
      LoopRepeat: THREE.LoopRepeat,
      LoopPingPong: THREE.LoopPingPong
    };
    // 网格辅助线
    this.gridHelper;
    // 坐标轴辅助线
    this.axesHelper;
    // 环境光
    this.ambientLight;
    //平行光
    this.directionalLight;
    // 平行光辅助线
    this.directionalLightHelper;
    // 点光源
    this.pointLight;
    //点光源辅助线
    this.pointLightHelper;
    //聚光灯
    this.spotLight;
    //聚光灯辅助线
    this.spotLightHelper;
    //模型平面
    this.planeGeometry;
    //模型材质列表
    this.modelMaterialList = [];
    // 模型材质原始数据缓存
    this.originalMaterials = new Map();
    // 效果合成器
    this.effectComposer;
    this.outlinePass;
    // 动画渲染器
    this.renderAnimation = null;
    // 碰撞检测
    this.raycaster = new THREE.Raycaster();
    // 鼠标位置
    this.mouse = new THREE.Vector2();
    // 辉光效果合成器
    this.glowComposer;
    this.glowRenderPass;
    // 辉光渲染器
    this.unrealBloomPass;
    // 辉光着色器
    this.shaderPass;
    // 需要辉光的材质
    this.glowMaterialList;
    this.materials = {};
    // 拖拽对象控制器
    this.transformControls;
    // 是否开启辉光
    this.glowUnrealBloomPass = false;
    // 窗口变化监听事件
    this.onWindowResizesListener;
    // 鼠标点击事件
    this.onMouseClickListener;
    // 模型上传进度条回调函数
    this.modelProgressCallback = e => e;
    // 当前拖拽的几何模型
    this.dragGeometryModel = {};
    // 当前模型加载状态
    this.loadingStatus = true;
    // 3d文字渲染器
    this.css3DRenderer = null;
    // 3d文字控制器
    this.css3dControls = null;
    // 当前拖拽标签信息
    this.dragTag = {};
    //当前标签列表
    this.dragTagList = [];
    // 当前拖拽模型信息
    this.activeDragManyModel = {};
    // 背景模块实例
    this.backgroundModules = new backgroundModules();
    // 着色器模块实例
    this.shaderModules = new shaderModules();
    // 灯光模块实例
    this.lightModules = new lightModules();
    // 材质模块实例
    this.materialModules = new materialModules();
  }

  init() {
    return new Promise(async resolve => {
      //初始化渲染器
      this.initRender();
      //初始化相机
      this.initCamera();
      //初始化场景
      this.initScene();
      //初始化控制器，控制摄像头,控制器一定要在渲染器后
      this.initControls();
      // 创建辅助线
      this.createHelper();
      // 创建灯光
      this.createLight();
      this.addEvenListMouseListener();
      const load = await this.loadModel({ filePath: "threeFile/glb/glb-7.glb", fileType: "glb" });
      // 创建效果合成器
      this.createEffectComposer();
      //场景渲染
      this.sceneAnimation();
      resolve(load);
    });
  }
  // 创建场景
  async initScene() {
    this.scene = new THREE.Scene();
    const texture = new THREE.TextureLoader().load(getAssetsFile("image/view-4.png"));
    texture.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.SRGBColorSpace = THREE.SRGBColorSpace;
    this.scene.background = texture;
    this.scene.environment = texture;
    this.scene.backgroundIntensity = 1;
    this.scene.backgroundBlurriness = 1;
    texture.dispose();
  }
  // 创建相机
  initCamera() {
    const { clientHeight, clientWidth } = this.container;
    this.camera = new THREE.PerspectiveCamera(50, clientWidth / clientHeight, 0.05, 10000);
  }
  // 创建渲染器
  initRender() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); //设置抗锯齿
    //设置屏幕像素比
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    //渲染的尺寸大小
    const { clientHeight, clientWidth } = this.container;
    this.renderer.setSize(clientWidth, clientHeight);
    //色调映射
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.autoClear = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    //曝光
    this.renderer.toneMappingExposure = 2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 创建一个CSS3DRenderer
    this.css3DRenderer = new CSS3DRenderer();
    this.css3DRenderer.setSize(clientWidth, clientHeight);
    this.css3DRenderer.domElement.style.position = "absolute";
    this.css3DRenderer.domElement.style.pointerEvents = "none";
    this.css3DRenderer.domElement.style.top = 0;
  }
  // 更新场景
  sceneAnimation() {
    this.renderAnimation = requestAnimationFrame(() => this.sceneAnimation());
    // 等模型加载和相关数据处理完成在执行
    if (this.loadingStatus) {
      //辉光效果开关开启时执行
      if (this.glowUnrealBloomPass) {
        // 将不需要处理辉光的材质进行存储备份
        this.setMeshFlow();
      } else {
        this.effectComposer.render();
        this.controls.update();
      }
      TWEEN.update();
      this.shaderModules.updateAllShaderTime();
      // 3d标签渲染器
      if (this.dragTagList.length) {
        this.css3DRenderer.render(this.scene, this.camera);
        this.css3dControls.update();
      }
    }
  }
  // 监听事件
  addEvenListMouseListener() {
    //监听场景大小改变，跳转渲染尺寸
    this.onWindowResizesListener = this.onWindowResizes.bind(this);
    window.addEventListener("resize", this.onWindowResizesListener);
    // 鼠标点击
    this.onMouseClickListener = this.materialModules.onMouseClickModel.bind(this);
    this.container.addEventListener("click", this.onMouseClickListener);
  }
  // 创建控制器
  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    //标签控制器
    this.css3dControls = new OrbitControls(this.camera, this.css3DRenderer.domElement);
    this.css3dControls.enablePan = false;
    this.css3dControls.enableDamping = true;
    this.css3dControls.target.set(0, 0, 0);
    this.css3dControls.update();
  }
  // 加载模型
  loadModel({ filePath, fileType, decomposeName }) {
    return new Promise(resolve => {
      this.loadingStatus = false;
      let loader;
      if (["glb", "gltf"].includes(fileType)) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(`draco/`);
        dracoLoader.setDecoderConfig({ type: "js" });
        dracoLoader.preload();
        loader = new GLTFLoader().setDRACOLoader(dracoLoader);
      } else {
        loader = this.fileLoaderMap[fileType];
      }
      this.model?.dispose()
      loader.load(
        filePath,
        result => {
          switch (fileType) {
            case "glb":
              this.model = result.scene;
              console.log('[loadModel] GLB加载完成，检查userData和extras...');
              
              // 手动从GLTF JSON中读取extras并设置到userData
              // GLTFLoader可能不会自动将extras加载到userData
              let foundLabels = 0;
              
              if (result.parser && result.parser.json) {
                console.log('[loadModel] 检查GLTF JSON中的nodes extras...');
                const gltfJson = result.parser.json;
                
                // 打印所有节点信息以便调试
                if (gltfJson.nodes) {
                  console.log(`[loadModel] GLTF JSON中共有 ${gltfJson.nodes.length} 个节点`);
                  gltfJson.nodes.forEach((node, index) => {
                    console.log(`[loadModel] 节点 ${index}: name="${node.name}", hasExtras=${!!node.extras}`, node.extras ? Object.keys(node.extras) : '');
                  });
                }
                
                // 规范化名称的辅助函数
                const normalizeName = (name) => {
                  if (!name) return '';
                  return name.replace(/[_\->]/g, ' ').replace(/\s+/g, ' ').trim();
                };
                
                // 创建节点名称到extras的映射（包括规范化后的名称）
                const nodeExtrasMap = new Map();
                if (gltfJson.nodes) {
                  gltfJson.nodes.forEach((node, index) => {
                    if (node.extras && node.extras.semanticLabel) {
                      // 使用原始名称
                      if (node.name) {
                        nodeExtrasMap.set(node.name, node.extras.semanticLabel);
                        // 也使用规范化后的名称
                        const normalized = normalizeName(node.name);
                        if (normalized && normalized !== node.name) {
                          nodeExtrasMap.set(normalized, node.extras.semanticLabel);
                        }
                      }
                      console.log(`[loadModel] GLTF JSON中节点 ${index} (${node.name}) 有extras.semanticLabel:`, node.extras.semanticLabel.substring(0, 50));
                    }
                  });
                }
                
                // 创建mesh名称到extras的映射（包括规范化后的名称）
                const meshExtrasMap = new Map();
                if (gltfJson.meshes) {
                  console.log(`[loadModel] GLTF JSON中共有 ${gltfJson.meshes.length} 个mesh`);
                  gltfJson.meshes.forEach((mesh, index) => {
                    if (mesh.extras && mesh.extras.semanticLabel) {
                      // 使用原始名称
                      if (mesh.name) {
                        meshExtrasMap.set(mesh.name, mesh.extras.semanticLabel);
                        // 也使用规范化后的名称
                        const normalized = normalizeName(mesh.name);
                        if (normalized && normalized !== mesh.name) {
                          meshExtrasMap.set(normalized, mesh.extras.semanticLabel);
                        }
                      }
                      console.log(`[loadModel] GLTF JSON中mesh ${index} (${mesh.name}) 有extras.semanticLabel:`, mesh.extras.semanticLabel.substring(0, 50));
                    }
                  });
                }
                
                console.log(`[loadModel] nodeExtrasMap大小: ${nodeExtrasMap.size}, meshExtrasMap大小: ${meshExtrasMap.size}`);
                
                // 将extras应用到场景中的对象
                result.scene.traverse(child => {
                  // 从节点名称匹配（精确匹配或规范化匹配）
                  if (child.name) {
                    let label = null;
                    // 1. 精确匹配
                    if (nodeExtrasMap.has(child.name)) {
                      label = nodeExtrasMap.get(child.name);
                    }
                    // 2. 规范化匹配
                    else {
                      const normalized = normalizeName(child.name);
                      if (normalized && nodeExtrasMap.has(normalized)) {
                        label = nodeExtrasMap.get(normalized);
                      }
                    }
                    
                    if (label) {
                      child.userData = child.userData || {};
                      child.userData.semanticLabel = label;
                      foundLabels++;
                      console.log(`[loadModel] ✓ 从GLTF JSON节点找到semanticLabel: ${child.name} -> ${label.substring(0, 50)}...`);
                    }
                    // 从mesh名称匹配（如果节点没有找到，尝试mesh）
                    else if (child.isMesh && meshExtrasMap.has(child.name)) {
                      child.userData = child.userData || {};
                      child.userData.semanticLabel = meshExtrasMap.get(child.name);
                      foundLabels++;
                      console.log(`[loadModel] ✓ 从GLTF JSON mesh找到semanticLabel: ${child.name} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    }
                    else if (child.isMesh) {
                      const normalized = normalizeName(child.name);
                      if (normalized && meshExtrasMap.has(normalized)) {
                        child.userData = child.userData || {};
                        child.userData.semanticLabel = meshExtrasMap.get(normalized);
                        foundLabels++;
                        console.log(`[loadModel] ✓ 从GLTF JSON mesh(规范化)找到semanticLabel: ${child.name} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                      }
                    }
                  }
                  // 检查userData中是否已有标签
                  else if (child.userData) {
                    if (child.userData.semanticLabel) {
                      foundLabels++;
                      console.log(`[loadModel] ✓ 找到semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    } else if (child.userData.extras && child.userData.extras.semanticLabel) {
                      child.userData.semanticLabel = child.userData.extras.semanticLabel;
                      foundLabels++;
                      console.log(`[loadModel] ✓ 从userData.extras找到semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    } else if (child.userData.label) {
                      child.userData.semanticLabel = child.userData.label;
                      foundLabels++;
                      console.log(`[loadModel] ✓ 找到label并转换为semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    }
                  }
                });
              } else {
                // 如果没有parser.json，尝试从userData中查找
                result.scene.traverse(child => {
                  if (child.userData) {
                    if (child.userData.semanticLabel) {
                      foundLabels++;
                      console.log(`[loadModel] ✓ 找到semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    } else if (child.userData.extras && child.userData.extras.semanticLabel) {
                      child.userData.semanticLabel = child.userData.extras.semanticLabel;
                      foundLabels++;
                      console.log(`[loadModel] ✓ 从userData.extras找到semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    } else if (child.userData.label) {
                      child.userData.semanticLabel = child.userData.label;
                      foundLabels++;
                      console.log(`[loadModel] ✓ 找到label并转换为semanticLabel: ${child.name || child.uuid} -> ${child.userData.semanticLabel.substring(0, 50)}...`);
                    }
                  }
                });
              }
              
              console.log(`[loadModel] 加载后共发现 ${foundLabels} 个带标签的对象`);
              break;
            case "fbx":
              this.model = result;
              break;
            case "gltf":
              this.model = result.scene;
              break;
            case "obj":
              this.model = result;
              this.parseObjSemanticLabels(result);
              break;
            case "stl":
              const material = new THREE.MeshStandardMaterial();
              const mesh = new THREE.Mesh(result, material);
              this.model = mesh;
              break;
            default:
              break;
          }
          this.model.decomposeName = decomposeName;
          this.materialModules.getModelMaterialList();
          this.materialModules.setModelPositionSize();
          this.parseSceneSemanticLabels(this.model);

          // 需要辉光的材质
          this.glowMaterialList = this.modelMaterialList.map(v => v.name);
          this.scene.add(this.model);
          this.loadingStatus = true;
          resolve(true);
          this.getModelAnimationList(result);
        },
        xhr => {
          this.modelProgressCallback(xhr.loaded, xhr.total);
        },
        err => {
          console.error('[loadModel] 模型加载失败:', err);
          ElMessage.error("文件错误: " + (err.message || '未知错误'));
          // 加载失败时应该返回false，而不是true
          resolve(false);
        }
      );
    });
  }

  parseObjSemanticLabels(objModel) {
    if (!objModel || typeof objModel.traverse !== "function") return {};
    objModel.traverse(child => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        const label = this.extractLabelFromMaterial(material?.name);
        if (label) {
          child.userData = child.userData || {};
          child.userData.semanticLabel = label;
        }
      });
    });
    return this.parseSceneSemanticLabels(objModel);
  }

  extractLabelFromMaterial(materialName) {
    if (!materialName) return null;
    const labelMatch = materialName.match(/#\s*label:\s*(.+)$/i);
    return labelMatch ? labelMatch[1].trim() : null;
  }

  getMeshSemanticLabel(mesh) {
    if (!mesh) return null;
    const userData = mesh.userData || {};
    if (userData.label) {
      console.log(`[getMeshSemanticLabel] 从 userData.label 读取: ${mesh.name || mesh.uuid}`);
      return userData.label;
    }
    if (userData.semanticLabel) {
      console.log(`[getMeshSemanticLabel] 从 userData.semanticLabel 读取: ${mesh.name || mesh.uuid}`);
      return userData.semanticLabel;
    }
    const materialUserData = mesh.material?.userData;
    if (materialUserData?.label) {
      console.log(`[getMeshSemanticLabel] 从 material.userData.label 读取: ${mesh.name || mesh.uuid}`);
      return materialUserData.label;
    }
    return null;
  }

  parseSceneSemanticLabels(sceneRoot = this.model) {
    const labels = {};
    if (!sceneRoot || typeof sceneRoot.traverse !== "function") return labels;
    console.log('[parseSceneSemanticLabels] 开始解析场景语义标签');
    sceneRoot.traverse(child => {
      if (!child.isMesh) return;
      const label = this.getMeshSemanticLabel(child);
      if (label) {
        console.log(`[parseSceneSemanticLabels] 找到标签: ${child.name || child.uuid} -> ${label.substring(0, 50)}...`);
        child.userData = child.userData || {};
        child.userData.semanticLabel = label;
        labels[child.uuid] = label;
      }
    });
    this.semanticLabels = labels;
    console.log(`[parseSceneSemanticLabels] 共找到 ${Object.keys(labels).length} 个语义标签`);
    return labels;
  }
  // 设置材质辉光
  setMeshFlow() {
    this.scene.traverse(v => {
      if (v instanceof THREE.GridHelper) {
        this.materials.gridHelper = v.material;
        v.material = new THREE.MeshStandardMaterial({ color: "#000" });
      }
      if (v instanceof THREE.Scene) {
        this.materials.scene = v.background;
        this.materials.environment = v.environment;
        v.background = null;
        v.environment = null;
      }
      if (!this.glowMaterialList.includes(v.name) && v.isMesh) {
        this.materials[v.uuid] = v.material;
        v.material = new THREE.MeshStandardMaterial({ color: "#000" });
      }
    });
    this.glowComposer.render();
    // 辉光渲染器执行完之后在恢复材质原效果
    this.scene.traverse(v => {
      if (this.materials[v.uuid]) {
        v.material = this.materials[v.uuid];
        delete this.materials[v.uuid];
      }
      if (v instanceof THREE.GridHelper) {
        v.material = this.materials.gridHelper;
        delete this.materials.gridHelper;
      }
      if (v instanceof THREE.Scene) {
        v.background = this.materials.scene;
        v.environment = this.materials.environment;
        delete this.materials.scene;
        delete this.materials.environment;
      }
    });
    this.effectComposer.render();
    this.controls.update();
  }
  // 加载几何体模型
  setGeometryModel(model) {
    return new Promise((resolve) => {
      const { clientHeight, clientWidth, offsetLeft, offsetTop } = this.container;
      // 计算鼠标在屏幕上的坐标
      this.mouse.x = ((model.clientX - offsetLeft) / clientWidth) * 2 - 1;
      this.mouse.y = -((model.clientY - offsetTop) / clientHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      if (intersects.length > 0) {
        // 在控制台输出鼠标在场景中的位置
        const { type } = model;
        // 不需要赋值的key
        const notGeometryKey = ["id", "name", "modelType", "type"];
        const geometryData = Object.keys(model)
          .filter(key => !notGeometryKey.includes(key))
          .map(v => model[v]);
        // 创建几何体
        const geometry = new THREE[type](...geometryData);

        // 随机颜色
        const meshColor = colors[Math.ceil(Math.random() * 10)];
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(meshColor), side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        const { x, y, z } = intersects[0].point;
        mesh.position.set(x, y, z);

        const newMesh = mesh.clone();
        Object.assign(mesh.userData, {
          rotation: newMesh.rotation,
          scale: newMesh.scale,
          position: newMesh.position
        });

        mesh.name = type + "_" + onlyKey(4, 5);
        mesh.userData.geometry = true;
        this.geometryGroup.add(mesh);
        this.model = this.geometryGroup;
        this.materialModules.onSetGeometryMeshList(mesh);

        this.glowMaterialList = this.modelMaterialList.map(v => v.name);
        this.setModelMeshDrag({ transformType: true });
        this.scene.add(this.model);
        //计算控制器缩放大小
        const box = new THREE.Box3().setFromObject(this.model);
        const size = box.getSize(new THREE.Vector3());
        this.controls.maxDistance = size.length() * 10;
        this.loadingStatus = true;
        resolve(true);
      } else {
        ElMessage.warning("当前角度无法获取鼠标位置请调整“相机角度”在添加");
      }
    });
  }

  // 模型加载进度条回调函数
  onProgress(callback) {
    if (typeof callback == "function") {
      this.modelProgressCallback = callback;
    }
  }
  // 创建辅助线
  createHelper() {
    //网格辅助线
    this.gridHelper = new THREE.GridHelper(6, 18, "#fff", "rgb(193,193,193)");
    this.gridHelper.position.set(0, -0.59, -0.1);
    this.gridHelper.visible = false;
    this.scene.add(this.gridHelper);
    // 坐标轴辅助线
    this.axesHelper = new THREE.AxesHelper(2);
    this.axesHelper.visible = false;
    this.scene.add(this.axesHelper);
    // 开启阴影
    this.renderer.shadowMap.enabled = true;
  }
  // 创建光源
  createLight() {
    // 创建环境光
    this.ambientLight = new THREE.AmbientLight("#fff", 0.8);
    this.ambientLight.visible = true;
    this.scene.add(this.ambientLight);
    // 创建平行光
    this.directionalLight = new THREE.DirectionalLight("#fff", 5);
    this.directionalLight.position.set(-1.44, 2.2, 1);
    this.directionalLight.castShadow = true;
    this.directionalLight.visible = false;
    this.scene.add(this.directionalLight);
    // 创建平行光辅助线
    this.directionalLightHelper = new THREE.DirectionalLightHelper(this.directionalLight, 0.3);
    this.directionalLightHelper.visible = false;
    this.scene.add(this.directionalLightHelper);

    // 创建点光源
    this.pointLight = new THREE.PointLight(0xff0000, 5, 100);
    this.pointLight.visible = false;
    this.scene.add(this.pointLight);
    // 创建点光源辅助线
    this.pointLightHelper = new THREE.PointLightHelper(this.pointLight, 0.5);
    this.pointLightHelper.visible = false;
    this.scene.add(this.pointLightHelper);

    //  创建聚光灯
    this.spotLight = new THREE.SpotLight("#00BABD", 900);
    this.spotLight.visible = false;
    this.spotLight.map = new THREE.TextureLoader().load(getAssetsFile("image/model-bg-1.jpg"));
    this.spotLight.map = new THREE.TextureLoader().load(getAssetsFile("image/model-bg-1.jpg"));
    this.spotLight.decay = 2;
    this.spotLight.shadow.mapSize.width = 1920;
    this.spotLight.shadow.mapSize.height = 1080;
    this.spotLight.shadow.camera.near = 1;
    this.spotLight.shadow.camera.far = 10;
    this.scene.add(this.spotLight);
    //创建聚光灯辅助线
    this.spotLightHelper = new THREE.SpotLightHelper(this.spotLight);
    this.spotLightHelper.visible = false;
    this.scene.add(this.spotLightHelper);

    const geometry = new THREE.PlaneGeometry(2000, 2000);
    const planeMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5 });

    this.planeGeometry = new THREE.Mesh(geometry, planeMaterial);
    this.planeGeometry.rotation.x = -Math.PI / 2;

    this.planeGeometry.position.set(0, -1.2, 0);
    this.planeGeometry.receiveShadow = true;
    this.planeGeometry.material.side = THREE.DoubleSide;
    this.planeGeometry.material.color.set("#23191F");
    this.planeGeometry.geometry.verticesNeedUpdate = true;
    this.scene.add(this.planeGeometry);
  }
  // 创建效果合成器
  createEffectComposer() {
    if (!this.container) return false;
    const { clientHeight, clientWidth } = this.container;
    this.effectComposer = new EffectComposer(
      this.renderer,
      new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        samples: 4 // 增加采样次数来提高抗锯齿效果
      })
    );
    const renderPass = new RenderPass(this.scene, this.camera);

    this.effectComposer.addPass(renderPass);

    this.outlinePass = new OutlinePass(new THREE.Vector2(clientWidth, clientHeight), this.model, this.camera);
    this.outlinePass.visibleEdgeColor = new THREE.Color("#FF8C00"); // 可见边缘的颜色
    this.outlinePass.hiddenEdgeColor = new THREE.Color("#8a90f3"); // 不可见边缘的颜色
    this.outlinePass.edgeGlow = 2; // 发光强度
    this.outlinePass.usePatternTexture = false; // 是否使用纹理图案
    this.outlinePass.edgeThickness = 1; // 边缘浓度
    this.outlinePass.edgeStrength = 4; // 边缘的强度，值越高边框范围越大
    this.outlinePass.pulsePeriod = 200; // 闪烁频率，值越大频率越低
    this.effectComposer.addPass(this.outlinePass);
    let outputPass = new OutputPass();
    this.effectComposer.addPass(outputPass);

    // 增强FXAA抗锯齿效果
    let effectFXAA = new ShaderPass(FXAAShader);
    const pixelRatio = this.renderer.getPixelRatio();
    effectFXAA.uniforms.resolution.value.set(1 / (clientWidth * pixelRatio), 1 / (clientHeight * pixelRatio));
    effectFXAA.renderToScreen = true;
    effectFXAA.needsSwap = true;
    // 调整FXAA参数以增强抗锯齿效果
    effectFXAA.material.uniforms.tDiffuse.value = 1.0;
    effectFXAA.enabled = true;
    this.effectComposer.addPass(effectFXAA);

    //创建辉光效果
    this.unrealBloomPass = new UnrealBloomPass(new THREE.Vector2(clientWidth, clientHeight), 1.5, 0.4, 0.85);
    // 辉光合成器
    const renderTargetParameters = {
      minFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      samples: 4 // 为辉光效果也添加抗锯齿
    };
    const glowRender = new THREE.WebGLRenderTarget(clientWidth * 2, clientHeight * 2, renderTargetParameters);
    this.glowComposer = new EffectComposer(this.renderer, glowRender);
    this.glowComposer.renderToScreen = false;
    this.glowRenderPass = new RenderPass(this.scene, this.camera);
    this.glowComposer.addPass(this.glowRenderPass);
    this.glowComposer.addPass(this.unrealBloomPass);
    // 着色器
    this.shaderPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.glowComposer.renderTarget2.texture },
          tDiffuse: { value: null },
          glowColor: { value: null }
        },
        vertexShader,
        fragmentShader,
        defines: {}
      }),
      "baseTexture"
    );

    this.shaderPass.material.uniforms.glowColor.value = new THREE.Color();
    this.shaderPass.renderToScreen = true;
    this.shaderPass.needsSwap = true;
    this.shaderPass.name = "ShaderColor";
  }
  // 切换模型
  onSwitchModel(model) {
    return new Promise(async (resolve, reject) => {
      try {
        // 加载几何模型
        if (model.modelType && model.modelType == "geometry") {
          this.modelAnimation = [];
          this.camera.fov = 80;
          this.camera.updateProjectionMatrix();
          console.log(model);
          await this.setGeometryModel(model);
          this.outlinePass.renderScene = this.geometryGroup;
          resolve();
        } else {
          this.clearSceneModel();
          // 加载模型
          const load = await this.loadModel(model);
          this.outlinePass.renderScene = this.model;
          // 模型加载成功返回 true
          resolve({ load, filePath: model.filePath });
        }
      } catch (err) {
        console.log(err);
        reject();
      }
    });
  }

  // 监听窗口变化
  onWindowResizes() {
    if (!this.container) return false;
    const { clientHeight, clientWidth } = this.container;
    //调整屏幕大小
    this.camera.aspect = clientWidth / clientHeight; // 摄像机宽高比例
    this.camera.updateProjectionMatrix(); //相机更新矩阵，将3d内容投射到2d面上转换
    this.renderer.setSize(clientWidth, clientHeight);
    this.css3DRenderer.setSize(clientWidth, clientHeight);
    if (this.effectComposer) {
      // 假设抗锯齿效果是EffectComposer中的第一个pass
      let pass = this.effectComposer.passes[3];
      const pixelRatio = this.renderer.getPixelRatio();
      pass.uniforms.resolution.value.set(1 / (clientWidth * pixelRatio), 1 / (clientHeight * pixelRatio));
      this.effectComposer.setSize(clientWidth, clientHeight);
    }

    if (this.glowComposer) this.glowComposer.setSize(clientWidth, clientHeight);
  }
  // 下载场景封面
  onDownloadSceneCover() {
    const coverUrl = this.getSceneCoverDataUrl();
    if (!coverUrl) {
      ElMessage.error("封面未准备好");
      return;
    }
    const link = document.createElement("a");
    link.href = coverUrl;
    link.download = `${new Date().toLocaleString()}.png`;
    link.click();
    ElMessage.success("下载成功");
  }
  getSceneCoverDataUrl() {
    if (!this.renderer || !this.renderer.domElement) return "";
    return this.renderer.domElement.toDataURL("image/png");
  }

  exportSceneToGlbBlob() {
    return new Promise((resolve, reject) => {
      const target = this.model || this.scene;
      if (!target) {
        reject(new Error("当前模型尚未加载完成，无法导出"));
        return;
      }
      
      console.log('[exportSceneToGlbBlob] 开始导出，检查userData...');
      
      // 收集所有需要导出的标签映射（使用UUID作为key，因为名称可能被规范化）
      const labelMapByUuid = new Map();
      const labelMapByName = new Map();
      target.traverse(child => {
        const label = child.userData?.semanticLabel || child.material?.userData?.label;
        if (label) {
          // 使用UUID作为主要key
          labelMapByUuid.set(child.uuid, label);
          // 同时保存名称映射（用于备用匹配）
          if (child.name) {
            labelMapByName.set(child.name, label);
            // 也保存规范化后的名称（去除特殊字符，统一为空格）
            const normalizedName = child.name.replace(/[_\->]/g, ' ').replace(/\s+/g, ' ').trim();
            if (normalizedName && normalizedName !== child.name) {
              labelMapByName.set(normalizedName, label);
            }
          }
          // 确保label在userData中
          child.userData = child.userData || {};
          child.userData.semanticLabel = label;
          console.log(`[exportSceneToGlbBlob] 准备导出标签: ${child.name || child.uuid} -> ${label.substring(0, 50)}...`);
        }
      });
      
      console.log(`[exportSceneToGlbBlob] 导出前共有 ${labelMapByUuid.size} 个带标签的对象`);
      
      const exporter = new GLTFExporter();
      const options = {
        trs: true,
        binary: true,
        embedImages: true,
        onlyVisible: true,
        includeCustomExtensions: true
      };

      exporter.parse(
        target,
        result => {
          if (result instanceof ArrayBuffer) {
            // 解析GLB文件，手动添加extras字段
            try {
              const glbBlob = this.addSemanticLabelsToGlb(result, labelMapByName, labelMapByUuid);
              console.log(`[exportSceneToGlbBlob] 导出成功，文件大小: ${glbBlob.size} bytes`);
              resolve(glbBlob);
            } catch (err) {
              console.error('[exportSceneToGlbBlob] 添加标签到GLB失败，使用原始文件:', err);
              // 如果失败，返回原始文件
              const blob = new Blob([result], { type: "application/octet-stream" });
              resolve(blob);
            }
          } else {
            reject(new Error("GLB 导出结果为空"));
          }
        },
        error => {
          console.error('[exportSceneToGlbBlob] 导出失败:', error);
          reject(error);
        },
        options
      );
    });
  }

  // 验证GLB文件格式
  validateGlbFile(glbArrayBuffer) {
    try {
      const dataView = new DataView(glbArrayBuffer);
      
      // 检查文件大小
      if (glbArrayBuffer.byteLength < 12) {
        return { valid: false, error: 'GLB文件太小（< 12 bytes）' };
      }
      
      // 检查魔数
      const magic = dataView.getUint32(0, true);
      if (magic !== 0x46546C67) { // "glTF"
        return { valid: false, error: `无效的GLB魔数: 0x${magic.toString(16)}` };
      }
      
      // 检查版本
      const version = dataView.getUint32(4, true);
      if (version !== 2) {
        return { valid: false, error: `不支持的GLB版本: ${version}` };
      }
      
      // 检查总长度
      const length = dataView.getUint32(8, true);
      if (length !== glbArrayBuffer.byteLength) {
        return { valid: false, error: `GLB长度不匹配: 头部声明${length}, 实际${glbArrayBuffer.byteLength}` };
      }
      
      // 检查JSON块
      if (glbArrayBuffer.byteLength < 20) {
        return { valid: false, error: 'GLB文件缺少JSON块' };
      }
      
      const jsonChunkLength = dataView.getUint32(12, true);
      const jsonChunkType = dataView.getUint32(16, true);
      
      if (jsonChunkType !== 0x4E4F534A) { // "JSON"
        return { valid: false, error: `无效的JSON块类型: 0x${jsonChunkType.toString(16)}` };
      }
      
      // 尝试解析JSON
      const jsonStart = 20;
      const jsonEnd = jsonStart + jsonChunkLength;
      
      if (jsonEnd > glbArrayBuffer.byteLength) {
        return { valid: false, error: `JSON块超出文件范围: ${jsonEnd} > ${glbArrayBuffer.byteLength}` };
      }
      
      const jsonText = new TextDecoder().decode(glbArrayBuffer.slice(jsonStart, jsonEnd));
      
      try {
        JSON.parse(jsonText);
      } catch (jsonErr) {
        return { valid: false, error: `JSON解析失败: ${jsonErr.message}` };
      }
      
      return { valid: true };
    } catch (err) {
      return { valid: false, error: `验证失败: ${err.message}` };
    }
  }
  
  // 将语义标签添加到GLB文件的extras字段
  addSemanticLabelsToGlb(glbArrayBuffer, labelMapByName, labelMapByUuid) {
    if (labelMapByName.size === 0 && labelMapByUuid.size === 0) {
      return new Blob([glbArrayBuffer], { type: "application/octet-stream" });
    }

    // 先验证文件格式
    const validation = this.validateGlbFile(glbArrayBuffer);
    if (!validation.valid) {
      console.error('[addSemanticLabelsToGlb] GLB文件验证失败:', validation.error);
      throw new Error(`GLB文件格式错误: ${validation.error}`);
    }

    // GLB文件格式：12字节头部 + JSON块 + BIN块
    const dataView = new DataView(glbArrayBuffer);
    
    // 读取GLB头部
    const magic = dataView.getUint32(0, true);
    const version = dataView.getUint32(4, true);
    const length = dataView.getUint32(8, true);
    
    if (magic !== 0x46546C67) { // "glTF"
      throw new Error("无效的GLB文件格式");
    }
    
    // 读取JSON块
    const jsonChunkLength = dataView.getUint32(12, true);
    const jsonChunkType = dataView.getUint32(16, true);
    
    if (jsonChunkType !== 0x4E4F534A) { // "JSON"
      throw new Error("GLB文件格式错误：找不到JSON块");
    }
    
    // 解析JSON
    const jsonStart = 20;
    const jsonEnd = jsonStart + jsonChunkLength;
    const jsonText = new TextDecoder().decode(glbArrayBuffer.slice(jsonStart, jsonEnd));
    const gltf = JSON.parse(jsonText);
    
    // 规范化名称的辅助函数（去除特殊字符，统一为空格）
    const normalizeName = (name) => {
      if (!name) return '';
      return name.replace(/[_\->]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    
    // 打印所有可用的标签映射
    console.log(`[addSemanticLabelsToGlb] 可用的标签映射:`, Array.from(labelMapByName.entries()).map(([k, v]) => `${k} -> ${v.substring(0, 30)}...`));
    
    // 将标签添加到nodes的extras字段
    if (gltf.nodes) {
      console.log(`[addSemanticLabelsToGlb] GLTF共有 ${gltf.nodes.length} 个节点`);
      gltf.nodes.forEach((node, index) => {
        let label = null;
        let matchType = null;
        
        // 1. 尝试精确匹配名称
        if (node.name && labelMapByName.has(node.name)) {
          label = labelMapByName.get(node.name);
          matchType = '精确匹配';
        }
        // 2. 尝试规范化后的名称匹配
        else if (node.name) {
          const normalized = normalizeName(node.name);
          if (normalized && labelMapByName.has(normalized)) {
            label = labelMapByName.get(normalized);
            matchType = '规范化匹配';
          }
        }
        
        if (label) {
          node.extras = node.extras || {};
          node.extras.semanticLabel = label;
          console.log(`[addSemanticLabelsToGlb] ✓ ${matchType} - 节点 ${index} "${node.name}" -> ${label.substring(0, 50)}...`);
        } else {
          console.log(`[addSemanticLabelsToGlb] ✗ 未匹配 - 节点 ${index} "${node.name}"`);
        }
      });
    }
    
    // 将标签添加到meshes的extras字段
    if (gltf.meshes) {
      console.log(`[addSemanticLabelsToGlb] GLTF共有 ${gltf.meshes.length} 个mesh`);
      gltf.meshes.forEach((mesh, index) => {
        let label = null;
        let matchType = null;
        
        // 1. 尝试精确匹配名称
        if (mesh.name && labelMapByName.has(mesh.name)) {
          label = labelMapByName.get(mesh.name);
          matchType = '精确匹配';
        }
        // 2. 尝试规范化后的名称匹配
        else if (mesh.name) {
          const normalized = normalizeName(mesh.name);
          if (normalized && labelMapByName.has(normalized)) {
            label = labelMapByName.get(normalized);
            matchType = '规范化匹配';
          }
        }
        
        if (label) {
          mesh.extras = mesh.extras || {};
          mesh.extras.semanticLabel = label;
          console.log(`[addSemanticLabelsToGlb] ✓ ${matchType} - mesh ${index} "${mesh.name}" -> ${label.substring(0, 50)}...`);
        } else {
          console.log(`[addSemanticLabelsToGlb] ✗ 未匹配 - mesh ${index} "${mesh.name}"`);
        }
      });
    }
    
    // 重新编码JSON
    const newJsonText = JSON.stringify(gltf);
    const newJsonBuffer = new TextEncoder().encode(newJsonText);
    
    console.log(`[addSemanticLabelsToGlb] JSON字符串长度: ${newJsonText.length}, 编码后: ${newJsonBuffer.length} bytes`);
    
    // 计算新的JSON块长度（必须是4的倍数）
    const paddedJsonLength = Math.ceil(newJsonBuffer.length / 4) * 4;
    const paddingSize = paddedJsonLength - newJsonBuffer.length;
    // GLB规范要求JSON块的padding必须是空格字符（0x20），而不是null（0x00）
    const jsonPadding = new Uint8Array(paddingSize).fill(0x20);
    
    console.log(`[addSemanticLabelsToGlb] JSON块长度: ${newJsonBuffer.length} -> ${paddedJsonLength} (padding: ${paddingSize} bytes)`);
    
    // 读取BIN块（如果存在）
    const binChunkStart = jsonEnd;
    let binChunkLength = 0;
    let binChunkType = 0;
    let binData = new Uint8Array(0);
    
    if (binChunkStart < glbArrayBuffer.byteLength) {
      binChunkLength = dataView.getUint32(binChunkStart, true);
      binChunkType = dataView.getUint32(binChunkStart + 4, true);
      if (binChunkType === 0x004E4942) { // "BIN\0"
        binData = new Uint8Array(glbArrayBuffer.slice(binChunkStart + 8, binChunkStart + 8 + binChunkLength));
      } else {
        binChunkLength = 0; // 没有BIN块
      }
    }
    
    // 构建新的GLB文件
    const binChunkHeaderSize = binChunkLength > 0 ? 8 : 0;
    const newLength = 12 + 8 + paddedJsonLength + binChunkHeaderSize + binChunkLength;
    const newGlb = new ArrayBuffer(newLength);
    const newDataView = new DataView(newGlb);
    const newUint8Array = new Uint8Array(newGlb);
    
    let offset = 0;
    
    // 写入头部
    newDataView.setUint32(offset, magic, true); offset += 4;
    newDataView.setUint32(offset, version, true); offset += 4;
    newDataView.setUint32(offset, newLength, true); offset += 4;
    
    // 写入JSON块
    newDataView.setUint32(offset, paddedJsonLength, true); offset += 4;
    newDataView.setUint32(offset, jsonChunkType, true); offset += 4;
    newUint8Array.set(newJsonBuffer, offset);
    offset += newJsonBuffer.length;
    if (jsonPadding.length > 0) {
      newUint8Array.set(jsonPadding, offset);
      offset += jsonPadding.length;
    }
    
    // 写入BIN块（如果存在）
    if (binChunkLength > 0) {
      newDataView.setUint32(offset, binChunkLength, true); offset += 4;
      newDataView.setUint32(offset, 0x004E4942, true); offset += 4; // "BIN\0"
      newUint8Array.set(binData, offset);
    }
    
    console.log(`[addSemanticLabelsToGlb] 最终GLB文件大小: ${newLength} bytes (头部: 12, JSON块: ${8 + paddedJsonLength}, BIN块: ${binChunkHeaderSize + binChunkLength})`);
    
    return new Blob([newGlb], { type: "application/octet-stream" });
  }
  // 导出模型
  onExporterModel(type) {
    if (type == "usdz") {
      const exporter = new USDZExporter();
      exporter.parse(this.scene, usdz => {
        // 将导出的 USDZ 数据保存为文件或进行其他操作
        const blob = new Blob([usdz], { type: "model/vnd.usdz+zip" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${new Date().toLocaleString()}.usdz`;
        link.click();
        URL.revokeObjectURL(url);
        ElMessage.success("导出成功");
      });
    } else {
      const exporter = new GLTFExporter();
      const options = {
        trs: true, // 是否保留位置、旋转、缩放信息
        animations: this.modelAnimation, // 导出的动画
        binary: type == "glb" ? true : false, // 是否以二进制格式输出
        embedImages: true, //是否嵌入贴图
        onlyVisible: true, //是否只导出可见物体
        includeCustomExtensions: true
      };
      exporter.parse(
        this.model,
        result => {
          if (result instanceof ArrayBuffer) {
            // 将结果保存为GLB二进制文件
            saveArrayBuffer(result, `${new Date().toLocaleString()}.glb`);
          } else {
            // 将结果保存为GLTF JSON文件
            saveString(JSON.stringify(result), `${new Date().toLocaleString()}.gltf`);
          }
          function saveArrayBuffer(buffer, filename) {
            // 将二进制数据保存为文件
            const blob = new Blob([buffer], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            ElMessage.success("导出成功");
          }
          function saveString(text, filename) {
            // 将字符串数据保存为文件
            const blob = new Blob([text], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
            ElMessage.success("导出成功");
          }
        },
        err => {
          ElMessage.error(err);
        },
        options
      );
    }
  }

  // 清除模型数据
  onClearModelData() {
    cancelAnimationFrame(this.rotationAnimationFrame);
    cancelAnimationFrame(this.renderAnimation);
    cancelAnimationFrame(this.animationFrame);
    this.container.removeEventListener("click", this.onMouseClickListener);
    window.removeEventListener("resize", this.onWindowResizesListener);
    this.scene.traverse(v => {
      if (v.type === "Mesh") {
        v.geometry.dispose();
        v.material.dispose();
      }
      if (v.isMesh) {
        v.geometry.dispose();
        v.material.dispose();
      }
    });
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.clear();
    this.container = null;
    // 相机
    this.camera = null;
    // 场景
    this.scene = null;
    //渲染器
    this.renderer = null;
    // 控制器
    this.controls = null;
    // 模型
    this.model = null;
    //文件加载器类型
    this.fileLoaderMap = null;
    //模型动画列表
    this.modelAnimation = null;
    //模型动画对象
    this.animationMixer = null;
    this.animationClock = null;
    //动画帧
    this.animationFrame = null;
    // 轴动画帧
    this.rotationAnimationFrame = null;
    // 动画构造器
    this.animateClipAction = null;
    // 动画循环方式枚举
    this.loopMap = null;
    // 网格辅助线
    this.gridHelper = null;
    // 坐标轴辅助线
    this.axesHelper = null;
    // 环境光
    this.ambientLight = null;
    //平行光
    this.directionalLight = null;
    // 平行光辅助线
    this.directionalLightHelper = null;
    // 点光源
    this.pointLight = null;
    //点光源辅助线
    this.pointLightHelper = null;
    //聚光灯
    this.spotLight = null;
    //聚光灯辅助线
    this.spotLightHelper = null;
    //模型平面
    this.planeGeometry = null;
    //模型材质列表
    this.modelMaterialList = [];
    this.originalMaterials.clear();
    // 效果合成器
    this.effectComposer = null;
    this.outlinePass = null;
    // 动画渲染器
    this.renderAnimation = null;
    // 碰撞检测
    this.raycaster = null;
    // 鼠标位置
    this.mouse = null;
    // 辉光效果合成器
    if (this.glowComposer) {
      this.glowComposer.renderer.clear();
    }
    this.glowComposer = null;
    // 辉光渲染器
    this.unrealBloomPass = null;
    //辉光着色器
    this.shaderPass = null;
    // 需要辉光的材质
    this.glowMaterialList = null;
    this.materials = null;
    // 拖拽对象控制器
    this.transformControls = null;
    this.dragGeometryModel = null;
    this.glowUnrealBloomPass = false;
    // 3d文字渲染器
    this.css3DRenderer = null;
    // 3d文字控制器
    this.css3dControls = null;
    // 当前拖拽标签信息
    this.dragTag = {};
    //当前标签列表
    this.dragTagList = [];
    // 当前拖拽模型信息
    this.activeDragManyModel = {};
  }

  // 清除场景模型数据
  clearSceneModel() {
    this.camera.fov = 50;
    // 先移除模型 材质释放内存
    this.scene.traverse(v => {
      if (["Mesh"].includes(v.type)) {
        v.geometry.dispose();
        v.material.dispose();
      }
    });
    this.dragGeometryModel = {};
    this.activeDragManyModel = {};
    this.geometryGroup.clear();
    this.scene.remove(this.geometryGroup);
    this.scene.remove(this.manyModelGroup);
    this.manyModelGroup.clear();

    // 移除添加的多模型
    const removeModelList = this.scene.children.filter(v => v.userData.type == "manyModel");
    removeModelList.forEach(v => {
      this.scene.remove(v);
    });
    this.scene.remove(this.model);
    this.model = null;

    //取消动画帧
    cancelAnimationFrame(this.animationFrame);
    cancelAnimationFrame(this.rotationAnimationFrame);

    this.glowUnrealBloomPass = false;
    this.glowMaterialList = [];
    this.modelMaterialList = [];
    this.originalMaterials.clear();

    this.materials = {};
    if (this.transformControls) {
      this.transformControls.detach();
      const transformControlsPlane = findObjectInScene(this.scene, { type: "TransformControlsPlane" });
      if (transformControlsPlane) {
        this.scene.remove(transformControlsPlane);
      }
      this.scene.remove(this.transformControls);
      this.transformControls = null;
    }

    if (this.effectComposer) {
      this.effectComposer.removePass(this.shaderPass);
    }

    this.renderer.toneMappingExposure = 2;
    this.outlinePass.selectedObjects = [];

    Object.assign(this.unrealBloomPass, {
      threshold: 0,
      strength: 0,
      radius: 0
    });
    this.shaderPass.material.uniforms.glowColor.value = new THREE.Color();

    const config = {
      gridHelper: false,
      x: 0,
      y: -0.59,
      z: -0.1,
      positionX: 0,
      positionY: -1,
      positionZ: 0,
      divisions: 18,
      size: 6,
      color: "rgb(193,193,193)",
      axesHelper: false,
      axesSize: 1.8
    };
    this.lightModules.onResettingLight({ ambientLight: true });

    this.onSetModelGridHelper(config);
    this.onSetModelGridHelperSize(config);
    this.onSetModelAxesHelper(config);
    this.clearSceneTags();
  }
  // 设置当前被拖拽的几何模型
  setDragGeometryModel(model) {
    this.dragGeometryModel = model;
  }
  // 设置当前被拖拽的多模型
  setDragManyModel(model) {
    this.activeDragManyModel = model;
  }
  // 加载多模型
  onLoadManyModel(model) {
    return new Promise((resolve, reject) => {
      const { clientHeight, clientWidth, offsetLeft, offsetTop } = this.container;
      const { filePath, fileType, name } = model;
      // 计算鼠标在屏幕上的坐标
      this.mouse.x = ((model.clientX - offsetLeft) / clientWidth) * 2 - 1;
      this.mouse.y = -((model.clientY - offsetTop) / clientHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);
      if (intersects.length > 0) {
        this.loadingStatus = false;
        let loader;
        if (["glb", "gltf"].includes(fileType)) {
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath(`draco/`);
          dracoLoader.setDecoderConfig({ type: "js" });
          dracoLoader.preload();
          loader = new GLTFLoader().setDRACOLoader(dracoLoader);
        } else {
          loader = this.fileLoaderMap[fileType];
        }
        let manyModel;
        loader.load(
          filePath,
          result => {
            switch (fileType) {
              case "glb":
                manyModel = result.scene;
                break;
              case "fbx":
                manyModel = result;
                break;
              case "gltf":
                manyModel = result.scene;
                break;
            case "obj":
              manyModel = result;
              this.parseObjSemanticLabels(result);
              break;
              case "stl":
                const material = new THREE.MeshStandardMaterial();
                const mesh = new THREE.Mesh(result, material);
                manyModel = mesh;
                break;
              default:
                break;
            }
            this.getManyModelAnimationList(result.animations);

            // 设置模型位置
            const { x, y, z } = intersects[0].point;
            manyModel.position.set(x, y, z);
            const box = new THREE.Box3().setFromObject(manyModel);
            const size = box.getSize(new THREE.Vector3());
            const maxSize = Math.max(size.x, size.y, size.z);
            const targetSize = 1.2;
            const scale = targetSize / (maxSize > 1 ? maxSize : 0.5);
            manyModel.scale.set(scale, scale, scale);
            manyModel.name = name;
            manyModel.userData = {
              type: "manyModel",
              ...manyModel.userData
            };
            this.manyModelGroup.add(manyModel);
            this.model = this.manyModelGroup;
            this.outlinePass.renderScene = this.model;
            this.materialModules.getModelMaterialList();
            // 需要辉光的材质
            this.glowMaterialList = this.modelMaterialList.map(v => v.name);
            this.scene.add(this.model);
            this.loadingStatus = true;

            resolve({ load: true });
          },
          xhr => {
            this.modelProgressCallback(xhr.loaded, xhr.total);
          },
          err => {
            ElMessage.error(err);
            reject();
          }
        );
      } else {
        reject();
        ElMessage.warning("当前角度无法获取鼠标位置请调整“相机角度”在添加");
      }
    });
  }
  // 选择多模型切换
  chooseManyModel(uuid) {
    const chooseModel = this.scene.children.find(v => v.uuid == uuid);
    // 设置当前编辑模型
    this.model = chooseModel;
    this.outlinePass.renderScene = this.model;
    // 更新当前编辑的模型材质列表
    this.materialModules.getModelMaterialList();
  }
}

Object.assign(renderModel.prototype, {
  ...modulesPrototype
});

export default renderModel;
