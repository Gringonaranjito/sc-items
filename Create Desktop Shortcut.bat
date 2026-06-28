@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$shortcutPath = Join-Path $desktop 'SC Items.lnk'; " ^
  "$targetPath = Join-Path $root 'SC Items.bat'; " ^
  "$iconPath = Join-Path $env:SystemRoot 'System32\shell32.dll'; " ^
  "$wsh = New-Object -ComObject WScript.Shell; " ^
  "$shortcut = $wsh.CreateShortcut($shortcutPath); " ^
  "$shortcut.TargetPath = $targetPath; " ^
  "$shortcut.WorkingDirectory = $root; " ^
  "$shortcut.WindowStyle = 7; " ^
  "$shortcut.Description = 'Open SC Items'; " ^
  "$shortcut.IconLocation = $iconPath + ',220'; " ^
  "$shortcut.Save(); " ^
  "Write-Host 'Created desktop shortcut:' $shortcutPath"

pause
