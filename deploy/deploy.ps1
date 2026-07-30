# Commit (if needed), push, and deploy to production.
# Usage (PowerShell, from project root):
#   powershell -ExecutionPolicy Bypass -File .\deploy\deploy.ps1 "fix tag filter"
#   powershell -ExecutionPolicy Bypass -File .\deploy\deploy.ps1 -DeployOnly
#
# Env overrides:
#   FORM_MANAGER_SSH_HOST  default: form-manager
#   FORM_MANAGER_GIT_PROXY default: http://127.0.0.1:7890

param(
  [Parameter(Position = 0)]
  [string]$Message = '',
  [switch]$DeployOnly,
  [switch]$NoProxy
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$SshHost = if ($env:FORM_MANAGER_SSH_HOST) { $env:FORM_MANAGER_SSH_HOST } else { 'form-manager' }
$GitProxy = if ($env:FORM_MANAGER_GIT_PROXY) { $env:FORM_MANAGER_GIT_PROXY } else { 'http://127.0.0.1:7890' }

function Invoke-GitPush {
  if ($NoProxy) {
    git push origin master
    return
  }
  git -c http.sslBackend=openssl -c "http.proxy=$GitProxy" -c "https.proxy=$GitProxy" push origin master
}

if (-not $DeployOnly) {
  $dirty = git status --porcelain
  if ($dirty) {
    if (-not $Message) {
      throw 'Uncommitted changes. Usage: .\deploy\deploy.ps1 "commit message"'
    }
    git add -A
    git commit -m $Message
  } elseif ($Message) {
    Write-Host 'Working tree clean, skipping commit.'
  }
  Write-Host '==> git push'
  Invoke-GitPush
}

Write-Host "==> Deploying to $SshHost ..."
ssh $SshHost 'cd /opt/form-manager && bash deploy/deploy-update.sh'
Write-Host '==> Done'
