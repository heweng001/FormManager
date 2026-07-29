@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   LUJIFO ERP 服务重启
echo ========================================
echo.

set "PORT_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set "PORT_PID=%%a"
)

if defined PORT_PID (
    echo [1/2] 端口 3000 被占用，进程号: !PORT_PID!
    taskkill /PID !PORT_PID! /F >nul 2>&1
    if !errorlevel! equ 0 (
        echo       已结束旧进程
    ) else (
        echo       警告: 未能结束进程 !PORT_PID!，请打开任务管理器手动结束
    )
    timeout /t 2 /nobreak >nul
) else (
    echo [1/2] 端口 3000 空闲
)

echo [2/2] 正在启动服务...
echo.
echo   访问地址: http://localhost:3000
echo   停止服务: 按 Ctrl+C 或关闭此窗口
echo.

node server.js
if !errorlevel! neq 0 (
    echo.
    echo 启动失败。请确认已安装 Node.js，并在项目目录执行过 npm install
    pause
)
