#!/bin/bash

#############################################
# VLM API 配置和测试脚本
# 
# 功能：
# 1. 交互式配置VLM API参数
# 2. 测试API连通性
# 3. 保存配置到文件
# 4. 输出连通性状态和错误信息
#
# 使用方法：
#   bash configure-vlm-api.sh
#
# 环境变量方式（非交互）：
#   VLM_API_URL=http://your-api.com \
#   VLM_API_KEY=your-key \
#   VLM_MODEL=gpt-4-vision-preview \
#   bash configure-vlm-api.sh --auto
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 获取项目目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

CONFIG_FILE="$PROJECT_DIR/vlm-config.json"

# 日志函数
log_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

log_step() {
    echo -e "\n${YELLOW}$1${NC}"
}

# 显示标题
clear
log_header "VLM API 配置和测试工具"
echo ""

# 检查node是否安装
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装，请先安装 Node.js"
    exit 1
fi

# 检查是否为自动模式
AUTO_MODE=false
if [ "$1" = "--auto" ] || [ "$1" = "-a" ]; then
    AUTO_MODE=true
    log_info "自动配置模式"
fi

# 读取现有配置
if [ -f "$CONFIG_FILE" ]; then
    log_info "检测到现有配置文件"
    EXISTING_API_URL=$(node -p "try { JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).baseUrl } catch(e) { '' }" 2>/dev/null)
    EXISTING_API_KEY=$(node -p "try { JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).apiKey } catch(e) { '' }" 2>/dev/null)
    EXISTING_MODEL=$(node -p "try { JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).modelName } catch(e) { '' }" 2>/dev/null)
    
    if [ ! -z "$EXISTING_API_URL" ]; then
        echo "  当前API地址: ${CYAN}$EXISTING_API_URL${NC}"
    fi
    if [ ! -z "$EXISTING_MODEL" ]; then
        echo "  当前模型: ${CYAN}$EXISTING_MODEL${NC}"
    fi
    echo ""
fi

# 获取配置参数
if [ "$AUTO_MODE" = true ]; then
    # 自动模式：从环境变量读取
    API_URL="${VLM_API_URL:-$EXISTING_API_URL}"
    API_KEY="${VLM_API_KEY:-$EXISTING_API_KEY}"
    MODEL_NAME="${VLM_MODEL:-$EXISTING_MODEL}"
    
    if [ -z "$API_URL" ] || [ -z "$API_KEY" ]; then
        log_error "自动模式需要设置环境变量: VLM_API_URL, VLM_API_KEY"
        echo ""
        echo "示例："
        echo "  VLM_API_URL=https://api.openai.com/v1 \\"
        echo "  VLM_API_KEY=sk-xxxxx \\"
        echo "  VLM_MODEL=gpt-4-vision-preview \\"
        echo "  bash configure-vlm-api.sh --auto"
        exit 1
    fi
else
    # 交互模式：提示用户输入
    log_step "请输入VLM API配置："
    echo ""
    
    # API地址
    read -p "$(echo -e ${CYAN}API地址 [${EXISTING_API_URL:-https://api.openai.com/v1}]: ${NC})" API_URL
    API_URL=${API_URL:-${EXISTING_API_URL:-https://api.openai.com/v1}}
    
    # API Key
    read -p "$(echo -e ${CYAN}API Key [${EXISTING_API_KEY:+已保存}]: ${NC})" API_KEY
    API_KEY=${API_KEY:-$EXISTING_API_KEY}
    
    # 模型名称
    read -p "$(echo -e ${CYAN}模型名称 [${EXISTING_MODEL:-gpt-4-vision-preview}]: ${NC})" MODEL_NAME
    MODEL_NAME=${MODEL_NAME:-${EXISTING_MODEL:-gpt-4-vision-preview}}
fi

# 验证配置
echo ""
log_step "配置信息："
echo "  API地址: ${CYAN}$API_URL${NC}"
echo "  API Key: ${CYAN}${API_KEY:0:15}...${NC}"
echo "  模型名称: ${CYAN}$MODEL_NAME${NC}"
echo ""

# 如果不是自动模式，询问是否继续
if [ "$AUTO_MODE" = false ]; then
    read -p "$(echo -e ${YELLOW}确认配置并测试? [Y/n]: ${NC})" CONFIRM
    CONFIRM=${CONFIRM:-Y}
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        log_warning "已取消"
        exit 0
    fi
fi

# 创建测试脚本
log_step "正在测试API连通性..."
echo ""

TEST_SCRIPT=$(cat << 'EOF'
const https = require('https');
const http = require('http');
const url = require('url');

const config = {
    baseUrl: process.argv[2],
    apiKey: process.argv[3],
    modelName: process.argv[4]
};

// 构建测试请求
const apiUrl = new URL(config.baseUrl.endsWith('/') 
    ? config.baseUrl + 'chat/completions' 
    : config.baseUrl + '/chat/completions');

const requestData = JSON.stringify({
    model: config.modelName,
    messages: [
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "测试连接 - 请回复OK"
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
                console.log(JSON.stringify({
                    success: true,
                    statusCode: res.statusCode,
                    duration: duration,
                    model: response.model || config.modelName,
                    message: '连接成功'
                }));
            } catch (e) {
                console.log(JSON.stringify({
                    success: false,
                    statusCode: res.statusCode,
                    duration: duration,
                    error: '响应解析失败',
                    details: data.substring(0, 200)
                }));
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
            
            console.log(JSON.stringify({
                success: false,
                statusCode: res.statusCode,
                duration: duration,
                error: errorMsg,
                details: errorDetails
            }));
        }
    });
});

req.on('error', (error) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(JSON.stringify({
        success: false,
        duration: duration,
        error: '网络连接失败',
        details: error.message
    }));
});

req.on('timeout', () => {
    req.destroy();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(JSON.stringify({
        success: false,
        duration: duration,
        error: '请求超时',
        details: '超过30秒未响应'
    }));
});

req.write(requestData);
req.end();
EOF
)

# 执行测试
RESULT=$(echo "$TEST_SCRIPT" | node - "$API_URL" "$API_KEY" "$MODEL_NAME" 2>&1)

# 解析结果
if echo "$RESULT" | grep -q "^{"; then
    SUCCESS=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).success" 2>/dev/null)
    STATUS_CODE=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).statusCode || 'N/A'" 2>/dev/null)
    DURATION=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).duration" 2>/dev/null)
    ERROR_MSG=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).error || ''" 2>/dev/null)
    ERROR_DETAILS=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).details || ''" 2>/dev/null)
    RESPONSE_MODEL=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).model || ''" 2>/dev/null)
    
    if [ "$SUCCESS" = "true" ]; then
        log_success "API连接测试通过！"
        echo ""
        echo "  状态码: ${GREEN}$STATUS_CODE${NC}"
        echo "  响应时间: ${GREEN}${DURATION}秒${NC}"
        if [ ! -z "$RESPONSE_MODEL" ]; then
            echo "  使用模型: ${GREEN}$RESPONSE_MODEL${NC}"
        fi
        echo ""
        TEST_PASSED=true
    else
        log_error "API连接测试失败"
        echo ""
        if [ ! -z "$STATUS_CODE" ] && [ "$STATUS_CODE" != "N/A" ]; then
            echo "  状态码: ${RED}$STATUS_CODE${NC}"
        fi
        echo "  响应时间: ${YELLOW}${DURATION}秒${NC}"
        echo "  错误信息: ${RED}$ERROR_MSG${NC}"
        if [ ! -z "$ERROR_DETAILS" ]; then
            echo "  详细信息: ${YELLOW}$ERROR_DETAILS${NC}"
        fi
        echo ""
        TEST_PASSED=false
    fi
else
    log_error "测试脚本执行失败"
    echo ""
    echo "  错误输出: ${RED}$RESULT${NC}"
    echo ""
    TEST_PASSED=false
fi

# 保存配置
log_step "保存配置..."

CONFIG_JSON=$(cat << EOF
{
  "baseUrl": "$API_URL",
  "apiKey": "$API_KEY",
  "modelName": "$MODEL_NAME",
  "lastTested": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "testPassed": $TEST_PASSED
}
EOF
)

echo "$CONFIG_JSON" > "$CONFIG_FILE"

if [ $? -eq 0 ]; then
    log_success "配置已保存到: $CONFIG_FILE"
else
    log_error "配置保存失败"
    exit 1
fi

# 显示最终状态
echo ""
log_header "配置完成"
echo ""

if [ "$TEST_PASSED" = true ]; then
    log_success "✅ API配置成功且连接正常"
    echo ""
    log_info "现在可以运行批量打标："
    echo "  bash start-batch-labeling.sh"
    echo ""
    exit 0
else
    log_warning "⚠️  配置已保存，但API连接测试未通过"
    echo ""
    log_info "请检查以下项目："
    echo "  1. API地址是否正确"
    echo "  2. API Key是否有效"
    echo "  3. 模型名称是否支持"
    echo "  4. 网络连接是否正常"
    echo "  5. API账户余额是否充足"
    echo ""
    log_info "修复后可重新运行此脚本测试"
    echo ""
    exit 1
fi

