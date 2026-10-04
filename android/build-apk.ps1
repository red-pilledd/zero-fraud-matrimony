# Builds the Thuna Android app in one step.
#   .\build-apk.ps1 -Url https://your-domain/     release APK for the live site (what members install)
#   .\build-apk.ps1 -Debug                         test APK pointing at this laptop's dev server (adb reverse tcp:3840 tcp:3840)
param([string]$Url, [switch]$Debug)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
if ($Debug) {
  .\gradlew.bat assembleDebug --console=plain
  $apk = 'app\build\outputs\apk\debug\app-debug.apk'
} else {
  if (-not $Url -or -not $Url.StartsWith('https://')) { throw 'Give the live site: .\build-apk.ps1 -Url https://your-domain/' }
  if (-not $Url.EndsWith('/')) { $Url = "$Url/" }
  .\gradlew.bat assembleRelease "-PthunaUrl=$Url" --console=plain
  $apk = 'app\build\outputs\apk\release\app-release.apk'
}
if ($LASTEXITCODE -ne 0) { throw 'Build failed - see the output above.' }
Copy-Item $apk "$env:USERPROFILE\Downloads\Thuna.apk" -Force
Write-Output "Built: $apk  (copied to Downloads\Thuna.apk). Run .\send-to-phone.ps1 to put it on a phone."
