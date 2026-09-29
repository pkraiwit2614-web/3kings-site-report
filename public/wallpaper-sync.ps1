param(
  [string]$Token,
  [switch]$Login,
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$ImageUrl = 'https://3kings-site-report.vercel.app/api/wallpaper-png'
$TaskName = '3Kings Dynamic Wallpaper'
$Root = Join-Path $env:LOCALAPPDATA '3KingsWallpaper'
$TokenPath = Join-Path $Root 'device-token.txt'
$InstalledScript = Join-Path $Root 'wallpaper-sync.ps1'

function Ensure-Root {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
}

function Save-Token([string]$Value) {
  if([string]::IsNullOrWhiteSpace($Value) -or $Value.Trim().Length -lt 20){
    throw 'Wallpaper device token is missing or invalid.'
  }
  Set-Content -LiteralPath $TokenPath -Value $Value.Trim() -NoNewline -Encoding UTF8
  try { & attrib.exe +H $TokenPath | Out-Null } catch {}
}

function Get-SavedToken {
  if($Token){ Save-Token $Token }
  if(-not (Test-Path $TokenPath)){
    throw 'Wallpaper device token is not installed. Run this script with -Install -Token "YOUR_TOKEN".'
  }
  $value = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
  if($value.Length -lt 20){ throw 'Saved wallpaper device token is invalid.' }
  return $value
}

if($Uninstall){
  try { & schtasks.exe /Delete /TN $TaskName /F | Out-Null } catch {}
  Write-Host 'Scheduled task removed. The last wallpaper image is kept on this PC.'
  exit 0
}

Ensure-Root

if($Login){
  Write-Host 'Browser login is no longer required. The wallpaper now uses a read-only device token.'
  Write-Host 'Use: powershell -ExecutionPolicy Bypass -File "'$InstalledScript'" -Install -Token "YOUR_TOKEN"'
  exit 0
}

if($Install){
  if(-not $PSCommandPath){ throw 'Save wallpaper-sync.ps1 to a file before using -Install.' }
  if((Resolve-Path $PSCommandPath).Path -ne $InstalledScript){
    Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force
  }
  if($Token){ Save-Token $Token } elseif(-not (Test-Path $TokenPath)){
    throw 'First install requires -Token "YOUR_TOKEN".'
  }
  $taskCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstalledScript`""
  & schtasks.exe /Create /TN $TaskName /SC MINUTE /MO 15 /TR $taskCommand /F | Out-Null
  Write-Host 'Installed: server-generated wallpaper will refresh every 15 minutes.'
  Write-Host 'Running the first refresh now...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstalledScript
  exit $LASTEXITCODE
}

$deviceToken = Get-SavedToken

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$width = [Math]::Max(1280, $screen.Width)
$height = [Math]::Max(720, $screen.Height)

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempPath = Join-Path $Root "wallpaper-download-$stamp.png"
$wallpaperPath = Join-Path $Root "wallpaper-$stamp.png"

$uriBuilder = [System.UriBuilder]::new($ImageUrl)
$uriBuilder.Query = "w=$width&h=$height&v=$stamp"
$url = $uriBuilder.Uri.AbsoluteUri

$parsedUri = $null
if(-not [System.Uri]::TryCreate($url, [System.UriKind]::Absolute, [ref]$parsedUri) -or $parsedUri.Scheme -ne 'https'){
  Write-Host "Wallpaper was not replaced: generated server URI is invalid: $url"
  exit 2
}

Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue

try {
  Invoke-WebRequest -UseBasicParsing -Uri $parsedUri -Headers @{
    'X-Wallpaper-Token' = $deviceToken
    'Cache-Control' = 'no-cache'
  } -OutFile $tempPath -TimeoutSec 60
} catch {
  Write-Host "Wallpaper was not replaced: server image download failed. $($_.Exception.Message)"
  exit 2
}

if(-not (Test-Path $tempPath) -or (Get-Item $tempPath).Length -lt 10000){
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  Write-Host 'Wallpaper was not replaced: downloaded image is missing or invalid.'
  exit 3
}

try {
  Add-Type -AssemblyName System.Drawing
  $img = [System.Drawing.Image]::FromFile($tempPath)
  $valid = ($img.Width -ge 1280 -and $img.Height -ge 720)
  $img.Dispose()
  if(-not $valid){ throw 'Image dimensions are invalid.' }
} catch {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  Write-Host "Wallpaper was not replaced: downloaded file is not a valid PNG. $($_.Exception.Message)"
  exit 4
}

Move-Item -LiteralPath $tempPath -Destination $wallpaperPath -Force
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name WallpaperStyle -Value '10'
Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name TileWallpaper -Value '0'

if(-not ('Wallpaper.NativeMethods' -as [type])){
  Add-Type @'
using System;
using System.Runtime.InteropServices;
namespace Wallpaper {
  public static class NativeMethods {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool SystemParametersInfo(int action, int param, string value, int flags);
  }
}
'@
}

$ok = [Wallpaper.NativeMethods]::SystemParametersInfo(20,0,$wallpaperPath,3)
if(-not $ok){ throw 'Windows could not apply the wallpaper.' }

Get-ChildItem -Path $Root -Filter 'wallpaper-*.png' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $wallpaperPath } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Wallpaper updated: $wallpaperPath"
Write-Host "Server image: ${width}x${height}"
Write-Host "Source: $($parsedUri.GetLeftPart([System.UriPartial]::Path))"
