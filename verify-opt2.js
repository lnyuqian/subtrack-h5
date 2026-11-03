/* ==========================================================================
   verify-opt2.js · 第 2 批 AC11–AC19
   记录页 / 年度支出 / 涨价识别 / CSV 导入导出
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

  /* ============ AC11 记录页可访问 ============ */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      const S = window.Store, U = window.U;
      S.reset();
      const t = U.fmtDate(U.today());
      const a = S.upsert({ name: '记录测试A', price: 30, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t });
      S.markPaid(a.id, t);
      const b = S.upsert({ name: '记录测试B', price: 12, currency: 'USD', cycle: 'monthly', startDate: t, nextDue: t });
      S.markPaid(b.id, t);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (await page.locator('#modalRoot').isVisible()) {
      await page.click('#modalFoot .btn-ghost');
      await page.waitForTimeout(300);
    }
    await page.click('.nav-item[data-view="records"]');
    await page.waitForTimeout(450);

    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.pay-timeline-row')];
      const dates = rows.map(x => (x.querySelector('.pt-info span') || {}).textContent || '');
      return {
        title: document.getElementById('viewTitle').textContent,
        rows: rows.length,
        dates: dates,
        hasMonth: document.querySelectorAll('.pt-month').length,
        navBadge: (document.getElementById('navCountPays') || {}).textContent,
      };
    });
    log('AC11', '记录页可打开且渲染行', r.title === '记录' && r.rows > 0, JSON.stringify(r));
    log('AC11', '按年月分组', r.hasMonth > 0, 'pt-month=' + r.hasMonth);
    await page.screenshot({ path: path.join(OUT, 'opt2-records.png'), fullPage: true });
    await ctx.close();
  }

  /* ============ AC12 年度支出准确 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      // 手工造跨年付款
      S.db.payments.push(
        { id: 'p1', subId: 'x', date: '2025-03-01', amount: 100, currency: 'CNY', auto: false },
        { id: 'p2', subId: 'x', date: '2025-07-15', amount: 50, currency: 'CNY', auto: false },
        { id: 'p3', subId: 'x', date: '2026-01-10', amount: 200, currency: 'CNY', auto: false }
      );
      S.save();
      const years = S.paymentsByYear(S.db.settings);
      const all = S.allPayments({});
      const y2025 = years.find(y => y.year === '2025');
      return {
        years: years.map(y => ({ y: y.year, total: Math.round(y.total * 100) / 100, count: y.count })),
        y2025total: y2025 ? Math.round(y2025.total * 100) / 100 : null,
        allCount: all.length,
      };
    });
    log('AC12', '2025 年合计 = 100 + 50 = 150', r.y2025total === 150, JSON.stringify(r.years));
    log('AC12', '年度分组数量正确', r.years.length === 2 && r.allCount === 3, 'years=' + r.years.length + ' all=' + r.allCount);
    await ctx.close();
  }

  /* ============ AC13 涨价识别 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const t = window.U.fmtDate(window.U.today());
      const s = S.upsert({ name: '涨价测试', price: 10, currency: 'CNY', cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01' });
      // 先给一条历史，再改价（同一天会合并，故先写昨天）
      s.priceHistory = [
        { price: 10, currency: 'CNY', since: '2026-01-01' },
        { price: 10, currency: 'CNY', since: '2026-02-01' }
      ];
      S.save();
      // 改价为 13
      S.upsert({ id: s.id, price: 13 });
      const after = S.get(s.id);
      const pc = S.priceChange(after);
      return {
        histLen: after.priceHistory.length,
        hist: after.priceHistory.map(h => h.price),
        pc,
        pct: pc ? Math.round(pc.pct * 10) / 10 : null,
        isRise: pc ? pc.isRise : null,
      };
    });
    log('AC13', '涨价被识别', r.pc !== null && r.isRise === true, JSON.stringify(r.pc));
    log('AC13', '涨幅 =(13-10)/10 = 30%', r.pct === 30, 'pct=' + r.pct);
    log('AC13', '历史追加一条', r.histLen === 3, 'hist=' + JSON.stringify(r.hist));

    // 界面上出现标签
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (await page.locator('#modalRoot').isVisible()) {
      await page.click('#modalFoot .btn-ghost');
      await page.waitForTimeout(250);
    }
    await page.click('.nav-item[data-view="subs"]');
    await page.waitForTimeout(450);
    const ui = await page.evaluate(() => {
      const el = document.querySelector('.price-rise');
      return el ? {
        text: el.textContent.trim(),
        pct: el.dataset.pct,
        rise: el.dataset.rise,
        cls: el.className,
      } : null;
    });
    log('AC13', '卡片出现涨价标签 30%', !!ui && ui.text.includes('30') && ui.rise === 'true',
      JSON.stringify(ui));
    await page.screenshot({ path: path.join(OUT, 'opt2-price-rise.png'), fullPage: true });
    await ctx.close();
  }

  /* ============ AC14 改价不改历史金额 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const s = S.upsert({ name: '历史不变测试', price: 20, currency: 'CNY', cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01' });
      S.markPaid(s.id, '2026-10-01');
      const before = S.paymentsOf(s.id).map(p => p.amount);
      // 涨价
      S.upsert({ id: s.id, price: 30 });
      const after = S.paymentsOf(s.id).map(p => p.amount);
      // 再标记一次（应按新价）
      S.markPaid(s.id, '2026-11-01');
      const after2 = S.paymentsOf(s.id).map(p => p.amount);
      return { before, after, after2 };
    });
    log('AC14', '涨价前付款记录金额不变', JSON.stringify(r.before) === JSON.stringify(r.after),
      `before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)}`);
    log('AC14', '涨价后的新记录用新价', r.after2.filter(x => x === 30).length === 1,
      'after2=' + JSON.stringify(r.after2));
    await ctx.close();
  }

  /* ============ AC15 CSV 导入 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const csv = [
        '名称,金额,币种,周期,下次扣费',
        'CSV订阅A,15.49,USD,每月,2026-12-01',
        'CSV订阅B,88,CNY,每年,2027-01-15',
        'CSV订阅C,25,CNY,每月,2026-12-20'
      ].join('\r\n');
      const res = S.importCSV(csv);
      const subs = S.db.subs.filter(s => s.name.indexOf('CSV订阅') === 0).map(s => ({
        name: s.name, price: s.price, cur: s.currency, cycle: s.cycle, due: s.nextDue
      }));
      return { res, subs };
    });
    log('AC15', '导入 3 条', r.res.added === 3 && r.subs.length === 3, JSON.stringify(r.res));
    const a = r.subs.find(s => s.name === 'CSV订阅A');
    const b = r.subs.find(s => s.name === 'CSV订阅B');
    log('AC15', '字段映射正确（金额/币种/周期/日期）',
      a && a.price === 15.49 && a.cur === 'USD' && a.cycle === 'monthly' && a.due === '2026-12-01' &&
      b && b.price === 88 && b.cycle === 'yearly',
      JSON.stringify(r.subs));
    await ctx.close();
  }

  /* ============ AC16 中英双表头 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const en = [
        'name,price,currency,cycle,next_due',
        'EnglishSub,9.99,EUR,monthly,2026-12-05'
      ].join('\n');
      const r1 = S.importCSV(en);
      const s1 = S.db.subs.find(x => x.name === 'EnglishSub');

      S.reset();
      const zh = [
        '订阅名称,价格,货币,付费周期,到期日',
        '中文表头订阅,66,人民币,每年,2027-02-01'
      ].join('\n');
      const r2 = S.importCSV(zh);
      const s2 = S.db.subs.find(x => x.name === '中文表头订阅');
      return {
        en: { added: r1.added, sub: s1 ? { p: s1.price, c: s1.currency, cy: s1.cycle, d: s1.nextDue } : null },
        zh: { added: r2.added, sub: s2 ? { p: s2.price, c: s2.currency, cy: s2.cycle, d: s2.nextDue } : null },
      };
    });
    log('AC16', '英文表头可识别', r.en.added === 1 && r.en.sub && r.en.sub.p === 9.99 && r.en.sub.c === 'EUR',
      JSON.stringify(r.en));
    log('AC16', '中文表头可识别（含别名「货币/付费周期/到期日」）',
      r.zh.added === 1 && r.zh.sub && r.zh.sub.p === 66 && r.zh.sub.c === 'CNY' && r.zh.sub.cy === 'yearly',
      JSON.stringify(r.zh));
    await ctx.close();
  }

  /* ============ AC17 错误有明确提示 ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const out = [];
      // 缺名称列
      try { S.importCSV('金额,币种\n10,CNY'); out.push({ case: '缺名称', err: null }); }
      catch (e) { out.push({ case: '缺名称', err: e.message }); }
      // 缺金额列
      try { S.importCSV('名称,币种\nA,CNY'); out.push({ case: '缺金额', err: null }); }
      catch (e) { out.push({ case: '缺金额', err: e.message }); }
      // 空内容
      try { S.importCSV(''); out.push({ case: '空', err: null }); }
      catch (e) { out.push({ case: '空', err: e.message }); }
      // 金额乱码：应跳过并给出行号
      const rr = S.importCSV('名称,金额\n正常,10\n坏行,abc');
      out.push({ case: '金额乱码', res: { added: rr.added, skipped: rr.skipped, errors: rr.errors } });
      return out;
    });
    const missName = r.find(x => x.case === '缺名称');
    const missPrice = r.find(x => x.case === '缺金额');
    const empty = r.find(x => x.case === '空');
    const bad = r.find(x => x.case === '金额乱码');
    log('AC17', '缺名称列报错且说明支持的列', !!missName.err && /名称/.test(missName.err), missName.err);
    log('AC17', '缺金额列报错', !!missPrice.err && /金额/.test(missPrice.err), missPrice.err);
    log('AC17', '空文件报错', !!empty.err, empty.err);
    log('AC17', '金额乱码跳过并给行号',
      bad.res && bad.res.added === 1 && bad.res.skipped === 1 &&
      bad.res.errors.length === 1 && /第 3 行/.test(bad.res.errors[0]),
      JSON.stringify(bad.res));
    await ctx.close();
  }

  /* ============ AC18 CSV 往返（导出→导入） ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      S.upsert({ name: '往返,含逗号', price: 12.5, currency: 'CNY', cycle: 'monthly', startDate: '2026-01-01', nextDue: '2026-12-01', note: '带"引号"的备注' });
      const csv = S.exportCSV();
      S.reset();
      const res = S.importCSV(csv);
      const s = S.db.subs[0];
      return {
        added: res.added,
        name: s ? s.name : null,
        note: s ? s.note : null,
        price: s ? s.price : null,
      };
    });
    log('AC18', '导出后能原样导入（含逗号与引号转义）',
      r.added === 1 && r.name === '往返,含逗号' && r.price === 12.5 && r.note === '带"引号"的备注',
      JSON.stringify(r));
    await ctx.close();
  }

  /* ============ AC20 GBK 编码 CSV 可导入（回归：曾因 UTF-8 误读导致表头乱码） ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const U = window.U, S = window.Store;
      S.reset();
      // 构造 GBK 字节：中文表头在 GBK 下无法通过严格 UTF-8 解码
      const gbkBytes = new Uint8Array([
        0xC3, 0xFB, 0xB3, 0xC6, 0x2C, // 名称,
        0xBD, 0xF0, 0xB6, 0xEE, 0x2C, // 金额,
        0xB1, 0xD2, 0xD6, 0xD6, 0x0A, // 币种\n
        0x47, 0x42, 0x4B, 0x32, 0x30, 0x2C, // GBK20,
        0x31, 0x30, 0x2C,                   // 10,
        0xD4, 0xAA, 0x0A                    // 元\n
      ]);
      const decoded = U.decodeText(gbkBytes);
      let outcome;
      try {
        const res = S.importCSV(decoded.text);
        outcome = {
          encoding: decoded.encoding,
          head: decoded.text.split('\n')[0],
          added: res.added,
          firstName: S.db.subs[0] ? S.db.subs[0].name : null,
          firstPrice: S.db.subs[0] ? S.db.subs[0].price : null,
          firstCur: S.db.subs[0] ? S.db.subs[0].currency : null,
        };
      } catch (e) {
        outcome = { encoding: decoded.encoding, head: decoded.text.split('\n')[0], error: e.message };
      }
      // 同时验证纯 ASCII 的 UTF-8 不被误判成 GBK
      const ascii = U.decodeText(new TextEncoder().encode('name,price\nA,1'));
      return { gbk: outcome, asciiEncoding: ascii.encoding };
    });
    log('AC20', 'GBK 编码被正确识别', r.gbk.encoding === 'gbk', 'encoding=' + r.gbk.encoding);
    log('AC20', 'GBK 表头解码出正确中文', r.gbk.head === '名称,金额,币种',
      'head=' + JSON.stringify(r.gbk.head));
    log('AC20', 'GBK CSV 导入成功且字段正确',
      r.gbk.added === 1 && r.gbk.firstName === 'GBK20' && r.gbk.firstPrice === 10 && r.gbk.firstCur === 'CNY',
      JSON.stringify(r.gbk));
    log('AC20', 'ASCII/UTF-8 不被误判为 GBK', r.asciiEncoding === 'utf-8', 'encoding=' + r.asciiEncoding);
    await ctx.close();
  }

  /* ============ AC21 CSV 不补历史付款（设计如此，需在 UI 说明） ============ */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      const before = S.db.payments.length;
      S.importCSV('名称,金额,币种,周期,下次扣费\n无历史订阅,10,CNY,每月,2026-12-01');
      return { before, after: S.db.payments.length, subs: S.db.subs.length };
    });
    log('AC21', 'CSV 导入只建订阅、不生成付款记录',
      r.subs === 1 && r.after === r.before, JSON.stringify(r));

    // UI 上必须有这条说明
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (await page.locator('#modalRoot').isVisible()) {
      await page.click('#modalFoot .btn-ghost');
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => { location.hash = '#settings'; });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.set-row button')];
      const b = btns.find(x => x.textContent.trim() === '导入' && x.closest('.set-row').textContent.includes('CSV'));
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    const noteText = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('#modalBody p')].map(p => p.textContent);
      return ps.find(t => t.includes('不会补生成')) || null;
    });
    log('AC21', '导入弹窗说明「不补历史付款」', !!noteText, noteText);
    await page.screenshot({ path: path.join(OUT, 'opt2-csv-modal.png') });
    await ctx.close();
  }

  /* ============ AC19 手机端记录页不溢出 ============ */  {
    const { ctx, page } = await fresh({ width: 375, height: 812 });
    await page.evaluate(() => {
      const S = window.Store;
      S.reset();
      S.seedDemo();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (await page.locator('#modalRoot').isVisible()) {
      await page.evaluate(() => document.getElementById('modalRoot').hidden = true);
    }
    await page.evaluate(() => { location.hash = '#records'; });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rows: document.querySelectorAll('.pay-timeline-row').length,
      title: document.getElementById('viewTitle').textContent,
    }));
    log('AC19', '手机端记录页无横向溢出', r.overflow <= 0 && r.rows > 0, JSON.stringify(r));
    await page.screenshot({ path: path.join(OUT, 'opt2-records-mobile.png'), fullPage: true });
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

  fs.writeFileSync(path.join(OUT, 'report-opt2.json'),
    JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
