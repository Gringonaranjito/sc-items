$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root "tools\node-v24.15.0-win-x64\node.exe"

if (-not (Test-Path $node)) {
  $node = "node"
}

$port = "4173"
$env:SC_ITEMS_PORT = $port

$serverScript = Join-Path $env:TEMP "sc-items-static-server.mjs"

@'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
const port = Number(process.argv[3] || 4173);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-cache",
  });
  res.end(body);
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const clean = decoded === "/" ? "/index.html" : decoded;
  const fullPath = path.resolve(root, "." + clean);
  const rootPath = path.resolve(root);
  if (!fullPath.startsWith(rootPath)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  try {
    const fullPath = safePath(req.url || "/");
    if (!fullPath) return send(res, 403, "Forbidden");

    fs.readFile(fullPath, (error, data) => {
      if (error) return send(res, 404, "Not found");
      const contentType = mimeTypes.get(path.extname(fullPath).toLowerCase()) || "application/octet-stream";
      send(res, 200, data, contentType);
    });
  } catch (error) {
    send(res, 500, String(error?.message || error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SC Items running at http://127.0.0.1:${port}/`);
});
'@ | Set-Content -Path $serverScript -Encoding UTF8

Start-Process -FilePath $node -ArgumentList @($serverScript, $root, $port) -WorkingDirectory $root -WindowStyle Hidden

Start-Sleep -Milliseconds 600
Start-Process "http://127.0.0.1:$port/"