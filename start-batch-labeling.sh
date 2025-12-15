#!/bin/bash

#############################################
# 3D模型批量打标 - 一键启动脚本
# 
# 功能：
# 1. 检查并启动后端服务
# 2. 检查并启动前端服务
# 3. 检查并启动Chrome浏览器
# 4. 启动批量打标自动化脚本
#
# 使用方法：
#   bash start-batch-labeling.sh
#
# 环境变量：
#   SERVER_URL    - 前端服务地址
#   API_URL       - 后端API地址
#   CONCURRENCY   - 并发数
#   VIEW_KEYS     - 视图配置
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

server_port=9999  #前端服务端口
api_port=10000  #后端服务端口
chrome_debug_port=30000  #Chrome调试端口

# 配置
export SERVER_URL="${SERVER_URL:-http://localhost:$server_port}"
export API_URL="${API_URL:-http://localhost:$api_port}"
export CONCURRENCY="${CONCURRENCY:-16}"
export VIEW_KEYS="${VIEW_KEYS:-axial}"
export CHROME_DEBUG_PORT="${CHROME_DEBUG_PORT:-$chrome_debug_port}"

# 获取项目目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# 确保logs目录存在
mkdir -p logs

# 日志函数
log_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

log_step() {
    echo -e "\n${YELLOW}[$1] $2${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装"
        return 1
    fi
    return 0
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -i:$port &> /dev/null
        return $?
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep ":$port " &> /dev/null
        return $?
    else
        # 如果没有lsof和netstat，尝试连接端口
        timeout 1 bash -c "cat < /dev/null > /dev/tcp/localhost/$port" 2>/dev/null
        return $?
    fi
}

# 等待端口开启
wait_for_port() {
    local port=$1
    local name=$2
    local max_attempts=30
    local attempt=0
    
    log_info "等待 $name (端口 $port) 启动..."
    
    while [ $attempt -lt $max_attempts ]; do
        if check_port $port; then
            log_success "$name 已就绪"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "$name 启动超时"
    return 1
}

# 显示配置信息
log_header "3D模型批量打标 - 自动化启动"
echo ""
log_info "配置信息："
echo "  项目目录: $PROJECT_DIR"
echo "  前端地址: $SERVER_URL"
echo "  后端地址: $API_URL"
echo "  并发数: $CONCURRENCY"
echo "  视图配置: $VIEW_KEYS"
echo "  Chrome调试端口: $CHROME_DEBUG_PORT"
echo ""

# 检查必要的命令
log_step "0/4" "检查依赖..."
MISSING_DEPS=0

if ! check_command node; then
    log_error "Node.js 未安装，请先安装 Node.js"
    MISSING_DEPS=1
fi

if ! check_command pnpm && ! check_command npm; then
    log_error "pnpm 或 npm 未安装"
    MISSING_DEPS=1
fi

if ! check_command google-chrome && ! check_command chromium-browser && ! check_command chromium; then
    log_error "Chrome/Chromium 未安装"
    MISSING_DEPS=1
fi

if [ $MISSING_DEPS -eq 1 ]; then
    log_error "缺少必要的依赖，请先安装"
    exit 1
fi

log_success "依赖检查通过"

# 1. 检查并启动后端服务
log_step "1/4" "检查后端服务..."

# 为了确保后端工作目录正确，总是重启后端
if check_port $api_port; then
    log_info "后端服务已运行，为确保工作目录正确，将重启服务..."
    
    # 尝试停止现有服务
    if command -v pm2 &> /dev/null; then
        pm2 stop "3d-label-server" 2>/dev/null || true
        pm2 delete "3d-label-server" 2>/dev/null || true
    fi
    
    # 如果有PID文件，尝试杀死进程
    if [ -f ".server.pid" ]; then
        kill $(cat .server.pid) 2>/dev/null || true
        rm .server.pid
    fi
    
    # 等待端口释放
    sleep 2
fi

log_info "正在启动后端服务..."

# 检查是否安装了pm2
if command -v pm2 &> /dev/null; then
    # 使用pm2启动
    if [ -f "ecosystem.config.js" ]; then
        pm2 start ecosystem.config.js --silent
    else
        # 没有 ecosystem.config.js，手动设置环境变量
        PORT=$api_port pm2 start server/index.js --name "3d-label-server" --cwd "$PROJECT_DIR" --silent
    fi
else
    # 使用nohup启动，必须设置 PORT 环境变量
    PORT=$api_port nohup node server/index.js > logs/server.log 2>&1 &
    echo $! > .server.pid
fi

# 等待后端启动
if wait_for_port $api_port "后端服务"; then
    log_success "后端服务启动成功"
else
    log_error "后端服务启动失败，请查看日志: logs/server.log"
    exit 1
fi

# 2. 检查并启动前端服务
log_step "2/4" "检查前端服务..."

# 确保 .env 文件存在并配置正确
log_info "检查前端环境配置..."
if [ ! -f ".env" ]; then
    log_info "创建 .env 文件..."
    cat > .env << EOF
# 前端API地址配置
VITE_API_BASE_URL=http://localhost:$api_port/api
VITE_APP_BASE_URL=/
EOF
    log_success ".env 文件已创建"
else
    # 检查 .env 文件中的端口是否匹配
    if ! grep -q "VITE_API_BASE_URL=.*:$api_port/api" .env; then
        log_info "更新 .env 文件中的API端口..."
        sed -i.bak "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=http://localhost:$api_port/api|" .env
        log_success ".env 文件已更新"
        # 端口变了，需要重新构建
        rm -rf dist
    fi
fi

if check_port $server_port; then
    log_success "前端服务已运行"
else
    log_info "前端未运行，正在启动..."
    
    # 检查是否已构建
    if [ ! -d "dist" ]; then
        log_info "检测到未构建，正在构建前端..."
        if command -v pnpm &> /dev/null; then
            pnpm build:pro
        else
            npm run build:pro
        fi
    fi
    
    # 启动前端预览服务
    if command -v pm2 &> /dev/null; then
        if command -v pnpm &> /dev/null; then
            pm2 start --name "3d-label-frontend" -- pnpm preview --host 0.0.0.0 --port $server_port --silent
        else
            pm2 start --name "3d-label-frontend" -- npm run preview -- --host 0.0.0.0 --port $server_port --silent
        fi
    else
        if command -v pnpm &> /dev/null; then
            nohup pnpm preview --host 0.0.0.0 --port $server_port > logs/frontend.log 2>&1 &
        else
            nohup npm run preview -- --host 0.0.0.0 --port $server_port > logs/frontend.log 2>&1 &
        fi
        echo $! > .frontend.pid
    fi
    
    # 等待前端启动
    if wait_for_port $server_port "前端服务"; then
        log_success "前端服务启动成功"
    else
        log_error "前端服务启动失败"
        exit 1
    fi
fi

# 3. 检查并启动Chrome浏览器
log_step "3/4" "检查Chrome浏览器..."

if pgrep -f "chrome.*remote-debugging-port=$CHROME_DEBUG_PORT" > /dev/null; then
    log_success "Chrome已运行"
else
    log_info "Chrome未运行，正在启动..."
    
    # 检查启动脚本
    if [ -f "start_chrome_swiftshader.sh" ]; then
        log_info "使用 SwiftShader 模式启动 Chrome..."
        SERVER_PORT=$server_port CHROME_DEBUG_PORT=$chrome_debug_port bash start_chrome_swiftshader.sh
    elif [ -f "start_chrome_xvfb.sh" ]; then
        log_info "使用 Xvfb 模式启动 Chrome..."
        SERVER_PORT=$server_port CHROME_DEBUG_PORT=$chrome_debug_port bash start_chrome_xvfb.sh
    else
        log_error "未找到Chrome启动脚本"
        log_info "请确保 start_chrome_swiftshader.sh 或 start_chrome_xvfb.sh 存在"
        exit 1
    fi
    
    # 等待Chrome启动
    log_info "等待 Chrome 完全启动（10秒）..."
    sleep 10
    
    if pgrep -f "chrome.*remote-debugging-port=$CHROME_DEBUG_PORT" > /dev/null; then
        log_success "Chrome启动成功"
        
        # 验证 Chrome 调试端口
        log_info "验证 Chrome 调试端口..."
        if curl -s "http://localhost:$chrome_debug_port/json/version" > /dev/null; then
            log_success "Chrome 调试端口可访问"
        else
            log_error "Chrome 调试端口不可访问，但进程存在"
            log_info "可能需要更长的启动时间，继续尝试..."
        fi
    else
        log_error "Chrome启动失败"
        log_info "请查看日志: tail -f logs/chrome.log"
        exit 1
    fi
fi

# 4. 启动批量打标自动化脚本
log_step "4/4" "启动批量打标任务..."
echo ""
log_header "开始执行批量打标"
echo ""

# 执行自动化脚本
node automation/batch-labeling.js

# 检查退出状态
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    log_header "✅ 批量打标任务完成！"
    echo ""
    log_info "查看详细日志: ls -lh logs/batch-labeling-*.log"
    echo ""
else
    log_header "❌ 批量打标任务失败！"
    echo ""
    log_error "退出码: $EXIT_CODE"
    log_info "请检查日志文件获取详细信息"
    echo ""
    exit $EXIT_CODE
fi

