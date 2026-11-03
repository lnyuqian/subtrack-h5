/* 矮视口专项：弹窗必须居中、页脚必须可见可点（针对「DSH 右栏未全屏时看不到保存按钮」） */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8848/index.html';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  :: ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  const sizes = [
    [400, 120], [400, 180], [360, 220], [400, 250],
    [320, 300], [375, 400], [460, 500], [900, 600],
  ];

  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); window.Store.reset(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(350);

    // 手机用底部悬浮按钮，桌面用顶栏按钮；按可见性择一
    const addBtn = (await page.locator('#tabAdd').isVisible()) ? '#tabAdd' : '#btnAdd';
    await page.click(addBtn);
    await page.waitForTimeout(550);

    const m = await page.evaluate(() => {
      const modal = document.querySelector('.modal');
      const foot = document.getElementById('modalFoot');
      const body = document.getElementById('modalBody');
      const name = document.querySelector('input[name="name"]');
      const save = [...document.querySelectorAll('#modalFoot button')].find(x => x.textContent.includes('保存'));
      const mr = modal.getBoundingClientRect();
      const fr = foot.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      const sr = save.getBoundingClientRect();
      const vh = innerHeight, vw = innerWidth;
      return {
        vh, vw,
        modal: { top: Math.round(mr.top), bottom: Math.round(mr.bottom), h: Math.round(mr.height) },
        bothEdgesInside: mr.top >= -1 && mr.bottom <= vh + 1,
        // 居中判定：上下留白差 ≤ 2px（或贴边+内边距）
        topGap: Math.round(mr.top),
        bottomGap: Math.round(vh - mr.bottom),
        saveVisible: sr.top >= -1 && sr.bottom <= vh + 1 && sr.height > 1,
        nameReachable: nr.top >= -1 && nr.bottom <= vh + 1 ? true : (body.scrollHeight > body.clientHeight),
        bodyScrollable: body.scrollHeight > body.clientHeight + 1,
      };
    });

    const centered = Math.abs(m.topGap - m.bottomGap) <= 2;
    const ok = m.saveVisible && m.bothEdgesInside;
    log(`${w}x${h} 弹窗完整在屏内且保存可见`, ok,
      `modal[${m.modal.top}..${m.modal.bottom}] 上留${m.topGap} 下留${m.bottomGap} 居中=${centered} 保存可见=${m.saveVisible} 溢出底=${m.modal.bottom - m.vh}`);

    if (!ok) await page.screenshot({ path: path.join(OUT, `tiny-fail-${w}x${h}.png`) });

    // 实际点一次保存，确认可交互
    await page.fill('input[name="name"]', '矮屏测试' + w + 'x' + h);
    await page.fill('input[name="price"]', '9.9');
    await page.click('#modalFoot .btn-primary');
    await page.waitForTimeout(500);
    const saved = await page.evaluate((nm) => {
      return window.Store.db.subs.some(s => s.name === nm);
    }, '矮屏测试' + w + 'x' + h);
    log(`${w}x${h} 保存按钮实际可点并落库`, saved);

    await ctx.close();
  }

  await browser.close();

  console.log('\n===== 控制台错误 =====');
  if (errors.length) [...new Set(errors)].forEach(e => console.log('  ' + e));
  else console.log('  （无）');

  const failed = results.filter(r => !r.ok);
  console.log('\n===== 汇总 =====');
  console.log('  通过 ' + (results.length - failed.length) + ' / ' + results.length);
  if (failed.length) failed.forEach(f => console.log('  x ' + f.name + ' :: ' + f.detail));

  fs.writeFileSync(path.join(OUT, 'report-tiny.json'),
    JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
