# One-time setup: deploy key for GitHub Actions + server authorized_keys.
# Usage (PowerShell, from project root):
#   powershell -ExecutionPolicy Bypass -File .\deploy\setup-github-actions.ps1
#
# Then add GitHub repo secrets (Settings -> Secrets and variables -> Actions):
#   DEPLOY_HOST      121.40.154.252
#   DEPLOY_USER      root
#   DEPLOY_SSH_KEY   contents of deploy/.github-actions-deploy (private key)

param(
  [string]$SshHost = $(if ($env:FORM_MANAGER_SSH_HOST) { $env:FORM_MANAGER_SSH_HOST } else { 'form-manager' }),
  [string]$DeployHost = '121.40.154.252',
  [string]$DeployUser = 'root'
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$keyPath = Join-Path $PSScriptRoot '.github-actions-deploy'
$pubPath = "$keyPath.pub"

if (-not (Test-Path $keyPath)) {
  Write-Host "==> Generating deploy key: $keyPath"
  ssh-keygen -t ed25519 -f $keyPath -N '""' -C 'github-actions-form-manager' | Out-Null
}

$publicKey = (Get-Content $pubPath -Raw).Trim()
Write-Host '==> Registering public key on server ...'
$escapedKey = $publicKey.Replace("'", "'\\''")
$remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qxF '$escapedKey' ~/.ssh/authorized_keys 2>/dev/null || echo '$escapedKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo registered"
ssh $SshHost $remoteCmd

Write-Host ''
Write-Host 'GitHub Actions secrets (repo Settings -> Secrets and variables -> Actions):'
Write-Host "  DEPLOY_HOST = $DeployHost"
Write-Host "  DEPLOY_USER = $DeployUser"
Write-Host '  DEPLOY_SSH_KEY = copy entire private key below (including BEGIN/END lines)'
Write-Host ''
Write-Host '----- BEGIN DEPLOY_SSH_KEY -----'
Get-Content $keyPath
Write-Host '----- END DEPLOY_SSH_KEY -----'
Write-Host ''
Write-Host 'After adding secrets, push to master or run the Deploy workflow manually on GitHub.'
