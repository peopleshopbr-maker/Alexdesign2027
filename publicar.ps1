param(
    [string]$Mensagem = "Atualizacao do projeto Alexdesign2027"
)

$ErrorActionPreference = "Stop"
$PastaProjeto = "C:\Users\studio alex\OneDrive\Documentos\Alexdesign\alexdesign2027"
$RepoUrl = "https://github.com" + "peopleshopbr-maker/Alexdesign2027.git"

Set-Location $PastaProjeto

Write-Host "1/4 - Verificando script de build..." -ForegroundColor Cyan
(Get-Content package.json) -replace 'if command -v wasm-pack >/dev/null 2>&1; then bun run build:wasm; fi && vite build', 'vite build' | Set-Content package.json

Write-Host "2/4 - Gerando build de producao (dist)..." -ForegroundColor Cyan
npm run build

Write-Host "3/4 - Preparando arquivos para o GitHub..." -ForegroundColor Cyan
git remote set-url origin $RepoUrl
git branch -M main
git add .

$alteracoes = git status --porcelain
if ($alteracoes) {
    git commit -m $Mensagem
} else {
    Write-Host "Nenhuma alteracao nova nos arquivos; forcando novo deploy..." -ForegroundColor Yellow
    git commit --allow-empty -m "$Mensagem (redeploy)"
}

Write-Host "4/4 - Enviando para o GitHub e disparando Cloudflare..." -ForegroundColor Cyan
git push -u origin main

Write-Host "`nConcluido! O GitHub foi atualizado e a Cloudflare iniciou a publicacao." -ForegroundColor Green
