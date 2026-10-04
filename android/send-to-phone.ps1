# Puts the built APK on the phone.
#
# Plugged in over USB with USB debugging on, it installs directly and you are
# done. Otherwise it serves the APK on the local network and prints an address
# to open in the phone's browser; Ctrl+C stops it.
#
#   powershell -ExecutionPolicy Bypass -File send-to-phone.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$apk  = Join-Path $root 'app\build\outputs\apk\release\app-release.apk'
$name = 'Thuna.apk'
$port = 8391

if (-not (Test-Path $apk)) {
    Write-Host "No APK built yet. Run this first:" -ForegroundColor Yellow
    Write-Host "  .uild-apk.ps1 -Url https://your-domain/"
    exit 1
}

$bytes  = [System.IO.File]::ReadAllBytes($apk)
$sizeMb = [math]::Round($bytes.Length / 1MB, 1)

# --- Fast path: a phone already attached over USB ------------------------------
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (Test-Path $adb) {
    $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" }
    if ($devices) {
        Write-Host "Phone attached over USB. Installing..." -ForegroundColor Cyan
        & $adb install -r $apk
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Installed. Open Thuna on the phone." -ForegroundColor Green
            exit 0
        }
        Write-Host "USB install failed; falling back to the network." -ForegroundColor Yellow
    }
}

# --- Otherwise serve it over the LAN -------------------------------------------
#
# Raw TcpListener rather than HttpListener: HttpListener needs a URL ACL, which
# needs an administrator prompt for any address other than localhost, and
# localhost is the one address the phone cannot reach. A socket needs neither.

$ip = (Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
    Select-Object -First 1).IPv4Address.IPAddress

if (-not $ip) { throw "No network adapter with a default gateway - is Wi-Fi on?" }

$page = @"
<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>Thuna</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#7b1e3a;
color:#fbf6ee;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}
svg{width:96px;height:96px;margin:0 auto 24px;display:block}
h1{margin:0;font-size:22px;letter-spacing:.01em}
a{display:inline-block;margin-top:26px;padding:16px 44px;border-radius:999px;
background:#d4a94a;color:#080a0e;font-weight:700;text-decoration:none;letter-spacing:.05em}
p{color:#97a1b0;font-size:14px;max-width:34ch;margin:10px auto 0}
</style>
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
<rect width="512" height="512" rx="114" fill="#0e1218"/>
<g fill="#d4a94a">
<rect x="176" y="146" width="160" height="56" rx="28"/>
<rect x="138" y="228" width="236" height="56" rx="28" opacity=".85"/>
<rect x="100" y="310" width="312" height="56" rx="28" opacity=".7"/>
</g></svg>
<h1>Thuna</h1>
<p>Android app, $sizeMb MB. Tap Download, then open the downloaded file.</p>
<a href="/$name">Download</a>
<p>Android will say this is not from the Play Store. Allow it for the browser
once and the install continues.</p>
"@

$pageBytes = [System.Text.Encoding]::UTF8.GetBytes($page)

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()

Write-Host ""
Write-Host "  On the phone, open:  http://${ip}:${port}" -ForegroundColor Green
Write-Host "  Serving $name, $sizeMb MB. Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

function Send-Response {
    param($stream, [string]$status, [string]$type, [byte[]]$body, [string]$filename)
    $head = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n"
    if ($filename) { $head += "Content-Disposition: attachment; filename=`"$filename`"`r`n" }
    $head += "`r`n"
    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $buf = New-Object byte[] 4096
            $read = $stream.Read($buf, 0, $buf.Length)
            $request = [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
            $path = '/'
            if ($request -match '^[A-Z]+ (\S+)') { $path = $Matches[1] }

            if ($path -eq "/$name") {
                Write-Host "  -> phone is downloading the APK" -ForegroundColor Cyan
                Send-Response $stream '200 OK' 'application/vnd.android.package-archive' $bytes $name
            } else {
                Send-Response $stream '200 OK' 'text/html; charset=utf-8' $pageBytes $null
            }
        } catch {
            # A phone that opens a connection and drops it is normal; keep serving.
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
