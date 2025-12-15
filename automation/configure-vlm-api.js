#!/usr/bin/env node

/**
 * VLM API 配置测试工具 (Node.js版本)
 * 
 * 使用方法：
 *   node automation/configure-vlm-api.js
 * 
 * 环境变量：
 *   VLM_API_URL - API地址
 *   VLM_API_KEY - API密钥
 *   VLM_MODEL - 模型名称
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const readline = require('readline');

const CONFIG_FILE = path.join(__dirname, '../vlm-config.json');

// 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

// 日志函数
function logHeader(text) {
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}${text}${colors.reset}`);
  console.log(`${colors.blue}${'='.repeat(50)}${colors.reset}`);
}

function logSuccess(text) {
  console.log(`${colors.green}✅ ${text}${colors.reset}`);
}

function logError(text) {
  console.log(`${colors.red}❌ ${text}${colors.reset}`);
}

function logWarning(text) {
  console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`);
}

function logInfo(text) {
  console.log(`${colors.cyan}ℹ️  ${text}${colors.reset}`);
}

// 读取现有配置
function loadExistingConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    logWarning(`读取配置失败: ${error.message}`);
  }
  return null;
}

// 测试API连接
function testApiConnection(config) {
  return new Promise((resolve) => {
    logInfo('正在测试API连通性...\n');
    
    const apiUrl = new URL(
      config.baseUrl.endsWith('/') 
        ? config.baseUrl + 'chat/completions' 
        : config.baseUrl + '/chat/completions'
    );

    const requestData = JSON.stringify({
      model: config.modelName,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "连接测试 - 请回复OK"
            }
          ]
        }
      ],
      max_tokens: 10
    });

    const options = {
      hostname: apiUrl.hostname,
      port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
      path: apiUrl.pathname + apiUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(requestData)
      },
      timeout: 30000
    };

    const client = apiUrl.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            logSuccess('API连接测试通过！\n');
            console.log(`  状态码: ${colors.green}${res.statusCode}${colors.reset}`);
            console.log(`  响应时间: ${colors.green}${duration}秒${colors.reset}`);
            console.log(`  使用模型: ${colors.green}${response.model || config.modelName}${colors.reset}\n`);
            resolve({ success: true, statusCode: res.statusCode, duration, model: response.model });
          } catch (e) {
            logError('响应解析失败\n');
            console.log(`  状态码: ${colors.red}${res.statusCode}${colors.reset}`);
            console.log(`  错误: ${colors.red}${e.message}${colors.reset}\n`);
            resolve({ success: false, error: '响应解析失败', details: e.message });
          }
        } else {
          let errorMsg = '连接失败';
          let errorDetails = '';

          try {
            const errorData = JSON.parse(data);
            errorMsg = errorData.error?.message || errorData.message || errorMsg;
            errorDetails = errorData.error?.code || errorData.code || '';
          } catch (e) {
            errorDetails = data.substring(0, 200);
          }

          logError('API连接测试失败\n');
          console.log(`  状态码: ${colors.red}${res.statusCode}${colors.reset}`);
          console.log(`  响应时间: ${colors.yellow}${duration}秒${colors.reset}`);
          console.log(`  错误信息: ${colors.red}${errorMsg}${colors.reset}`);
          if (errorDetails) {
            console.log(`  详细信息: ${colors.yellow}${errorDetails}${colors.reset}`);
          }
          console.log('');
          resolve({ success: false, statusCode: res.statusCode, error: errorMsg, details: errorDetails });
        }
      });
    });

    req.on('error', (error) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logError('网络连接失败\n');
      console.log(`  响应时间: ${colors.yellow}${duration}秒${colors.reset}`);
      console.log(`  错误: ${colors.red}${error.message}${colors.reset}\n`);
      resolve({ success: false, error: '网络连接失败', details: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logError('请求超时\n');
      console.log(`  响应时间: ${colors.yellow}${duration}秒${colors.reset}`);
      console.log(`  错误: ${colors.red}超过30秒未响应${colors.reset}\n`);
      resolve({ success: false, error: '请求超时', details: '超过30秒未响应' });
    });

    req.write(requestData);
    req.end();
  });
}

// 保存配置
function saveConfig(config, testResult) {
  const configData = {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelName: config.modelName,
    lastTested: new Date().toISOString(),
    testPassed: testResult.success
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
    logSuccess(`配置已保存到: ${CONFIG_FILE}`);
    return true;
  } catch (error) {
    logError(`配置保存失败: ${error.message}`);
    return false;
  }
}

// 交互式输入
async function interactiveInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  const existingConfig = loadExistingConfig();

  console.log('\n请输入VLM API配置:\n');

  const baseUrl = await question(
    `${colors.cyan}API地址 [${existingConfig?.baseUrl || 'https://api.openai.com/v1'}]: ${colors.reset}`
  ) || existingConfig?.baseUrl || 'https://api.openai.com/v1';

  const apiKey = await question(
    `${colors.cyan}API Key [${existingConfig?.apiKey ? '已保存' : ''}]: ${colors.reset}`
  ) || existingConfig?.apiKey || '';

  const modelName = await question(
    `${colors.cyan}模型名称 [${existingConfig?.modelName || 'gpt-4-vision-preview'}]: ${colors.reset}`
  ) || existingConfig?.modelName || 'gpt-4-vision-preview';

  rl.close();

  if (!apiKey) {
    logError('API Key不能为空');
    process.exit(1);
  }

  return { baseUrl, apiKey, modelName };
}

// 主函数
async function main() {
  console.clear();
  logHeader('VLM API 配置和测试工具');

  let config;

  // 检查环境变量
  if (process.env.VLM_API_URL && process.env.VLM_API_KEY) {
    logInfo('从环境变量读取配置\n');
    config = {
      baseUrl: process.env.VLM_API_URL,
      apiKey: process.env.VLM_API_KEY,
      modelName: process.env.VLM_MODEL || 'gpt-4-vision-preview'
    };
  } else {
    // 交互式输入
    const existingConfig = loadExistingConfig();
    if (existingConfig) {
      logInfo('检测到现有配置文件');
      console.log(`  当前API地址: ${colors.cyan}${existingConfig.baseUrl}${colors.reset}`);
      console.log(`  当前模型: ${colors.cyan}${existingConfig.modelName}${colors.reset}`);
    }

    config = await interactiveInput();
  }

  // 显示配置信息
  console.log('\n配置信息:');
  console.log(`  API地址: ${colors.cyan}${config.baseUrl}${colors.reset}`);
  console.log(`  API Key: ${colors.cyan}${config.apiKey.substring(0, 15)}...${colors.reset}`);
  console.log(`  模型名称: ${colors.cyan}${config.modelName}${colors.reset}\n`);

  // 测试连接
  const testResult = await testApiConnection(config);

  // 保存配置
  saveConfig(config, testResult);

  // 最终状态
  console.log('');
  logHeader('配置完成');
  console.log('');

  if (testResult.success) {
    logSuccess('API配置成功且连接正常');
    console.log('');
    logInfo('现在可以运行批量打标:');
    console.log('  bash start-batch-labeling.sh\n');
    process.exit(0);
  } else {
    logWarning('配置已保存，但API连接测试未通过');
    console.log('');
    logInfo('请检查以下项目:');
    console.log('  1. API地址是否正确');
    console.log('  2. API Key是否有效');
    console.log('  3. 模型名称是否支持');
    console.log('  4. 网络连接是否正常');
    console.log('  5. API账户余额是否充足\n');
    logInfo('修复后可重新运行此脚本测试\n');
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('');
    logError(`程序异常: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { testApiConnection, saveConfig, loadExistingConfig };

