#!/bin/bash

# ============================================
# 3D Label Tool 开发环境启动脚本
# ============================================

echo "🚀 启动 3D Label Tool 开发环境..."
echo ""

# 设置后端端口
export PORT=10000

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "⚠️  警告: .env 文件不存在"
    echo "正在从模板创建 .env 文件..."
    
    if [ -f "env.template" ]; then
        cp env.template .env
        echo "✅ .env 文件已创建"
        echo ""
        echo "📝 请检查 .env 文件中的配置是否正确："
        echo "   - 本地开发：VITE_API_BASE_URL=http://localhost:10000/api"
        echo "   - 远程访问：VITE_API_BASE_URL=http://服务器IP:10000/api"
        echo ""
        read -p "按回车键继续启动..."
    else
        echo "❌ 错误: env.template 文件不存在"
        echo "请手动创建 .env 文件，参考 ENV_SETUP.md"
        exit 1
    fi
fi

# 验证 .env 配置
echo "📋 检查环境配置..."
if grep -q "0.0.0.0" .env; then
    echo ""
    echo "❌ 错误: .env 文件中包含 0.0.0.0 地址"
    echo "这会导致 CORS 错误！"
    echo ""
    echo "请修改 .env 文件，将："
    echo "  VITE_API_BASE_URL=http://0.0.0.0:10000/api"
    echo "改为："
    echo "  VITE_API_BASE_URL=http://localhost:10000/api"
    echo ""
    exit 1
fi

echo "✅ 环境配置检查通过"
echo ""

# 显示配置信息
echo "📊 当前配置:"
echo "   后端端口: $PORT"
echo "   前端端口: 9999"
if [ -f ".env" ]; then
    api_url=$(grep VITE_API_BASE_URL .env | cut -d'=' -f2)
    echo "   API地址: $api_url"
fi
echo ""

# 检查端口是否被占用
echo "🔍 检查端口占用..."
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  警告: 端口 $PORT 已被占用"
    read -p "是否尝试杀掉占用进程？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti:$PORT | xargs kill -9 2>/dev/null
        echo "✅ 已释放端口 $PORT"
        sleep 1
    else
        echo "请手动停止占用端口的进程，或选择其他端口"
        exit 1
    fi
fi

if lsof -Pi :9999 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  警告: 端口 9999 已被占用"
    read -p "是否尝试杀掉占用进程？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        lsof -ti:9999 | xargs kill -9 2>/dev/null
        echo "✅ 已释放端口 9999"
        sleep 1
    fi
fi

echo ""
echo "🎬 启动服务..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动服务
npm run dev:full

# 如果脚本被中断，清理
trap 'echo ""; echo "👋 服务已停止"; exit' INT TERM

