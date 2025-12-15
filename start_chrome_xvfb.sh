#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 从环境变量读取配置，如果未设置则使用默认值
CHROME_DEBUG_PORT="${CHROME_DEBUG_PORT:-30000}"
SERVER_PORT="${SERVER_PORT:-9999}"

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}启动 Chrome - Xvfb + GPU 加速模式${NC}"
echo -e "${GREEN}===========================================${NC}"
echo -e "${YELLOW}调试端口: $CHROME_DEBUG_PORT${NC}"
echo -e "${YELLOW}前端地址: http://localhost:$SERVER_PORT${NC}"

# 检查 Xvfb 是否安装
if ! command -v Xvfb &> /dev/null; then
    echo -e "${RED}❌ Xvfb 未安装${NC}"
    echo -e "${YELLOW}安装命令: sudo apt install xvfb${NC}"
    exit 1
fi

# 清理旧进程
OLD_CHROME_PID=$(pgrep -f "chrome.*remote-debugging-port=$CHROME_DEBUG_PORT")
if [ ! -z "$OLD_CHROME_PID" ]; then
    echo -e "${YELLOW}⚠️  发现旧 Chrome 进程 PID: $OLD_CHROME_PID，正在关闭...${NC}"
    kill $OLD_CHROME_PID 2>/dev/null
    sleep 2
fi

OLD_XVFB_PID=$(pgrep -f "Xvfb :99")
if [ ! -z "$OLD_XVFB_PID" ]; then
    echo -e "${YELLOW}⚠️  发现旧 Xvfb 进程 PID: $OLD_XVFB_PID，正在关闭...${NC}"
    kill $OLD_XVFB_PID 2>/dev/null
    sleep 2
fi

# 清理临时数据
rm -rf /tmp/chrome-batch-labeling 2>/dev/null

# 启动 Xvfb (虚拟显示)
echo -e "${GREEN}🖥️  启动 Xvfb 虚拟显示...${NC}"
mkdir -p logs
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset > logs/xvfb.log 2>&1 &
XVFB_PID=$!
export DISPLAY=:99

sleep 2

if ps -p $XVFB_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Xvfb 启动成功，PID: $XVFB_PID${NC}"
else
    echo -e "${RED}❌ Xvfb 启动失败${NC}"
    exit 1
fi

# 启动 Chrome
echo -e "${GREEN}🚀 启动 Chrome (GPU 加速)...${NC}"
nohup google-chrome \
  --display=:99 \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-software-rasterizer \
  --enable-gpu-rasterization \
  --ignore-gpu-blocklist \
  --enable-features=VaapiVideoDecoder \
  --remote-debugging-port=$CHROME_DEBUG_PORT \
  --window-size=1920,1080 \
  --user-data-dir=/tmp/chrome-batch-labeling-$CHROME_DEBUG_PORT \
  --disable-sync \
  --disable-extensions \
  --no-first-run \
  --mute-audio \
  --enable-logging=stderr \
  --v=1 \
  http://localhost:$SERVER_PORT \
  > logs/chrome.log 2>&1 &

CHROME_PID=$!
sleep 3

# 检查是否启动成功
if ps -p $CHROME_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 启动成功！${NC}"
    echo -e "   Chrome PID: ${GREEN}$CHROME_PID${NC}"
    echo -e "   Xvfb PID: ${GREEN}$XVFB_PID${NC}"
    echo -e "   调试端口: ${GREEN}$CHROME_DEBUG_PORT${NC}"
    echo -e "   前端地址: ${GREEN}http://localhost:$SERVER_PORT${NC}"
    echo ""
    echo -e "${YELLOW}🎮 GPU 模式：硬件加速 (通过 Xvfb)${NC}"
    echo ""
    echo -e "${YELLOW}📊 查看日志:${NC}"
    echo -e "   Chrome: tail -f logs/chrome.log"
    echo -e "   Xvfb: tail -f logs/xvfb.log"
    echo ""
    echo -e "${YELLOW}🔍 验证配置:${NC}"
    echo -e "   curl http://localhost:$CHROME_DEBUG_PORT/json/version"
    echo ""
    echo -e "${YELLOW}⏹️  停止服务:${NC}"
    echo -e "   kill $CHROME_PID $XVFB_PID"
else
    echo -e "${RED}❌ Chrome 启动失败${NC}"
    echo -e "查看详细日志: tail -50 logs/chrome.log"
    kill $XVFB_PID 2>/dev/null
    exit 1
fi

