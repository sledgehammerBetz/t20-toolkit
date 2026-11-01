# Monta (se faltar) e abre a instância de teste do Foundry: porta 30001, pasta de dados própria, mundo t20-testes.
# Não toca na instalação de jogo (porta 30000, mundo t20). Rodar de novo é seguro.
#   powershell -ExecutionPolicy Bypass -File tests\instancia-teste.ps1              # monta e abre
#   powershell -ExecutionPolicy Bypass -File tests\instancia-teste.ps1 -Atualizar   # recopia sistema e Suplementos de Arton
param(
  [string]$Jogo = 'D:\Users\MIGUEL\AppData\Local\FoundryVTT',
  [string]$Teste = 'D:\Users\MIGUEL\AppData\Local\FoundryVTT-Testes',
  [string]$Exe = 'D:\Program Files\Foundry Virtual Tabletop\Foundry Virtual Tabletop.exe',
  [int]$Porta = 30001,
  [switch]$Atualizar
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$data = Join-Path $Teste 'Data'
New-Item -ItemType Directory -Force "$Teste\Config", "$data\systems", "$data\modules", "$data\worlds\t20-testes" | Out-Null

# Licença e opções próprias (sem UPnP, outra porta).
Copy-Item "$Jogo\Config\license.json" "$Teste\Config\license.json" -Force
@{ dataPath = $Teste; port = $Porta; upnp = $false; compressStatic = $true; language = 'en.core'; world = $null; updateChannel = 'stable'; telemetry = $false } |
  ConvertTo-Json | Set-Content -Encoding ascii "$Teste\Config\options.json"

# Sistema e Suplementos de Arton são copiados (não ligados): os compêndios abertos pelo mundo de jogo ficam travados.
foreach ($p in 'systems\tormenta20', 'modules\suplementos-de-arton') {
  if ($Atualizar -or -not (Test-Path "$data\$p")) { robocopy "$Jogo\Data\$p" "$data\$p" /MIR /XF LOCK /NFL /NDL /NJH /NJS | Out-Null }
}

# O Toolkit e os testes vêm direto do repositório: o teste roda o código que está no checkout.
foreach ($l in @(@('t20-toolkit', $repo), @('t20-toolkit-tests', (Join-Path $repo 'tests')))) {
  $dest = "$data\modules\$($l[0])"
  if (-not (Test-Path $dest)) { cmd /c mklink /J "$dest" "$($l[1])" | Out-Null }
}

# Quench 0.10.0 (Foundry 13), do GitHub do autor.
if (-not (Test-Path "$data\modules\quench\module.json")) {
  $zip = Join-Path $Teste 'quench-0.10.0.zip'
  Invoke-WebRequest -UseBasicParsing 'https://github.com/Ethaks/FVTT-Quench/releases/download/v0.10.0/module.zip' -OutFile $zip
  $tmp = Join-Path $Teste 'quench-tmp'
  Expand-Archive $zip $tmp -Force
  Move-Item "$tmp\dist" "$data\modules\quench"
  Remove-Item $tmp -Recurse -Force
}

$world = "$data\worlds\t20-testes\world.json"
if (-not (Test-Path $world)) {
  @{ id = 't20-testes'; title = 'T20 Toolkit — Testes automáticos'; description = 'Mundo só para a bateria de testes do T20 Toolkit (Quench). Pode ser apagado e recriado.'
     system = 'tormenta20'; coreVersion = '13.351'; compatibility = @{ minimum = '13'; verified = '13.351' }; version = '1.0.0' } |
    ConvertTo-Json | Set-Content -Encoding utf8 $world
}

try { $status = Invoke-RestMethod "http://localhost:$Porta/api/status" -TimeoutSec 2 } catch { $status = $null }
if (-not $status) {
  Start-Process -FilePath $Exe -ArgumentList "--dataPath=`"$Teste`"", "--port=$Porta", '--world=t20-testes', '--noupnp', '--headless' | Out-Null
  Write-Host "Abrindo a instância de teste em http://localhost:$Porta ..."
} else { Write-Host "Instância de teste já está no ar: mundo $($status.world)." }
Write-Host "Entre como Gamemaster (sem senha) e clique no frasco do Quench, ou rode no console: await game.t20ToolkitTests.run()"
