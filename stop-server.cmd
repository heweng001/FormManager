@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ========================================
echo   LUJIFO ERP 停止服务
echo ========================================
echo.

set "PORT_PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set "PORT_PID=%%a"
)

if not defined PORT_PID (
    echo 端口 3000 没有运行中的服务。
    goto :done
)

echo 正在结束进程 !PORT_PID! ...
taskkill /PID !PORT_PID! /F
if !errorlevel! equ 0 (
    echo 服务已停止。
) else (
    echo 停止失败，请用任务管理器手动结束进程 !PORT_PID!
)

:done
echo.
pause
