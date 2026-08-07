$ErrorActionPreference = 'Stop'

$source = 'C:\Program Files\Android\Android Studio'
$destination = 'D:\Android\AndroidStudio'
$log = 'D:\Android\android-studio-relocation.log'

if (-not (Test-Path -LiteralPath $source)) {
  throw "Android Studio source does not exist: $source"
}
if ((Resolve-Path -LiteralPath $source).Path -ne $source) {
  throw "Unexpected Android Studio source path: $source"
}
if (Test-Path -LiteralPath $destination) {
  throw "Android Studio destination already exists: $destination"
}
if (Get-Process studio64, studio -ErrorAction SilentlyContinue) {
  throw 'Close Android Studio before relocating it.'
}

Start-Transcript -LiteralPath $log -Force | Out-Null
try {
  Move-Item -LiteralPath $source -Destination $destination

  if (-not (Test-Path -LiteralPath "$destination\bin\studio64.exe")) {
    throw 'The moved Android Studio executable was not found at the destination.'
  }

  New-Item -ItemType Junction -Path $source -Target $destination | Out-Null

  if (-not (Test-Path -LiteralPath "$source\bin\studio64.exe")) {
    throw 'The compatibility junction was not created correctly.'
  }

  Write-Output "Android Studio relocated to $destination"
}
finally {
  Stop-Transcript | Out-Null
}
