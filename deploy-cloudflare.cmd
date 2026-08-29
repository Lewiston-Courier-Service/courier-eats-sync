@echo off
setlocal

echo.
echo Courier Eats - Direct Cloudflare Worker Deploy
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

call npm install
if errorlevel 1 goto :fail

echo.
echo A browser will open so you can authorize Wrangler with Cloudflare.
call npx wrangler login
if errorlevel 1 goto :fail

echo.
echo Paste your Square access token when prompted. It will be stored as a Cloudflare secret.
call npx wrangler secret put SQUARE_ACCESS_TOKEN
if errorlevel 1 goto :fail

echo.
echo Create a private admin key now. Use a long random value and save it somewhere secure.
call npx wrangler secret put ADMIN_API_KEY
if errorlevel 1 goto :fail

echo.
echo Deploying Courier Eats Sync...
call npx wrangler deploy
if errorlevel 1 goto :fail

echo.
echo DEPLOY COMPLETE.
echo Copy the workers.dev URL shown above and open /api/health to test it.
pause
exit /b 0

:fail
echo.
echo Deployment stopped because a command failed.
pause
exit /b 1
