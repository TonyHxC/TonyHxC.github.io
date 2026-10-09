@echo off
rem Starts Pogey Life from a little local web server so the TV can play YouTube (opening index.html directly gives "Error 153").
rem Leave the window that opens running while you play; close it to stop.
title Pogey Life - local server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if errorlevel 1 pause
