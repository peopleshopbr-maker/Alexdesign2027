param([string]$Mensagem = "Atualizacao do projeto Alexdesign2027")
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\studio alex\OneDrive\Documentos\Alexdesign\alexdesign2027"
(Get-Content package.json) -replace 'if command -v wasm-pack >/dev/null 2>&1; then bun run build:wasm; fi && vite build', 'vite build' | Set-Content package.json
npm run build
git branch -M main
git add .
if (git status --porcelain) { git commit -m $Mensagem } else { git commit --allow-empty -m "$Mensagem (redeploy)" }
git push -u origin main
npx wrangler pages deploy dist --project-name=alexdesign-design2027 --branch=main
