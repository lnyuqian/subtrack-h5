/* ==========================================================================
   verify-webkit.js · Safari 内核（WebKit）兼容验证
   覆盖 Chromium 测不到的：dvh、TextDecoder('gbk')、Safari 弹窗布局
   ========================================================================== */
const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://lnyuqian.github.io/subtrack-h5/';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  :: ' + detail : ''));
}

(async () => {
  let browser;
  try {
    browser = await webkit.launch();
  } catch (e) {
    console.log('SKIP  WebKit 未安装：' + e.message.split('\n')[0]);
    console.log('      安装：node <playwright>/cli.js install webkit');
    process.exit(0);
  }

  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  log('线上可访问（HTTPS）', resp.status() === 200, 'status=' + resp.status());

  await page.evaluate(() => { localStorage.clear(); window.Store.reset(); window.Store.seedDemo(); });
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  if (await page.locator('#modalRoot').isVisible()) {
    await page.click('#modalFoot .btn-ghost');
    await page.waitForTimeout(400);
  }

  const st = await page.evaluate(() => ({
    subs: window.Store.db.subs.length,
    cards: document.querySelectorAll('#dashboardBody .sub-card').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dvh: CSS.supports('height', '100dvh'),
    gbk: (() => { try { new TextDecoder('gbk'); return true; } catch (e) { return false; } })(),
    decodeText: typeof window.U.decodeText === 'function',
  }));

  log('数据渲染', st.subs > 0 && st.cards > 0, JSON.stringify(st));
  log('无横向溢出', st.overflow <= 0, 'delta=' + st.overflow);
  log('支持 100dvh（矮屏弹窗依赖）', st.dvh === true);
  log('支持 TextDecoder(gbk)（GBK 导入依赖）', st.gbk === true && st.decodeText === true);

  // GBK 导入在 WebKit 下真实跑一遍
  const gbkRun = await page.evaluate(() => {
    const U = window.U, S = window.Store;
    S.reset();
    const bytes = new Uint8Array([
      0xC3, 0xFB, 0xB3, 0xC6, 0x2C, 0xBD, 0xF0, 0xB6, 0xEE, 0x0A, // 名称,金额\n
      0x57, 0x4B, 0x2C, 0x39, 0x2E, 0x39, 0x0A                    // WK,9.9\n
    ]);
    const d = U.decodeText(bytes);
    try {
      const res = S.importCSV(d.text);
      return { enc: d.encoding, added: res.added, name: S.db.subs[0] ? S.db.subs[0].name : null };
    } catch (e) { return { enc: d.encoding, error: e.message }; }
  });
  log('WebKit 下 GBK CSV 可导入', gbkRun.added === 1 && gbkRun.name === 'WK', JSON.stringify(gbkRun));

  // 弹窗布局
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  if (await page.locator('#modalRoot').isVisible()) {
    await page.click('#modalFoot .btn-ghost');
    await page.waitForTimeout(300);
  }
  await page.click('#tabAdd');
  await page.waitForTimeout(800);
  const modal = await page.evaluate(() => {
    const m = document.querySelector('.modal');
    const s = [...document.querySelectorAll('#modalFoot button')].find(x => x.textContent.includes('保存'));
    const mr = m.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return {
      h: Math.round(mr.height),
      saveVisible: sr.top >= 0 && sr.bottom <= innerHeight && sr.height > 1,
      bottomGap: Math.round(innerHeight - mr.bottom),
    };
  });
  log('弹窗保存按钮可见', modal.saveVisible === true, JSON.stringify(modal));
  await page.screenshot({ path: path.join(OUT, 'live-webkit.png') });

  await browser.close();

  console.log('\n===== 控制台错误 =====');
  if (errors.length) [...new Set(errors)].forEach(e => console.log('  ' + e));
  else console.log('  （无）');

  const failed = results.filter(r => !r.ok);
  console.log('\n===== 汇总 =====');
  console.log('  通过 ' + (results.length - failed.length) + ' / ' + results.length);
  if (failed.length) failed.forEach(f => console.log('  x ' + f.name + ' :: ' + f.detail));

  fs.writeFileSync(path.join(OUT, 'report-webkit.json'),
    JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
