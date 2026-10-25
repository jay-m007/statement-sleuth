# Builds the Statement Sleuth Android app (debug .apk) on Windows. Run from the repo folder.
# Needs: Node, and Android Studio installed and opened once (so the Android SDK exists).
$ErrorActionPreference = "Continue"
function Fail($m) { Write-Host ""; Write-Host "STOP: $m" -ForegroundColor Red; exit 1 }
function Step($m) { Write-Host ""; Write-Host "== $m" -ForegroundColor Cyan }

Step "1/5 Install packages"
npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
Step "2/5 Run tests"
npm test; if ($LASTEXITCODE -ne 0) { Fail "tests failed" }
Step "3/5 Build the web part and copy it into the Android project"
npm run build; if ($LASTEXITCODE -ne 0) { Fail "build failed" }
npx cap sync android; if ($LASTEXITCODE -ne 0) { Fail "cap sync failed" }

Step "4/5 Find Android Studio's Java and the Android SDK"
$jbr = @("$env:ProgramFiles\Android\Android Studio\jbr", "$env:LOCALAPPDATA\Programs\Android Studio\jbr", "$env:ProgramFiles\Android\Android Studio1\jbr") | Where-Object { Test-Path "$_\bin\java.exe" } | Select-Object -First 1
if (-not $jbr) { Fail "Could not find Android Studio's Java. Open the 'android' folder in Android Studio instead (File > Open) and press the green Run button." }
$sdk = $null
foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) { if ($c -and (Test-Path "$c\platform-tools" -PathType Container)) { $sdk = $c; break } }
if (-not $sdk) { foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) { if ($c -and (Test-Path "$c\platforms" -PathType Container)) { $sdk = $c; break } } }
if (-not $sdk) { Fail "Could not find the Android SDK. Open Android Studio once, let it finish downloading, then run this again." }
$env:JAVA_HOME = $jbr
$sdkFwd = $sdk -replace '\\', '/'
Set-Content -Path "android\local.properties" -Value "sdk.dir=$sdkFwd" -Encoding ASCII
Write-Host "Java: $jbr"; Write-Host "SDK:  $sdk"

Step "5/5 Build the app (the first time this downloads a lot and can take 10+ minutes)"
Push-Location android
.\gradlew.bat assembleDebug --console=plain
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "Gradle build failed. Scroll up for the first red error, or open the 'android' folder in Android Studio and press Run; it often fixes missing SDK parts by itself." }

$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { Fail "Build finished but the .apk was not found." }
Copy-Item $apk "..\Statement-Sleuth.apk" -Force
Write-Host ""
Write-Host "DONE. Your app is at: $((Resolve-Path '..\Statement-Sleuth.apk').Path)" -ForegroundColor Green
Write-Host "Copy it to your phone and tap it to install (allow 'install unknown apps' if asked)."
