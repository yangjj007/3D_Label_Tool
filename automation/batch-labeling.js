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
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(debugUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('连接超时'));
        });
      });
      
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
      
      // 获取或创建页面
      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
      
      // 设置视口
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // 禁用超时（批量处理可能很长）
      this.page.setDefaultTimeout(0);
      this.page.setDefaultNavigationTimeout(60000);
      
      console.log('✅ 已连接到Chrome实例');
    } catch (error) {
      console.error('❌ 连接Chrome失败:', error.message);
      console.log('\n💡 请确保Chrome已通过以下命令启动:');
      console.log('   bash start_chrome_swiftshader.sh');
      console.log('   或');
      console.log('   bash start_chrome_xvfb.sh');
      throw error;
    }
  }

  /**
   * 设置页面监听器
   */
  setupPageListeners() {
    // 监听控制台日志
    this.page.on('console', msg => {
      const text = msg.text();
      // 只输出关键日志
      if (text.includes('[批量打标]') || 
          text.includes('[Global API]') ||
          text.includes('ERROR') ||
          text.includes('WARN')) {
        const type = msg.type();
        const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '📄';
        console.log(`${prefix} [浏览器] ${text}`);
      }
    });

    // 监听页面错误
    this.page.on('pageerror', error => {
      console.error('❌ [浏览器错误]', error.message);
    });

    // 监听请求失败
    this.page.on('requestfailed', request => {
      console.warn('⚠️  [请求失败]', request.url(), request.failure()?.errorText);
    });
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
      
      // 等待Vue应用加载完成
      await this.page.waitForFunction(() => {
        return window.__VUE_APP__ !== undefined;
      }, { timeout: 30000 });
      
      // 额外等待一下确保所有组件都挂载完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ 应用加载完成');
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
      
      throw error;
    }
  }

  /**
   * 获取待处理文件总数
   */
  async getTotalFiles() {
    console.log('📊 获取待处理文件总数...');
    
    try {
      const response = await new Promise((resolve, reject) => {
        const url = `${this.config.apiUrl}/api/files?type=raw&page=1&pageSize=1`;
        http.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      
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

    while (true) {
      await new Promise(resolve => setTimeout(resolve, this.config.checkInterval));

      try {
        const status = await this.page.evaluate(() => {
          const app = window.__VUE_APP__;
          if (!app) return null;
          
          // 尝试从多个来源获取状态
          const proxy = app?.proxy;
          
          // 方式1: 从props获取（如果是在FileList组件中）
          if (proxy?.isBatchProcessing !== undefined) {
            return {
              processed: proxy.processedCount || 0,
              total: proxy.totalCount || 0,
              isProcessing: proxy.isBatchProcessing || false
            };
          }
          
          // 方式2: 从全局状态获取
          if (window.__BATCH_STATUS__) {
            return window.__BATCH_STATUS__;
          }
          
          return null;
        });

        const now = Date.now();

        if (!status) {
          console.log('│ ⚠️  无法获取状态信息，继续等待...                      │');
          continue;
        }

        const { processed, total, isProcessing } = status;

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

        // 显示进度
        const progressBar = this.getProgressBar(processed, total, 30);
        console.log(`│ ${progressBar} ${percent.padStart(5)}% │`);
        console.log(`│ 进度: ${processed}/${total} | 耗时: ${elapsed}min | 预计剩余: ${eta}min${''.padEnd(10)}│`);
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
          noProgressCount++;
        } else {
          lastProcessed = processed;
          lastCheckTime = now;
          noProgressCount = 0;
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
        console.log('ℹ️  没有待处理的文件，任务结束\n');
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

