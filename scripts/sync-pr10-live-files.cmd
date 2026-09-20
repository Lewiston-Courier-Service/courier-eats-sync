@echo off
setlocal

set "BASE=https://raw.githubusercontent.com/Lewiston-Courier-Service/courier-eats-sync/feature/corporate-delivery-link"

echo.
echo Courier Eats PR10 live-file sync
echo ================================
echo This updates code/assets only. It does NOT deploy.
echo .dev.vars is not touched.
echo.

if exist wrangler.jsonc copy /Y wrangler.jsonc wrangler.pre-pr10-live-backup.jsonc >nul

call :get worker-entry.js worker-entry.js || exit /b 1
call :get corporate-delivery-link.js corporate-delivery-link.js || exit /b 1
call :get square-payment-hardening.js square-payment-hardening.js || exit /b 1
call :get wrangler.jsonc wrangler.jsonc || exit /b 1
call :get dist/index.html dist\index.html || exit /b 1
call :get dist/app.js dist\app.js || exit /b 1
call :get dist/styles.css dist\styles.css || exit /b 1
call :get dist/breakfast-bg.webp dist\breakfast-bg.webp || exit /b 1
call :get dist/lunch-bg.webp dist\lunch-bg.webp || exit /b 1
call :get dist/dinner-bg.webp dist\dinner-bg.webp || exit /b 1

echo.
echo Checking JavaScript syntax...
node --check corporate-delivery-link.js || exit /b 1
node --check square-payment-hardening.js || exit /b 1
node --check worker-entry.js || exit /b 1
node --check dist\app.js || exit /b 1

echo.
findstr /c:"CORPORATE_DELIVERY_LINK_ENABLED" wrangler.jsonc
echo.
echo PASS: latest PR10 live files are synced locally.
echo Corporate delivery pricing remains gated off until Uber Direct is re-enabled.
echo No deployment has occurred yet.
exit /b 0

:get
set "REMOTE=%~1"
set "LOCAL=%~2"
echo Updating %LOCAL%...
curl.exe -fL "%BASE%/%REMOTE%" -o "%LOCAL%"
if errorlevel 1 (
  echo ERROR: Unable to download %REMOTE%
  exit /b 1
)
exit /b 0
