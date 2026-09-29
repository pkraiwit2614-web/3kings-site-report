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
$WallpaperPath = Join-Path $Root 'wallpaper.png'
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

function Invoke-BrowserQuiet {
  param(
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [switch]$CaptureOutput
  )

  # Windows PowerShell 5.1 can convert Chromium diagnostic stderr into NativeCommandError
  # when ErrorActionPreference is Stop. Chromium often writes harmless task-manager/debug
  # diagnostics to stderr even when the command succeeds, so suppress native stderr only
  # for this invocation while preserving strict error handling everywhere else.
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

if($Uninstall){
  try { & schtasks.exe /Delete /TN $TaskName /F | Out-Null } catch {}
  Write-Host 'Scheduled task removed. The last wallpaper image is kept on this PC.'
  exit 0
}

Ensure-Root
$browser = Find-Browser

if($Login){
  Write-Host 'Opening the dedicated 3 Kings wallpaper browser profile...'
  Write-Host 'Sign in to the Web App once, confirm that the wallpaper page appears, then close that browser window.'
  Start-Process -FilePath $browser -ArgumentList @("--user-data-dir=$ProfileDir",'--no-first-run',$AppUrl)
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

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$width = [Math]::Max(1280, $screen.Width)
$height = [Math]::Max(720, $screen.Height)
$commonArgs = @(
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-background-networking',
  "--user-data-dir=$ProfileDir",
  "--window-size=$width,$height",
  '--force-device-scale-factor=1',
  '--virtual-time-budget=12000'
)

# Validate authentication and successful data rendering before touching the current wallpaper.
$dumpArgs = $commonArgs + @('--dump-dom',$AppUrl)
$dump = Invoke-BrowserQuiet -Arguments $dumpArgs -CaptureOutput
$dom = $dump.Output
if($dump.ExitCode -ne 0 -or $dom -notmatch 'data-wallpaper-state="ready"'){
  Write-Host 'Wallpaper was not replaced: the Web App session is signed out or data is not ready.'
  Write-Host "Run: powershell -ExecutionPolicy Bypass -File `"$InstalledScript`" -Login"
  exit 2
}

$tempShot = Join-Path $Root 'wallpaper-new.png'
Remove-Item $tempShot -Force -ErrorAction SilentlyContinue
$shotArgs = $commonArgs + @("--screenshot=$tempShot",$AppUrl)
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
Write-Host "Wallpaper updated: $WallpaperPath"
