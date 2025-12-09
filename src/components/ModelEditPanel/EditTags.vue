<template>
  <div class="edit-box">
    <!-- 头部 -->
    <div class="header-main">
      <span class="header-title">
        <el-icon><CollectionTag /></el-icon>
        标签配置
      </span>
      <el-button type="primary" size="small" icon="Refresh" @click="onInitialize">
        重置
      </el-button>
    </div>

    <!-- 标签类型选择区 -->
    <div class="section-card">
      <div class="section-header">
        <el-icon class="section-icon"><PriceTag /></el-icon>
        <span class="section-title">标签类型</span>
        <span class="section-tip">可拖拽添加多个</span>
      </div>
      <el-scrollbar max-height="140px" class="icon-scrollbar">
        <el-row class="tag-row" :gutter="8">
          <el-col
            draggable="true"
            v-for="tag in tagList"
            :key="tag.name"
            :span="4"
            @dragstart="e => onDragstart(e, tag)"
            @drag="e => onDrag(e)"
          >
            <div class="tag-box">
              <el-icon size="18px">
                <component :is="tag.name"></component>
              </el-icon>
            </div>
          </el-col>
        </el-row>
      </el-scrollbar>
    </div>

    <!-- 标签列表区 -->
    <div class="section-card">
      <div class="section-header">
        <el-icon class="section-icon"><List /></el-icon>
        <span class="section-title">标签列表</span>
        <span class="section-count" v-if="config.dragTagList.length">
          {{ config.dragTagList.length }}
        </span>
      </div>
      <el-scrollbar max-height="160px" v-if="config.dragTagList.length">
        <div class="tag-list">
          <div
            class="tag-item"
            :class="{ 'tag-item-active': activeTag.uuid == tag.uuid }"
            @click="onChooseTag(tag)"
            v-for="tag in config.dragTagList"
            :key="tag.uuid"
          >
            <div class="tag-item-content">
              <el-icon class="tag-item-icon" v-show="activeTag.uuid == tag.uuid">
                <Check />
              </el-icon>
              <span class="tag-item-text">{{ tag.innerText }}</span>
            </div>
            <el-icon 
              class="tag-item-delete" 
              @click.stop="onDeleteTag(tag.uuid)"
            >
              <Delete />
            </el-icon>
          </div>
        </div>
      </el-scrollbar>
      <el-empty v-else description="暂无标签" :image-size="80" />
    </div>

    <!-- 标签编辑区 -->
    <div class="section-card edit-section" v-if="activeTag.uuid">
      <div class="section-header">
        <el-icon class="section-icon"><Edit /></el-icon>
        <span class="section-title">标签编辑</span>
      </div>

      <el-collapse v-model="activeCollapseNames" class="custom-collapse">
        <!-- 内容设置 -->
        <el-collapse-item title="内容设置" name="content">
          <div class="edit-item textarea-item">
            <el-input
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              @input="onChangeTagValue"
              v-model.trim="activeTag.innerText"
              placeholder="请输入标签内容"
            />
          </div>
        </el-collapse-item>

        <!-- 样式与尺寸 -->
        <el-collapse-item title="样式与尺寸" name="style">
          <div class="edit-group-compact">
            <div class="compact-item">
              <span class="compact-label">高度</span>
              <el-slider v-model="activeTag.height" :min="1" :max="500" show-input size="small" @input="onChangeTagValue" />
            </div>
            <div class="compact-item">
              <span class="compact-label">宽度</span>
              <el-slider v-model="activeTag.width" :min="1" :max="500" show-input size="small" @input="onChangeTagValue" />
            </div>
            <div class="compact-item">
              <span class="compact-label">字体</span>
              <el-slider v-model="activeTag.fontSize" :min="1" :max="50" :step="0.1" show-input size="small" @input="onChangeTagValue" />
            </div>
            <div class="compact-item">
              <span class="compact-label">图标</span>
              <el-slider v-model="activeTag.iconSize" :min="1" :max="50" :step="0.1" show-input size="small" @input="onChangeTagValue" />
            </div>
          </div>
        </el-collapse-item>

        <!-- 位置设置 -->
        <el-collapse-item title="位置设置" name="position">
          <div class="edit-group-compact">
            <div class="compact-item">
              <span class="compact-label">X</span>
              <el-slider v-model="activeTag.positionX" :min="-50" :max="50" :step="0.01" show-input size="small" @input="onChangeTagValue" />
            </div>
            <div class="compact-item">
              <span class="compact-label">Y</span>
              <el-slider v-model="activeTag.positionY" :min="-50" :max="50" :step="0.1" show-input size="small" @input="onChangeTagValue" />
            </div>
            <div class="compact-item">
              <span class="compact-label">Z</span>
              <el-slider v-model="activeTag.positionZ" :min="-50" :max="50" :step="0.1" show-input size="small" @input="onChangeTagValue" />
            </div>
          </div>
        </el-collapse-item>

        <!-- 颜色设置 -->
        <el-collapse-item title="颜色设置" name="color">
          <div class="color-row">
            <div class="color-item">
              <label class="color-label">背景</label>
              <el-color-picker
                color-format="hex"
                :predefine="predefineColors"
                @change="onChangeTagValue"
                v-model="activeTag.backgroundColor"
              />
            </div>
            <div class="color-item">
              <label class="color-label">图标</label>
              <el-color-picker
                color-format="hex"
                :predefine="predefineColors"
                @change="onChangeTagValue"
                v-model="activeTag.iconColor"
              />
            </div>
            <div class="color-item">
              <label class="color-label">字体</label>
              <el-color-picker 
                color-format="hex" 
                :predefine="predefineColors" 
                @change="onChangeTagValue" 
                v-model="activeTag.color" 
              />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>
<script setup>
import { reactive, computed, defineExpose, ref } from "vue";
import { useMeshEditStore } from "@/store/meshEditStore";
import { PREDEFINE_COLORS } from "@/config/constant";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

const store = useMeshEditStore();

const activeCollapseNames = ref(['content', 'style']);

const predefineColors = PREDEFINE_COLORS;
const config = reactive({
  dragTagList: computed(() => store.modelApi.dragTagList)
});

const tagList = computed(() => {
  const arr = [];
  for (const [key] of Object.entries(ElementPlusIconsVue)) {
    arr.push({ name: key });
  }
  return arr;
});

const activeTag = reactive({});

// 拖拽标签开始
const onDragstart = (e, tag) => {
  store.modelApi.setDragTag(tag);
  store.setActiveEditModelType("tags");
};
// 拖拽中
const onDrag = event => {
  event.preventDefault();
};

// 重置数据
const onInitialize = () => {
  activeTag.uuid = null;
  store.modelApi.clearSceneTags();
};

//选择标签
const onChooseTag = tag => {
  Object.assign(activeTag, { ...tag });
};
// 删除标签
const onDeleteTag = uuid => {
  store.modelApi.deleteTag(uuid);
  activeTag.uuid = null;
};

// 修改标签配置
const onChangeTagValue = () => {
  store.modelApi.updateTagElement(activeTag);
};

defineExpose({ config });
</script>
<style scoped lang="scss">
// 主容器
.edit-box {
  padding: 0;
  color: #fff;
}

// 主标题头部
.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: linear-gradient(135deg, #2a2d3a 0%, #1f2129 100%);
  border-bottom: 2px solid #4d57fd;
  margin-bottom: 12px;
  
  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    
    .el-icon {
      font-size: 20px;
      color: #4d57fd;
    }
  }
}

// 区块卡片
.section-card {
  background: #1f2129;
  border-radius: 8px;
  margin: 12px;
  padding: 12px;
  border: 1px solid #2a2d3a;
  transition: all 0.3s ease;
  
  &:hover {
    border-color: #4d57fd;
    box-shadow: 0 2px 8px rgba(77, 87, 253, 0.1);
  }
}

// 区块头部
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2d3a;
  
  .section-icon {
    font-size: 16px;
    color: #4d57fd;
  }
  
  .section-title {
    font-size: 14px;
    font-weight: 500;
    color: #e0e0e0;
    flex: 1;
  }
  
  .section-tip {
    font-size: 12px;
    color: #18c174;
    background: rgba(24, 193, 116, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
  }
  
  .section-count {
    font-size: 12px;
    color: #fff;
    background: #4d57fd;
    padding: 2px 8px;
    border-radius: 10px;
    min-width: 20px;
    text-align: center;
  }
}

// 图标滚动区域
.icon-scrollbar {
  margin-top: 8px;
}

// 标签图标行
.tag-row {
  padding: 4px;
  
  .tag-box {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    background: #2a2d3a;
    border: 1px solid #3a3d4a;
    border-radius: 6px;
    cursor: grab;
    transition: all 0.2s ease;
    margin-bottom: 8px;
    
    &:hover {
      border-color: #4d57fd;
      background: #32353f;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(77, 87, 253, 0.2);
    }
    
    &:active {
      cursor: grabbing;
      transform: scale(0.95);
    }
    
    .el-icon {
      color: #e0e0e0;
    }
  }
}

// 标签列表
.tag-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}

.tag-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #2a2d3a;
  border: 1px solid #3a3d4a;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #32353f;
    border-color: #4d57fd;
    transform: translateX(2px);
  }
  
  &.tag-item-active {
    background: linear-gradient(90deg, rgba(77, 87, 253, 0.2) 0%, rgba(77, 87, 253, 0.05) 100%);
    border-color: #4d57fd;
    
    .tag-item-content {
      color: #fff;
      font-weight: 500;
    }
  }
  
  .tag-item-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    color: #e0e0e0;
    
    .tag-item-icon {
      font-size: 16px;
      color: #4d57fd;
      flex-shrink: 0;
    }
    
    .tag-item-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  
  .tag-item-delete {
    font-size: 16px;
    color: #888;
    cursor: pointer;
    transition: color 0.2s ease;
    flex-shrink: 0;
    margin-left: 8px;
    
    &:hover {
      color: #ff4d4f;
    }
  }
}

// Collapse 自定义样式
:deep(.custom-collapse) {
  border: none;
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;
  --el-collapse-border-color: #2a2d3a;
  
  .el-collapse-item__header {
    color: #e0e0e0;
    font-size: 13px;
    font-weight: 500;
    height: 40px;
    line-height: 40px;
    padding-left: 8px;
    border-bottom: 1px solid #2a2d3a;
    
    &.is-active {
      color: #4d57fd;
      border-bottom-color: transparent;
    }

    &:hover {
      color: #4d57fd;
    }
  }
  
  .el-collapse-item__wrap {
    border-bottom: none;
  }
  
  .el-collapse-item__content {
    padding: 12px 8px;
    color: #fff;
  }
}

// 紧凑编辑组
.edit-group-compact {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.compact-item {
  display: flex;
  align-items: center;
  
  .compact-label {
    width: 40px;
    font-size: 12px;
    color: #b0b0b0;
    flex-shrink: 0;
  }
  
  :deep(.el-slider) {
    flex: 1;
    margin-left: 12px;
    --el-slider-height: 4px;
    
    .el-slider__runway {
      margin-top: 0;
      margin-bottom: 0;
    }
  }
}

// 颜色行
.color-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px;
  background: #2a2d3a;
  border-radius: 6px;
  
  .color-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex: 1;
    padding: 8px 0;
    
    .color-label {
      font-size: 12px;
      color: #b0b0b0;
    }
  }
}

// 编辑项 (用于 textarea)
.edit-item {
  &.textarea-item {
    width: 100%;
  }
}

// 覆盖 Element Plus 样式
:deep(.el-scrollbar__view) {
  padding: 4px;
}

:deep(.el-slider) {
  .el-slider__runway {
    background-color: #2a2d3a;
  }
  
  .el-slider__bar {
    background-color: #4d57fd;
  }
  
  .el-slider__button {
    border-color: #4d57fd;
    width: 12px;
    height: 12px;
  }

  .el-slider__input {
    width: 60px;
    .el-input__inner {
       padding: 0 4px;
       font-size: 12px;
    }
  }
}

:deep(.el-input-number) {
  width: 100%;
  
  .el-input__inner {
    background-color: #2a2d3a;
    border-color: #3a3d4a;
    color: #fff;
  }
}

:deep(.el-textarea__inner) {
  background-color: #2a2d3a;
  border-color: #3a3d4a;
  color: #fff;
  font-family: inherit;
  
  &:focus {
    border-color: #4d57fd;
  }
  
  &::placeholder {
    color: #666;
  }
}

:deep(.el-empty) {
  padding: 20px 0;
  
  .el-empty__description {
    color: #888;
  }
}
</style>
