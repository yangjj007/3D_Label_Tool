#!/usr/bin/env node

/**
 * WebGL 诊断脚本
 * 
 * 功能：连接到正在运行的 Chrome 实例，检查 WebGL 是否可用
 * 
 * 使用方法：
 *   node check-webgl.js [调试端口]
 * 
 * 示例：
 *   node check-webgl.js 30000
 */

const puppeteer = require('puppeteer');
const http = require('http');

const CHROME_DEBUG_PORT = process.argv[2] || process.env.CHROME_DEBUG_PORT || 30000;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:9999';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                   WebGL 诊断工具                          ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log(`🔍 配置信息:`);
console.log(`   调试端口: ${CHROME_DEBUG_PORT}`);
console.log(`   前端地址: ${SERVER_URL}\n`);

async function checkWebGL() {
  let browser = null;
  let page = null;

  try {
    // 1. 连接到 Chrome
    console.log('🔌 连接到 Chrome...');
    const debugUrl = `http://localhost:${CHROME_DEBUG_PORT}/json/version`;
    
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
        reject(new Error(`连接失败: ${err.message}\n\n💡 请先启动 Chrome:\n   bash start_chrome_swiftshader.sh`));
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('连接超时'));
      });
    });

    console.log('✅ 已连接到 Chrome');
    console.log(`   产品: ${response['Product']}`);
    console.log(`   用户代理: ${response['User-Agent']}\n`);

    const browserWSEndpoint = response.webSocketDebuggerUrl;
    browser = await puppeteer.connect({ 
      browserWSEndpoint,
      defaultViewport: null
    });

    // 2. 创建测试页面
    console.log('📄 创建测试页面...');
    const pages = await browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();

    // 3. 测试 WebGL
    console.log('🔍 检查 WebGL 支持...\n');
    
    const webglInfo = await page.evaluate(() => {
      const results = {
        webgl1: { supported: false },
        webgl2: { supported: false }
      };

      // 测试 WebGL 1.0
      try {
        const canvas1 = document.createElement('canvas');
        const gl1 = canvas1.getContext('webgl') || canvas1.getContext('experimental-webgl');
        
        if (gl1) {
          const debugInfo = gl1.getExtension('WEBGL_debug_renderer_info');
          results.webgl1 = {
            supported: true,
            vendor: gl1.getParameter(gl1.VENDOR),
            renderer: debugInfo ? gl1.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
            version: gl1.getParameter(gl1.VERSION),
            shadingLanguageVersion: gl1.getParameter(gl1.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl1.getParameter(gl1.MAX_TEXTURE_SIZE),
            maxViewportDims: gl1.getParameter(gl1.MAX_VIEWPORT_DIMS),
            maxVertexAttribs: gl1.getParameter(gl1.MAX_VERTEX_ATTRIBS),
            maxTextureImageUnits: gl1.getParameter(gl1.MAX_TEXTURE_IMAGE_UNITS)
          };
        } else {
          results.webgl1.error = 'WebGL context is null';
        }
      } catch (e) {
        results.webgl1.error = e.message;
      }

      // 测试 WebGL 2.0
      try {
        const canvas2 = document.createElement('canvas');
        const gl2 = canvas2.getContext('webgl2');
        
        if (gl2) {
          const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
          results.webgl2 = {
            supported: true,
            vendor: gl2.getParameter(gl2.VENDOR),
            renderer: debugInfo ? gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
            version: gl2.getParameter(gl2.VERSION),
            shadingLanguageVersion: gl2.getParameter(gl2.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl2.getParameter(gl2.MAX_TEXTURE_SIZE),
            maxViewportDims: gl2.getParameter(gl2.MAX_VIEWPORT_DIMS)
          };
        } else {
          results.webgl2.error = 'WebGL 2 context is null';
        }
      } catch (e) {
        results.webgl2.error = e.message;
      }

      return results;
    });

    // 输出结果
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      WebGL 1.0                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    if (webglInfo.webgl1.supported) {
      console.log('║ 状态: ✅ 可用                                            ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log(`║ 供应商:       ${webglInfo.webgl1.vendor.padEnd(41)}║`);
      console.log(`║ 渲染器:       ${webglInfo.webgl1.renderer.substring(0, 41).padEnd(41)}║`);
      if (webglInfo.webgl1.renderer.length > 41) {
        console.log(`║               ${webglInfo.webgl1.renderer.substring(41, 82).padEnd(41)}║`);
      }
      console.log(`║ 版本:         ${webglInfo.webgl1.version.padEnd(41)}║`);
      console.log(`║ 着色语言:     ${webglInfo.webgl1.shadingLanguageVersion.padEnd(41)}║`);
      console.log(`║ 最大纹理尺寸: ${webglInfo.webgl1.maxTextureSize.toString().padEnd(41)}║`);
      console.log(`║ 最大视口:     ${JSON.stringify(webglInfo.webgl1.maxViewportDims).padEnd(41)}║`);
    } else {
      console.log('║ 状态: ❌ 不可用                                          ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log(`║ 错误: ${(webglInfo.webgl1.error || 'Unknown').substring(0, 50).padEnd(50)}║`);
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      WebGL 2.0                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    if (webglInfo.webgl2.supported) {
      console.log('║ 状态: ✅ 可用                                            ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log(`║ 供应商:       ${webglInfo.webgl2.vendor.padEnd(41)}║`);
      console.log(`║ 渲染器:       ${webglInfo.webgl2.renderer.substring(0, 41).padEnd(41)}║`);
      if (webglInfo.webgl2.renderer.length > 41) {
        console.log(`║               ${webglInfo.webgl2.renderer.substring(41, 82).padEnd(41)}║`);
      }
      console.log(`║ 版本:         ${webglInfo.webgl2.version.padEnd(41)}║`);
      console.log(`║ 着色语言:     ${webglInfo.webgl2.shadingLanguageVersion.padEnd(41)}║`);
      console.log(`║ 最大纹理尺寸: ${webglInfo.webgl2.maxTextureSize.toString().padEnd(41)}║`);
      console.log(`║ 最大视口:     ${JSON.stringify(webglInfo.webgl2.maxViewportDims).padEnd(41)}║`);
    } else {
      console.log('║ 状态: ⚠️  不可用 (但 WebGL 1.0 应该足够)                ║');
      console.log('╠════════════════════════════════════════════════════════════╣');
      console.log(`║ 错误: ${(webglInfo.webgl2.error || 'Unknown').substring(0, 50).padEnd(50)}║`);
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // 判断是否可以运行应用
    if (webglInfo.webgl1.supported || webglInfo.webgl2.supported) {
      console.log('✅ 结论: WebGL 可用，应用应该可以正常运行！\n');
      
      // 如果使用了 SwiftShader，给出提示
      if (webglInfo.webgl1.renderer && webglInfo.webgl1.renderer.includes('SwiftShader')) {
        console.log('⚠️  注意: 正在使用 SwiftShader (软件渲染)');
        console.log('   性能: 比 GPU 慢 10-100 倍');
        console.log('   建议: 降低并发数到 4-8\n');
      }
      
      return 0;
    } else {
      console.log('❌ 结论: WebGL 不可用，应用无法运行！\n');
      console.log('💡 解决方案:');
      console.log('   1. 确保 Chrome 使用了正确的启动参数');
      console.log('   2. 使用 SwiftShader: --use-gl=swiftshader --enable-unsafe-swiftshader');
      console.log('   3. 或使用 ANGLE: --use-gl=angle');
      console.log('   4. 不要使用 --disable-webgl 参数\n');
      
      return 1;
    }

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    return 1;
  } finally {
    if (browser) {
      await browser.disconnect();
    }
  }
}

// 运行诊断
checkWebGL()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('❌ 未处理的错误:', error);
    process.exit(1);
  });

