@echo off
chcp 65001 >nul
title Atualizacao Sequencial - Alexdesign2027

cd /d "C:\Users\studio alex\OneDrive\Documentos\Alexdesign\alexdesign2027"

echo ========================================================
echo  ETAPA 1/3: ATUALIZANDO E COMPILANDO PASTA LOCAL (DIST)
echo ========================================================
powershell -NoProfile -Command "(Get-Content package.json) -replace 'if command -v wasm-pack >/dev/null 2>&1; then bun run build:wasm; fi && vite build', 'vite build' | Set-Content package.json"
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar a pasta local. Processo interrompido.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo  ETAPA 2/3: ENVIANDO ALTERACOES PARA O GITHUB
echo ========================================================
set /p MSG="Digite a descricao da atualizacao (ou Enter para padrao): "
if "%MSG%"=="" set MSG=Atualizacao do projeto Alexdesign2027

call git branch -M main
call git add .
call git diff --cached --quiet
if %errorlevel% neq 0 (
    call git commit -m "%MSG%"
) else (
    call git commit --allow-empty -m "%MSG% (redeploy)"
)
call git push -u origin main
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao enviar para o GitHub. Processo interrompido.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo  ETAPA 3/3: PUBLICANDO NA CLOUDFLARE (alexdesign.art.br)
echo ========================================================
call npx wrangler pages deploy dist --project-name=alexdesign-design2027 --branch=main
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao publicar na Cloudflare.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo  TUDO CONCLUIDO COM SUCESSO!
echo ========================================================
pause
