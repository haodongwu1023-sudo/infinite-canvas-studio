@echo off
chcp 65001 >nul
cd /d "%~dp0web"
where node >nul 2>&1
if errorlevel 1 (
    echo 请先安装 Node.js 22.12 或更高版本，再重新打开本脚本。
    pause
    exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
    echo 首次运行，正在安装依赖...
    call npm ci
    if errorlevel 1 (
        echo 依赖安装失败，请检查终端中的错误信息。
        pause
        exit /b 1
    )
)
echo 启动后请打开 http://127.0.0.1:3001/canvas
call npm run dev
pause
