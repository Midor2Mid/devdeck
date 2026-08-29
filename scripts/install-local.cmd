@echo off
REM Double-click this, then close DevDeck. It waits for the app to exit, copies
REM the freshly packaged build over the local install, verifies it landed, and
REM starts DevDeck again.
REM
REM It exists as a .cmd because the install cannot be run from a terminal
REM INSIDE DevDeck: closing the app kills its terminal panes, which would kill
REM the install halfway through and leave a half-copied build.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-local.ps1" -WaitSeconds 600 -Relaunch
echo.
pause
