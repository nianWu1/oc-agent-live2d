# Clear oc-claw local app data / logs (Windows).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/clear-oc-claw-data.ps1
#   powershell -File scripts/clear-oc-claw-data.ps1 -Yes
#   powershell -File scripts/clear-oc-claw-data.ps1 -DryRun

param(
  [switch]$Yes,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$BundleId = "com.openclaw.ooclaw"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$paths = @(
  (Join-Path $env:APPDATA $BundleId),
  (Join-Path $env:LOCALAPPDATA $BundleId),
  (Join-Path $env:LOCALAPPDATA "$BundleId\logs")
) | Select-Object -Unique

$existing = @()
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) { $existing += $p }
}

if ($existing.Count -eq 0) {
  Write-Host "Nothing to clear for $BundleId."
  exit 0
}

Write-Host "Will clear oc-claw local data ($BundleId):"
foreach ($p in $existing) { Write-Host "  - $p" }
Write-Host ""
Write-Host "Note: this clears ALL app data for $BundleId, including:"
Write-Host "      settings.json, characters/, and imported Live2D under ...\live2d\"
Write-Host "      custom sprite pets in %USERPROFILE%\.codex\pets are NOT touched."
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run — no changes."
  exit 0
}

if (-not $Yes) {
  $ans = Read-Host "Quit oc-claw first, then type YES to continue"
  if ($ans -ne "YES") {
    Write-Host "Aborted."
    exit 1
  }
}

Get-Process -Name "oc_claw","oc-claw" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$BackupRoot = Join-Path $env:TEMP "oc-claw-data-backup-$Stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($p in $existing) {
  $name = (Split-Path $p -Leaf)
  $parent = Split-Path (Split-Path $p -Parent) -Leaf
  $dest = Join-Path $BackupRoot "${parent}__$name"
  Write-Host "Backing up -> $dest"
  Copy-Item -LiteralPath $p -Destination $dest -Recurse -Force
  Remove-Item -LiteralPath $p -Recurse -Force
  Write-Host "Removed $p"
}

Write-Host ""
Write-Host "Done. Backup at: $BackupRoot"
Write-Host "Restart oc-claw afterwards."
