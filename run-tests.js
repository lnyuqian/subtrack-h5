/* ==========================================================================
   run-tests.js · 本地即 CI 的统一入口（D8）
   为什么不用 test.cmd 设 NODE_PATH：
   cmd 默认代码页 936，家目录里的「1、」在 GBK 无法编码 →
   NODE_PATH 失配 → require('playwright') 报 MODULE_NOT_FOUND。
   改为在本进程里用绝对路径定位模块，再加进 module.paths。
   ========================================================================== */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/** 依次尝试常见位置，找到 playwright 就返回其 node_modules 目录 */
function locatePlaywright() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules'),
    path.join(process.cwd(), 'node_modules'),
    path.join(process.cwd(), '..', 'node_modules'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const probe = path.join(dir, 'playwright');
    if (fs.existsSync(probe)) return dir;
  }
  return null;
}

const modDir = locatePlaywright();
if (!modDir) {
  console.error('[FAIL] 找不到 playwright。已尝试：');
  console.error('  ' + path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'));
  console.error('  提示：npm i -g playwright');
  process.exit(2);
}
// 让子进程的 require 能找到 playwright，且不依赖 NODE_PATH 的编码
process.env.NODE_PATH = modDir;
require('module').Module._initPaths();

const SUITES = {
  main: { file: 'verify.js', label: '主回归 1440/768/375' },
  tiny: { file: 'verify-tiny.js', label: '矮视口 8 尺寸' },
  opt1: { file: 'verify-opt1.js', label: '第1批 AC1–AC10' },
  opt2: { file: 'verify-opt2.js', label: '第2批 AC11–AC19' },
};

const arg = process.argv[2];
const names = arg && SUITES[arg] ? [arg] : Object.keys(SUITES);

console.log('playwright: ' + modDir);
console.log('运行: ' + names.map(n => SUITES[n].file).join(' + '));
console.log('');

let failed = 0;
const t0 = Date.now();

for (const name of names) {
  const suite = SUITES[name];
  const file = path.join(__dirname, suite.file);
  if (!fs.existsSync(file)) {
    console.log('[SKIP] ' + suite.file + ' 不存在');
    continue;
  }
  console.log('=== ' + suite.file + '（' + suite.label + '）===');
  let code = 0;
  try {
    // 用 inherit 而不是 pipe：管道在部分受限环境（命名管道被禁）会卡住子进程
    execFileSync(process.execPath, [file], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
      timeout: 300000,
    });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : 1;
    if (e.signal === 'SIGTERM') console.error('  (超时终止)');
    failed++;
  }
  if (code !== 0) console.error('  子进程退出码 ' + code);
  console.log('');
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (failed) {
  console.log('FAILED: ' + failed + ' 套失败，用时 ' + secs + 's');
  process.exit(1);
}
console.log('ALL GREEN（' + names.length + ' 套），用时 ' + secs + 's');
