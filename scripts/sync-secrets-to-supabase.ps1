# Sincroniza variables de .env a tabla configuracion (Edge Functions).
# Requiere: .env en la raíz del proyecto. NO commitear .env.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root '.env'

if (-not (Test-Path $EnvFile)) {
  Write-Error "Falta $EnvFile — copiá .env.example a .env y completá los valores."
}

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $k, $v = $_ -split '=', 2
  if ($k -and $null -ne $v) {
    [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process')
  }
}

$required = @('TELEGRAM_BOT_TOKEN', 'OPENROUTER_API_KEY')
foreach ($name in $required) {
  if (-not $env:$name) { Write-Error "Falta $name en .env" }
}

$model = if ($env:OPENROUTER_MODEL) { $env:OPENROUTER_MODEL } else { 'openai/gpt-4o-mini' }

Write-Host 'Sincronizando secrets a Supabase vía CLI...'
Push-Location $Root

if ($env:GOOGLE_CLIENT_ID -and $env:GOOGLE_CLIENT_SECRET) {
  Write-Host 'Google OAuth: cargar manualmente en Configuración del panel o vía SQL.'
}

npx --yes supabase@latest link --project-ref wxiifdjerstsrrbvmuvh 2>$null
npx --yes supabase@latest secrets set `
  "TELEGRAM_BOT_TOKEN=$($env:TELEGRAM_BOT_TOKEN)" `
  "OPENROUTER_API_KEY=$($env:OPENROUTER_API_KEY)" `
  "OPENROUTER_MODEL=$model" `
  2>&1

Pop-Location
Write-Host 'Listo. Los tokens Telegram/OpenRouter también viven en configuracion (edge_*).'
