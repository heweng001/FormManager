# LUJIFO ERP 服务重启（PowerShell 版）
# 注意：不要用 $pid，那是当前终端自己的进程号

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '========================================'
Write-Host '  LUJIFO ERP 服务重启'
Write-Host '========================================'
Write-Host ''

$portPid = $null
$lines = netstat -ano | Select-String ':3000' | Select-String 'LISTENING'
if ($lines) {
    $portPid = ($lines[0].Line -split '\s+')[-1]
}

if ($portPid) {
    Write-Host "[1/2] 端口 3000 被占用，进程号: $portPid"
    try {
        Stop-Process -Id $portPid -Force -ErrorAction Stop
        Write-Host '      已结束旧进程'
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "      警告: 未能结束进程 $portPid - $($_.Exception.Message)"
    }
} else {
    Write-Host '[1/2] 端口 3000 空闲'
}

Write-Host '[2/2] 正在启动服务...'
Write-Host ''
Write-Host '  访问地址: http://localhost:3000'
Write-Host '  停止服务: 按 Ctrl+C 或关闭此窗口'
Write-Host ''

& node server.js
