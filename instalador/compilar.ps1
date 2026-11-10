# Compila o instalador do sistema com checagens prévias (Windows PowerShell 5.1+).
#
# Uso:   instalador\compilar.bat            (duplo clique ou terminal)
#   ou:  powershell -ExecutionPolicy Bypass -File instalador\compilar.ps1 [/Q]
#
# Parâmetros extras são repassados ao ISCC (ex.: /Q para compilar em silêncio).
# O caminho do node.exe é procurado sozinho e repassado ao script via /DNodeExe
# (o instalador embute esse executável).

$ErrorActionPreference = 'Continue'
# Garante acentos corretos na saída (console e terminal).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$pastaProjeto = Split-Path -Parent $PSScriptRoot
$iss = Join-Path $PSScriptRoot 'HistoricoEscolar.iss'

function Falhar([string]$mensagem) {
  Write-Host ''
  Write-Host "ERRO: $mensagem" -ForegroundColor Red
  exit 1
}

# Raízes de instalação de programas (LOCALAPPDATA cobre o Inno baixado por usuário).
$raizes = @()
if ($env:LOCALAPPDATA) { $raizes += Join-Path $env:LOCALAPPDATA 'Programs' }
if ($env:ProgramFiles) { $raizes += $env:ProgramFiles }
if (${env:ProgramFiles(x86)}) { $raizes += ${env:ProgramFiles(x86)} }

# ---- 1) Inno Setup 6 -------------------------------------------------
$iscc = $null
foreach ($raiz in $raizes) {
  $candidato = Join-Path $raiz 'Inno Setup 6\ISCC.exe'
  if (Test-Path $candidato) { $iscc = $candidato; break }
}
if (-not $iscc) {
  $noPath = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
  if ($noPath) { $iscc = $noPath.Source }
}
if (-not $iscc) {
  Falhar ("Inno Setup 6 não encontrado.`n" +
          "  Instale com:  winget install JRSoftware.InnoSetup`n" +
          "  ou baixe em:  https://jrsoftware.org/isdl.php")
}

# ---- 2) Dependências (sem node_modules o ISCC aborta com "no files found") ----
if (-not (Test-Path (Join-Path $pastaProjeto 'node_modules\pdfkit\package.json'))) {
  Falhar ("Dependências não instaladas: falta a pasta node_modules.`n" +
          "  Rode na pasta do projeto:  npm install --omit=dev")
}

# ---- 3) node.exe (é embutido dentro do instalador) -------------------
$node = $null
foreach ($raiz in $raizes) {
  $candidato = Join-Path $raiz 'nodejs\node.exe'
  if (Test-Path $candidato) { $node = $candidato; break }
}
if (-not $node) {
  $noPath = Get-Command 'node.exe' -ErrorAction SilentlyContinue
  if ($noPath) { $node = $noPath.Source }
}
if (-not $node) {
  Falhar ("Node.js não encontrado.`n" +
          "  Instale com:  winget install OpenJS.NodeJS.LTS`n" +
          "  ou baixe em:  https://nodejs.org (instalador padrão)")
}

# ---- 4) Compila -------------------------------------------------------
Write-Host "Inno:   $iscc"
Write-Host "Node:   $node"
Write-Host "Script: $iss"
Write-Host ''

$argumentos = @("/DNodeExe=$node")
$argumentos += $args
$argumentos += $iss
$saida = & $iscc @argumentos 2>&1 | ForEach-Object { "$_" }
$saida | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) {
  Falhar "A compilação falhou (código $LASTEXITCODE). Veja as mensagens acima."
}

$exe = Join-Path $pastaProjeto 'dist\Instalador-HistoricoEscolar.exe'
if (-not (Test-Path $exe)) { Falhar "Compilação concluída mas o arquivo não foi encontrado: $exe" }
$tamanho = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host ''
Write-Host "Pronto: $exe  ($tamanho MB)" -ForegroundColor Green
exit 0
