# ============================================================
#  StatementGuard Installer
#  Run: irm https://raw.githubusercontent.com/ridhanshr/StatementGuard/main/install.ps1 | iex
# ============================================================

$ErrorActionPreference = "Stop"
$repo = "ridhanshr/StatementGuard"
$appName = "StatementGuard"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  $appName Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- Get latest release from GitHub ---
Write-Host "[1/4] Fetching latest release..." -ForegroundColor Yellow
try {
    $releaseApi = "https://api.github.com/repos/$repo/releases/latest"
    $release = Invoke-RestMethod -Uri $releaseApi -UseBasicParsing
    $version = $release.tag_name
    Write-Host "  Latest version: $version" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Could not fetch release info." -ForegroundColor Red
    Write-Host "  Make sure the repository has a published release." -ForegroundColor Red
    Write-Host "  URL: https://github.com/$repo/releases" -ForegroundColor Gray
    exit 1
}

# --- Find Setup.exe asset ---
Write-Host "[2/4] Finding installer..." -ForegroundColor Yellow
$asset = $release.assets | Where-Object { $_.name -match "Setup.*\.exe$" } | Select-Object -First 1

if (-not $asset) {
    Write-Host "  ERROR: No Setup.exe found in the latest release." -ForegroundColor Red
    Write-Host "  Available assets:" -ForegroundColor Gray
    $release.assets | ForEach-Object { Write-Host "    - $($_.name)" -ForegroundColor Gray }
    exit 1
}

$downloadUrl = $asset.browser_download_url
$fileName = $asset.name
$fileSize = [math]::Round($asset.size / 1MB, 1)
Write-Host "  Found: $fileName ($fileSize MB)" -ForegroundColor Green

# --- Download ---
Write-Host "[3/4] Downloading $fileName..." -ForegroundColor Yellow
$tempDir = Join-Path $env:TEMP "StatementGuard_Install"
if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
$downloadPath = Join-Path $tempDir $fileName

try {
    $ProgressPreference = 'SilentlyContinue'  # Speed up download
    Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -UseBasicParsing
    $ProgressPreference = 'Continue'
    Write-Host "  Downloaded to: $downloadPath" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Download failed." -ForegroundColor Red
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# --- Run installer ---
Write-Host "[4/4] Launching installer..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  The installer window will open shortly." -ForegroundColor Cyan
Write-Host "  Follow the on-screen instructions to complete installation." -ForegroundColor Cyan
Write-Host ""

Start-Process -FilePath $downloadPath -Wait

# --- Cleanup ---
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  You can now launch $appName from the Start Menu" -ForegroundColor Green
Write-Host "  or the Desktop shortcut." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Clean up temp files
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
