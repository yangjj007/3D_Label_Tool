#!/bin/bash

#############################################
# 快速修复和重启脚本
# 
# 功能：
# 1. 停止所有服务
# 2. 清理临时文件
# 3. 使用正确的配置重启
#
# 使用方法：
#   bash restart-with-fix.sh
#############################################

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              快速修复和重启 - WebGL 问题修复              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. 停止所有服务
echo -e "${YELLOW}[1/5] 停止所有服务...${NC}"
echo ""

# 停止 Chrome
echo -e "  停止 Chrome..."
pkill -f "chrome.*remote-debugging-port" 2>/dev/null
pkill -f "chromium.*remote-debugging-port" 2>/dev/null
pkill -f "Xvfb" 2>/dev/null

# 停止 Node 服务
echo -e "  停止 Node 服务..."
if command -v pm2 &> /dev/null; then
    pm2 stop all 2>/dev/null
    pm2 delete all 2>/dev/null
fi

# 通过 PID 文件停止
if [ -f ".server.pid" ]; then
    kill $(cat .server.pid) 2>/dev/null
    rm .server.pid
fi

if [ -f ".frontend.pid" ]; then
    kill $(cat .frontend.pid) 2>/dev/null
    rm .frontend.pid
fi

sleep 2
echo -e "${GREEN}  ✅ 服务已停止${NC}"
echo ""

# 2. 清理临时文件
echo -e "${YELLOW}[2/5] 清理临时文件...${NC}"
echo ""

echo -e "  清理 Chrome 临时数据..."
rm -rf /tmp/chrome-batch-labeling* 2>/dev/null

echo -e "  清理旧日志..."
# 保留最近 3 天的日志
find logs/ -name "*.log" -mtime +3 -delete 2>/dev/null
find logs/ -name "*.png" -mtime +3 -delete 2>/dev/null

echo -e "${GREEN}  ✅ 清理完成${NC}"
echo ""

# 3. 检查环境
echo -e "${YELLOW}[3/5] 检查环境...${NC}"
echo ""

bash diagnose.sh || true

echo ""

# 4. 设置最佳配置
echo -e "${YELLOW}[4/5] 设置配置...${NC}"
echo ""

# 使用保守的配置以避免 WebGL 上下文丢失
export CONCURRENCY=2        # 并发数设为 2（SwiftShader 安全值）
export VIEW_KEYS=axial      # 只使用一个视图
export SERVER_URL=http://localhost:9999
export API_URL=http://localhost:10000
export CHROME_DEBUG_PORT=30000

echo -e "  ${GREEN}✅${NC} 并发数: ${GREEN}$CONCURRENCY${NC} (低并发，避免 WebGL 上下文丢失)"
echo -e "  ${GREEN}✅${NC} 视图: ${GREEN}$VIEW_KEYS${NC}"
echo -e "  ${GREEN}✅${NC} 前端: ${GREEN}$SERVER_URL${NC}"
echo -e "  ${GREEN}✅${NC} 后端: ${GREEN}$API_URL${NC}"
echo -e "  ${GREEN}✅${NC} Chrome 调试: ${GREEN}$CHROME_DEBUG_PORT${NC}"
echo ""

echo -e "${BLUE}💡 这些配置已针对 SwiftShader（CPU 软件渲染）优化${NC}"
echo -e "${BLUE}   如果你有 GPU，可以提高并发数：${NC}"
echo -e "${BLUE}   CONCURRENCY=8 bash start-batch-labeling.sh${NC}"
echo ""

# 5. 启动服务
echo -e "${YELLOW}[5/5] 启动服务...${NC}"
echo ""

read -p "是否开始启动并执行批量打标？(Y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo -e "${YELLOW}已取消${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}开始执行批量打标（使用优化配置）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 执行启动脚本
bash start-batch-labeling.sh

# 检查退出状态
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                   ✅ 执行成功！                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                   ❌ 执行失败                              ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}💡 故障排除建议：${NC}"
    echo ""
    echo -e "  1. 查看详细日志:"
    echo -e "     ${GREEN}tail -f logs/chrome.log${NC}"
    echo -e "     ${GREEN}tail -f logs/batch-labeling-*.log${NC}"
    echo ""
    echo -e "  2. 检查 WebGL 支持:"
    echo -e "     ${GREEN}node check-webgl.js${NC}"
    echo ""
    echo -e "  3. 如果 WebGL 仍然失败，尝试重启系统或使用更低的并发:"
    echo -e "     ${GREEN}CONCURRENCY=1 bash start-batch-labeling.sh${NC}"
    echo ""
    echo -e "  4. 查看完整的故障排除文档:"
    echo -e "     ${GREEN}cat WEBGL_TROUBLESHOOTING.md${NC}"
    echo ""
fi

exit $EXIT_CODE

