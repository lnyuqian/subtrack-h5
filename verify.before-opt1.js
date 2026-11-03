/* 实测脚本：手机 375 / 平板 768 / 桌面 1440，检查渲染、交互与控制台错误 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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

  async function newPage(viewport, theme) {
    const ctx = await browser.newContext({
      viewport,
      colorScheme: theme || 'light',
      deviceScaleFactor: 2,
      locale: 'zh-CN',
    });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
    page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
    return { ctx, page };
  }

  /* ============ 桌面 1440 ============ */
  {
    const { ctx, page } = await newPage({ width: 1440, height: 960 });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);

    const emptyVisible = await page.locator('#dashboardBody .empty').count();
    log('桌面 · 空态引导出现', emptyVisible > 0, 'empty blocks=' + emptyVisible);

    await page.evaluate(() => { window.Store.seedDemo(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const cards = await page.locator('#dashboardBody .sub-card').count();
    log('桌面 · 订阅卡片渲染', cards > 0, 'cards=' + cards);

    const sideM = await page.locator('#sideMonthly').textContent();
    const sideY = await page.locator('#sideYearly').textContent();
    log('桌面 · 侧栏折算非空', /\d/.test(sideM) && /\d/.test(sideY), 'monthly=' + sideM + ' yearly=' + sideY);

    const sidebarVisible = await page.locator('.sidebar').isVisible();
    log('桌面 · 侧栏常驻可见', sidebarVisible);

    const tabbarDisplay = await page.locator('.tabbar').evaluate(el => getComputedStyle(el).display);
    log('桌面 · 底部 Tab 隐藏', tabbarDisplay === 'none', 'display=' + tabbarDisplay);

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log('桌面 · 无横向溢出', overflowX <= 0, 'delta=' + overflowX);

    const kpis = await page.locator('.kpi').count();
    log('桌面 · KPI 卡片 4 个', kpis === 4, 'kpis=' + kpis);

    await page.screenshot({ path: path.join(OUT, 'desktop-dashboard.png'), fullPage: true });

    await page.click('.nav-item[data-view="subs"]');
    await page.waitForTimeout(300);
    const gridCols = await page.locator('#subsBody .subs-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
    const colCount = gridCols.split(' ').length;
    log('桌面 · 订阅页多列网格', colCount >= 3, 'cols=' + colCount + ' :: ' + gridCols);
    await page.screenshot({ path: path.join(OUT, 'desktop-subs.png'), fullPage: true });

    await page.fill('#searchInput', 'Netflix');
    await page.waitForTimeout(350);
    const searched = await page.locator('#subsBody .sub-card').count();
    log('桌面 · 搜索过滤', searched === 1, 'cards=' + searched);
    await page.fill('#searchInput', '');
    await page.waitForTimeout(350);

    const chipCount = await page.locator('.chip').count();
    log('桌面 · 分类筛选 chips', chipCount > 1, 'chips=' + chipCount);

    await page.click('.nav-item[data-view="calendar"]');
    await page.waitForTimeout(300);
    const cells = await page.locator('.cal-cell').count();
    const events = await page.locator('.cal-ev').count();
    log('桌面 · 日历渲染', cells >= 35 && events > 0, 'cells=' + cells + ' events=' + events);
    await page.screenshot({ path: path.join(OUT, 'desktop-calendar.png'), fullPage: true });

    await page.click('.nav-item[data-view="stats"]');
    await page.waitForTimeout(300);
    const bars = await page.locator('.chart-svg rect').count();
    log('桌面 · 统计柱状图 12 根', bars === 12, 'bars=' + bars);
    await page.screenshot({ path: path.join(OUT, 'desktop-stats.png'), fullPage: true });

    await page.click('.nav-item[data-view="settings"]');
    await page.waitForTimeout(300);
    const setRows = await page.locator('.set-row').count();
    log('桌面 · 设置页', setRows >= 8, 'rows=' + setRows);
    await page.screenshot({ path: path.join(OUT, 'desktop-settings.png'), fullPage: true });

    await page.click('#btnAdd');
    await page.waitForTimeout(350);
    const modalVisible = await page.locator('#modalRoot').isVisible();
    log('桌面 · 新增弹窗打开', modalVisible);

    await page.fill('input[name="name"]', '测试订阅A');
    await page.fill('input[name="price"]', '99');
    await page.click('#modalFoot .btn-primary');
    await page.waitForTimeout(450);
    const modalClosed = !(await page.locator('#modalRoot').isVisible());
    const added = await page.evaluate(() => window.Store.db.subs.some(s => s.name === '测试订阅A'));
    log('桌面 · 新增并保存', modalClosed && added, 'closed=' + modalClosed + ' inStore=' + added);

    await page.click('.nav-item[data-view="subs"]');
    await page.waitForTimeout(300);
    await page.locator('#subsBody .sub-card').first().click();
    await page.waitForTimeout(350);
    const editTitle = await page.locator('#modalTitle').textContent();
    log('桌面 · 点击卡片打开编辑', editTitle.includes('编辑'), 'title=' + editTitle);

    const before = await page.evaluate(() => window.Store.db.payments.length);
    await page.click('#modalBody .btn-ghost.btn-sm');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.Store.db.payments.length);
    log('桌面 · 标记本期已付记一笔', after === before + 1, before + ' -> ' + after);

    await page.evaluate(() => window.Store.updateSettings({ theme: 'dark' }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(350);
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    log('桌面 · 深色模式生效', themeAttr === 'dark', 'theme=' + themeAttr + ' bg=' + bg);
    await page.screenshot({ path: path.join(OUT, 'desktop-dark.png'), fullPage: true });

    const icsOk = await page.evaluate(() => {
      const subs = window.Store.db.subs.filter(s => s.status !== 'cancelled');
      const txt = window.ICS.build(subs, window.Store.db.settings);
      return {
        hasHeader: txt.startsWith('BEGIN:VCALENDAR'),
        hasEnd: txt.trim().endsWith('END:VCALENDAR'),
        events: (txt.match(/BEGIN:VEVENT/g) || []).length,
        alarms: (txt.match(/BEGIN:VALARM/g) || []).length,
        hasRRule: /RRULE:FREQ=/.test(txt),
        hasCrlf: txt.indexOf('\r\n') >= 0,
      };
    });
    log('导出 · iCal 结构正确',
      icsOk.hasHeader && icsOk.hasEnd && icsOk.events > 0 && icsOk.hasRRule &&
      icsOk.alarms > 0 && icsOk.hasCrlf,
      JSON.stringify(icsOk));

    const calc = await page.evaluate(() => {
      const s = window.Store.db.subs.find(x => x.name === 'Netflix');
      const settings = window.Store.db.settings;
      settings.currency = 'CNY';
      const monthly = window.Store.monthlyBase(s, settings);
      return {
        price: s.price, cur: s.currency,
        monthly: Math.round(monthly * 100) / 100,
        expect: Math.round(15.49 * 7.1 * 100) / 100
      };
    });
    log('计算 · USD→CNY 月费折算', Math.abs(calc.monthly - calc.expect) < 0.02, JSON.stringify(calc));

    const yearCalc = await page.evaluate(() => {
      const s = window.Store.db.subs.find(x => x.name === 'B站大会员');
      const settings = window.Store.db.settings;
      return {
        m: Math.round(window.Store.monthlyBase(s, settings) * 100) / 100,
        expect: Math.round(148 / 12 * 100) / 100
      };
    });
    log('计算 · 年付折算月费', Math.abs(yearCalc.m - yearCalc.expect) < 0.02, JSON.stringify(yearCalc));

    await ctx.close();
  }

  /* ============ 手机 375 ============ */
  {
    const { ctx, page } = await newPage({ width: 375, height: 812 }, 'light');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      localStorage.clear();
      window.Store.reset();
      window.Store.seedDemo();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const sidebarTransform = await page.locator('.sidebar').evaluate(el => getComputedStyle(el).transform);
    log('手机 · 侧栏收起为抽屉', sidebarTransform !== 'none' && /-/.test(sidebarTransform), 'transform=' + sidebarTransform);

    const tabbarDisplay = await page.locator('.tabbar').evaluate(el => getComputedStyle(el).display);
    log('手机 · 底部 Tab 出现', tabbarDisplay === 'grid', 'display=' + tabbarDisplay);

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log('手机 · 无横向溢出', overflowX <= 0, 'delta=' + overflowX);

    const smallTargets = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.icon-btn, .btn, .tab-item, .chip')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 30 || r.width < 30);
      });
      return els.slice(0, 5).map(e => e.className + ':' +
        Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
    });
    log('手机 · 触控目标 >=30px', smallTargets.length === 0, smallTargets.join(' | ') || 'all ok');

    await page.screenshot({ path: path.join(OUT, 'mobile-dashboard.png'), fullPage: true });

    await page.click('.tab-item[data-view="subs"]');
    await page.waitForTimeout(350);
    const cols = await page.locator('#subsBody .subs-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
    const n = cols.split(' ').length;
    log('手机 · 订阅页双列', n === 2, 'cols=' + n + ' :: ' + cols);
    await page.screenshot({ path: path.join(OUT, 'mobile-subs.png'), fullPage: true });

    await page.click('#openNav');
    await page.waitForTimeout(350);
    const navOpen = await page.locator('#app').evaluate(el => el.classList.contains('nav-open'));
    log('手机 · 侧栏抽屉可展开', navOpen);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.click('#tabAdd');
    await page.waitForTimeout(450);
    const modalBox = await page.locator('.modal').boundingBox();
    const vh = page.viewportSize().height;
    const sheet = modalBox && Math.abs(modalBox.y + modalBox.height - vh) < 3;
    log('手机 · 弹窗底部贴边', !!sheet, JSON.stringify(modalBox) + ' vh=' + vh);
    await page.screenshot({ path: path.join(OUT, 'mobile-form.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.click('.tab-item[data-view="calendar"]');
    await page.waitForTimeout(350);
    const calOverflow = await page.evaluate(() => {
      const g = document.querySelector('.cal-grid');
      return g ? g.scrollWidth - g.clientWidth : -1;
    });
    log('手机 · 日历不溢出', calOverflow <= 1, 'delta=' + calOverflow);
    await page.screenshot({ path: path.join(OUT, 'mobile-calendar.png'), fullPage: true });

    await page.click('.tab-item[data-view="stats"]');
    await page.waitForTimeout(350);
    const statOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log('手机 · 统计页不溢出', statOverflow <= 0, 'delta=' + statOverflow);
    await page.screenshot({ path: path.join(OUT, 'mobile-stats.png'), fullPage: true });

    await page.click('#btnBell');
    await page.waitForTimeout(350);
    const drawerVisible = await page.locator('#drawerRoot').isVisible();
    const remItems = await page.locator('.rem-item').count();
    log('手机 · 提醒抽屉', drawerVisible && remItems > 0, 'visible=' + drawerVisible + ' items=' + remItems);
    await page.screenshot({ path: path.join(OUT, 'mobile-reminders.png') });

    await ctx.close();
  }

  /* ============ 手机深色 ============ */
  {
    const { ctx, page } = await newPage({ width: 390, height: 844 }, 'dark');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    log('手机深色 · auto 跟随系统', theme === 'dark', 'theme=' + theme);

    const hiddens = await page.evaluate(() => {
      const banner = document.getElementById('alertBanner');
      const badge = document.getElementById('bellBadge');
      return {
        banner: getComputedStyle(banner).display,
        bannerH: Math.round(banner.getBoundingClientRect().height),
        badge: getComputedStyle(badge).display,
      };
    });
    log('隐藏元素不占位（hidden 生效）',
      hiddens.banner === 'none' && hiddens.bannerH === 0 && hiddens.badge === 'none',
      JSON.stringify(hiddens));

    await page.screenshot({ path: path.join(OUT, 'mobile-dark.png'), fullPage: true });
    await ctx.close();
  }

  /* ============ 平板 768 ============ */
  {
    const { ctx, page } = await newPage({ width: 768, height: 1024 }, 'light');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log('平板 768 · 无横向溢出', overflowX <= 0, 'delta=' + overflowX);
    await page.screenshot({ path: path.join(OUT, 'tablet-dashboard.png'), fullPage: true });
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

  fs.writeFileSync('shots/report.json', JSON.stringify({ results, errors: [...new Set(errors)] }, null, 2));
  process.exit(failed.length || errors.length ? 1 : 0);
})();
