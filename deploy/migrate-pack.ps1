# Windows: pack migration data (data.db + uploads)
# Usage (PowerShell, from project root):
#   powershell -ExecutionPolicy Bypass -File .\deploy\migrate-pack.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bundleDir = Join-Path $env:TEMP "form-manager-migrate-$stamp"
$zipPath = Join-Path (Get-Location) 'migrate-bundle.zip'

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

if (Test-Path 'data.db') {
  Copy-Item 'data.db' $bundleDir
  Write-Host 'Included: data.db'
} else {
  Write-Warning 'data.db not found'
}

if (Test-Path 'uploads') {
  Copy-Item 'uploads' $bundleDir -Recurse
  Write-Host 'Included: uploads/'
}

$wikiDir = 'public\uploads\wiki'
if (Test-Path $wikiDir) {
  $dest = Join-Path $bundleDir 'public\uploads\wiki'
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item $wikiDir $dest -Recurse
  Write-Host 'Included: public/uploads/wiki/'
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $zipPath
Remove-Item $bundleDir -Recurse -Force

Write-Host ''
Write-Host "Done: $zipPath"
Write-Host 'Upload to server, then run:'
Write-Host '  cd /opt/form-manager && unzip -o migrate-bundle.zip -d /opt/form-manager'
