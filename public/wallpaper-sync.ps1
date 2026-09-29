param(
  [switch]$Login,
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$AppUrl = 'https://3kings-site-report.vercel.app/wallpaper'
$TaskName = '3Kings Dynamic Wallpaper'
$Root = Join-Path $env:LOCALAPPDATA '3KingsWallpaper'
$ProfileDir = Join-Path $Root 'BrowserProfile'
$InstalledScript = Join-Path $Root 'wallpaper-sync.ps1'

function Find-Browser {
  $pf = [Environment]::GetFolderPath('ProgramFiles')
  $pfx86 = [Environment]::GetFolderPath('ProgramFilesX86')
  $local = $env:LOCALAPPDATA
  $candidates = @(
    (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $pfx86 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $local 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $pf 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $pfx86 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $local 'Google\Chrome\Application\chrome.exe')
  )
  foreach($candidate in $candidates){ if($candidate -and (Test-Path $candidate)){ return $candidate } }
  foreach($name in @('msedge.exe','chrome.exe')){
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){ return $cmd.Source }
  }
  throw 'Microsoft Edge or Google Chrome was not found.'
}

function Ensure-Root {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
  New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

function Close-WallpaperBrowserProfile {
  # Edge/Chrome may keep background processes alive after the dedicated login window is closed.
  # Those processes hold a lock on BrowserProfile and can make a new headless process start without
  # the saved Supabase session. Stop ONLY browser processes whose command line points at our dedicated
  # wallpaper profile; normal Edge/Chrome windows are left untouched.
  try {
    $needle = $ProfileDir.ToLowerInvariant()
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        ($_.Name -ieq 'msedge.exe' -or $_.Name -ieq 'chrome.exe') -and
        $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle)
      }
    foreach($p in $processes){
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if($processes){ Start-Sleep -Milliseconds 800 }
  } catch {}

  # Remove stale Chromium singleton lock files only inside the dedicated profile root.
  foreach($name in @('SingletonLock','SingletonCookie','SingletonSocket')){
    Remove-Item -LiteralPath (Join-Path $ProfileDir $name) -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-BrowserQuiet {
  param(
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [switch]$CaptureOutput
  )

  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    if($CaptureOutput){
      $output = (& $script:browser @Arguments 2>$null | Out-String)
    } else {
      & $script:browser @Arguments 2>$null | Out-Null
      $output = ''
    }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = $output }
}

function Test-WallpaperDomReady {
  param([string]$Dom)
  if([string]::IsNullOrWhiteSpace($Dom)){ return $false }
  $markers = @(
    'CRITICAL FOLLOW-UP / BLOCKERS',
    'PROCUREMENT FOLLOW-UP',
    'CONDO HANDOVER / DEFECT'
  )
  foreach($marker in $markers){
    if($Dom -notlike "*$marker*"){ return $false }
  }
  return $true
}

if($Uninstall){
  try { & schtasks.exe /Delete /TN $TaskName /F | Out-Null } catch {}
  Write-Host 'Scheduled task removed. The last wallpaper image is kept on this PC.'
  exit 0
}

Ensure-Root
$browser = Find-Browser

if($Login){
  Close-WallpaperBrowserProfile
  Write-Host 'Opening the dedicated 3 Kings wallpaper browser profile...'
  Write-Host 'Sign in to the Web App once, confirm that the wallpaper page appears, then close that browser window.'
  Start-Process -FilePath $browser -ArgumentList @("--user-data-dir=$ProfileDir",'--profile-directory=Default','--no-first-run',$AppUrl)
  exit 0
}

if($Install){
  if(-not $PSCommandPath){ throw 'Save wallpaper-sync.ps1 to a file before using -Install.' }
  if((Resolve-Path $PSCommandPath).Path -ne $InstalledScript){ Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force }
  $taskCommand = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstalledScript`""
  & schtasks.exe /Create /TN $TaskName /SC MINUTE /MO 15 /TR $taskCommand /F | Out-Null
  Write-Host 'Installed: wallpaper will refresh every 15 minutes while this Windows user is signed in.'
  Write-Host 'Running the first refresh now...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstalledScript
  exit $LASTEXITCODE
}

# Make sure no background process is still holding the dedicated profile before headless Edge starts.
Close-WallpaperBrowserProfile

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$width = [Math]::Max(1280, $screen.Width)
$height = [Math]::Max(720, $screen.Height)

# Force a fresh route request on every run so a prior prerender/CSS response is not reused.
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$FreshAppUrl = "$AppUrl?wallpaper_refresh=$cacheBust"

$commonArgs = @(
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  '--profile-directory=Default',
  '--disk-cache-size=1',
  '--media-cache-size=1',
  "--user-data-dir=$ProfileDir",
  "--window-size=$width,$height",
  '--force-device-scale-factor=1',
  '--virtual-time-budget=30000'
)

# Validate the actual rendered panels rather than relying on a React data attribute.
$dumpArgs = $commonArgs + @('--dump-dom',$FreshAppUrl)
$dump = Invoke-BrowserQuiet -Arguments $dumpArgs -CaptureOutput
$dom = $dump.Output
$isReady = ($dump.ExitCode -eq 0 -and (Test-WallpaperDomReady -Dom $dom))

if(-not $isReady){
  Close-WallpaperBrowserProfile
  Start-Sleep -Seconds 2
  $retryBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $FreshAppUrl = "$AppUrl?wallpaper_refresh=$retryBust"
  $dumpArgs = $commonArgs + @('--dump-dom',$FreshAppUrl)
  $dump = Invoke-BrowserQuiet -Arguments $dumpArgs -CaptureOutput
  $dom = $dump.Output
  $isReady = ($dump.ExitCode -eq 0 -and (Test-WallpaperDomReady -Dom $dom))
}

if(-not $isReady){
  if($dom -like '*BUILDING TODAY*'){
    Write-Host 'Wallpaper was not replaced: the page is authenticated but still loading data.'
  } elseif($dom -like '*WALLPAPER UPDATE PAUSED*'){
    Write-Host 'Wallpaper was not replaced: the wallpaper page reported a data-loading error.'
  } elseif($dom -like '*TODAY*S COMMAND CENTER*'){
    Write-Host 'Wallpaper was not replaced: the wallpaper page opened but the live panels did not finish rendering.'
  } else {
    Write-Host 'Wallpaper was not replaced: the dedicated browser profile could not be opened with its saved session.'
    Write-Host "Run: powershell -ExecutionPolicy Bypass -File `"$InstalledScript`" -Login"
  }
  exit 2
}

# dump-dom exits with the profile closed, but ensure no helper process retained the lock before screenshot.
Close-WallpaperBrowserProfile

# Use a new image filename every run so Windows does not keep a cached bitmap.
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempShot = Join-Path $Root "wallpaper-new-$stamp.png"
$WallpaperPath = Join-Path $Root "wallpaper-$stamp.png"
Remove-Item $tempShot -Force -ErrorAction SilentlyContinue
$shotArgs = $commonArgs + @("--screenshot=$tempShot",$FreshAppUrl)
$shot = Invoke-BrowserQuiet -Arguments $shotArgs
if($shot.ExitCode -ne 0 -or -not (Test-Path $tempShot) -or (Get-Item $tempShot).Length -lt 50000){
  Write-Host 'Wallpaper was not replaced: screenshot generation failed.'
  exit 3
}

Move-Item -LiteralPath $tempShot -Destination $WallpaperPath -Force
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
$ok = [Wallpaper.NativeMethods]::SystemParametersInfo(20,0,$WallpaperPath,3)
if(-not $ok){ throw 'Windows could not apply the wallpaper.' }

Get-ChildItem -Path $Root -Filter 'wallpaper-*.png' -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $WallpaperPath } |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Wallpaper updated: $WallpaperPath"
Write-Host "Fresh source: $FreshAppUrl"
