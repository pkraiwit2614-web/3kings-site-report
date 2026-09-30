param(
  [string]$Token,
  [switch]$Login,
  [switch]$Install,
  [switch]$Uninstall,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$ImageUrl = 'https://3kings-site-report.vercel.app/api/wallpaper-render'
$TaskName = '3Kings Dynamic Wallpaper'
$Root = Join-Path $env:LOCALAPPDATA '3KingsWallpaper'
$TokenPath = Join-Path $Root 'device-token.txt'
$InstalledScript = Join-Path $Root 'wallpaper-sync.ps1'
$LogPath = Join-Path $Root 'wallpaper-sync.log'
$SuccessPath = Join-Path $Root 'last-success.txt'

function Ensure-Root {
  New-Item -ItemType Directory -Path $Root -Force | Out-Null
}

function Write-Log([string]$Message) {
  try {
    Ensure-Root
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $Message"
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    $lines = @(Get-Content -LiteralPath $LogPath -ErrorAction SilentlyContinue)
    if($lines.Count -gt 300){
      $lines | Select-Object -Last 200 | Set-Content -LiteralPath $LogPath -Encoding UTF8
    }
  } catch {}
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

function Show-Status {
  Write-Host ''
  Write-Host '3 Kings Dynamic Wallpaper status'
  Write-Host '--------------------------------'
  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    Write-Host "Task state       : $($task.State)"
    Write-Host "Last run         : $($info.LastRunTime)"
    Write-Host "Next run         : $($info.NextRunTime)"
    Write-Host "Last task result : $($info.LastTaskResult)"
  } catch {
    Write-Host 'Task state       : NOT INSTALLED'
  }
  if(Test-Path $SuccessPath){
    Write-Host "Last success     : $((Get-Content -LiteralPath $SuccessPath -Raw).Trim())"
  } else {
    Write-Host 'Last success     : none recorded'
  }
  Write-Host "Log file         : $LogPath"
  if(Test-Path $LogPath){
    Write-Host ''
    Write-Host 'Recent log:'
    Get-Content -LiteralPath $LogPath | Select-Object -Last 8 | ForEach-Object { Write-Host $_ }
  }
  exit 0
}

function Register-WallpaperTask {
  $taskUser = if($env:USERDOMAIN){ "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstalledScript`""

  try {
    Import-Module ScheduledTasks -ErrorAction Stop
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskUser
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 15)
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
      -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logonTrigger,$repeatTrigger) -Settings $settings -Principal $principal -Force | Out-Null
    Write-Log 'Scheduled task registered: interactive session + logon + 15-minute repeat + battery allowed.'
    return
  } catch {
    Write-Log "ScheduledTasks registration failed; using schtasks fallback. $($_.Exception.Message)"
  }

  $taskCommand = "powershell.exe $arguments"
  & schtasks.exe /Create /TN $TaskName /SC MINUTE /MO 15 /TR $taskCommand /F /IT | Out-Null
  if($LASTEXITCODE -ne 0){ throw 'Windows could not register the wallpaper scheduled task.' }
  Write-Log 'Scheduled task registered with schtasks interactive fallback.'
}

if($Uninstall){
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop | Out-Null }
  catch { try { & schtasks.exe /Delete /TN $TaskName /F | Out-Null } catch {} }
  Write-Log 'Scheduled task removed.'
  Write-Host 'Scheduled task removed. The last wallpaper image is kept on this PC.'
  exit 0
}

Ensure-Root

if($Status){ Show-Status }

if($Login){
  Write-Host 'Browser login is no longer required. The wallpaper uses a read-only device token.'
  Write-Host 'Use -Install to repair or reinstall automatic refresh.'
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

  Register-WallpaperTask
  Write-Host 'Installed: automatic wallpaper refresh is scheduled at sign-in and every 15 minutes.'
  Write-Host 'Battery use is allowed and missed runs will start when Windows becomes available.'
  Write-Host 'Running the first refresh now...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstalledScript
  $firstResult = $LASTEXITCODE
  if($firstResult -eq 0){
    Write-Host ''
    Write-Host 'Automatic refresh status:'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $InstalledScript -Status
  }
  exit $firstResult
}

Write-Log 'Refresh started.'

try {
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
    Write-Log "FAILED: generated server URI is invalid: $url"
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
    Write-Log "FAILED: server image download. $($_.Exception.Message)"
    Write-Host "Wallpaper was not replaced: server image download failed. $($_.Exception.Message)"
    exit 2
  }

  if(-not (Test-Path $tempPath) -or (Get-Item $tempPath).Length -lt 10000){
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    Write-Log 'FAILED: downloaded image is missing or invalid.'
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
    Write-Log "FAILED: downloaded file is not a valid PNG. $($_.Exception.Message)"
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

  $success = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Set-Content -LiteralPath $SuccessPath -Value $success -NoNewline -Encoding UTF8
  Write-Log "SUCCESS: wallpaper updated to $wallpaperPath (${width}x${height})."

  Write-Host "Wallpaper updated: $wallpaperPath"
  Write-Host "Server image: ${width}x${height}"
  Write-Host "Source: $($parsedUri.GetLeftPart([System.UriPartial]::Path))"
  exit 0
} catch {
  Write-Log "FAILED: unexpected error. $($_.Exception.Message)"
  Write-Host "Wallpaper was not replaced: $($_.Exception.Message)"
  exit 5
}
