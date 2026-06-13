$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "backend"
$dest = Join-Path $root "src-tauri\resources\backend"

if (-not (Test-Path (Join-Path $src "main.py"))) {
    throw "backend/main.py not found"
}

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Copy-Item (Join-Path $src "main.py") $dest
Copy-Item (Join-Path $src "database.py") $dest
Copy-Item (Join-Path $src "models.py") $dest
Copy-Item (Join-Path $src "schemas.py") $dest
Copy-Item (Join-Path $src "requirements.txt") $dest
Copy-Item (Join-Path $src "llm_client.py") $dest
Copy-Item -Recurse (Join-Path $src "llm") (Join-Path $dest "llm")

$venv = Join-Path $dest ".venv"
python -m venv $venv
& (Join-Path $venv "Scripts\pip.exe") install -r (Join-Path $dest "requirements.txt") | Out-Null

Write-Output "backend bundle ready: $dest"
