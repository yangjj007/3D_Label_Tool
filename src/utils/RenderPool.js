/**
 * 渲染池管理器
 * 
 * 管理多个离屏渲染实例的生命周期
 * 提供渲染器的获取、释放和资源管理
 */

import OffscreenRenderModel from './OffscreenRenderModel';

class RenderPool {
  constructor(poolSize = 5, width = 1200, height = 900, enableDebugScreenshots = false) {
    this.poolSize = Math.max(1, Math.min(poolSize, 100)); // 限制在 1-100 个（避免资源耗尽）
    this.width = width;
    this.height = height;
    this.enableDebugScreenshots = enableDebugScreenshots; // 调试截图开关
    
    // 渲染器池
    this.pool = [];
    
    // 空闲队列和使用中队列
    this.available = [];
    this.inUse = new Set();
    
    // 等待队列
    this.waitQueue = [];
    
    // 初始化状态
    this.initialized = false;
    
    // 性能监控
    this.stats = {
      totalAcquired: 0,
      totalReleased: 0,
      maxWaitTime: 0,
      avgWaitTime: 0
    };
  }

  /**
   * 检测 OffscreenCanvas 支持
   */
  static isSupported() {
    try {
      // 检查 OffscreenCanvas 是否存在
      if (typeof OffscreenCanvas === 'undefined') {
        console.warn('[RenderPool] OffscreenCanvas 不支持');
        return false;
      }
      
      // 检查 WebGL 支持
      const canvas = new OffscreenCanvas(1, 1);
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (!gl) {
        console.warn('[RenderPool] WebGL 不支持');
        return false;
      }
      
      // 检查 convertToBlob 支持
      if (typeof canvas.convertToBlob !== 'function') {
        console.warn('[RenderPool] OffscreenCanvas.convertToBlob 不支持');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('[RenderPool] 兼容性检测失败:', error);
      return false;
    }
  }

  /**
   * 初始化渲染池
   */
  async initialize() {
    if (this.initialized) {
      console.warn('[RenderPool] 渲染池已初始化');
      return;
    }

    console.log(`[RenderPool] 开始初始化，池大小: ${this.poolSize}`);
    
    const startTime = Date.now();
    const promises = [];

    // 创建渲染器实例
    for (let i = 0; i < this.poolSize; i++) {
      const renderer = new OffscreenRenderModel(this.width, this.height, this.enableDebugScreenshots);
      this.pool.push(renderer);
      promises.push(
        renderer.init().catch(error => {
          console.error(`[RenderPool] 渲染器 ${i} 初始化失败:`, error);
          throw error;
        })
      );
    }

    try {
      await Promise.all(promises);
      
      // 所有渲染器都可用
      this.available = [...this.pool];
      this.initialized = true;
      
      const elapsed = Date.now() - startTime;
      console.log(`[RenderPool] 初始化完成，耗时: ${elapsed}ms`);
    } catch (error) {
      console.error('[RenderPool] 初始化失败:', error);
      // 清理已创建的渲染器
      await this.cleanup();
      throw error;
    }
  }

  /**
   * 获取一个空闲的渲染器
   * @param {Number} timeout - 超时时间（毫秒），默认 60000ms
   * @returns {Promise<OffscreenRenderModel>}
   */
  async acquire(timeout = 60000) {
    if (!this.initialized) {
      throw new Error('RenderPool not initialized. Call initialize() first.');
    }

    const startWaitTime = Date.now();

    // 如果有空闲渲染器，直接返回
    if (this.available.length > 0) {
      const renderer = this.available.shift();
      this.inUse.add(renderer);
      this.stats.totalAcquired++;
      
      console.log(`[RenderPool] 获取渲染器 (空闲: ${this.available.length}, 使用中: ${this.inUse.size})`);
      return renderer;
    }

    // 否则加入等待队列
    console.log(`[RenderPool] 无空闲渲染器，加入等待队列 (队列长度: ${this.waitQueue.length + 1})`);
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // 超时，从等待队列移除
        const index = this.waitQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(`RenderPool acquire timeout (${timeout}ms)`));
      }, timeout);

      this.waitQueue.push({
        resolve: (renderer) => {
          clearTimeout(timeoutId);
          const waitTime = Date.now() - startWaitTime;
          
          // 更新统计
          this.stats.maxWaitTime = Math.max(this.stats.maxWaitTime, waitTime);
          const totalWaits = this.stats.totalAcquired;
          this.stats.avgWaitTime = 
            (this.stats.avgWaitTime * (totalWaits - 1) + waitTime) / totalWaits;
          
          console.log(`[RenderPool] 等待 ${waitTime}ms 后获取渲染器`);
          resolve(renderer);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        startTime: startWaitTime
      });
    });
  }

  /**
   * 释放渲染器回池中
   * @param {OffscreenRenderModel} renderer - 要释放的渲染器
   */
  release(renderer) {
    if (!renderer) {
      console.warn('[RenderPool] 尝试释放空渲染器');
      return;
    }

    if (!this.inUse.has(renderer)) {
      console.warn('[RenderPool] 尝试释放未在使用中的渲染器');
      return;
    }

    // 从使用中移除
    this.inUse.delete(renderer);
    this.stats.totalReleased++;

    // 如果有等待的请求，直接分配给它
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      this.inUse.add(renderer);
      this.stats.totalAcquired++;
      
      console.log(`[RenderPool] 释放渲染器并分配给等待者 (等待队列: ${this.waitQueue.length})`);
      waiter.resolve(renderer);
    } else {
      // 否则放回空闲队列
      this.available.push(renderer);
      console.log(`[RenderPool] 释放渲染器 (空闲: ${this.available.length}, 使用中: ${this.inUse.size})`);
    }
  }

  /**
   * 获取池状态
   */
  getStatus() {
    return {
      poolSize: this.poolSize,
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waitQueue.length,
      initialized: this.initialized,
      stats: { ...this.stats }
    };
  }

  /**
   * 打印池状态
   */
  printStatus() {
    const status = this.getStatus();
    console.log('[RenderPool] 状态:', {
      总数: status.poolSize,
      空闲: status.available,
      使用中: status.inUse,
      等待中: status.waiting,
      总获取次数: status.stats.totalAcquired,
      总释放次数: status.stats.totalReleased,
      最大等待时间: `${status.stats.maxWaitTime}ms`,
      平均等待时间: `${Math.round(status.stats.avgWaitTime)}ms`
    });
  }

  /**
   * 清理所有渲染器
   */
  async cleanup() {
    console.log('[RenderPool] 开始清理渲染池...');
    
    // 拒绝所有等待中的请求
    this.waitQueue.forEach(waiter => {
      waiter.reject(new Error('RenderPool is being cleaned up'));
    });
    this.waitQueue = [];

    // 清理所有渲染器
    const cleanupPromises = this.pool.map(async (renderer, index) => {
      try {
        renderer.dispose();
        console.log(`[RenderPool] 渲染器 ${index} 已清理`);
      } catch (error) {
        console.error(`[RenderPool] 渲染器 ${index} 清理失败:`, error);
      }
    });

    await Promise.all(cleanupPromises);

    // 重置状态
    this.pool = [];
    this.available = [];
    this.inUse.clear();
    this.initialized = false;

    console.log('[RenderPool] 渲染池清理完成');
    this.printStatus();
  }

  /**
   * 强制回收长时间占用的渲染器（可选功能）
   * @param {Number} maxHoldTime - 最大持有时间（毫秒）
   */
  forceReclaim(maxHoldTime = 120000) {
    const now = Date.now();
    let reclaimedCount = 0;

    this.waitQueue.forEach(waiter => {
      if (now - waiter.startTime > maxHoldTime) {
        waiter.reject(new Error(`Forcefully reclaimed after ${maxHoldTime}ms`));
        reclaimedCount++;
      }
    });

    if (reclaimedCount > 0) {
      this.waitQueue = this.waitQueue.filter(
        waiter => now - waiter.startTime <= maxHoldTime
      );
      console.log(`[RenderPool] 强制回收了 ${reclaimedCount} 个超时请求`);
    }

    return reclaimedCount;
  }

  /**
   * 调整池大小（动态扩容/缩容，可选功能）
   * @param {Number} newSize - 新的池大小
   */
  async resize(newSize) {
    newSize = Math.max(1, Math.min(newSize, 100));
    
    if (newSize === this.poolSize) {
      console.log('[RenderPool] 池大小未改变');
      return;
    }

    console.log(`[RenderPool] 调整池大小: ${this.poolSize} -> ${newSize}`);

    if (newSize > this.poolSize) {
      // 扩容：添加新渲染器
      const addCount = newSize - this.poolSize;
      for (let i = 0; i < addCount; i++) {
        const renderer = new OffscreenRenderModel(this.width, this.height, this.enableDebugScreenshots);
        await renderer.init();
        this.pool.push(renderer);
        this.available.push(renderer);
      }
    } else {
      // 缩容：移除多余的空闲渲染器
      const removeCount = this.poolSize - newSize;
      const toRemove = this.available.splice(0, Math.min(removeCount, this.available.length));
      
      toRemove.forEach(renderer => {
        renderer.dispose();
        const index = this.pool.indexOf(renderer);
        if (index !== -1) {
          this.pool.splice(index, 1);
        }
      });
    }

    this.poolSize = newSize;
    console.log(`[RenderPool] 池大小调整完成: ${this.poolSize}`);
  }
}

export default RenderPool;

