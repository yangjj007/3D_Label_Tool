#!/bin/bash

#############################################
# 3D模型批量打标 - 停止所有服务脚本
# 
# 功能：
# 1. 停止后端服务
# 2. 停止前端服务
# 3. 停止Chrome浏览器
# 4. 清理临时文件
#
# 使用方法：
#   bash stop-all.sh
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}停止所有服务...${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 获取项目目录
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

STOPPED_COUNT=0

# 1. 停止PM2管理的服务
echo -e "${YELLOW}[1/4] 检查PM2服务...${NC}"
if command -v pm2 &> /dev/null; then
    PM2_LIST=$(pm2 list 2>/dev/null | grep -E "3d-label-server|3d-label-frontend|frontend|server")
    
    if [ ! -z "$PM2_LIST" ]; then
        echo -e "${YELLOW}停止PM2管理的服务...${NC}"
        pm2 stop 3d-label-server 2>/dev/null && echo -e "${GREEN}✅ 后端服务已停止${NC}" && STOPPED_COUNT=$((STOPPED_COUNT + 1))
        pm2 stop 3d-label-frontend 2>/dev/null && echo -e "${GREEN}✅ 前端服务已停止${NC}" && STOPPED_COUNT=$((STOPPED_COUNT + 1))
        pm2 stop frontend 2>/dev/null
        
        # 删除进程
        pm2 delete 3d-label-server 2>/dev/null
        pm2 delete 3d-label-frontend 2>/dev/null
        pm2 delete frontend 2>/dev/null
        
        echo -e "${GREEN}✅ PM2服务已清理${NC}"
    else
        echo -e "${BLUE}ℹ️  没有运行中的PM2服务${NC}"
    fi
else
    echo -e "${BLUE}ℹ️  PM2未安装，跳过${NC}"
fi

# 2. 停止Node.js后端服务
echo -e "\n${YELLOW}[2/4] 检查后端服务...${NC}"

# 通过PID文件停止
if [ -f ".server.pid" ]; then
    SERVER_PID=$(cat .server.pid)
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}停止后端服务 (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID 2>/dev/null
        sleep 1
        
        # 如果还在运行，强制杀死
        if ps -p $SERVER_PID > /dev/null 2>&1; then
            kill -9 $SERVER_PID 2>/dev/null
        fi
        
        echo -e "${GREEN}✅ 后端服务已停止${NC}"
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
    fi
    rm -f .server.pid
fi

# 通过进程名停止
BACKEND_PID=$(pgrep -f "node.*server/index.js")
if [ ! -z "$BACKEND_PID" ]; then
    echo -e "${YELLOW}发现后端进程 (PID: $BACKEND_PID)，正在停止...${NC}"
    kill $BACKEND_PID 2>/dev/null
    sleep 1
    
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        kill -9 $BACKEND_PID 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ 后端服务已停止${NC}"
    STOPPED_COUNT=$((STOPPED_COUNT + 1))
else
    echo -e "${BLUE}ℹ️  后端服务未运行${NC}"
fi

# 3. 停止前端服务
echo -e "\n${YELLOW}[3/4] 检查前端服务...${NC}"

# 通过PID文件停止
if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}停止前端服务 (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID 2>/dev/null
        sleep 1
        
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            kill -9 $FRONTEND_PID 2>/dev/null
        fi
        
        echo -e "${GREEN}✅ 前端服务已停止${NC}"
        STOPPED_COUNT=$((STOPPED_COUNT + 1))
    fi
    rm -f .frontend.pid
fi

# 通过进程名停止
FRONTEND_PID=$(pgrep -f "vite.*preview.*29999")
if [ ! -z "$FRONTEND_PID" ]; then
    echo -e "${YELLOW}发现前端进程 (PID: $FRONTEND_PID)，正在停止...${NC}"
    kill $FRONTEND_PID 2>/dev/null
    sleep 1
    
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        kill -9 $FRONTEND_PID 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ 前端服务已停止${NC}"
    STOPPED_COUNT=$((STOPPED_COUNT + 1))
else
    echo -e "${BLUE}ℹ️  前端服务未运行${NC}"
fi

# 4. 停止Chrome浏览器
echo -e "\n${YELLOW}[4/4] 检查Chrome浏览器...${NC}"

CHROME_PID=$(pgrep -f "chrome.*remote-debugging-port=30000")
if [ ! -z "$CHROME_PID" ]; then
    echo -e "${YELLOW}停止Chrome浏览器 (PID: $CHROME_PID)...${NC}"
    kill $CHROME_PID 2>/dev/null
    sleep 2
    
    # 如果还在运行，强制杀死
    if ps -p $CHROME_PID > /dev/null 2>&1; then
        kill -9 $CHROME_PID 2>/dev/null
    fi
    
    echo -e "${GREEN}✅ Chrome浏览器已停止${NC}"
    STOPPED_COUNT=$((STOPPED_COUNT + 1))
else
    echo -e "${BLUE}ℹ️  Chrome浏览器未运行${NC}"
fi

# 清理其他可能的Chrome进程
EXTRA_CHROME=$(pgrep -f "chrome.*batch-labeling")
if [ ! -z "$EXTRA_CHROME" ]; then
    echo -e "${YELLOW}清理额外的Chrome进程...${NC}"
    kill $EXTRA_CHROME 2>/dev/null
    sleep 1
fi

# 5. 清理临时文件
echo -e "\n${YELLOW}清理临时文件...${NC}"

# 清理Chrome临时数据
if [ -d "/tmp/chrome-batch-labeling" ]; then
    rm -rf /tmp/chrome-batch-labeling
    echo -e "${GREEN}✅ Chrome临时数据已清理${NC}"
fi

# 清理其他临时文件
rm -f .server.pid .frontend.pid 2>/dev/null

# 清理可能的锁文件
rm -f /tmp/.X99-lock 2>/dev/null

echo ""
echo -e "${BLUE}========================================${NC}"
if [ $STOPPED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✅ 已停止 $STOPPED_COUNT 个服务${NC}"
else
    echo -e "${BLUE}ℹ️  没有运行中的服务${NC}"
fi
echo -e "${BLUE}========================================${NC}"
echo ""

# 显示剩余的相关进程
REMAINING=$(ps aux | grep -E "node.*server|chrome.*30000|vite.*preview" | grep -v grep)
if [ ! -z "$REMAINING" ]; then
    echo -e "${YELLOW}⚠️  警告: 发现可能相关的残留进程:${NC}"
    echo "$REMAINING"
    echo ""
    echo -e "${YELLOW}如需强制清理，请运行:${NC}"
    echo "  pkill -9 -f 'node.*server'"
    echo "  pkill -9 -f 'chrome.*30000'"
    echo "  pkill -9 -f 'vite.*preview'"
fi

