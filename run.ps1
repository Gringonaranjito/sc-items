$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root "tools\node-v24.15.0-win-x64\node.exe"
if (-not (Test-Path $node)) {
  $node = "node"
}

$env:SC_ITEMS_PORT = "4173"
$env:SCMINERSDB_EXPORT_ROOT = "C:\Users\juanc\Documents\Codex\2026-06-19\i\scminersdb\data"
$env:SCMINERSDB_UPDATE_SOURCE_DIR = $env:SCMINERSDB_EXPORT_ROOT

Start-Process -FilePath $node -ArgumentList @((Join-Path $root "scminersdb_bridge.mjs")) -WorkingDirectory $root -WindowStyle Hidden
for ($i = 0; $i -lt 20; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:4173/api/scminersdb/manifest" -UseBasicParsing -TimeoutSec 1
    if ($response.StatusCode -eq 200) {
      break
    }
  } catch {
    Start-Sleep -Milliseconds 200
  }
}
Start-Process "http://127.0.0.1:4173/"
