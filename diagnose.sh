#!/bin/bash

#############################################
# 批量打标系统诊断脚本
# 
# 功能：
# 1. 检查所有服务状态
# 2. 检查端口占用
# 3. 检查 WebGL 支持
# 4. 生成诊断报告
#
# 使用方法：
#   bash diagnose.sh
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SERVER_PORT=9999
API_PORT=10000
CHROME_DEBUG_PORT=30000

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              批量打标系统 - 诊断工具                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 检查依赖
echo -e "${BLUE}[1/6] 检查依赖...${NC}"
echo ""

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "  ${GREEN}✅${NC} $1: $(which $1)"
        return 0
    else
        echo -e "  ${RED}❌${NC} $1: 未安装"
        return 1
    fi
}

DEPS_OK=1
check_command node || DEPS_OK=0
check_command google-chrome || check_command chromium-browser || check_command chromium || DEPS_OK=0
check_command curl || DEPS_OK=0

if [ $DEPS_OK -eq 0 ]; then
    echo -e "\n${RED}❌ 缺少必要的依赖${NC}\n"
else
    echo -e "\n${GREEN}✅ 所有依赖已安装${NC}\n"
fi

# 2. 检查端口占用
echo -e "${BLUE}[2/6] 检查端口占用...${NC}"
echo ""

check_port() {
    local port=$1
    local name=$2
    
    if command -v lsof &> /dev/null; then
        local pid=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$pid" ]; then
            local cmd=$(ps -p $pid -o comm= 2>/dev/null)
            echo -e "  ${GREEN}✅${NC} 端口 $port ($name): 被 PID $pid ($cmd) 占用"
            return 0
        else
            echo -e "  ${RED}❌${NC} 端口 $port ($name): 未被占用"
            return 1
        fi
    else
        echo -e "  ${YELLOW}⚠️${NC}  端口 $port ($name): 无法检查（lsof 未安装）"
        return 2
    fi
}

check_port $SERVER_PORT "前端服务"
FRONTEND_STATUS=$?

check_port $API_PORT "后端服务"
BACKEND_STATUS=$?

check_port $CHROME_DEBUG_PORT "Chrome调试"
CHROME_STATUS=$?

echo ""

# 3. 检查 Chrome 进程
echo -e "${BLUE}[3/6] 检查 Chrome 进程...${NC}"
echo ""

CHROME_PID=$(pgrep -f "chrome.*remote-debugging-port=$CHROME_DEBUG_PORT" | head -1)
if [ ! -z "$CHROME_PID" ]; then
    echo -e "  ${GREEN}✅${NC} Chrome 进程运行中"
    echo -e "     PID: $CHROME_PID"
    
    # 显示 Chrome 命令行参数
    echo -e "     命令行参数:"
    ps -p $CHROME_PID -o args= | tr ' ' '\n' | grep -E "^--" | head -10 | while read line; do
        if echo "$line" | grep -qE "gl|webgl|gpu|render"; then
            echo -e "       ${GREEN}$line${NC}"
        else
            echo -e "       $line"
        fi
    done
    
    # 检查关键参数
    CHROME_CMD=$(ps -p $CHROME_PID -o args=)
    echo ""
    echo -e "  关键参数检查:"
    
    if echo "$CHROME_CMD" | grep -q -- "--use-gl=swiftshader"; then
        echo -e "    ${GREEN}✅${NC} 使用 SwiftShader 软件渲染"
    elif echo "$CHROME_CMD" | grep -q -- "--use-gl=angle"; then
        echo -e "    ${GREEN}✅${NC} 使用 ANGLE 渲染"
    elif echo "$CHROME_CMD" | grep -q -- "--disable-gpu"; then
        echo -e "    ${YELLOW}⚠️${NC}  GPU 已禁用（可能使用软件渲染）"
    else
        echo -e "    ${GREEN}✅${NC} 使用 GPU 硬件加速"
    fi
    
    if echo "$CHROME_CMD" | grep -q -- "--disable-webgl"; then
        echo -e "    ${RED}❌${NC} WebGL 已禁用！这会导致应用无法运行"
    else
        echo -e "    ${GREEN}✅${NC} WebGL 未被禁用"
    fi
    
else
    echo -e "  ${RED}❌${NC} Chrome 进程未运行"
    echo -e "     请运行: bash start_chrome_swiftshader.sh"
fi

echo ""

# 4. 测试服务连接
echo -e "${BLUE}[4/6] 测试服务连接...${NC}"
echo ""

test_http() {
    local url=$1
    local name=$2
    
    if curl -s --connect-timeout 2 "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✅${NC} $name: $url"
        return 0
    else
        echo -e "  ${RED}❌${NC} $name: $url (无法连接)"
        return 1
    fi
}

test_http "http://localhost:$SERVER_PORT" "前端服务"
test_http "http://localhost:$API_PORT/api/health" "后端健康检查"
test_http "http://localhost:$API_PORT/api/files?type=raw&page=1&pageSize=1" "后端文件列表"
test_http "http://localhost:$CHROME_DEBUG_PORT/json/version" "Chrome调试接口"

echo ""

# 5. 检查文件目录
echo -e "${BLUE}[5/6] 检查文件目录...${NC}"
echo ""

check_dir() {
    local dir=$1
    local name=$2
    
    if [ -d "$dir" ]; then
        local count=$(find "$dir" -type f 2>/dev/null | wc -l)
        echo -e "  ${GREEN}✅${NC} $name: $dir ($count 个文件)"
        return 0
    else
        echo -e "  ${RED}❌${NC} $name: $dir (不存在)"
        return 1
    fi
}

check_dir "files/raw_files" "原始文件目录"
check_dir "files/label_files" "标注文件目录"
check_dir "logs" "日志目录"

echo ""

# 6. 检查 WebGL（如果 Chrome 在运行）
if [ ! -z "$CHROME_PID" ] && [ $CHROME_STATUS -eq 0 ]; then
    echo -e "${BLUE}[6/6] 检查 WebGL 支持...${NC}"
    echo ""
    
    if [ -f "check-webgl.js" ]; then
        # 运行 WebGL 检查脚本
        CHROME_DEBUG_PORT=$CHROME_DEBUG_PORT node check-webgl.js
    else
        echo -e "  ${YELLOW}⚠️${NC}  check-webgl.js 未找到，跳过 WebGL 检查"
    fi
else
    echo -e "${BLUE}[6/6] 检查 WebGL 支持...${NC}"
    echo ""
    echo -e "  ${YELLOW}⚠️${NC}  Chrome 未运行，跳过 WebGL 检查"
    echo -e "     请先启动 Chrome: bash start_chrome_swiftshader.sh"
    echo ""
fi

# 生成摘要
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        诊断摘要                            ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"

# 统计状态
ISSUES=0

if [ $DEPS_OK -eq 0 ]; then
    echo -e "${BLUE}║${NC} ${RED}❌${NC} 缺少必要的依赖                                      ${BLUE}║${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $FRONTEND_STATUS -ne 0 ]; then
    echo -e "${BLUE}║${NC} ${RED}❌${NC} 前端服务未运行 (端口 $SERVER_PORT)                       ${BLUE}║${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $BACKEND_STATUS -ne 0 ]; then
    echo -e "${BLUE}║${NC} ${RED}❌${NC} 后端服务未运行 (端口 $API_PORT)                        ${BLUE}║${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $CHROME_STATUS -ne 0 ]; then
    echo -e "${BLUE}║${NC} ${RED}❌${NC} Chrome 未运行 (调试端口 $CHROME_DEBUG_PORT)              ${BLUE}║${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ $ISSUES -eq 0 ]; then
    echo -e "${BLUE}║${NC} ${GREEN}✅${NC} 所有服务运行正常！                                  ${BLUE}║${NC}"
else
    echo -e "${BLUE}║${NC} ${RED}发现 $ISSUES 个问题${NC}                                          ${BLUE}║${NC}"
fi

echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 给出建议
if [ $ISSUES -gt 0 ]; then
    echo -e "${YELLOW}💡 建议操作:${NC}"
    echo ""
    
    if [ $BACKEND_STATUS -ne 0 ]; then
        echo -e "  1. 启动后端服务:"
        echo -e "     ${GREEN}PORT=$API_PORT node server/index.js${NC}"
        echo ""
    fi
    
    if [ $FRONTEND_STATUS -ne 0 ]; then
        echo -e "  2. 启动前端服务:"
        echo -e "     ${GREEN}pnpm preview --host 0.0.0.0 --port $SERVER_PORT${NC}"
        echo ""
    fi
    
    if [ $CHROME_STATUS -ne 0 ]; then
        echo -e "  3. 启动 Chrome:"
        echo -e "     ${GREEN}bash start_chrome_swiftshader.sh${NC}"
        echo ""
    fi
    
    echo -e "  或者使用一键启动脚本:"
    echo -e "  ${GREEN}bash start-batch-labeling.sh${NC}"
    echo ""
else
    echo -e "${GREEN}✅ 系统就绪！可以开始批量打标${NC}"
    echo ""
    echo -e "运行批量打标:"
    echo -e "  ${GREEN}node automation/batch-labeling.js${NC}"
    echo ""
    echo -e "或使用一键脚本:"
    echo -e "  ${GREEN}bash start-batch-labeling.sh${NC}"
    echo ""
fi

echo -e "${BLUE}📖 查看详细的故障排除指南:${NC}"
echo -e "   ${GREEN}cat WEBGL_TROUBLESHOOTING.md${NC}"
echo ""

