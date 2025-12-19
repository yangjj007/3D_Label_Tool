@echo off
REM ============================================
REM 3D Label Tool 开发环境启动脚本 (Windows)
REM ============================================

echo 🚀 启动 3D Label Tool 开发环境...
echo.

REM 设置后端端口
set PORT=10000

REM 检查 .env 文件是否存在
if not exist ".env" (
    echo ⚠️  警告: .env 文件不存在
    echo 正在从模板创建 .env 文件...
    
    if exist "env.template" (
        copy env.template .env
        echo ✅ .env 文件已创建
        echo.
        echo 📝 请检查 .env 文件中的配置是否正确：
        echo    - 本地开发：VITE_API_BASE_URL=http://localhost:10000/api
        echo    - 远程访问：VITE_API_BASE_URL=http://服务器IP:10000/api
        echo.
        pause
    ) else (
        echo ❌ 错误: env.template 文件不存在
        echo 请手动创建 .env 文件，参考 ENV_SETUP.md
        exit /b 1
    )
)

REM 验证 .env 配置
echo 📋 检查环境配置...
findstr "0.0.0.0" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ❌ 错误: .env 文件中包含 0.0.0.0 地址
    echo 这会导致 CORS 错误！
    echo.
    echo 请修改 .env 文件，将：
    echo   VITE_API_BASE_URL=http://0.0.0.0:10000/api
    echo 改为：
    echo   VITE_API_BASE_URL=http://localhost:10000/api
    echo.
    exit /b 1
)

echo ✅ 环境配置检查通过
echo.

REM 显示配置信息
echo 📊 当前配置:
echo    后端端口: %PORT%
echo    前端端口: 9999
if exist ".env" (
    for /f "tokens=2 delims==" %%a in ('findstr VITE_API_BASE_URL .env') do (
        echo    API地址: %%a
    )
)
echo.

REM 检查端口是否被占用
echo 🔍 检查端口占用...
netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  警告: 端口 %PORT% 已被占用
    echo 请手动停止占用端口的进程，或选择其他端口
    echo 您可以使用以下命令查看占用进程：
    echo   netstat -ano ^| findstr ":%PORT%"
    echo.
    pause
)

echo.
echo 🎬 启动服务...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

REM 启动服务
npm run dev:full

