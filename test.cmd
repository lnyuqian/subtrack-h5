@echo off
REM D8：本地即 CI。构建 / 测试各一个具名命令。
REM 用法：test.cmd           跑全部四套
REM       test.cmd main      只跑主回归
REM       test.cmd tiny      只跑矮视口
REM       test.cmd opt1      只跑第1批 AC
REM       test.cmd opt2      只跑第2批 AC
REM
REM 注意：不在这里设 NODE_PATH —— cmd 代码页 936 无法编码家目录里的「、」，
REM 会让 require('playwright') 失败。定位模块由 run-tests.js 负责。

setlocal
cd /d "%~dp0"
node run-tests.js %1
exit /b %ERRORLEVEL%
