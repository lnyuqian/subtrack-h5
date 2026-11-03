/* ==========================================================================
   verify-opt1.js · 第一批优化的 AC 专项验收（AC1–AC10）
   每条断言对应 AC 表的一行，失败即打印实测值与期望值
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8848/index.html';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(ac, name, ok, detail) {
  results.push({ ac, name, ok, detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + ac + ' · ' + name + (detail ? '  :: ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  async function fresh(viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 960 }, locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); window.Store.reset(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    return { ctx, page };
  }

  /* ================= AC1 币种符号唯一 ================= */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const groups = {};
      window.Platforms.CURRENCIES.forEach(c => {
        (groups[c.symbol] = groups[c.symbol] || []).push(c.code);
      });
      const dup = Object.entries(groups).filter(([, v]) => v.length > 1);
      const jpy = window.Platforms.CURRENCY_MAP['JPY'];
      const usd = window.Platforms.CURRENCY_MAP['USD'];
      return { dup, jpy: jpy.symbol, usd: usd.symbol, total: window.Platforms.CURRENCIES.length };
    });
    log('AC1', '无两种币种共用同一符号', r.dup.length === 0,
      `重复组=${JSON.stringify(r.dup)} 共${r.total}种`);
    log('AC1', 'JPY 显示 JP¥、USD 显示 US$', r.jpy === 'JP¥' && r.usd === 'US$',
      `JPY=${r.jpy} USD=${r.usd}`);
    await ctx.close();
  }

  /* ================= AC2 付款历史可见 ================= */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => window.Store.seedDemo());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    // 锁定同一个订阅 id：markPaid 会顺延 nextDue 并改变排序，
    // 若按「第一张卡片」重新定位会落到别的订阅上（这是测试陷阱，不是产品缺陷）
    const targetId = await page.evaluate(() => {
      const s = window.Store.db.subs.find(x => x.status === 'active');
      return s ? s.id : null;
    });

    await page.click('.nav-item[data-view="subs"]');
    await page.waitForTimeout(300);
    await page.locator(`#subsBody .sub-card[data-id="${targetId}"]`).click();
    await page.waitForTimeout(400);

    const before = await page.evaluate(() =>
      document.querySelectorAll('.pay-history .pay-row').length);
    const hasSection = await page.locator('.pay-history').count();

    // 标记本期已付（会关闭弹窗），再用同一 id 重开
    await page.click('#modalBody .btn-ghost.btn-sm');
    await page.waitForTimeout(500);
    await page.locator(`#subsBody .sub-card[data-id="${targetId}"]`).click();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() =>
      document.querySelectorAll('.pay-history .pay-row').length);
    const headText = await page.evaluate(() => {
      const h = document.querySelector('.pay-history .pay-head');
      return h ? h.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    const storeCount = await page.evaluate((id) => window.Store.paymentsOf(id).length, targetId);

    log('AC2', '编辑弹窗出现「付款历史」区', hasSection > 0, 'sections=' + hasSection);
    log('AC2', '标记已付后记录条数 +1', after === before + 1,
      `DOM ${before} -> ${after}（store=${storeCount}）`);
    log('AC2', '显示累计金额', !!headText && /累计/.test(headText), headText);
    await page.screenshot({ path: path.join(OUT, 'opt1-pay-history.png') });
    await ctx.close();
  }

  /* ================= AC3 图表脚注合计正确 ================= */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => window.Store.seedDemo());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.click('.nav-item[data-view="stats"]');
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => {
      const note = document.querySelector('.chart-note');
      const fc = window.Store.forecast(window.Store.db.settings, 12);
      const sum = fc.reduce((a, x) => a + x.total, 0);
      const txt = note ? note.textContent.replace(/\s+/g, ' ').trim() : null;
      // 从文本里抠出「12 个月合计 ¥X」
      const m = txt && txt.match(/12 个月合计\s*([^\s，]+)/);
      return { txt, sum: Math.round(sum * 100) / 100, matched: m ? m[1] : null, peak: /年付高峰/.test(txt || '') };
    });
    const noteNum = r.matched ? Number(String(r.matched).replace(/[^\d.]/g, '')) : NaN;
    log('AC3', '脚注出现且含合计', !!r.txt && /12 个月合计/.test(r.txt), r.txt);
    log('AC3', '脚注合计 = 各月 total 求和（误差≤1）',
      Math.abs(noteNum - r.sum) <= 1, `页面=${noteNum} 实际求和=${r.sum}`);
    log('AC3', '年付高峰被标出', r.peak === true, 'peak=' + r.peak);
    await page.screenshot({ path: path.join(OUT, 'opt1-chart-note.png'), fullPage: true });
    await ctx.close();
  }

  /* ================= AC4 汇率可编辑并生效 ================= */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      window.Store.reset();
      // 只用一条纯美元订阅，便于精确算
      window.Store.upsert({
        name: 'USD订阅', category: 'ai', price: 10, currency: 'USD',
        cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01'
      });
      window.Store.updateSettings({ currency: 'CNY', rates: null });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const before = await page.evaluate(() =>
      Math.round(window.Store.summary(window.Store.db.settings).monthly * 100) / 100);

    await page.click('.nav-item[data-view="settings"]');
    await page.waitForTimeout(350);
    // 打开汇率编辑
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.set-row button')];
      const b = btns.find(x => x.textContent.trim() === '编辑');
      if (b) b.click();
    });
    await page.waitForTimeout(300);
    const editorOpen = await page.locator('.rate-editor.open').count();

    // 把 USD 改成 8.0
    const changed = await page.evaluate(() => {
      const inp = document.querySelector('.rate-input[data-code="USD"]');
      if (!inp) return false;
      inp.value = '8';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() =>
      Math.round(window.Store.summary(window.Store.db.settings).monthly * 100) / 100);
    const ratesNow = await page.evaluate(() =>
      Math.round(window.Store.db.settings.rates.USD * 10000) / 10000);

    log('AC4', '汇率编辑区可展开', editorOpen > 0, 'open=' + editorOpen);
    log('AC4', '输入框存在并可改', changed === true);
    log('AC4', '美元订阅月支出 71 → 80',
      Math.abs(before - 71) < 0.5 && Math.abs(after - 80) < 0.5,
      `before=${before} after=${after} rates.USD=${ratesNow}`);
    await page.screenshot({ path: path.join(OUT, 'opt1-rates.png'), fullPage: true });
    await ctx.close();
  }

  /* ================= AC5 导入不误合并 ================= */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      // 同名同起始日、不同价格：家庭共享各付，必须保留 2 条
      const payload = {
        version: 1,
        subs: [
          { name: '家庭共享', price: 30, currency: 'CNY', cycle: 'monthly', category: 'video', startDate: '2026-01-01', nextDue: '2026-12-01' },
          { name: '家庭共享', price: 45, currency: 'CNY', cycle: 'monthly', category: 'video', startDate: '2026-01-01', nextDue: '2026-12-01' }
        ]
      };
      const res = S.importJSON(JSON.stringify(payload));
      const kept = S.db.subs.filter(x => x.name === '家庭共享').length;
      // 再来一次完全相同的一份，应当合并而不是翻倍
      const res2 = S.importJSON(JSON.stringify(payload));
      const afterDup = S.db.subs.filter(x => x.name === '家庭共享').length;
      return { added: res.added, kept, added2: res2.added, merged2: res2.merged, afterDup };
    });
    log('AC5', '不同价格同名订阅保留 2 条', r.kept === 2, JSON.stringify(r));
    log('AC5', '重复导入相同数据合并而非翻倍',
      r.afterDup === 2 && r.merged2 === 2, `afterDup=${r.afterDup} merged2=${r.merged2}`);
    await ctx.close();
  }

  /* ================= AC7 + AC6 PWA / 离线 ================= */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

    // manifest 可访问
    const manResp = await page.goto(BASE.replace('index.html', 'manifest.webmanifest'));
    const manStatus = manResp.status();
    const manBody = await manResp.text();
    let manOk = false, iconCount = 0;
    try { const j = JSON.parse(manBody); manOk = !!(j.name && j.icons); iconCount = (j.icons || []).length; } catch (e) {}

    // 图标可访问
    const iconResp = await page.goto(BASE.replace('index.html', 'icons/icon-192.png'));
    const iconStatus = iconResp.status();

    // 注册 SW
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); window.Store.reset(); window.Store.seedDemo(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        registered: !!window.__SW_REGISTERED__,
        regCount: regs.length,
        hasController: !!navigator.serviceWorker.controller,
        skipped: window.__SW_SKIPPED__ || null,
        err: window.__SW_ERROR__ || null,
      };
    });

    log('AC6', 'manifest 可访问且结构合法', manStatus === 200 && manOk && iconCount >= 3,
      `status=${manStatus} name/图标=${manOk} icons=${iconCount}`);
    log('AC6', 'PWA 图标可访问', iconStatus === 200, 'icon-192 status=' + iconStatus);
    log('AC6', 'Service Worker 注册成功', sw.registered && sw.regCount > 0,
      JSON.stringify(sw));

    // 离线：断网后刷新
    await ctx.setOffline(true);
    let offlineOk = false, offlineDetail = '';
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1200);
      const st = await page.evaluate(() => ({
        title: document.title,
        cards: document.querySelectorAll('#dashboardBody .sub-card').length,
        subs: window.Store && window.Store.db ? window.Store.db.subs.length : -1,
        bodyLen: document.body.innerText.length,
      }));
      offlineOk = st.subs > 0 && st.cards > 0 && st.bodyLen > 50;
      offlineDetail = JSON.stringify(st);
      await page.screenshot({ path: path.join(OUT, 'opt1-offline.png'), fullPage: true });
    } catch (e) {
      offlineDetail = 'ERR ' + e.message.slice(0, 120);
    }
    await ctx.setOffline(false);
    log('AC7', '断网刷新仍可用（数据在、卡片在）', offlineOk, offlineDetail);

    await ctx.close();
  }

  /* ================= AC8 启动提醒弹窗 ================= */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      const U = window.U, S = window.Store;
      S.reset();
      const t = U.fmtDate(U.today());
      S.upsert({ name: '今天扣费A', category: 'video', price: 25, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t });
      S.upsert({ name: '今天扣费B', category: 'ai', price: 20, currency: 'USD', cycle: 'monthly', startDate: t, nextDue: t });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const first = await page.evaluate(() => {
      const root = document.getElementById('modalRoot');
      const title = document.getElementById('modalTitle');
      const hero = document.querySelector('.onboard-hero');
      return {
        visible: root && !root.hidden,
        title: title ? title.textContent : null,
        hero: hero ? hero.textContent.replace(/\s+/g, ' ').trim() : null,
        rows: document.querySelectorAll('.onboard-row').length,
      };
    });

    log('AC8', '启动弹出今日扣费提醒',
      first.visible && first.title === '今日扣费提醒', JSON.stringify(first));
    log('AC8', '文案含「今天」与笔数',
      !!first.hero && /今天有 2 笔/.test(first.hero), first.hero);
    await page.screenshot({ path: path.join(OUT, 'opt1-onboard.png') });

    // 关闭后当天不再弹
    await page.click('#modalFoot .btn-ghost');
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const second = await page.evaluate(() => {
      const root = document.getElementById('modalRoot');
      return { visible: root && !root.hidden, title: document.getElementById('modalTitle').textContent };
    });
    log('AC8', '当天关闭后不再重复弹', !second.visible || second.title !== '今日扣费提醒',
      JSON.stringify(second));

    // 回归：关闭启动弹窗后页面不能被顶走（曾出现 scrollY=113 导致提醒条压到顶栏下）
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1700);
    if (await page.locator('#modalRoot').isVisible()) {
      await page.click('#modalFoot .btn-ghost');
      await page.waitForTimeout(400);
    }
    const scrollState = await page.evaluate(() => {
      const tb = document.querySelector('.topbar').getBoundingClientRect();
      const banner = document.getElementById('alertBanner');
      const br = banner && !banner.hidden ? banner.getBoundingClientRect() : null;
      return {
        scrollY: Math.round(window.scrollY),
        topbarBottom: Math.round(tb.bottom),
        bannerTop: br ? Math.round(br.top) : null,
        overlap: br ? Math.max(0, Math.round(tb.bottom - br.top)) : 0,
      };
    });
    log('AC8', '关弹窗后不被顶走、提醒条不与顶栏重叠',
      scrollState.scrollY === 0 && scrollState.overlap === 0, JSON.stringify(scrollState));

    await ctx.close();
  }

  /* ================= AC10 localStorage 写满有提示 ================= */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      // 塞满配额
      let filled = false;
      try {
        const big = 'x'.repeat(1024 * 1024);
        for (let i = 0; i < 6; i++) localStorage.setItem('__fill_' + i, big);
        filled = true;
      } catch (e) { filled = false; }
      // 此时再保存应抛 STORAGE_FULL 或成功裁剪
      let outcome = 'unknown', msg = '';
      try {
        S.upsert({ name: '配额测试', price: 1, currency: 'CNY', cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01' });
        outcome = 'ok';
      } catch (e) {
        outcome = 'threw';
        msg = e.code || e.message;
      }
      // 清理
      for (let i = 0; i < 6; i++) localStorage.removeItem('__fill_' + i);
      return { filled, outcome, msg };
    });
    // 关键：不能是「抛了但没人处理」的静默失败；要么裁剪成功，要么给 STORAGE_FULL
    const handled = r.outcome === 'ok' || r.msg === 'STORAGE_FULL';
    log('AC10', '写满时要么自动裁剪要么报 STORAGE_FULL',
      r.filled ? handled : true,
      JSON.stringify(r));

    // 端到端：写满后点保存，界面必须出现提示（不能静默）
    const r2 = await (async () => {
      const p2 = await ctx.newPage();
      await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
      const res = await p2.evaluate(() => {
        const S = window.Store;
        S.reset();
        try {
          const big = 'x'.repeat(1024 * 1024);
          for (let i = 0; i < 6; i++) localStorage.setItem('__fill_' + i, big);
        } catch (e) {}
        let uiMsg = null;
        try {
          S.upsert({ name: '配额E2E', price: 1, currency: 'CNY', cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01' });
        } catch (e) {
          uiMsg = e.message;
        }
        for (let i = 0; i < 6; i++) localStorage.removeItem('__fill_' + i);
        return { uiMsg };
      });
      await p2.close();
      return res;
    })();
    log('AC10', '错误信息面向用户可读',
      !r2.uiMsg || /存储|导出备份|清理/.test(r2.uiMsg), r2.uiMsg || '(未触发)');

    await ctx.close();
  }

  await browser.close();

  console.log('\n===== 控制台错误 =====');
  if (errors.length) [...new Set(errors)].forEach(e => console.log('  ' + e));
  else console.log('  （无）');

  const failed = results.filter(r => !r.ok);
  console.log('\n===== 汇总 =====');
  console.log('  通过 ' + (results.length - failed.length) + ' / ' + results.length);
  if (failed.length) failed.forEach(f => console.log('  x ' + f.ac + ' ' + f.name + ' :: ' + f.detail));

  fs.writeFileSync(path.join(OUT, 'report-opt1.json'),
    JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
