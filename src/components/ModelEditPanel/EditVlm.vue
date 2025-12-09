<template>
  <div class="edit-box">
    <div class="header">
      <span>标签栏</span>
    </div>

    <div class="section">
      <div class="header">
        <span>模型材质</span>
      </div>
      <div class="options material-list" v-if="materialList.length">
        <el-scrollbar max-height="220px">
          <div
            v-for="mesh in materialList"
            :key="mesh.uuid"
            class="option material-item"
            :class="selectedUuid == mesh.uuid ? 'option-active' : ''"
            @click="onSelectMaterial(mesh)"
          >
            <el-space>
              <el-icon
                size="18"
                :color="mesh.visible ? '#18c174' : '#f56c6c'"
                @click.stop="toggleMeshVisible(mesh)"
              >
                <component :is="mesh.visible ? 'View' : 'Hide'"></component>
              </el-icon>
              <div class="icon-name">{{ mesh.name || mesh.uuid }}</div>
              <div class="check" v-if="selectedUuid == mesh.uuid">
                <el-icon size="20px" color="#2a3ff6">
                  <Check />
                </el-icon>
              </div>
            </el-space>
          </div>
        </el-scrollbar>
      </div>
      <el-empty v-else description="暂无材质信息" :image-size="80" />
    </div>

    <div class="section">
      <div class="header">
        <span>API 配置</span>
      </div>
      <div class="options api-row">
        <div class="api-input">
          <el-input
            v-model="apiConfig.baseUrl"
            size="small"
            clearable
            placeholder="请输入API接口地址"
          />
        </div>
        <div class="api-input">
          <el-input
            v-model="apiConfig.apiKey"
            size="small"
            clearable
            placeholder="请输入API Key"
            show-password
          />
        </div>
        <div class="api-input">
          <el-input
            v-model="apiConfig.modelName"
            size="small"
            clearable
            placeholder="请输入模型名"
          />
        </div>
        <div class="api-action">
          <el-button type="primary" size="small" :loading="testing" @click="onTestApi">测试</el-button>
          <el-button type="success" size="small" @click="saveApiConfig">保存配置</el-button>
          <span class="status-message" :class="testState" v-if="testMessage">
            {{ testMessage }}
          </span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="header">
        <span>提示词库</span>
        <div class="rule-selector">
          <el-radio-group v-model="selectionRule" size="small">
            <el-radio-button label="random">随机</el-radio-button>
            <el-radio-button label="weighted">加权</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <div class="options prompt-actions-row">
        <el-button 
          type="success" 
          size="small" 
          icon="FolderOpened"
          @click="loadPromptsFromServer"
          :loading="loadingPrompts"
        >
          从文件加载
        </el-button>
        <el-button 
          type="primary" 
          size="small" 
          icon="Document"
          @click="savePromptsToServer"
          :loading="savingPrompts"
        >
          保存到文件
        </el-button>
      </div>
      <div class="options prompt-list">
        <el-scrollbar max-height="200px">
          <div
            v-for="prompt in promptList"
            :key="prompt.id"
            class="option prompt-item"
          >
            <div class="prompt-preview" @click="editPrompt(prompt)">
              {{ truncatePrompt(prompt.content) }}
            </div>
            <div class="prompt-actions">
              <el-button 
                type="text" 
                size="small"
                icon="Edit" 
                @click="editPrompt(prompt)"
              />
              <el-button 
                v-if="selectionRule === 'weighted'"
                type="text" 
                size="small"
                class="weight-control"
              >
                <el-input-number
                  v-model="prompt.weight"
                  :min="1"
                  :max="100"
                  size="small"
                  controls-position="right"
                  @click.stop
                />
              </el-button>
              <el-button 
                type="text" 
                size="small"
                icon="Delete" 
                @click="deletePrompt(prompt.id)"
                :disabled="promptList.length === 1"
              />
            </div>
          </div>
        </el-scrollbar>
        <el-button 
          type="primary" 
          size="small" 
          style="margin-top: 8px; width: 100%"
          @click="addNewPrompt"
        >
          添加提示词
        </el-button>
      </div>
      
      <div class="header">
        <span>截图配置</span>
      </div>
      
      <div class="options screenshot-row">
        <el-button type="info" size="small" @click="captureSceneImage" :disabled="!selectedUuid || multiCapturing">
          截图
        </el-button>
        <div class="view-selector">
          <el-button
            v-for="viewKey in MULTI_VIEW_ORDER"
            :key="viewKey"
            size="mini"
            :type="selectedViewKeys.includes(viewKey) ? 'primary' : 'default'"
            :disabled="multiCapturing"
            @click="toggleViewSelection(viewKey)"
          >
            {{ CAMERA_VIEW_PRESETS[viewKey]?.label?.charAt(0) || viewKey }}
          </el-button>
        </div>
        <span class="hint">
          先选中某个材质再点截图；点选的视图会自动截图
        </span>
      </div>
      <div class="options slider-row">
        <div class="slider-label">
          <span>最大并发度</span>
          <span>{{ batchConcurrency }}</span>
        </div>
        <el-slider
          v-model="batchConcurrency"
          :min="1"
          :max="8"
          :step="1"
          show-input
          :disabled="batchSending"
        />
      </div>
      <div class="options capture-list" v-if="captures.length">
        <el-row type="flex" gutter="8" class="capture-row">
          <el-col :span="6" v-for="capture in captures" :key="capture.id">
            <div class="capture-item">
              <img :src="capture.url" alt="capture" />
              <div class="capture-footer">
                <span class="capture-name">{{ capture.name }}</span>
                <el-button type="text" icon="Delete" @click="removeCapture(capture.id)" />
              </div>
            </div>
          </el-col>
        </el-row>
      </div>
      <div class="options action-row">
        <el-button
          type="primary"
          size="small"
          :loading="sending"
          :disabled="batchSending"
          @click="onSendPrompt"
        >
          提交
        </el-button>
        <el-button
          type="warning"
          size="small"
          :loading="batchSending"
          :disabled="sending || !materialList.length"
          @click="onBatchSendPrompt"
        >
          批量提交
        </el-button>
        <span class="status-message" :class="conversationState" v-if="conversationText">
          {{ conversationState === 'success' ? '请求成功' : '请求失败' }}
        </span>
        <span class="status-message batch" :class="batchConversationState" v-if="batchConversationText">
          {{ batchConversationText }}
        </span>
      </div>
      <div class="options response-panel">
        <div class="response-title">
          <span>VLM 返回内容</span>
          <span v-if="batchResults.length" style="margin-left: 6px; font-weight: normal">
            ({{ batchResults.length }})
          </span>
        </div>
        
        <!-- 批量结果列表 -->
        <div v-if="batchResults.length" class="batch-results-list">
          <div v-for="(item, index) in batchResults" :key="index" class="batch-result-item">
            <div class="batch-item-header">
              <span class="batch-item-name" :title="item.materialName">{{ item.materialName }}</span>
              <el-button type="text" size="small" @click="openResultDetail(item)">
                <el-icon><View /></el-icon>
              </el-button>
            </div>
            <div class="batch-item-preview" :class="{ error: item.error }">
              {{ formatPreview(item.text || item.error) }}
            </div>
          </div>
        </div>
        
        <!-- 单次对话结果 -->
        <template v-else>
          <div class="response-body" v-if="conversationText">{{ conversationText }}</div>
          <div class="response-body empty-text" v-else>等待发送内容...</div>
        </template>
      </div>

      <div class="options write-btn-row">
        <el-button
          type="primary"
          size="small"
          :disabled="!conversationText && !batchResults.length"
          @click="onWriteLabel"
        >
          写入标签
        </el-button>
      </div>
    </div>
    
    <el-dialog
      v-model="showResultDialog"
      :title="currentDetailTitle"
      width="500px"
      append-to-body
      custom-class="vlm-result-dialog"
    >
      <div class="detail-content">{{ currentDetailContent }}</div>
    </el-dialog>

    <el-dialog
      v-model="showPromptDialog"
      title="编辑提示词"
      width="600px"
      append-to-body
      custom-class="prompt-edit-dialog"
    >
      <el-input
        v-model="promptDialogContent"
        type="textarea"
        :autosize="{ minRows: 10, maxRows: 20 }"
        placeholder="输入提示词内容"
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="cancelEditPrompt">取消</el-button>
          <el-button type="primary" @click="savePrompt">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, getCurrentInstance, watch } from "vue";
import { useMeshEditStore } from "@/store/meshEditStore";
import { useFileStore } from "@/store/fileStore";
import { getModelFile, saveModelFile } from "@/utils/filePersistence";
import MultiImageVLM from "@/utils/vlmService";
import { ElMessage } from "element-plus";
import { CAMERA_VIEW_PRESETS } from "@/utils/modelEditClass/helperModules";

const store = useMeshEditStore();
const fileStore = useFileStore();
const vlmClient = new MultiImageVLM();

const apiConfig = reactive({
  baseUrl: "https://aihubmix.com",
  apiKey: "",
  modelName: ""
});
const CONFIG_STORAGE_KEY = "vlm-api-config";
const PROMPT_STORAGE_KEY = "vlm-prompt-library";
const DEFAULT_MODEL_NAME = "qwen3-vl-235b-a22b-instruct";
const { proxy } = getCurrentInstance();
const $local = proxy.$local;

const saveApiToStorage = () => {
  const payload = {
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    modelName: apiConfig.modelName
  };
  $local.set(CONFIG_STORAGE_KEY, payload);
};

const savePromptLibrary = () => {
  const payload = {
    prompts: promptList.value,
    selectionRule: selectionRule.value
  };
  $local.set(PROMPT_STORAGE_KEY, payload);
};

const loadPromptLibrary = () => {
  const stored = $local.get(PROMPT_STORAGE_KEY);
  if (stored?.prompts && Array.isArray(stored.prompts) && stored.prompts.length > 0) {
    promptList.value = stored.prompts;
  }
  if (stored?.selectionRule) {
    selectionRule.value = stored.selectionRule;
  }
};

const DEFAULT_PROMPT = `You are an industrial design expert specializing in analyzing the interactive properties of 3D models. When users provide screenshots of 3D models with highlighted areas (marked by yellow borders)—which may include multiple views such as front/top/side/isometric—strictly follow these rules to generate a description in a **single paragraph**:

#### **Core Requirements**

1. **Focus exclusively on highlighted areas**: Completely ignore non-highlighted sections  
2. **Prioritize interaction details**:  
   - Specify operation method (press/flip/rotate/slide)  
   - Quantify operational parameters (force/travel distance/angle)  
   - Describe the resulting effect  
3. **Supplement with physical details**:  
   - Precise materials (e.g., aerospace-grade aluminum/silicone rubber)  
   - Exact colors  
   - Printed fonts or paintings
4. **Output must**:  
   - Be a **single paragraph** (no bullet points/headings)  
   - Use active verbs for operations (e.g., "press backward" not "can be pressed")  

#### **Prohibited Actions**  
- Never describe non-highlighted areas  
- Avoid vague quantifiers (e.g., "slight pressure")  
- Add no explanatory prefixes/suffixes  

#### **Response Examples**  
▶ **Example 1 (Firearm Trigger)**  
This is the trigger of a firearm, part of the lower receiver assembly. Press backward with 5N force (4mm travel) to activate the firing mechanism; features a bead-blasted zinc alloy surface in matte black (#1A1A1A) with an internal helical trigger spring providing reset force.  

▶ **Example 2 (Keyboard Keycap)**  
The W key in the primary typing zone triggers character input via vertical depression (requiring 1.2N force, 2mm travel); its keycap uses oil-resistant coated PBT plastic with a white body (#FFFFFF) and laser-etched characters, featuring a micro-concave spherical surface contoured for fingertip contact.  

▶ **Example 3 (Automotive Tire)**  
This is the front-left tire of an automobile, part of the suspension system. Non-interactive; the tread uses synthetic rubber with deep-groove patterning, primarily carbon black in color, paired with a silver wheel rim.  

Now directly respond with the description for the specified 3D model section:`;

const promptList = ref([
  {
    id: 'default-prompt-1',
    content: DEFAULT_PROMPT,
    weight: 1
  }
]);

const selectionRule = ref('random');
const showPromptDialog = ref(false);
const editingPrompt = ref(null);
const promptDialogContent = ref('');

const conversationText = ref("");
const conversationState = ref("");
const testMessage = ref("");
const testState = ref("");
const testing = ref(false);
const sending = ref(false);
const captures = ref([]);
const multiCapturing = ref(false);
const selectedViewKeys = ref([]);
const batchConcurrency = ref(4);
const batchSending = ref(false);
const batchConversationText = ref("");
const batchConversationState = ref("");
const batchResults = ref([]);
const showResultDialog = ref(false);
const currentDetailTitle = ref("");
const currentDetailContent = ref("");
const savingPrompts = ref(false);
const loadingPrompts = ref(false);

const openResultDetail = item => {
  currentDetailTitle.value = item.materialName;
  currentDetailContent.value = item.error ? `错误: ${item.error}` : item.text;
  showResultDialog.value = true;
};

const formatPreview = text => {
  if (!text) return "无内容";
  const maxLen = 60;
  if (text.length <= maxLen) return text;
  return `${text.slice(0, 20)}...${text.slice(-20)}`;
};

const truncatePrompt = (text, maxLength = 80) => {
  if (!text) return "空提示词";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

const selectPromptByRule = () => {
  if (promptList.value.length === 0) return '';
  if (promptList.value.length === 1) return promptList.value[0].content;
  
  if (selectionRule.value === 'random') {
    const randomIndex = Math.floor(Math.random() * promptList.value.length);
    return promptList.value[randomIndex].content;
  } else {
    // 加权选择
    const totalWeight = promptList.value.reduce((sum, p) => sum + (p.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (const prompt of promptList.value) {
      random -= (prompt.weight || 1);
      if (random <= 0) {
        return prompt.content;
      }
    }
    
    return promptList.value[0].content;
  }
};

const addNewPrompt = () => {
  const newPrompt = {
    id: `prompt-${Date.now()}`,
    content: '请输入新的提示词内容...',
    weight: 1
  };
  promptList.value.push(newPrompt);
  savePromptLibrary();
  editPrompt(newPrompt);
};

const editPrompt = (prompt) => {
  editingPrompt.value = prompt;
  promptDialogContent.value = prompt.content;
  showPromptDialog.value = true;
};

const savePrompt = () => {
  if (editingPrompt.value) {
    editingPrompt.value.content = promptDialogContent.value;
    showPromptDialog.value = false;
    editingPrompt.value = null;
    promptDialogContent.value = '';
    savePromptLibrary();
    ElMessage.success('提示词已更新');
  }
};

const cancelEditPrompt = () => {
  showPromptDialog.value = false;
  editingPrompt.value = null;
  promptDialogContent.value = '';
};

const deletePrompt = (id) => {
  if (promptList.value.length <= 1) {
    ElMessage.warning('至少需要保留一个提示词');
    return;
  }
  promptList.value = promptList.value.filter(p => p.id !== id);
  savePromptLibrary();
  ElMessage.success('提示词已删除');
};

const MULTI_VIEW_ORDER = ["main", "top", "side", "axial"];

const materialList = computed(() => store.modelApi?.modelMaterialList || []);
const selectedUuid = computed(() => store.selectMeshUuid);

const truncateText = (text, maxLength = 60) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}……`;
};

const formatTestMessage = text => `连接正常！回复内容：${truncateText(text)}`;

const toggleMeshVisible = mesh => {
  if (!mesh?.uuid) return;
  mesh.visible = !mesh.visible;
  store.modelApi?.materialModules?.onSetMeshVisible?.(mesh);
};

const onSelectMaterial = mesh => {
  if (!mesh) return;
  store.selectMeshAction(mesh);
  store.modelApi?.materialModules?.onChangeModelMaterial?.(mesh.name);
};

const parseError = error => {
  const response = error?.response?.data || {};
  return {
    message: response.message || response.error?.message || error?.message || "接口请求异常",
    code: response.code || response.error?.code
  };
};

const decorateMessage = (text, code) => (code ? `错误 ${code}：${text}` : text);

const ensureModelName = () => {
  if (!apiConfig.modelName) {
    apiConfig.modelName = DEFAULT_MODEL_NAME;
  }
};

const saveApiConfig = () => {
  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    ElMessage.warning("保存前请补全API地址和Key");
    return;
  }
  ensureModelName();
  saveApiToStorage();
  ElMessage.success("API配置已保存");
};

const buildClient = () => {
  vlmClient.init({
    baseUrl: apiConfig.baseUrl,
    apiKey: apiConfig.apiKey,
    modelName: apiConfig.modelName || DEFAULT_MODEL_NAME
  });
  return vlmClient;
};

const captureSceneImage = async () => {
  if (!selectedUuid.value) {
    ElMessage.warning("请先选择一个材质再截图");
    return;
  }
  const selectedPresetKeys = MULTI_VIEW_ORDER.filter(key => selectedViewKeys.value.includes(key));
  if (selectedPresetKeys.length) {
    await capturePresetSequence(selectedPresetKeys);
    return;
  }
  const coverData = store.modelApi?.getSceneCoverDataUrl?.();
  if (!coverData) {
    ElMessage.warning("渲染画面尚未准备好");
    return;
  }
  const index = addCapture(coverData);
  ElMessage.success(`已生成截图 img-${index}`);
};

const addCapture = url => {
  const index = captures.value.length + 1;
  captures.value.push({
    id: `capture-${Date.now()}-${index}`,
    name: `img-${index}`,
    url
  });
  return index;
};

const waitForNextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

const restoreCameraState = original => {
  if (!original || !store.modelApi?.camera) return;
  const modelApi = store.modelApi;
  modelApi.camera.position.copy(original.position);
  const lookAtTarget = original.target || { x: 0, y: 0, z: 0 };
  modelApi.camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
  modelApi.camera.updateProjectionMatrix();
  if (modelApi.controls) {
    if (original.target) {
      modelApi.controls.target.copy(original.target);
    }
    modelApi.controls.update();
  }
};

const capturePresetSequence = async viewKeys => {
  if (multiCapturing.value) return;
  if (!store.modelApi?.camera || !store.modelApi?.onSetCameraView) {
    ElMessage.warning("相机尚未准备好，无法进行多视角截图");
    return;
  }
  const modelApi = store.modelApi;
  const originalState = {
    position: modelApi.camera.position.clone(),
    target: modelApi.controls?.target?.clone?.()
  };
  multiCapturing.value = true;
  let successCount = 0;
  try {
    for (const viewKey of viewKeys) {
      const preset = CAMERA_VIEW_PRESETS[viewKey];
      if (!preset) continue;
      modelApi.onSetCameraView(viewKey);
      await waitForNextFrame();
      const coverData = modelApi.getSceneCoverDataUrl?.();
      if (!coverData) {
        ElMessage.warning(`${preset.label} 渲染尚未准备好`);
        continue;
      }
      addCapture(coverData);
      successCount++;
    }
    if (successCount) {
      ElMessage.success(`已生成 ${successCount} 张多视角截图`);
    }
  } catch (error) {
    console.error("多视角截图失败", error);
    ElMessage.error("多视角截图失败");
  } finally {
    restoreCameraState(originalState);
    multiCapturing.value = false;
  }
};

const toggleViewSelection = viewKey => {
  if (multiCapturing.value) return;
  const index = selectedViewKeys.value.indexOf(viewKey);
  if (index > -1) {
    selectedViewKeys.value = selectedViewKeys.value.filter(key => key !== viewKey);
  } else {
    selectedViewKeys.value = [...selectedViewKeys.value, viewKey];
  }
};

const removeCapture = id => {
  captures.value = captures.value.filter(item => item.id !== id);
};

const loadSavedConfig = () => {
  const stored = $local.get(CONFIG_STORAGE_KEY);
  if (stored?.baseUrl) apiConfig.baseUrl = stored.baseUrl;
  if (stored?.apiKey) apiConfig.apiKey = stored.apiKey;
  apiConfig.modelName = stored?.modelName || DEFAULT_MODEL_NAME;
};

onMounted(async () => {
  apiConfig.modelName = DEFAULT_MODEL_NAME;
  loadSavedConfig();
  
  // 先尝试从服务器文件加载提示词
  try {
    const response = await fetch('http://localhost:3001/api/prompts-library');
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data?.prompts?.length > 0) {
        promptList.value = result.data.prompts;
        if (result.data.selectionRule) {
          selectionRule.value = result.data.selectionRule;
        }
        console.log('从服务器文件加载提示词成功');
        return; // 成功加载，直接返回
      }
    }
  } catch (error) {
    console.log('从服务器文件加载提示词失败，将使用本地存储:', error.message);
  }
  
  // 如果服务器文件加载失败，则从 localStorage 加载
  loadPromptLibrary();
});

// 监听权重变化和规则变化，自动保存
watch(
  () => promptList.value.map(p => p.weight),
  () => {
    savePromptLibrary();
  },
  { deep: true }
);

watch(selectionRule, () => {
  savePromptLibrary();
});

const onTestApi = async () => {
  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    testMessage.value = "请先填写API地址和Key";
    testState.value = "error";
    return;
  }
  testing.value = true;
  testMessage.value = "";
  testState.value = "";
  try {
    const result = await buildClient().generateWithImages("视觉语言接口连通测试", []);
    if (result.error) {
      testMessage.value = decorateMessage(result.error, result.raw?.error?.code);
      testState.value = "error";
      ElMessage.error("API测试失败");
    } else {
      testMessage.value = formatTestMessage(result.text || "接口响应成功但未返回文本");
      testState.value = "success";
      ElMessage.success("API测试成功");
    }
  } catch (error) {
    const { message, code } = parseError(error);
    testMessage.value = decorateMessage(message, code);
    testState.value = "error";
    ElMessage.error("API测试异常");
  } finally {
    testing.value = false;
  }
};

const onSendPrompt = async () => {
  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    ElMessage.warning("请先填写 API 地址和 Key");
    return;
  }
  
  const selectedPrompt = selectPromptByRule();
  if (!selectedPrompt.trim()) {
    ElMessage.warning("提示词库为空或提示词内容为空");
    return;
  }
  
  sending.value = true;
  conversationText.value = "";
  conversationState.value = "";
  batchResults.value = [];
  try {
    const imageInputs = captures.value.map(item => item.url);
    const result = await buildClient().generateWithImages(selectedPrompt.trim(), imageInputs);
    if (result.error) {
      conversationText.value = decorateMessage(result.error, result.raw?.error?.code);
      conversationState.value = "error";
      ElMessage.error("VLM调用失败");
    } else {
      conversationText.value = result.text || "接口返回但无文本内容";
      conversationState.value = "success";
      ElMessage.success("收到VLM回复");
    }
  } catch (error) {
    const { message, code } = parseError(error);
    conversationText.value = decorateMessage(message, code);
    conversationState.value = "error";
    ElMessage.error("VLM请求异常");
  } finally {
    sending.value = false;
  }
};

const captureMaterialWithViews = async (mesh, viewKeys) => {
  if (!store.modelApi?.camera || !store.modelApi?.onSetCameraView) {
    return [];
  }
  
  const modelApi = store.modelApi;
  const originalState = {
    position: modelApi.camera.position.clone(),
    target: modelApi.controls?.target?.clone?.()
  };
  
  const capturedImages = [];
  
  try {
    // 选中当前材质
    onSelectMaterial(mesh);
    await waitForNextFrame();
    
    // 如果没有指定视图，使用当前视图
    if (!viewKeys || viewKeys.length === 0) {
      const coverData = modelApi.getSceneCoverDataUrl?.();
      if (coverData) {
        capturedImages.push(coverData);
      }
      return capturedImages;
    }
    
    // 按指定视图截图
    for (const viewKey of viewKeys) {
      const preset = CAMERA_VIEW_PRESETS[viewKey];
      if (!preset) continue;
      
      modelApi.onSetCameraView(viewKey);
      await waitForNextFrame();
      
      const coverData = modelApi.getSceneCoverDataUrl?.();
      if (coverData) {
        capturedImages.push(coverData);
      }
    }
  } catch (error) {
    console.error(`材质 ${mesh.name || mesh.uuid} 截图失败`, error);
  } finally {
    restoreCameraState(originalState);
  }
  
  return capturedImages;
};

const onBatchSendPrompt = async () => {
  if (!apiConfig.baseUrl || !apiConfig.apiKey) {
    ElMessage.warning("请先填写 API 地址和 Key");
    return;
  }
  
  const selectedPrompt = selectPromptByRule();
  if (!selectedPrompt.trim()) {
    ElMessage.warning("提示词库为空或提示词内容为空");
    return;
  }
  
  if (!materialList.value.length) {
    ElMessage.warning("当前没有材质可以批量处理");
    return;
  }
  
  // 获取选中的视图
  const selectedPresetKeys = MULTI_VIEW_ORDER.filter(key => selectedViewKeys.value.includes(key));
  if (selectedPresetKeys.length === 0) {
    ElMessage.warning("请先选择至少一个视图角度");
    return;
  }
  
  batchSending.value = true;
  batchConversationText.value = "";
  batchConversationState.value = "";
  batchResults.value = [];
  
  try {
    ElMessage.info(`开始批量处理 ${materialList.value.length} 个材质...`);
    
    // 为每个材质准备请求
    const requests = [];
    const materialNames = [];
    
    for (const mesh of materialList.value) {
      const images = await captureMaterialWithViews(mesh, selectedPresetKeys);
      
      if (images.length === 0) {
        console.warn(`材质 ${mesh.name || mesh.uuid} 未能生成截图`);
        continue;
      }
      
      materialNames.push(mesh.name || mesh.uuid);
      // 为每个材质根据规则选择提示词
      const promptForThisMaterial = selectionRule.value === 'random' ? selectPromptByRule() : selectedPrompt;
      requests.push([
        promptForThisMaterial.trim(),
        images,
        {}
      ]);
    }
    
    if (requests.length === 0) {
      ElMessage.error("所有材质截图失败，无法继续");
      batchConversationText.value = "批量截图失败";
      batchConversationState.value = "error";
      return;
    }
    
    // 批量调用 VLM API
    const results = await buildClient().generateBatch(requests, batchConcurrency.value);
    batchResults.value = results.map((res, idx) => ({
      ...res,
      materialName: materialNames[idx]
    }));
    
    // 统计结果
    let successCount = 0;
    let errorCount = 0;
    
    batchResults.value.forEach(result => {
      if (result.error) {
        errorCount++;
        console.error(`材质 ${result.materialName} 请求失败:`, result.error);
      } else {
        successCount++;
        console.log(`材质 ${result.materialName} 请求成功:`, truncateText(result.text, 30));
      }
    });
    
    // 更新状态
    if (successCount > 0 && errorCount === 0) {
      batchConversationText.value = `批量处理成功：${successCount}/${requests.length} 个材质`;
      batchConversationState.value = "success";
      ElMessage.success(`批量处理完成！成功 ${successCount} 个`);
    } else if (successCount > 0) {
      batchConversationText.value = `部分成功：${successCount} 成功，${errorCount} 失败`;
      batchConversationState.value = "warning";
      ElMessage.warning(`批量处理完成：${successCount} 成功，${errorCount} 失败`);
    } else {
      batchConversationText.value = `批量处理失败：${errorCount} 个全部失败`;
      batchConversationState.value = "error";
      ElMessage.error("批量处理失败");
    }
    
    conversationText.value = "";
    
  } catch (error) {
    const { message, code } = parseError(error);
    batchConversationText.value = decorateMessage(message, code);
    batchConversationState.value = "error";
    ElMessage.error("批量处理异常");
    console.error("批量处理异常:", error);
  } finally {
    batchSending.value = false;
  }
};

const getPanelConfig = () => ({
  apiConfig: { ...apiConfig },
  promptList: promptList.value,
  selectionRule: selectionRule.value,
  conversationText: conversationText.value,
  testMessage: testMessage.value
});

const escapeRegExp = string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const writeAutoTags = async (fileId, batchResultsData) => {
  if (!fileId) {
    ElMessage.warning("未找到文件ID");
    return;
  }

  // 处理单次对话和批量结果
  // 如果传入了 batchResultsData，优先使用；否则使用组件内的 batchResults.value
  const results = batchResultsData || batchResults.value;
  const hasBatch = results.length > 0;
  // 只有在没有传入 batchResultsData 且有 conversationText 时才视为单次写入
  const hasSingle = !batchResultsData && !!conversationText.value;

  if (!hasSingle && !hasBatch) return;

  try {
    const fileRecord = await getModelFile(fileId);
    if (!fileRecord || !fileRecord.fileBlob) {
      ElMessage.error("无法读取文件内容");
      return;
    }

    const fileName = fileRecord.name || "";
    const isObjFile = fileName.toLowerCase().endsWith(".obj");
    const isGlbFile = /\.(glb|gltf)$/i.test(fileName);

    if (!isObjFile && !isGlbFile) {
      ElMessage.warning("目前仅支持 .obj、.glb/.gltf 文件写入标签");
      return;
    }

    const applyLabelToMesh = (mesh, label) => {
      if (!mesh || !label) {
        console.warn(`[applyLabelToMesh] 参数无效: mesh=${!!mesh}, label=${!!label}`);
        return false;
      }
      console.log(`[applyLabelToMesh] 应用标签到: ${mesh.name || mesh.uuid}, 标签: ${label.substring(0, 50)}...`);
      mesh.userData = mesh.userData || {};
      mesh.userData.semanticLabel = label;
      if (mesh.material) {
        mesh.material.userData = mesh.material.userData || {};
        mesh.material.userData.label = label;
        console.log(`[applyLabelToMesh] 同时设置material.userData.label`);
      }
      if (store.modelApi) {
        store.modelApi.semanticLabels = store.modelApi.semanticLabels || {};
        store.modelApi.semanticLabels[mesh.uuid] = label;
        console.log(`[applyLabelToMesh] 同时设置modelApi.semanticLabels[${mesh.uuid}]`);
      }
      return true;
    };

    const assignLabelByName = (name, label) => {
      console.log(`[writeAutoTags] 尝试通过名称分配标签: "${name}" -> "${label?.substring(0, 50)}..."`);
      const mesh = store.modelApi?.model?.getObjectByName(name);
      if (!mesh) {
        console.warn(`[writeAutoTags] 未找到名为 "${name}" 的对象`);
        return false;
      }
      console.log(`[writeAutoTags] 找到对象: ${mesh.name} (${mesh.type})`);
      const result = applyLabelToMesh(mesh, label);
      if (result) {
        console.log(`[writeAutoTags] ✓ 成功分配标签到: ${mesh.name}`);
      } else {
        console.warn(`[writeAutoTags] ✗ 分配标签失败: ${mesh.name}`);
      }
      return result;
    };

    const assignLabelByUuid = (uuid, label) => {
      const mesh = store.modelApi?.model?.getObjectByProperty("uuid", uuid);
      return applyLabelToMesh(mesh, label);
    };

    const validBatchResults = hasBatch ? results.filter(res => !res.error && res.text) : [];

    if (isObjFile) {
      let content = await fileRecord.fileBlob.text();
      let updatedCount = 0;

      const updateLabelInContent = (matName, label) => {
        if (!matName) return false;
        const baseName = matName.split("#")[0].trim();
        if (!baseName) return false;

        const regex = new RegExp(`^(\\s*)usemtl\\s+${escapeRegExp(baseName)}.*$`, "gm");
        const labelContent = label.replace(/\n/g, " ");
        if (regex.test(content)) {
          content = content.replace(regex, `$1usemtl ${baseName} # label: ${labelContent}`);
          return true;
        }
        return false;
      };

      if (validBatchResults.length) {
        for (const res of validBatchResults) {
          let matName = res.targetMaterialName;
          // 如果没有 targetMaterialName，尝试从场景中获取
          if (!matName) {
             const meshName = res.materialName;
             const mesh = store.modelApi?.model?.getObjectByName(meshName);
             if (mesh && mesh.material) matName = mesh.material.name;
          }
          
          if (matName) {
            if (updateLabelInContent(matName, res.text)) {
              // 如果场景存在，也更新场景中的 mesh（可选）
              if (store.modelApi) {
                  const meshName = res.materialName;
                  const mesh = store.modelApi?.model?.getObjectByName(meshName);
                  if (mesh) applyLabelToMesh(mesh, res.text);
              }
              updatedCount++;
            }
          }
        }
      } else if (hasSingle) {
        if (!selectedUuid.value) {
          ElMessage.warning("请先选择一个材质以确定写入目标");
          return;
        }
        const mesh = store.modelApi?.model?.getObjectByProperty("uuid", selectedUuid.value);
        if (mesh && mesh.material) {
          if (updateLabelInContent(mesh.material.name, conversationText.value)) {
            applyLabelToMesh(mesh, conversationText.value);
            updatedCount++;
          }
        } else {
          ElMessage.warning("无法找到当前选中的材质信息");
          return;
        }
      }

      if (updatedCount > 0) {
        const newBlob = new Blob([content], { type: fileRecord.fileBlob.type || "text/plain" });
        await saveModelFile(
          { id: fileId, name: fileName, type: fileRecord.type || fileRecord.fileBlob.type, hasLabels: true },
          newBlob
        );
        // 同步更新 fileStore
        fileStore.addOrUpdateFile({ id: fileId, hasLabels: true });
        ElMessage.success(`成功写入 ${updatedCount} 个标签，请重新加载模型以查看效果`);
      } else {
        ElMessage.warning("未在文件中找到对应的材质定义，无法写入");
      }
      return;
    }

    if (isGlbFile) {
      console.log(`[writeAutoTags] 处理GLB文件`);
      let updatedCount = 0;
      if (validBatchResults.length) {
        console.log(`[writeAutoTags] 批量写入模式，共 ${validBatchResults.length} 个标签`);
        validBatchResults.forEach((res, idx) => {
          console.log(`[writeAutoTags] 批量结果 ${idx + 1}: materialName="${res.materialName}", text="${res.text?.substring(0, 50)}..."`);
        });
        for (const res of validBatchResults) {
          if (assignLabelByName(res.materialName, res.text)) {
            updatedCount++;
          }
        }
        console.log(`[writeAutoTags] 批量写入完成，成功: ${updatedCount}/${validBatchResults.length}`);
      } else if (hasSingle) {
        console.log(`[writeAutoTags] 单次写入模式`);
        if (!selectedUuid.value) {
          ElMessage.warning("请先选择一个材质以确定写入目标");
          return;
        }
        const labelText = conversationText.value.trim();
        if (!labelText) {
          ElMessage.warning("当前对话内容为空，无法写入标签");
          return;
        }
        if (assignLabelByUuid(selectedUuid.value, labelText)) {
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        if (!store.modelApi?.exportSceneToGlbBlob) {
          ElMessage.error("模型导出接口尚未初始化");
          return;
        }
        const newBlob = await store.modelApi.exportSceneToGlbBlob();
        await saveModelFile(
          { id: fileId, name: fileName, type: fileRecord.type || newBlob.type, hasLabels: true },
          newBlob
        );
        // 同步更新 fileStore
        fileStore.addOrUpdateFile({ id: fileId, hasLabels: true });
        ElMessage.success(`成功写入 ${updatedCount} 个标签，GLB 文件已更新，请重新加载模型`);
      } else {
        ElMessage.warning("未在模型中找到对应的部分，无法写入标签");
      }
    }
  } catch (e) {
    console.error("写入标签失败", e);
    ElMessage.error("写入文件失败");
  }
};

const onWriteLabel = async () => {
  const fileId = fileStore.selectedFileId;
  if (!fileId) {
    ElMessage.warning("未找到当前选中的文件");
    return;
  }
  await writeAutoTags(fileId);
};

// 保存提示词到服务器文件
const savePromptsToServer = async () => {
  if (promptList.value.length === 0) {
    ElMessage.warning("提示词库为空，无需保存");
    return;
  }
  
  savingPrompts.value = true;
  
  try {
    const response = await fetch('http://localhost:3001/api/prompts-library', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompts: promptList.value,
        selectionRule: selectionRule.value,
        description: "VLM提示词库配置文件 - 用于工业设计3D模型分析"
      })
    });
    
    if (!response.ok) {
      throw new Error(`保存失败: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      ElMessage.success(`提示词库已保存到文件 (${result.count} 个提示词)`);
      console.log('提示词库保存成功:', result);
    } else {
      throw new Error(result.error || '保存失败');
    }
  } catch (error) {
    console.error('保存提示词库失败:', error);
    ElMessage.error(`保存失败: ${error.message}`);
  } finally {
    savingPrompts.value = false;
  }
};

// 从服务器文件加载提示词
const loadPromptsFromServer = async () => {
  loadingPrompts.value = true;
  
  try {
    const response = await fetch('http://localhost:3001/api/prompts-library');
    
    if (!response.ok) {
      throw new Error(`加载失败: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      const { prompts, selectionRule: rule } = result.data;
      
      if (Array.isArray(prompts) && prompts.length > 0) {
        promptList.value = prompts;
        if (rule) {
          selectionRule.value = rule;
        }
        
        // 同时保存到 localStorage
        savePromptLibrary();
        
        ElMessage.success(`已从文件加载 ${prompts.length} 个提示词`);
        console.log('提示词库加载成功:', result.data);
      } else {
        throw new Error('文件中没有有效的提示词数据');
      }
    } else {
      throw new Error(result.error || '加载失败');
    }
  } catch (error) {
    console.error('加载提示词库失败:', error);
    ElMessage.error(`加载失败: ${error.message}`);
  } finally {
    loadingPrompts.value = false;
  }
};

defineExpose({ getPanelConfig, captureMaterialWithViews, writeAutoTags });
</script>

<style scoped lang="scss">
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.rule-selector {
  margin-left: auto;
}
.prompt-actions-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.material-list {
  padding: 4px 0;
}
.material-item {
  user-select: none;
}
.options {
  box-sizing: border-box;
  max-width: 380px;
  margin-bottom: 6px;
}
.material-item {
  cursor: pointer;
  padding: 6px 12px;
  margin: 4px 0;
  background: #1f2129;
  border-radius: 4px;
}
.material-item .icon-name {
  max-width: 180px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  color: #fff;
}
.material-item .check {
  margin-left: 4px;
}
.option-active {
  border: 1px solid #2a3ff6;
}
.prompt-list {
  padding: 4px 0;
}
.prompt-item {
  cursor: pointer;
  padding: 8px 12px;
  margin: 4px 0;
  background: #1f2129;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: 1px solid #2a2b34;
  transition: border-color 0.3s;
  
  &:hover {
    border-color: #2a3ff6;
  }
}
.prompt-preview {
  flex: 1;
  font-size: 13px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}
.prompt-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.weight-control {
  :deep(.el-input-number) {
    width: 100px;
  }
}
.api-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.api-input {
  width: 100%;
}
.api-action {
  display: flex;
  align-items: center;
  gap: 12px;
}
.status-message {
  font-size: 12px;
  color: #ffc107;
}
.status-message.success {
  color: #18c174;
}
.status-message.error {
  color: #f56c6c;
}
.screenshot-row {
  align-items: center;
  gap: 12px;
  display: flex;
}
.view-selector {
  display: flex;
  gap: 4px;
}
.view-selector .el-button {
  min-width: 28px;
  padding: 0 6px;
  font-size: 12px;
}
.screenshot-row .hint {
  font-size: 12px;
  color: #8ea3ff;
}
.slider-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.slider-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #8fa3ff;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status-message.batch {
  font-size: 12px;
}
.status-message.warning {
  color: #ffc107;
}
.capture-list {
  overflow-x: auto;
  padding-bottom: 6px;
}
.capture-row {
  flex-wrap: nowrap;
}
.capture-item {
  background: #11131c;
  border: 1px solid #2a2b34;
  border-radius: 6px;
  padding: 4px;
  min-height: 120px;
}
.capture-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
}
.capture-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.capture-name {
  font-size: 12px;
  color: #ffffff;
}
.response-panel {
  background: #11131c;
  border-radius: 6px;
  border: 1px solid #2a2b34;
  padding: 10px;
}
.write-btn-row {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
.response-title {
  font-size: 12px;
  color: #8fa3ff;
  margin-bottom: 6px;
}
.response-body {
  font-size: 13px;
  line-height: 1.5;
  color: #fff;
  white-space: pre-wrap;
  min-height: 60px;
}
.empty-text {
  color: #5c5f6d;
}
.batch-results-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}
.batch-result-item {
  background: #1f2129;
  border-radius: 4px;
  padding: 6px 8px;
  border: 1px solid #2a2b34;
}
.batch-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.batch-item-name {
  font-size: 12px;
  color: #8ea3ff;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.batch-item-preview {
  font-size: 12px;
  color: #ddd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.batch-item-preview.error {
  color: #f56c6c;
}
.detail-content {
  white-space: pre-wrap;
  line-height: 1.6;
  max-height: 60vh;
  overflow-y: auto;
  font-size: 14px;
  color: #333;
}
/* Dark theme support for dialog if needed, though element-plus dialogs are usually white by default */
:deep(.vlm-result-dialog) {
  background: #1f2129;
}
:deep(.vlm-result-dialog .el-dialog__title) {
  color: #fff;
}
:deep(.vlm-result-dialog .el-dialog__body) {
  color: #fff;
  padding: 10px 20px;
}
:deep(.vlm-result-dialog .detail-content) {
  color: #fff;
}
</style>


