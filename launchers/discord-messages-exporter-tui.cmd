@echo off
rem Launch the interactive TUI on Windows. Prefers an installed command, then
rem a built checkout, then the TypeScript source when dependencies exist.
setlocal

set "ROOT=%~dp0.."

where discord-messages-exporter-tui >nul 2>nul
if %ERRORLEVEL% equ 0 (
    discord-messages-exporter-tui %*
    exit /b %ERRORLEVEL%
)

if exist "%ROOT%\dist\src\tui.js" (
    node "%ROOT%\dist\src\tui.js" %*
    exit /b %ERRORLEVEL%
)

if exist "%ROOT%\node_modules\.bin\tsx.cmd" (
    "%ROOT%\node_modules\.bin\tsx.cmd" "%ROOT%\src\tui.ts" %*
    exit /b %ERRORLEVEL%
)

echo discord-messages-exporter is not built. Run: npm install ^&^& npm run build 1>&2
exit /b 1
