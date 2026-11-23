@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where py >nul 2>nul || (echo Python ne najden. Ustanovite Python 3 s python.org, otmetiv "tcl/tk and IDLE" i "py launcher". & pause & exit /b 1)
where git >nul 2>nul || echo Git ne najden: sohranenie rabotaet, a otpravka na GitHub - net. Ustanovite Git for Windows.
py admin\editor_app.py
if errorlevel 1 pause
