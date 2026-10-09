# Pogey Life - tiny local web server for testing on your own PC.
# YouTube won't play when index.html is opened as a file (Error 153), so play-local.bat starts this instead.
# It serves the whole site folder (the one above NEETLIFE, so Plinko works too) at http://localhost:8080/
# Close the window to stop it.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$port = 8080
$listener = $null
foreach ($p in 8080..8090) {   # first free port
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l; $port = $p; break
  } catch { }
}
if (-not $listener) { Write-Host 'Could not start the server: ports 8080-8090 are all busy.'; Read-Host 'Press Enter to close'; exit 1 }

$url = "http://localhost:$port/NEETLIFE/index.html"
Write-Host ''
Write-Host '  Pogey Life is running at:' -ForegroundColor Yellow
Write-Host "  $url" -ForegroundColor Cyan
Write-Host ''
Write-Host '  Leave this window open while you play. Close it to stop.'
Start-Process $url

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.mp4' = 'video/mp4'; '.webm' = 'video/webm'
  '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.wasm' = 'application/wasm'
}
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      if ((Test-Path -LiteralPath $file -PathType Container)) {
        if (-not $ctx.Request.Url.AbsolutePath.EndsWith('/')) { $res.Redirect($ctx.Request.Url.AbsolutePath + '/'); $res.Close(); continue }
        $file = Join-Path $file 'index.html'
      }
      if ($file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
        $res.Headers.Add('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $msg = [Text.Encoding]::UTF8.GetBytes('Not found')
        $res.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch { try { $res.StatusCode = 500 } catch { } }
    finally { try { $res.Close() } catch { } }
  } catch { }  # a browser hanging up mid-request shouldn't stop the server
}
