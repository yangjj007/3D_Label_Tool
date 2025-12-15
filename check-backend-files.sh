#!/bin/bash

#############################################
# 快速诊断脚本 - 检查后端能否看到文件
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:30005}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}后端文件诊断工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 获取项目目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}1. 检查本地文件系统:${NC}"
echo "   项目目录: $PROJECT_DIR"

RAW_FILES_DIR="$PROJECT_DIR/files/raw_files"
LABELED_FILES_DIR="$PROJECT_DIR/files/labeled_files"

echo "   RAW文件目录: $RAW_FILES_DIR"
if [ -d "$RAW_FILES_DIR" ]; then
    FILE_COUNT=$(find "$RAW_FILES_DIR" -maxdepth 1 -type f -name "*.glb" | wc -l)
    echo -e "   ${GREEN}✓ 目录存在${NC}"
    echo "   文件数量: $FILE_COUNT"
    if [ $FILE_COUNT -gt 0 ]; then
        echo "   前3个文件:"
        find "$RAW_FILES_DIR" -maxdepth 1 -type f -name "*.glb" | head -3 | while read file; do
            echo "     - $(basename "$file")"
        done
    fi
else
    echo -e "   ${RED}✗ 目录不存在${NC}"
fi

echo ""
echo -e "${BLUE}2. 检查后端API:${NC}"
echo "   API地址: $API_URL"

# 检查健康状态
if command -v curl &> /dev/null; then
    echo -n "   健康检查: "
    HEALTH=$(curl -s "$API_URL/api/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 后端正常${NC}"
    else
        echo -e "${RED}✗ 后端无响应${NC}"
        exit 1
    fi
    
    # 获取raw文件列表
    echo ""
    echo "   获取RAW文件列表..."
    RESPONSE=$(curl -s "$API_URL/api/files?type=raw&page=1&pageSize=10")
    
    if [ $? -eq 0 ]; then
        # 使用node解析JSON（如果可用）
        if command -v node &> /dev/null; then
            TOTAL=$(echo "$RESPONSE" | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).total")
            FILES_COUNT=$(echo "$RESPONSE" | node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')).files.length")
            
            echo "   后端返回:"
            echo "     总文件数: $TOTAL"
            echo "     当前页文件数: $FILES_COUNT"
            
            if [ "$TOTAL" -gt 0 ]; then
                echo -e "   ${GREEN}✓ 后端能看到文件${NC}"
                echo ""
                echo "   文件列表:"
                echo "$RESPONSE" | node -pe "
                    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                    data.files.slice(0, 5).map((f, i) => 
                        '     ' + (i+1) + '. ' + f.name + ' (' + (f.size/1024/1024).toFixed(2) + 'MB)'
                    ).join('\n')
                "
            else
                echo -e "   ${RED}✗ 后端返回0个文件${NC}"
                echo ""
                echo -e "${YELLOW}⚠️  后端看不到文件，可能原因:${NC}"
                echo "   1. 后端工作目录不对"
                echo "   2. 后端没有权限访问文件目录"
                echo "   3. 后端需要重启"
                echo ""
                echo -e "${BLUE}建议操作:${NC}"
                echo "   1. 重启后端服务: pm2 restart all 或 kill后端进程"
                echo "   2. 从项目根目录启动: cd $PROJECT_DIR && node server/index.js"
                echo "   3. 运行批量打标脚本（会自动重启后端）: bash start-batch-labeling.sh"
            fi
        else
            echo "   原始响应:"
            echo "$RESPONSE" | head -20
        fi
    else
        echo -e "   ${RED}✗ API请求失败${NC}"
    fi
else
    echo -e "   ${YELLOW}⚠️  curl未安装，跳过API检查${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}诊断完成${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

