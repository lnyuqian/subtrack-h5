@echo off
REM D8：本地即 CI。构建 / 测试各一个具名命令。
REM 用法：test.cmd           跑全部三套
REM       test.cmd main      只跑主回归
REM       test.cmd tiny      只跑矮视口
REM       test.cmd opt1      只跑 AC 专项

setlocal
set NODE_PATH=C:\Users\1、\AppData\Roaming\npm\node_modules
cd /d "%~dp0"

if "%1"=="main" goto main
if "%1"=="tiny" goto tiny
if "%1"=="opt1" goto opt1
goto all

:main
node verify.js
exit /b %ERRORLEVEL%

:tiny
node verify-tiny.js
exit /b %ERRORLEVEL%

:opt1
node verify-opt1.js
exit /b %ERRORLEVEL%

:all
echo === verify.js ^(main 1440/768/375^) ===
node verify.js || exit /b 1
echo.
echo === verify-tiny.js ^(short viewports^) ===
node verify-tiny.js || exit /b 1
echo.
echo === verify-opt1.js ^(AC1-AC10^) ===
node verify-opt1.js || exit /b 1
echo.
echo ALL GREEN
