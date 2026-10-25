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

Step "4/5 Find a suitable Java and the Android SDK"
# Capacitor 8 builds with Java 21 exactly. Newer Android Studio ships Java 25, which does not work here, so look for a Java 21 or fetch one.
function JavaMajor($jh) {
  $exe = Join-Path $jh "bin\java.exe"
  if (-not (Test-Path $exe)) { return 0 }
  $out = (& cmd /c "`"$exe`" -version 2>&1") -join " "
  if ($out -match 'version "(\d+)') { return [int]$Matches[1] }
  return 0
}
$tools = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) ".tools"
$cands = @()
$cands += $env:JAVA_HOME
$cands += (Get-ChildItem "$tools" -Directory -Filter "jdk*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
foreach ($root in @("$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Amazon Corretto", "$env:ProgramFiles\Zulu")) {
  $cands += (Get-ChildItem $root -Directory -Filter "*jdk*" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
}
$cands += "$env:ProgramFiles\Android\Android Studio\jbr"
$jbr = $null
foreach ($c in ($cands | Where-Object { $_ })) { $m = JavaMajor $c; if ($m -eq 21) { $jbr = $c; break } }
if (-not $jbr) {
  Write-Host "No Java 21 found on this computer. Downloading Eclipse Temurin 21 (about 200 MB, from api.adoptium.net) into $tools ..."
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  $zip = Join-Path $tools "temurin21.zip"
  try { Invoke-WebRequest -UseBasicParsing -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $zip } catch { Fail "Could not download Java 21: $_" }
  Expand-Archive -Path $zip -DestinationPath $tools -Force
  Remove-Item $zip -Force
  $jbr = (Get-ChildItem $tools -Directory -Filter "jdk*" | Select-Object -First 1).FullName
  if ((JavaMajor $jbr) -ne 21) { Fail "The downloaded Java did not work." }
}
$sdk = $null
foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) { if ($c -and (Test-Path "$c\platform-tools" -PathType Container)) { $sdk = $c; break } }
if (-not $sdk) { foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk")) { if ($c -and (Test-Path "$c\platforms" -PathType Container)) { $sdk = $c; break } } }
if (-not $sdk) { Fail "Could not find the Android SDK. Open Android Studio once, let it finish downloading, then run this again." }
$env:JAVA_HOME = $jbr
$env:Path = "$jbr\bin;$env:Path"
$sdkFwd = $sdk -replace '\\', '/'
Set-Content -Path "android\local.properties" -Value "sdk.dir=$sdkFwd" -Encoding ASCII
Write-Host "Java: $jbr (version $(JavaMajor $jbr))"; Write-Host "SDK:  $sdk"

Step "5/5 Build the app (the first time this downloads a lot and can take 10+ minutes)"
Push-Location android
$jdkFwd = $jbr -replace '\\', '/'
.\gradlew.bat assembleDebug --console=plain "-Dorg.gradle.java.installations.paths=$jdkFwd"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "Gradle build failed. Scroll up for the first red error, or open the 'android' folder in Android Studio and press Run; it often fixes missing SDK parts by itself." }

$apk = "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { Fail "Build finished but the .apk was not found." }
Copy-Item $apk "..\Statement-Sleuth.apk" -Force
Write-Host ""
Write-Host "DONE. Your app is at: $((Resolve-Path '..\Statement-Sleuth.apk').Path)" -ForegroundColor Green
Write-Host "Copy it to your phone and tap it to install (allow 'install unknown apps' if asked)."
