# Starts Thuna's private local Postgres (port 5458) as a detached background process.
# Safe to run when it is already running.
$ErrorActionPreference = 'Stop'
$bin = 'C:\Program Files\PostgreSQL\16\bin'
$data = Join-Path $PSScriptRoot '..\.pgdata' | Resolve-Path
& "$bin\pg_ctl.exe" -D "$data" status *> $null
if ($LASTEXITCODE -eq 0) { Write-Output 'Postgres already running on 5458'; exit 0 }
Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList @('-D', "`"$data`"", '-o', '"-p 5458"', '-l', "`"$data\..\pg.log`"", 'start') -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  & "$bin\pg_isready.exe" -h localhost -p 5458 *> $null
  if ($LASTEXITCODE -eq 0) { Write-Output 'Postgres started on 5458'; exit 0 }
}
Write-Output 'Postgres did not start — see pg.log'
exit 1
