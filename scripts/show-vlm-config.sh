#!/bin/bash

#############################################
# 查看VLM API配置
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$PROJECT_DIR/vlm-config.json"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}VLM API 配置信息${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ 配置文件不存在${NC}"
    echo ""
    echo -e "${CYAN}ℹ️  请先运行配置脚本:${NC}"
    echo "  bash configure-vlm-api.sh"
    echo ""
    exit 1
fi

# 读取配置
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js 未安装${NC}"
    exit 1
fi

BASE_URL=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).baseUrl")
API_KEY=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).apiKey")
MODEL_NAME=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).modelName")
LAST_TESTED=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).lastTested || 'N/A'")
TEST_PASSED=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).testPassed")

echo -e "${CYAN}配置文件路径:${NC}"
echo "  $CONFIG_FILE"
echo ""

echo -e "${CYAN}API配置:${NC}"
echo "  地址: ${BLUE}$BASE_URL${NC}"
echo "  Key:  ${BLUE}${API_KEY:0:15}...${API_KEY: -4}${NC}"
echo "  模型: ${BLUE}$MODEL_NAME${NC}"
echo ""

echo -e "${CYAN}测试状态:${NC}"
echo "  最后测试: ${YELLOW}$LAST_TESTED${NC}"

if [ "$TEST_PASSED" = "true" ]; then
    echo -e "  测试结果: ${GREEN}✅ 通过${NC}"
else
    echo -e "  测试结果: ${RED}❌ 未通过${NC}"
fi

echo ""
echo -e "${YELLOW}管理命令:${NC}"
echo "  重新配置: bash configure-vlm-api.sh"
echo "  测试连接: node automation/configure-vlm-api.js"
echo ""

