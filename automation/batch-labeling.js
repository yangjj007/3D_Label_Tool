/**
 * 3D模型批量打标自动化脚本
 * 
 * 功能：
 * 1. 连接到已运行的Chrome实例（通过remote-debugging-port）
 * 2. 导航到前端应用并启动批量打标
 * 3. 监控进度并生成报告
 * 
 * 使用方法：
 *   node automation/batch-labeling.js
 * 
 * 环境变量：
 *   SERVER_URL        - 前端服务地址（默认：http://localhost:29999）
 *   API_URL           - 后端API地址（默认：http://localhost:30005）
 *   CONCURRENCY       - 并发数（默认：4）
 *   VIEW_KEYS         - 视图键，逗号分隔（默认：axial）
 *   CHROME_DEBUG_PORT - Chrome调试端口（默认：30000）
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const http = require('http');

class BatchLabelingAutomation {
  constructor(config = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:29999',
      apiUrl: config.apiUrl || 'http://localhost:30005',
      concurrency: config.concurrency || 4,
      viewKeys: config.viewKeys || ['axial'],
      chromeDebugPort: config.chromeDebugPort || 30000,
      maxNoProgressTime: config.maxNoProgressTime || 600000, // 10分钟无进度视为卡死
      checkInterval: config.checkInterval || 10000, // 10秒检查一次
      ...config
    };
    
    this.browser = null;
    this.page = null;
    this.stats = {
      total: 0,
      processed: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * 检查服务是否可用
   */
  async checkService(url, name) {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * 等待服务启动
   */
  async waitForService(url, name, maxRetries = 30, interval = 2000) {
    console.log(`⏳ 等待${name}启动...`);
    
    for (let i = 0; i < maxRetries; i++) {
      if (await this.checkService(url, name)) {
        console.log(`✅ ${name}已就绪`);
        return true;
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    throw new Error(`${name}启动超时（${maxRetries * interval / 1000}秒）`);
  }

  /**
   * 连接到已运行的Chrome实例
   */
  async connectToChrome() {
    console.log(`🔌 连接到Chrome调试端口: ${this.config.chromeDebugPort}...`);
    
    try {
      // 获取浏览器WebSocket地址
      const debugUrl = `http://localhost:${this.config.chromeDebugPort}/json/version`;
      console.log(`🔍 调试URL: ${debugUrl}`);
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(debugUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`解析响应失败: ${e.message}`));
            }
          });
        });
        req.on('error', (err) => {
          reject(new Error(`HTTP请求失败: ${err.message}`));
        });
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('连接超时'));
        });
      });
      
      // 显示浏览器信息
      console.log('📊 浏览器信息:');
      console.log(`   产品: ${response['Product'] || 'Unknown'}`);
      console.log(`   用户代理: ${response['User-Agent'] || 'Unknown'}`);
      console.log(`   V8版本: ${response['V8-Version'] || 'Unknown'}`);
      console.log(`   WebKit版本: ${response['WebKit-Version'] || 'Unknown'}`);
      
      const browserWSEndpoint = response.webSocketDebuggerUrl;
      
      if (!browserWSEndpoint) {
        throw new Error('无法获取WebSocket地址');
      }
      
      console.log('📡 WebSocket地址:', browserWSEndpoint);
      
      // 连接到现有浏览器
      this.browser = await puppeteer.connect({ 
        browserWSEndpoint,
        defaultViewport: null
      });
      
      console.log('✅ 已通过 Puppeteer 连接到浏览器');
      
      // 获取浏览器版本信息
      const version = await this.browser.version();
      console.log('🔍 浏览器版本:', version);
      
      // 获取或创建页面
      const pages = await this.browser.pages();
      console.log(`📄 当前打开的页面数: ${pages.length}`);
      
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
      
      // 设置视口
      await this.page.setViewport({ width: 1920, height: 1080 });
      console.log('📐 视口设置: 1920x1080');
      
      // 禁用超时（批量处理可能很长）
      this.page.setDefaultTimeout(0);
      this.page.setDefaultNavigationTimeout(60000);
      
      // 获取Chrome启动参数（如果可能）
      console.log('🔍 尝试获取 Chrome 启动参数...');
      try {
        const cmdLine = await this.page.evaluate(() => {
          return navigator.userAgent;
        });
        console.log('   User Agent:', cmdLine);
      } catch (e) {
        console.log('   无法获取启动参数');
      }
      
      console.log('✅ 已连接到Chrome实例\n');
    } catch (error) {
      console.error('❌ 连接Chrome失败:', error.message);
      console.log('\n💡 请确保Chrome已通过以下命令启动:');
      console.log('   bash start_chrome_swiftshader.sh');
      console.log('   或');
      console.log('   bash start_chrome_xvfb.sh');
      console.log('\n🔍 故障排除:');
      console.log('   1. 检查 Chrome 进程是否运行:');
      console.log(`      ps aux | grep "remote-debugging-port=${this.config.chromeDebugPort}"`);
      console.log('   2. 检查端口是否可访问:');
      console.log(`      curl http://localhost:${this.config.chromeDebugPort}/json/version`);
      console.log('   3. 查看 Chrome 启动日志:');
      console.log('      tail -f logs/chrome.log');
      throw error;
    }
  }

  /**
   * 设置页面监听器
   */
  setupPageListeners() {
    // 存储所有控制台日志
    const allConsoleLogs = [];
    
    // 监听控制台日志
    this.page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      
      // 存储日志
      allConsoleLogs.push(`[${type}] ${text}`);
      if (allConsoleLogs.length > 100) {
        allConsoleLogs.shift(); // 只保留最后100条
      }
      
      // 输出所有日志（不再过滤）
      const prefix = type === 'error' ? '❌' : 
                    type === 'warning' ? '⚠️' : 
                    type === 'info' ? 'ℹ️' : 
                    type === 'debug' ? '🐛' : '📄';
      console.log(`${prefix} [浏览器-${type}] ${text}`);
    });

    // 监听页面错误
    this.page.on('pageerror', error => {
      console.error('❌ [浏览器页面错误]', error.message);
      console.error('   堆栈:', error.stack?.substring(0, 500));
      allConsoleLogs.push(`[pageerror] ${error.message}`);
    });

    // 监听请求失败
    this.page.on('requestfailed', request => {
      const url = request.url();
      const failure = request.failure();
      
      // 忽略百度统计等第三方请求失败
      if (url.includes('hm.baidu.com') || url.includes('google-analytics')) {
        return;
      }
      
      console.warn('⚠️  [请求失败]', url);
      console.warn('   错误:', failure?.errorText);
      allConsoleLogs.push(`[requestfailed] ${url}: ${failure?.errorText}`);
    });
    
    // 监听请求
    this.page.on('request', request => {
      const url = request.url();
      // 只记录 API 请求
      if (url.includes('/api/')) {
        console.log(`🌐 [请求] ${request.method()} ${url}`);
      }
    });
    
    // 监听响应
    this.page.on('response', async response => {
      const url = response.url();
      const status = response.status();
      
      // 只记录 API 响应
      if (url.includes('/api/')) {
        const statusEmoji = status >= 200 && status < 300 ? '✅' : 
                           status >= 400 ? '❌' : '⚠️';
        console.log(`${statusEmoji} [响应] ${status} ${url}`);
        
        // 如果是错误响应，尝试输出响应体
        if (status >= 400) {
          try {
            const text = await response.text();
            console.log(`   响应体: ${text.substring(0, 200)}`);
          } catch (e) {
            // 忽略
          }
        }
      }
    });
    
    // 将日志暴露给页面（用于错误诊断）
    this.page.evaluateOnNewDocument(() => {
      window.__consoleLogs__ = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = function(...args) {
        window.__consoleLogs__.push('[log] ' + args.join(' '));
        if (window.__consoleLogs__.length > 100) window.__consoleLogs__.shift();
        originalLog.apply(console, args);
      };
      
      console.error = function(...args) {
        window.__consoleLogs__.push('[error] ' + args.join(' '));
        if (window.__consoleLogs__.length > 100) window.__consoleLogs__.shift();
        originalError.apply(console, args);
      };
      
      console.warn = function(...args) {
        window.__consoleLogs__.push('[warn] ' + args.join(' '));
        if (window.__consoleLogs__.length > 100) window.__consoleLogs__.shift();
        originalWarn.apply(console, args);
      };
    });
    
    console.log('✅ 页面监听器已设置\n');
  }

  /**
   * 导航到应用
   */
  async navigateToApp() {
    console.log(`🌐 导航到: ${this.config.serverUrl}`);
    
    try {
      await this.page.goto(this.config.serverUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      console.log('⏳ 等待应用加载...');
      
      // 等待一下让页面稳定
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 检查 WebGL 支持（在页面加载后检查）
      console.log('🔍 检查 WebGL 支持...');
      const webglInfo = await this.page.evaluate(() => {
        try {
          const canvas = document.createElement('canvas');
          
          // 添加 WebGL 上下文丢失/恢复监听
          let contextLost = false;
          canvas.addEventListener('webglcontextlost', (e) => {
            console.error('[WebGL] 上下文丢失事件触发');
            contextLost = true;
            e.preventDefault(); // 阻止默认行为，允许恢复
          });
          
          canvas.addEventListener('webglcontextrestored', () => {
            console.log('[WebGL] 上下文已恢复');
            contextLost = false;
          });
          
          const gl = canvas.getContext('webgl', {
            failIfMajorPerformanceCaveat: false,  // 即使性能差也继续
            preserveDrawingBuffer: true,          // 保留绘制缓冲区
            antialias: false,                     // 禁用抗锯齿以节省资源
            powerPreference: 'high-performance'   // 优先性能
          }) || canvas.getContext('experimental-webgl', {
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true,
            antialias: false,
            powerPreference: 'high-performance'
          });
          
          if (!gl) {
            return {
              supported: false,
              error: 'WebGL context is null'
            };
          }
          
          // 检查上下文是否立即丢失
          if (gl.isContextLost()) {
            return {
              supported: false,
              error: 'WebGL context lost immediately after creation',
              contextLost: true
            };
          }
          
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          return {
            supported: true,
            vendor: gl.getParameter(gl.VENDOR),
            renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
            contextLost: contextLost
          };
        } catch (e) {
          return {
            supported: false,
            error: e.message
          };
        }
      });
      
      if (!webglInfo.supported) {
        console.error('❌ WebGL 不可用!');
        console.error('   错误:', webglInfo.error);
        console.error('\n💡 可能的解决方案:');
        console.error('   1. 确保 Chrome 启动时使用了 --use-gl=swiftshader 或 --use-gl=angle');
        console.error('   2. 检查 start_chrome_swiftshader.sh 脚本是否正确执行');
        console.error('   3. 确认没有使用 --disable-webgl 参数');
      } else {
        console.log('✅ WebGL 可用');
        console.log(`   供应商: ${webglInfo.vendor}`);
        console.log(`   渲染器: ${webglInfo.renderer}`);
        console.log(`   版本: ${webglInfo.version}`);
        console.log(`   着色语言版本: ${webglInfo.shadingLanguageVersion}`);
        console.log(`   最大纹理尺寸: ${webglInfo.maxTextureSize}`);
        console.log(`   最大视口尺寸: ${webglInfo.maxViewportDims}`);
      }
      
      // 检查 Three.js 是否加载
      console.log('🔍 检查 Three.js...');
      const threeInfo = await this.page.evaluate(() => {
        if (typeof THREE !== 'undefined') {
          return {
            loaded: true,
            version: THREE.REVISION
          };
        }
        return { loaded: false };
      });
      
      if (threeInfo.loaded) {
        console.log(`✅ Three.js 已加载 (版本: r${threeInfo.version})`);
      } else {
        console.warn('⚠️  Three.js 未检测到');
      }
      
      // 等待Vue应用加载完成
      console.log('🔍 等待 Vue 应用初始化...');
      await this.page.waitForFunction(() => {
        return window.__VUE_APP__ !== undefined;
      }, { timeout: 30000 });
      
      console.log('✅ Vue 应用已初始化');
      
      // 检查前端暴露的 API
      console.log('🔍 检查前端 API...');
      const apiInfo = await this.page.evaluate(() => {
        return {
          startBatchLabeling: typeof window.startBatchLabeling === 'function',
          stopBatchLabeling: typeof window.stopBatchLabeling === 'function',
          getBatchStatus: typeof window.getBatchStatus === 'function'
        };
      });
      
      console.log('   API 可用性:');
      console.log(`     - startBatchLabeling: ${apiInfo.startBatchLabeling ? '✅' : '❌'}`);
      console.log(`     - stopBatchLabeling: ${apiInfo.stopBatchLabeling ? '✅' : '❌'}`);
      console.log(`     - getBatchStatus: ${apiInfo.getBatchStatus ? '✅' : '❌'}`);
      
      if (!apiInfo.startBatchLabeling) {
        console.error('❌ 批量打标 API 未暴露!');
        console.error('   请检查前端代码是否正确挂载了 window.startBatchLabeling');
      }
      
      // 额外等待一下确保所有组件都挂载完成
      console.log('⏳ 等待组件挂载...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('✅ 应用加载完成\n');
    } catch (error) {
      console.error('❌ 应用加载失败:', error.message);
      
      // 尝试截图保存错误状态
      try {
        const screenshotPath = path.join(__dirname, '../logs/error-screenshot.png');
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 错误截图已保存: ${screenshotPath}`);
      } catch (screenshotError) {
        // 忽略截图错误
      }
      
      // 获取页面的控制台日志
      console.log('\n📋 页面控制台日志（最后10条）:');
      try {
        const consoleLogs = await this.page.evaluate(() => {
          if (window.__consoleLogs__) {
            return window.__consoleLogs__.slice(-10);
          }
          return [];
        });
        
        if (consoleLogs.length > 0) {
          consoleLogs.forEach(log => console.log('   ', log));
        } else {
          console.log('    (无日志记录)');
        }
      } catch (e) {
        console.log('    (无法获取日志)');
      }
      
      throw error;
    }
  }

  /**
   * 获取待处理文件总数
   */
  async getTotalFiles() {
    console.log('📊 获取待处理文件总数...');
    
    try {
      // 尝试获取更大的分页以查看所有文件
      const response = await new Promise((resolve, reject) => {
        const url = `${this.config.apiUrl}/api/files?type=raw&page=1&pageSize=100`;
        console.log(`🔍 请求URL: ${url}`);
        http.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`解析响应失败: ${e.message}, 原始数据: ${data.substring(0, 200)}`));
            }
          });
        }).on('error', reject);
      });
      
      console.log(`📋 后端返回信息: 总数=${response.total}, 当前页=${response.page}, 文件数=${response.files?.length || 0}`);
      
      if (response.files && response.files.length > 0) {
        console.log(`📄 前3个文件:`);
        response.files.slice(0, 3).forEach((file, i) => {
          console.log(`   ${i + 1}. ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, hasLabels=${file.hasLabels})`);
        });
      }
      
      return response.total || 0;
    } catch (error) {
      console.warn('⚠️  无法从API获取文件总数:', error.message);
      return 0;
    }
  }

  /**
   * 启动批量打标
   */
  async startBatchLabeling() {
    console.log('\n🎯 启动批量打标任务...');
    console.log(`   并发数: ${this.config.concurrency}`);
    console.log(`   视图: ${this.config.viewKeys.join(', ')}`);
    
    this.stats.startTime = Date.now();

    const result = await this.page.evaluate((config) => {
      // 调用前端暴露的全局函数
      if (typeof window.startBatchLabeling === 'function') {
        console.log('[Automation] 调用 window.startBatchLabeling');
        return window.startBatchLabeling({
          concurrency: config.concurrency,
          viewKeys: config.viewKeys
        }).then(() => ({ success: true }))
          .catch(err => ({ 
            success: false, 
            error: err.message || String(err) 
          }));
      } else {
        console.error('[Automation] window.startBatchLabeling 未定义');
        return { 
          success: false, 
          error: '未找到批量打标函数，请确保前端代码已正确暴露API' 
        };
      }
    }, this.config);

    if (!result.success) {
      throw new Error(`批量打标启动失败: ${result.error}`);
    }

    console.log('✅ 批量打标已启动\n');
  }

  /**
   * 监控进度
   */
  async monitorProgress() {
    console.log('📊 开始监控进度...\n');
    console.log('┌─────────────────────────────────────────────────────────┐');

    let lastProcessed = 0;
    let lastCheckTime = Date.now();
    let noProgressCount = 0;
    let waitCount = 0;

    while (true) {
      await new Promise(resolve => setTimeout(resolve, this.config.checkInterval));

      try {
        // 首先检查 WebGL 上下文状态
        const webglStatus = await this.page.evaluate(() => {
          // 检查 Three.js 渲染器状态
          if (window.__THREE_RENDERER__) {
            const gl = window.__THREE_RENDERER__.getContext();
            return {
              hasRenderer: true,
              contextLost: gl ? gl.isContextLost() : true
            };
          }
          return { hasRenderer: false, contextLost: false };
        });
        
        if (webglStatus.hasRenderer && webglStatus.contextLost) {
          console.log('│ ❌ WebGL 上下文已丢失，等待恢复...                    │');
          
          // 等待最多 30 秒让上下文恢复
          if (waitCount < 3) {
            waitCount++;
            continue;
          } else {
            throw new Error('WebGL 上下文丢失且无法恢复，请重启 Chrome');
          }
        }
        
        waitCount = 0; // 重置等待计数
        
        const status = await this.page.evaluate(() => {
          const app = window.__VUE_APP__;
          
          // 调试信息：检查各种状态源
          const debug = {
            hasVueApp: !!app,
            hasProxy: !!app?.proxy,
            hasBatchStatus: !!window.__BATCH_STATUS__,
            batchStatusValue: window.__BATCH_STATUS__,
            proxyKeys: app?.proxy ? Object.keys(app.proxy).filter(k => k.includes('batch') || k.includes('process') || k.includes('count')) : []
          };
          
          console.log('[Monitor Debug]', JSON.stringify(debug, null, 2));
          
          if (!app) return { error: 'no_vue_app', debug };
          
          // 尝试从多个来源获取状态
          const proxy = app?.proxy;
          
          // 方式1: 从props获取（如果是在FileList组件中）
          if (proxy?.isBatchProcessing !== undefined) {
            return {
              processed: proxy.processedCount || 0,
              total: proxy.totalCount || 0,
              isProcessing: proxy.isBatchProcessing || false,
              source: 'vue_proxy'
            };
          }
          
          // 方式2: 从全局状态获取
          if (window.__BATCH_STATUS__) {
            return {
              ...window.__BATCH_STATUS__,
              source: 'global_status'
            };
          }
          
          // 方式3: 尝试直接从组件实例获取
          if (app?.$children) {
            // 递归查找包含批量处理状态的组件
            function findBatchComponent(component) {
              if (component.isBatchProcessing !== undefined) {
                return {
                  processed: component.processedCount || 0,
                  total: component.totalCount || 0,
                  isProcessing: component.isBatchProcessing || false
                };
              }
              if (component.$children) {
                for (const child of component.$children) {
                  const result = findBatchComponent(child);
                  if (result) return result;
                }
              }
              return null;
            }
            
            const result = findBatchComponent(app);
            if (result) {
              return { ...result, source: 'component_search' };
            }
          }
          
          return { error: 'no_status', debug };
        });

        const now = Date.now();

        if (status.error) {
          console.log(`│ ⚠️  无法获取状态: ${status.error.padEnd(35)}│`);
          
          // 显示调试信息
          if (status.debug) {
            console.log(`│    Vue App: ${status.debug.hasVueApp ? '✅' : '❌'}, Proxy: ${status.debug.hasProxy ? '✅' : '❌'}           │`);
            console.log(`│    Global Status: ${status.debug.hasBatchStatus ? '✅' : '❌'}${' '.repeat(30)}│`);
            if (status.debug.proxyKeys && status.debug.proxyKeys.length > 0) {
              console.log(`│    Found keys: ${status.debug.proxyKeys.join(', ').substring(0, 35).padEnd(35)}│`);
            }
          }
          
          // 如果持续无法获取状态，可能是批量打标还未真正开始
          if (noProgressCount < 6) { // 等待最多 1 分钟
            noProgressCount++;
            continue;
          } else {
            throw new Error('长时间无法获取批量打标状态，可能批量打标未正确启动');
          }
        }

        // 重置无进度计数（成功获取到状态）
        noProgressCount = 0;
        
        const { processed, total, isProcessing, source } = status;

        // 更新统计
        this.stats.processed = processed;
        this.stats.total = total || this.stats.total;

        // 计算进度
        const percent = total > 0 ? ((processed / total) * 100).toFixed(1) : 0;
        const elapsed = ((now - this.stats.startTime) / 1000 / 60).toFixed(1);
        const avgTime = processed > 0 ? ((now - this.stats.startTime) / processed / 1000 / 60).toFixed(2) : 0;
        const eta = total > processed && avgTime > 0 
          ? ((total - processed) * avgTime).toFixed(1) 
          : '???';

        // 显示进度（包含状态来源）
        const progressBar = this.getProgressBar(processed, total, 30);
        const sourceLabel = source ? `[${source}]` : '';
        console.log(`│ ${progressBar} ${percent.padStart(5)}% │`);
        console.log(`│ 进度: ${processed}/${total} | 耗时: ${elapsed}min | ETA: ${eta}min ${sourceLabel.padEnd(8)}│`);
        console.log('├─────────────────────────────────────────────────────────┤');

        // 检查是否完成
        if (!isProcessing && processed >= total && total > 0) {
          this.stats.endTime = now;
          console.log('│ 🎉 批量打标完成！' + ' '.repeat(37) + '│');
          console.log('└─────────────────────────────────────────────────────────┘\n');
          break;
        }

        // 检查是否卡死
        if (processed === lastProcessed) {
          const noProgressTime = now - lastCheckTime;
          if (noProgressTime > this.config.maxNoProgressTime) {
            throw new Error(`进度超过${this.config.maxNoProgressTime / 60000}分钟无变化，可能已卡死`);
          }
        } else {
          lastProcessed = processed;
          lastCheckTime = now;
        }

        // 移动光标回到表格顶部继续刷新
        if (isProcessing) {
          process.stdout.write('\x1b[2A'); // 向上移动2行
        }

      } catch (error) {
        console.log('└─────────────────────────────────────────────────────────┘\n');
        console.error('❌ 监控进度出错:', error.message);
        throw error;
      }
    }
  }

  /**
   * 生成进度条
   */
  getProgressBar(current, total, width = 30) {
    if (total === 0) return '░'.repeat(width);
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * 生成报告
   */
  generateReport() {
    const duration = this.stats.endTime 
      ? ((this.stats.endTime - this.stats.startTime) / 1000 / 60).toFixed(2)
      : 0;
    const avgTime = this.stats.processed > 0 
      ? (duration / this.stats.processed).toFixed(2) 
      : 0;
    const successRate = this.stats.total > 0
      ? ((this.stats.processed / this.stats.total) * 100).toFixed(1)
      : 0;

    const report = `
╔════════════════════════════════════════════════════════════╗
║                   批量打标完成报告                         ║
╠════════════════════════════════════════════════════════════╣
║ 总文件数:     ${this.stats.total.toString().padEnd(40)}║
║ 成功处理:     ${this.stats.processed.toString().padEnd(40)}║
║ 失败数量:     ${this.stats.failed.toString().padEnd(40)}║
║ 成功率:       ${successRate}%${' '.repeat(40 - successRate.length - 1)}║
║ 总耗时:       ${duration} 分钟${' '.repeat(40 - duration.length - 3)}║
║ 平均耗时:     ${avgTime} 分钟/文件${' '.repeat(40 - avgTime.length - 7)}║
║ 并发数:       ${this.config.concurrency.toString().padEnd(40)}║
║ 视图配置:     ${this.config.viewKeys.join(', ').padEnd(40)}║
╠════════════════════════════════════════════════════════════╣
║ 开始时间:     ${new Date(this.stats.startTime).toLocaleString('zh-CN').padEnd(40)}║
║ 结束时间:     ${new Date(this.stats.endTime || Date.now()).toLocaleString('zh-CN').padEnd(40)}║
╚════════════════════════════════════════════════════════════╝
    `;

    console.log(report);

    // 保存到日志文件
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const logFile = path.join(logDir, `batch-labeling-${timestamp}.log`);
    
    const detailedLog = report + '\n\n详细信息:\n' + JSON.stringify(this.stats, null, 2);
    fs.writeFileSync(logFile, detailedLog);
    
    console.log(`📝 详细报告已保存: ${logFile}\n`);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.disconnect();
        console.log('🔌 已断开浏览器连接');
      }
    } catch (error) {
      console.warn('⚠️  清理资源时出错:', error.message);
    }
  }

  /**
   * 主运行函数
   */
  async run() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           3D模型批量打标 - 自动化执行器               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      // 1. 检查服务可用性
      await this.waitForService(this.config.apiUrl + '/api/health', '后端API服务');
      await this.waitForService(this.config.serverUrl, '前端服务');
      
      // 2. 获取待处理文件数
      this.stats.total = await this.getTotalFiles();
      console.log(`📦 待处理文件总数: ${this.stats.total}\n`);

      if (this.stats.total === 0) {
        console.log('⚠️  后端返回的待处理文件数为 0\n');
        console.log('💡 可能的原因和解决方法:');
        console.log('   1. 检查后端工作目录是否正确');
        console.log('      - 后端应该从项目根目录启动');
        console.log('      - 文件应该在: <项目根目录>/files/raw_files/');
        console.log('   2. 检查后端日志确认文件路径');
        console.log('      - 查看后端启动时的工作目录');
        console.log('      - 确认后端能访问 files/raw_files/ 目录');
        console.log('   3. 尝试重启后端服务');
        console.log('      - cd <项目根目录>');
        console.log('      - pm2 restart all  或  node server/index.js\n');
        console.log('ℹ️  任务结束\n');
        return;
      }

      // 3. 连接Chrome
      await this.connectToChrome();
      this.setupPageListeners();

      // 4. 导航到应用
      await this.navigateToApp();

      // 5. 启动批量打标
      await this.startBatchLabeling();

      // 6. 监控进度
      await this.monitorProgress();

      // 7. 生成报告
      this.generateReport();

      console.log('✅ 自动化任务执行完成！\n');

    } catch (error) {
      console.error('\n❌ 自动化任务失败:', error.message);
      console.error('\n堆栈跟踪:', error.stack);
      
      this.stats.failed = this.stats.total - this.stats.processed;
      this.stats.endTime = Date.now();
      
      // 即使失败也生成报告
      this.generateReport();
      
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// CLI入口
if (require.main === module) {
  const config = {
    serverUrl: process.env.SERVER_URL || 'http://localhost:29999',
    apiUrl: process.env.API_URL || 'http://localhost:30005',
    concurrency: parseInt(process.env.CONCURRENCY || '4'),
    viewKeys: (process.env.VIEW_KEYS || 'axial').split(',').map(k => k.trim()),
    chromeDebugPort: parseInt(process.env.CHROME_DEBUG_PORT || '30000')
  };

  console.log('配置信息:');
  console.log('  前端地址:', config.serverUrl);
  console.log('  后端地址:', config.apiUrl);
  console.log('  并发数:', config.concurrency);
  console.log('  视图配置:', config.viewKeys.join(', '));
  console.log('  Chrome调试端口:', config.chromeDebugPort);
  console.log('');

  const automation = new BatchLabelingAutomation(config);
  
  automation.run()
    .then(() => {
      console.log('✅ 程序正常退出');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 程序异常退出');
      process.exit(1);
    });
}

module.exports = BatchLabelingAutomation;

