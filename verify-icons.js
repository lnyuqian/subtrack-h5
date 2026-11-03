/* ==========================================================================
   verify-icons.js · 自定义订阅图标（AC22–AC28）
   主题：无图标的订阅按名称首字生成通用图标
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

  /* ===== AC22 取首字：中文一字符 / 英文首字母大写 ===== */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const U = window.U;
      const cases = [
        ['迅雷会员', '迅'], ['公司食堂卡', '公'], ['小红书会员', '小'],
        ['得到APP', '得'], ['微信读书', '微'], ['淘宝88VIP', '淘'],
        ['netflix', 'N'], ['Zoom Pro', 'Z'], ['abc', 'A'],
        ['hbo', 'H'], ['1Password', '1'], [' 折价 商品 ', '折'],
      ];
      return cases.map(([input, expect]) => ({
        input, expect, got: U.initial(input), ok: U.initial(input) === expect
      }));
    });
    const bad = r.filter(x => !x.ok);
    log('AC22', '中文取首字、英文取首字母大写', bad.length === 0,
      bad.length ? JSON.stringify(bad) : `${r.length}/${r.length} 全部正确`);

    // 边界：空名、纯符号、单字、emoji
    const edge = await page.evaluate(() => {
      const U = window.U;
      return {
        empty: U.initial(''),
        nullish: U.initial(null),
        symbol: U.initial('!!!'),
        single: U.initial('A'),
        singleCjk: U.initial('云'),
        emoji: U.initial('🎬Netflix'),
        space: U.initial('   '),
      };
    });
    log('AC22', '边界输入不崩且不返回空白',
      edge.empty === '?' && edge.symbol === '!' && edge.single === 'A' && edge.space === '?',
      JSON.stringify(edge));
    await ctx.close();
  }

  /* ===== AC23 图标只显示 1 个字符（不再挤两个字） ===== */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      const S = window.Store, U = window.U;
      S.reset();
      const t = U.fmtDate(U.today());
      ['迅雷会员', '公司食堂卡', '得到APP', 'MyCustomSub', '小红书会员', 'Zoom Pro']
        .forEach(n => S.upsert({ name: n, price: 10, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (await page.locator('#modalRoot').isVisible()) await page.evaluate(() => document.getElementById('modalRoot').hidden = true);
    await page.evaluate(() => { location.hash = '#subs'; });
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => [...document.querySelectorAll('#subsBody .sc-avatar')].map(a => ({
      text: a.textContent,
      len: Array.from(a.textContent).length,
    })));
    log('AC23', '每个图标恰好 1 个字符', r.every(x => x.len === 1),
      JSON.stringify(r.map(x => x.text)));

    // 视觉不溢出：文字宽度不超过图标宽度
    const overflow = await page.evaluate(() => [...document.querySelectorAll('#subsBody .sc-avatar')].map(a => {
      const range = document.createRange();
      range.selectNodeContents(a);
      const tw = range.getBoundingClientRect().width;
      const aw = a.getBoundingClientRect().width;
      return { text: a.textContent, textW: Math.round(tw), avatarW: Math.round(aw), fits: tw <= aw };
    }));
    log('AC23', '字形不超出图标边界', overflow.every(x => x.fits),
      JSON.stringify(overflow.filter(x => !x.fits)) || 'all fit');
    await ctx.close();
  }

  /* ===== AC24 通用色板全部满足 WCAG AA（白字对比度 ≥ 4.5） ===== */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const U = window.U;
      // 取一大批名字，覆盖色板每个分支
      const names = [];
      for (let i = 0; i < 60; i++) names.push('订阅' + i);
      const seen = {};
      names.forEach(n => {
        const c = U.iconColor(n, '');
        seen[c] = (seen[c] || 0) + 1;
      });
      const rows = Object.keys(seen).map(c => ({
        color: c,
        contrast: Math.round(U.contrastOnWhite(c) * 100) / 100,
        hits: seen[c],
      }));
      return { distinct: rows.length, rows, min: Math.min(...rows.map(x => x.contrast)) };
    });
    log('AC24', '通用色对比度全部 ≥ 4.5', r.min >= 4.5,
      `distinct=${r.distinct} min=${r.min}`);
    log('AC24', '色板有多样性（≥8 种）', r.distinct >= 8, 'distinct=' + r.distinct);
    await ctx.close();
  }

  /* ===== AC25 已有颜色时忽略（不覆盖品牌色/手选色） ===== */
  {
    const { ctx, page } = await fresh();
    const r = await page.evaluate(() => {
      const U = window.U, S = window.Store;
      // 1) 品牌色（本身达标）应原样保留
      const netflix = U.iconColor('Netflix', '#E50914');
      // 2) 过亮的品牌色会被压暗，但色相不变
      const spotify = U.iconColor('Spotify', '#1DB954');
      // 3) 无颜色时用通用色
      const custom = U.iconColor('迅雷会员', '');
      // 4) 手选色
      const manual = U.iconColor('随便', '#3f5ae0');
      // 5) 3 位简写也能识别
      const short = U.iconColor('短色', '#f00');
      return {
        netflix, netflixKept: netflix === '#E50914',
        spotify, spotifyDarkened: spotify !== '#1DB954',
        spotifyContrast: Math.round(U.contrastOnWhite(spotify) * 100) / 100,
        custom, manualKept: manual === '#3f5ae0',
        short,
      };
    });
    log('AC25', '已达标的自带色原样保留', r.netflixKept === true, 'Netflix=' + r.netflix);
    log('AC25', '手选色原样保留', r.manualKept === true);
    log('AC25', '过亮品牌色被压暗且达到 4.5', r.spotifyDarkened && r.spotifyContrast >= 4.5,
      `Spotify ${r.spotify} contrast=${r.spotifyContrast}`);
    log('AC25', '无颜色时回退通用色', /^#[0-9a-f]{6}$/i.test(r.custom), r.custom);
    log('AC25', '支持 3 位简写色', /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r.short), r.short);
    await ctx.close();
  }

  /* ===== AC26 同一名称颜色稳定（刷新后不变） ===== */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      const S = window.Store, U = window.U;
      S.reset();
      const t = U.fmtDate(U.today());
      ['迅雷会员', '公司食堂卡', 'MyCustomSub'].forEach(n =>
        S.upsert({ name: n, price: 10, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (await page.locator('#modalRoot').isVisible()) await page.evaluate(() => document.getElementById('modalRoot').hidden = true);
    await page.evaluate(() => { location.hash = '#subs'; });
    await page.waitForTimeout(400);
    const first = await page.evaluate(() => [...document.querySelectorAll('#subsBody .sub-card')].map(c => ({
      n: c.querySelector('.sc-name').textContent,
      bg: getComputedStyle(c.querySelector('.sc-avatar')).backgroundColor,
    })));

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    if (await page.locator('#modalRoot').isVisible()) await page.evaluate(() => document.getElementById('modalRoot').hidden = true);
    await page.evaluate(() => { location.hash = '#subs'; });
    await page.waitForTimeout(400);
    const second = await page.evaluate(() => [...document.querySelectorAll('#subsBody .sub-card')].map(c => ({
      n: c.querySelector('.sc-name').textContent,
      bg: getComputedStyle(c.querySelector('.sc-avatar')).backgroundColor,
    })));

    const same = JSON.stringify(first) === JSON.stringify(second);
    log('AC26', '刷新后颜色不变（按名称哈希稳定）', same,
      same ? `${first.length} 条一致` : `first=${JSON.stringify(first)} second=${JSON.stringify(second)}`);
    await ctx.close();
  }

  /* ===== AC27 各视图都用同一套图标逻辑 ===== */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => {
      const S = window.Store, U = window.U;
      S.reset();
      const t = U.fmtDate(U.today());
      const s = S.upsert({ name: '迅雷会员', price: 30, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t });
      S.markPaid(s.id, t);
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (await page.locator('#modalRoot').isVisible()) await page.evaluate(() => document.getElementById('modalRoot').hidden = true);

    // 概览卡片
    await page.evaluate(() => { location.hash = '#dashboard'; });
    await page.waitForTimeout(400);
    const dash = await page.evaluate(() => {
      const a = document.querySelector('#dashboardBody .sc-avatar, #dashboardBody .avatar');
      return a ? { t: a.textContent, bg: getComputedStyle(a).backgroundColor } : null;
    });
    // 记录页时间轴
    await page.evaluate(() => { location.hash = '#records'; });
    await page.waitForTimeout(500);
    const rec = await page.evaluate(() => {
      const a = document.querySelector('.pt-avatar');
      return a ? { t: a.textContent, bg: getComputedStyle(a).backgroundColor } : null;
    });
    // 表单预览（桌面视口用顶栏按钮，手机用底部悬浮按钮）
    const addBtn = (await page.locator('#tabAdd').isVisible()) ? '#tabAdd' : '#btnAdd';
    await page.click(addBtn);
    await page.waitForTimeout(600);
    const form = await page.evaluate(() => {
      const nm = document.querySelector('input[name="name"]');
      nm.value = '迅雷会员';
      nm.dispatchEvent(new Event('input', { bubbles: true }));
      const pv = document.querySelector('.form-preview-avatar');
      return pv ? { t: pv.textContent, bg: getComputedStyle(pv).backgroundColor } : null;
    });

    const match = dash && rec && form &&
      dash.t === rec.t && rec.t === form.t && dash.bg === rec.bg && rec.bg === form.bg;
    log('AC27', '概览/记录/表单三处图标一致', !!match,
      JSON.stringify({ dash, rec, form }));
    await ctx.close();
  }

  /* ===== AC28 手机端图标尺寸与布局正常 ===== */
  {
    const { ctx, page } = await fresh({ width: 375, height: 812 });
    await page.evaluate(() => {
      const S = window.Store, U = window.U;
      S.reset();
      const t = U.fmtDate(U.today());
      ['迅雷会员', '公司食堂卡', 'Zoom Pro'].forEach(n =>
        S.upsert({ name: n, price: 10, currency: 'CNY', cycle: 'monthly', startDate: t, nextDue: t }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (await page.locator('#modalRoot').isVisible()) await page.evaluate(() => document.getElementById('modalRoot').hidden = true);
    await page.evaluate(() => { location.hash = '#subs'; });
    await page.waitForTimeout(500);

    const r = await page.evaluate(() => {
      const avs = [...document.querySelectorAll('#subsBody .sc-avatar')];
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        sizes: avs.map(a => {
          const rc = a.getBoundingClientRect();
          return { t: a.textContent, w: Math.round(rc.width), h: Math.round(rc.height),
                   fs: getComputedStyle(a).fontSize };
        }),
        allOneChar: avs.every(a => Array.from(a.textContent).length === 1),
      };
    });
    log('AC28', '手机端图标为正方形且不溢出', r.overflow <= 0 && r.sizes.every(s => s.w === s.h), JSON.stringify(r.sizes));
    log('AC28', '手机端仍是单字符', r.allOneChar === true);
    await page.screenshot({ path: path.join(OUT, 'fix-icons-mobile.png'), fullPage: true });
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

  fs.writeFileSync(path.join(OUT, 'report-icons.json'),
    JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
