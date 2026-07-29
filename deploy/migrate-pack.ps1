# Windows 本地：打包迁移数据（data.db + uploads）
# 用法（PowerShell，在项目根目录）:
#   .\deploy\migrate-pack.ps1
# 生成 migrate-bundle.zip 后，上传到服务器解压

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bundleDir = Join-Path $env:TEMP "form-manager-migrate-$stamp"
$zipPath = Join-Path (Get-Location) "migrate-bundle.zip"

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

if (Test-Path 'data.db') {
  Copy-Item 'data.db' $bundleDir
  Write-Host "已包含 data.db"
} else {
  Write-Warning "未找到 data.db，请确认数据库文件存在"
}

if (Test-Path 'uploads') {
  Copy-Item 'uploads' $bundleDir -Recurse
  Write-Host "已包含 uploads/"
}

$wikiDir = 'public\uploads\wiki'
if (Test-Path $wikiDir) {
  $dest = Join-Path $bundleDir 'public\uploads\wiki'
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item $wikiDir $dest -Recurse
  Write-Host "已包含 public/uploads/wiki/"
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $zipPath
Remove-Item $bundleDir -Recurse -Force

Write-Host ""
Write-Host "打包完成: $zipPath"
Write-Host "上传到服务器后，在 /opt/form-manager 解压:"
Write-Host "  unzip -o migrate-bundle.zip -d /opt/form-manager"
