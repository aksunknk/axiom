$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "backend"
$dest = Join-Path $root "src-tauri\resources\backend"

if (-not (Test-Path (Join-Path $src "main.py"))) {
    throw "backend/main.py not found"
}

if (Test-Path (Join-Path $dest "main.py")) {
    exit 0
}

New-Item -ItemType Directory -Path $dest -Force | Out-Null
foreach ($file in @("main.py", "database.py", "models.py", "schemas.py", "requirements.txt")) {
    Copy-Item (Join-Path $src $file) $dest
}

Write-Output "backend resources stub ready: $dest"
