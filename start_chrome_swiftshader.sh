#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 从环境变量读取配置，如果未设置则使用默认值
CHROME_DEBUG_PORT="${CHROME_DEBUG_PORT:-30000}"
SERVER_PORT="${SERVER_PORT:-9999}"

echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}启动 Chrome - SwiftShader 稳定模式${NC}"
echo -e "${GREEN}===========================================${NC}"
echo -e "${YELLOW}调试端口: $CHROME_DEBUG_PORT${NC}"
echo -e "${YELLOW}前端地址: http://localhost:$SERVER_PORT${NC}"

# 清理旧进程
OLD_PID=$(pgrep -f "chrome.*remote-debugging-port=$CHROME_DEBUG_PORT")
if [ ! -z "$OLD_PID" ]; then
    echo -e "${YELLOW}⚠️  发现旧进程 PID: $OLD_PID，正在关闭...${NC}"
    kill $OLD_PID 2>/dev/null
    sleep 2
fi

# 清理临时数据
rm -rf /tmp/chrome-batch-labeling 2>/dev/null

# 启动 Chrome - SwiftShader 优化版本
echo -e "${GREEN}🚀 启动 Chrome (SwiftShader 软件渲染)...${NC}"
echo -e "${YELLOW}⚠️  注意：使用软件渲染，速度较慢${NC}"
echo -e "${YELLOW}⚠️  建议：并发数设置为 4-8${NC}"

# 确保日志目录存在
mkdir -p logs

nohup google-chrome \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --use-gl=swiftshader \
  --enable-unsafe-swiftshader \
  --remote-debugging-port=$CHROME_DEBUG_PORT \
  --window-size=1920,1080 \
  --user-data-dir=/tmp/chrome-batch-labeling-$CHROME_DEBUG_PORT \
  --disable-sync \
  --disable-extensions \
  --no-first-run \
  --mute-audio \
  --js-flags="--max-old-space-size=4096" \
  --enable-logging=stderr \
  --v=1 \
  http://localhost:$SERVER_PORT \
  > logs/chrome.log 2>&1 &

CHROME_PID=$!
sleep 3

# 检查是否启动成功
if ps -p $CHROME_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 启动成功！${NC}"
    echo -e "   PID: ${GREEN}$CHROME_PID${NC}"
    echo -e "   调试端口: ${GREEN}$CHROME_DEBUG_PORT${NC}"
    echo -e "   前端地址: ${GREEN}http://localhost:$SERVER_PORT${NC}"
    echo ""
    echo -e "${YELLOW}🎮 渲染模式：SwiftShader (CPU 软件渲染)${NC}"
    echo -e "${YELLOW}⚠️  性能：比 GPU 慢 10-100 倍${NC}"
    echo -e "${YELLOW}⚠️  并发数建议：4-8${NC}"
    echo ""
    echo -e "${YELLOW}📊 查看日志:${NC}"
    echo -e "   tail -f logs/chrome.log"
    echo ""
    echo -e "${YELLOW}🔍 验证 WebGL:${NC}"
    echo -e "   curl http://localhost:$CHROME_DEBUG_PORT/json/version"
    echo ""
    echo -e "${YELLOW}⏹️  停止浏览器:${NC}"
    echo -e "   kill $CHROME_PID"
else
    echo -e "${RED}❌ Chrome 启动失败${NC}"
    echo -e "查看详细日志: tail -50 logs/chrome.log"
    exit 1
fi

