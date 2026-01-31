@echo off
title ClassIn Maker Pro
cd /d "D:\클래스인 판서 제작기"

echo ========================================
echo   ClassIn Maker Pro 실행 중...
echo ========================================
echo.

REM 기존 서버 종료 (포트 5173)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F 2>nul

echo 개발 서버를 시작합니다...
echo 브라우저에서 http://localhost:5173 으로 접속하세요
echo.
echo 종료하려면 이 창을 닫으세요.
echo ========================================

start "" http://localhost:5173
npm run dev
