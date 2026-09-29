param(
  [switch]$Login,
  [switch]$Install,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$AppUrl = 'https://3kings-site-report.vercel.app/wallpaper'
$TaskName = '3Kings Dynamic Wallpaper'
$Root = Join-Path $env:LOCALAPPDATA '3KingsWallpaper'
$LoginProfileDir = Join-Path $Root 'BrowserProfile'
$HeadlessProfileDir = Join-Path $Root 'HeadlessProfile'
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
  New-Item -ItemType Directory -Path $LoginProfileDir -Force | Out-Null
}

function Close-BrowserProfileProcesses {
  param([Parameter(Mandatory=$true)][string]$ProfilePath)
  try {
    $needle = $ProfilePath.ToLowerInvariant()
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        ($_.Name -ieq 'msedge.exe' -or $_.Name -ieq 'chrome.exe') -and
        $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle)
      })
    foreach($p in $processes){
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if($processes.Count -gt 0){ Start-Sleep -Milliseconds 1200 }
  } catch {}
}

function Remove-ProfileLocks {
  param([Parameter(Mandatory=$true)][string]$ProfilePath)
  foreach($name in @('SingletonLock','SingletonCookie','SingletonSocket')){
    Remove-Item -LiteralPath (Join-Path $ProfilePath $name) -Force -ErrorAction SilentlyContinue
  }
}

function Initialize-HeadlessProfile {
  Close-BrowserProfileProcesses -ProfilePath $LoginProfileDir
  Close-BrowserProfileProcesses -ProfilePath $HeadlessProfileDir

  if(-not (Test-Path $HeadlessProfileDir)){
    if(-not (Test-Path (Join-Path $LoginProfileDir 'Default'))){
      throw 'The dedicated login profile has not been created yet. Run the script with -Login first.'
    }

    Write-Host 'Preparing the dedicated headless wallpaper session...'
    New-Item -ItemType Directory -Path $HeadlessProfileDir -Force | Out-Null

    $roboArgs = @(
      $LoginProfileDir,
      $HeadlessProfileDir,
      '/MIR','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP',
      '/XD','Cache','Code Cache','GPUCache','GrShaderCache','ShaderCache','DawnCache'
    )
    & robocopy.exe @roboArgs | Out-Null
    $rc = $LASTEXITCODE
    if($rc -ge 8){
      Remove-Item -LiteralPath $HeadlessProfileDir -Recurse -Force -ErrorAction SilentlyContinue
      throw "Could not prepare the headless browser profile. Robocopy exit code: $rc"
    }
  }

  Remove-ProfileLocks -ProfilePath $HeadlessProfileDir
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
  Close-BrowserProfileProcesses -ProfilePath $LoginProfileDir
  Remove-ProfileLocks -ProfilePath $LoginProfileDir

  # Any new interactive login must seed a fresh headless profile on the next refresh.
  Close-BrowserProfileProcesses -ProfilePath $HeadlessProfileDir
  Remove-Item -LiteralPath $HeadlessProfileDir -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host 'Opening the dedicated 3 Kings wallpaper login profile...'
  Write-Host 'Sign in, wait until TODAY''S COMMAND CENTER shows live data, then close this browser window.'
  Start-Process -FilePath $browser -ArgumentList @(
    "--user-data-dir=$LoginProfileDir",
    '--profile-directory=Default',
    '--no-first-run',
    '--disable-background-mode',
    $AppUrl
  )
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

try {
  Initialize-HeadlessProfile
} catch {
  Write-Host "Wallpaper was not replaced: $($_.Exception.Message)"
  Write-Host "Run: powershell -ExecutionPolicy Bypass -File `"$InstalledScript`" -Login"
  exit 2
}

Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$width = [Math]::Max(1280, $screen.Width)
$height = [Math]::Max(720, $screen.Height)

$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$FreshAppUrl = "$AppUrl?wallpaper_refresh=$cacheBust"

$commonArgs = @(
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-background-mode',
  '--profile-directory=Default',
  '--disk-cache-size=1',
  '--media-cache-size=1',
  "--user-data-dir=$HeadlessProfileDir",
  "--window-size=$width,$height",
  '--force-device-scale-factor=1',
  '--virtual-time-budget=30000'
)

$dumpArgs = $commonArgs + @('--dump-dom',$FreshAppUrl)
$dump = Invoke-BrowserQuiet -Arguments $dumpArgs -CaptureOutput
$dom = $dump.Output
$isReady = ($dump.ExitCode -eq 0 -and (Test-WallpaperDomReady -Dom $dom))

if(-not $isReady){
  Close-BrowserProfileProcesses -ProfilePath $HeadlessProfileDir
  Remove-ProfileLocks -ProfilePath $HeadlessProfileDir
  Start-Sleep -Seconds 2
  $retryBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $FreshAppUrl = "$AppUrl?wallpaper_refresh=$retryBust"
  $dumpArgs = $commonArgs + @('--dump-dom',$FreshAppUrl)
  $dump = Invoke-BrowserQuiet -Arguments $dumpArgs -CaptureOutput
  $dom = $dump.Output
  $isReady = ($dump.ExitCode -eq 0 -and (Test-WallpaperDomReady -Dom $dom))
}

if(-not $isReady){
  Write-Host "Headless Edge exit code: $($dump.ExitCode)"
  if($dom -like '*BUILDING TODAY*'){
    Write-Host 'Wallpaper was not replaced: authenticated session found, but live data is still loading.'
  } elseif($dom -like '*WALLPAPER UPDATE PAUSED*'){
    Write-Host 'Wallpaper was not replaced: the wallpaper page reported a data-loading error.'
  } elseif($dom -like '*TODAY*S COMMAND CENTER*'){
    Write-Host 'Wallpaper was not replaced: the command center opened, but live panels did not finish rendering.'
  } elseif($dom -like '*login*' -or $dom -like '*Sign in*'){
    Write-Host 'Wallpaper was not replaced: the copied headless session is signed out.'
  } else {
    Write-Host 'Wallpaper was not replaced: Headless Edge could not render the saved wallpaper session.'
  }
  Write-Host "Run -Login only if the message above says the copied session is signed out."
  exit 2
}

Close-BrowserProfileProcesses -ProfilePath $HeadlessProfileDir
Remove-ProfileLocks -ProfilePath $HeadlessProfileDir

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tempShot = Join-Path $Root "wallpaper-new-$stamp.png"
$WallpaperPath = Join-Path $Root "wallpaper-$stamp.png"
Remove-Item $tempShot -Force -ErrorAction SilentlyContinue
$shotArgs = $commonArgs + @("--screenshot=$tempShot",$FreshAppUrl)
$shot = Invoke-BrowserQuiet -Arguments $shotArgs
if($shot.ExitCode -ne 0 -or -not (Test-Path $tempShot) -or (Get-Item $tempShot).Length -lt 50000){
  Write-Host "Wallpaper was not replaced: screenshot generation failed. Edge exit code: $($shot.ExitCode)"
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
