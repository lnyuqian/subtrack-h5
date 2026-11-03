/* ==========================================================================
   store.js · 数据层（localStorage 持久化 + 业务计算）
   - 订阅 CRUD
   - 周期折算（月费 / 年费）
   - 下次扣费日推算与「自动续费滚动」
   - 到期提醒计算
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'subtrack.h5.v1';
  var P = global.Platforms;
  var U = global.U;

  var DEFAULT_SETTINGS = {
    currency: 'CNY',
    theme: 'auto',
    reminderDays: 7,          // 提前几天提醒
    weekStart: 1,             // 1=周一, 0=周日
    rates: null,              // 自定义汇率（null = 用内置）
    notifications: false,     // 浏览器通知开关
    compact: false            // 紧凑列表（预留）
  };

  var db = null;

  /* ---------------- 读写 ---------------- */
  function blank() {
    return { version: 1, settings: Object.assign({}, DEFAULT_SETTINGS), subs: [], payments: [] };
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { db = blank(); return db; }
    try {
      var parsed = JSON.parse(raw);
      db = normalize(parsed);
    } catch (e) {
      console.warn('[store] 数据损坏，已重置', e);
      db = blank();
    }
    return db;
  }

  function normalize(d) {
    var out = blank();
    if (!d || typeof d !== 'object') return out;
    if (d.settings && typeof d.settings === 'object') {
      out.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings);
    }
    if (Array.isArray(d.subs)) {
      out.subs = d.subs.filter(function (s) { return s && s.name; }).map(normalizeSub);
    }
    if (Array.isArray(d.payments)) out.payments = d.payments.filter(Boolean);
    return out;
  }

  function normalizeSub(s) {
    var o = Object.assign({}, s);
    o.id = o.id || U.uid('sub');
    o.name = String(o.name || '').trim() || '未命名订阅';
    o.category = P.CATEGORY_MAP[o.category] ? o.category : 'other';
    o.color = o.color || (P.PRESETS.find(function (p) { return p.name === o.name; }) || {}).color || U.autoColor(o.name);
    o.price = U.toNum(o.price);
    o.currency = P.CURRENCY_MAP[o.currency] ? o.currency : 'CNY';
    o.cycle = P.CYCLE_MAP[o.cycle] ? o.cycle : 'monthly';
    o.customMonths = Math.max(1, U.toNum(o.customMonths) || 1);
    o.startDate = U.fmtDate(o.startDate) || U.fmtDate(U.today());
    o.nextDue = U.fmtDate(o.nextDue) || o.startDate;
    o.status = ['active', 'paused', 'cancelled'].indexOf(o.status) >= 0 ? o.status : 'active';
    o.autoRenew = o.autoRenew !== false;
    o.payMethod = o.payMethod || '';
    o.url = o.url || '';
    o.note = o.note || '';
    o.remindDays = o.remindDays == null ? null : U.toNum(o.remindDays);
    o.createdAt = o.createdAt || new Date().toISOString();
    o.updatedAt = o.updatedAt || o.createdAt;
    return o;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('[store] 保存失败', e);
      throw e;
    }
    emit();
  }

  var listeners = [];
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
  function emit() { listeners.forEach(function (fn) { try { fn(db); } catch (e) { console.error(e); } }); }

  /* ---------------- 周期与金额 ---------------- */
  function cycleMonths(sub) {
    if (sub.cycle === 'custom') return Math.max(1, U.toNum(sub.customMonths) || 1);
    return P.cycle(sub.cycle).months;
  }

  function cycleLabel(sub) {
    if (sub.cycle === 'custom') return '每 ' + cycleMonths(sub) + ' 个月';
    return P.cycle(sub.cycle).name;
  }

  /** 单期价格 → 每月金额（原币种） */
  function monthlyCost(sub) {
    var m = cycleMonths(sub);
    return U.toNum(sub.price) / m;
  }

  function yearlyCost(sub) { return monthlyCost(sub) * 12; }

  /** 基准币种的每月金额 */
  function monthlyBase(sub, settings) {
    settings = settings || db.settings;
    return U.convert(monthlyCost(sub), sub.currency, settings.currency, settings.rates);
  }

  function yearlyBase(sub, settings) {
    return monthlyBase(sub, settings) * 12;
  }

  function fmtAmount(n, settings) {
    settings = settings || db.settings;
    return U.moneySmart(n);
  }

  function moneyLabel(n, settings) {
    settings = settings || db.settings;
    return U.currencySymbol(settings.currency) + U.moneySmart(n);
  }

  /* ---------------- 下次扣费 ---------------- */
  function nextDueDate(sub) { return U.parseDate(sub.nextDue) || U.parseDate(sub.startDate) || U.today(); }

  function daysUntilDue(sub) { return U.daysBetween(U.today(), nextDueDate(sub)); }

  /** 从某个日期推进一个周期 */
  function advance(d, sub) {
    if (sub.cycle === 'weekly') return U.addDays(d, 7);
    return U.addMonths(d, cycleMonths(sub));
  }

  /**
   * 自动续费滚动：把已经过期且开启了自动续费的订阅推到未来
   * 顺带补记付款历史（最多补 60 期，避免异常数据死循环）
   */
  function rollForward(settings) {
    var changed = 0;
    var today = U.today();
    db.subs.forEach(function (sub) {
      if (sub.status !== 'active') return;
      var due = U.parseDate(sub.nextDue);
      if (!due) return;
      var guard = 0;
      while (due < today && guard < 60) {
        if (sub.autoRenew) {
          db.payments.push({
            id: U.uid('pay'),
            subId: sub.id,
            date: U.fmtDate(due),
            amount: sub.price,
            currency: sub.currency,
            auto: true
          });
        }
        due = advance(due, sub);
        guard++;
        changed++;
      }
      if (guard > 0) {
        sub.nextDue = U.fmtDate(due);
        sub.updatedAt = new Date().toISOString();
      }
    });
    if (changed) save();
    return changed;
  }

  /* ---------------- CRUD ---------------- */
  function list(filter) {
    var arr = db.subs.slice();
    filter = filter || {};
    if (filter.status && filter.status !== 'all') {
      arr = arr.filter(function (s) { return s.status === filter.status; });
    }
    if (filter.category && filter.category !== 'all') {
      arr = arr.filter(function (s) { return s.category === filter.category; });
    }
    if (filter.q) {
      var q = filter.q.toLowerCase();
      arr = arr.filter(function (s) {
        return (s.name + ' ' + (s.note || '') + ' ' + (s.payMethod || '')).toLowerCase().indexOf(q) >= 0;
      });
    }
    return arr;
  }

  function sortList(arr, mode) {
    var s = arr.slice();
    switch (mode) {
      case 'monthlyDesc': s.sort(function (a, b) { return monthlyCost(b) - monthlyCost(a); }); break;
      case 'monthlyAsc': s.sort(function (a, b) { return monthlyCost(a) - monthlyCost(b); }); break;
      case 'name': s.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-CN'); }); break;
      case 'added': s.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }); break;
      default: s.sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return daysUntilDue(a) - daysUntilDue(b);
      });
    }
    return s;
  }

  function get(id) { return db.subs.find(function (s) { return s.id === id; }) || null; }

  function upsert(data) {
    var now = new Date().toISOString();
    if (data.id) {
      var idx = db.subs.findIndex(function (s) { return s.id === data.id; });
      if (idx < 0) throw new Error('订阅不存在');
      var merged = normalizeSub(Object.assign({}, db.subs[idx], data, { updatedAt: now }));
      db.subs[idx] = merged;
      save();
      return merged;
    }
    var created = normalizeSub(Object.assign({}, data, { id: U.uid('sub'), createdAt: now, updatedAt: now }));
    db.subs.push(created);
    save();
    return created;
  }

  function remove(id) {
    db.subs = db.subs.filter(function (s) { return s.id !== id; });
    db.payments = db.payments.filter(function (p) { return p.subId !== id; });
    save();
  }

  function setStatus(id, status) {
    var s = get(id);
    if (!s) return;
    s.status = status;
    s.updatedAt = new Date().toISOString();
    save();
  }

  /** 标记本期已付：记一笔付款并把下次扣费推到下一期 */
  function markPaid(id, dateOverride) {
    var s = get(id);
    if (!s) return;
    var payDate = U.parseDate(dateOverride) || U.parseDate(s.nextDue) || U.today();
    db.payments.push({
      id: U.uid('pay'),
      subId: s.id,
      date: U.fmtDate(payDate),
      amount: s.price,
      currency: s.currency,
      auto: false
    });
    s.nextDue = U.fmtDate(advance(payDate, s));
    s.updatedAt = new Date().toISOString();
    save();
  }

  function paymentsOf(subId) {
    return db.payments.filter(function (p) { return p.subId === subId; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  /* ---------------- 汇总 ---------------- */
  function summary(settings) {
    settings = settings || db.settings;
    var active = db.subs.filter(function (s) { return s.status === 'active'; });
    var monthly = 0, yearly = 0;
    active.forEach(function (s) { monthly += monthlyBase(s, settings); yearly += yearlyBase(s, settings); });
    var counts = { active: 0, paused: 0, cancelled: 0, total: db.subs.length };
    db.subs.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
    return {
      monthly: monthly,
      yearly: yearly,
      daily: monthly / 30.44,
      counts: counts,
      avg: active.length ? monthly / active.length : 0,
      byCategory: byCategory(settings),
      upcoming: upcoming(settings)
    };
  }

  function byCategory(settings) {
    settings = settings || db.settings;
    var map = {};
    db.subs.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = s.category;
      if (!map[k]) map[k] = { id: k, name: P.cat(k).name, color: P.cat(k).color, amount: 0, count: 0 };
      map[k].amount += monthlyBase(s, settings);
      map[k].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  /** 提醒窗口内的订阅 */
  function upcoming(settings, days) {
    settings = settings || db.settings;
    var win = days == null ? (settings.reminderDays || 7) : days;
    return db.subs
      .filter(function (s) { return s.status === 'active'; })
      .map(function (s) { return { sub: s, days: daysUntilDue(s) }; })
      .filter(function (x) { return x.days <= win; })
      .sort(function (a, b) { return a.days - b.days; });
  }

  /** 某月内所有扣费日（日历用） */
  function dueInRange(start, end) {
    var out = [];
    var s0 = U.startOfDay(start), e0 = U.startOfDay(end);
    db.subs.forEach(function (sub) {
      if (sub.status === 'cancelled') return;
      var due = nextDueDate(sub);
      var guard = 0;
      // 向前回退到区间之前，再向后收集
      while (due > s0 && guard < 400) {
        var prev = sub.cycle === 'weekly' ? U.addDays(due, -7) : U.addMonths(due, -cycleMonths(sub));
        if (prev < s0) break;
        due = prev; guard++;
      }
      guard = 0;
      while (due <= e0 && guard < 400) {
        if (due >= s0) out.push({ date: new Date(due), sub: sub });
        due = advance(due, sub);
        guard++;
      }
    });
    return out.sort(function (a, b) { return a.date - b.date; });
  }

  /** 未来 12 个月的月度支出预测 */
  function forecast(settings, months) {
    settings = settings || db.settings;
    months = months || 12;
    var out = [];
    var base = U.monthStart(U.today());
    for (var i = 0; i < months; i++) {
      var mStart = U.addMonths(base, i);
      var mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
      var items = dueInRange(mStart, mEnd).filter(function (x) { return x.sub.status === 'active'; });
      var total = items.reduce(function (acc, x) {
        return acc + U.convert(x.sub.price, x.sub.currency, settings.currency, settings.rates);
      }, 0);
      out.push({
        label: (mStart.getMonth() + 1) + '月',
        date: mStart,
        total: total,
        count: items.length
      });
    }
    return out;
  }

  /** 年付 vs 月付占比 */
  function cycleSplit(settings) {
    settings = settings || db.settings;
    var g = { monthly: 0, quarterly: 0, yearly: 0, weekly: 0, custom: 0 };
    db.subs.filter(function (s) { return s.status === 'active'; }).forEach(function (s) {
      var k = s.cycle === 'custom' ? 'custom' : s.cycle;
      g[k] = (g[k] || 0) + monthlyBase(s, settings);
    });
    return g;
  }

  /* ---------------- 设置 ---------------- */
  function updateSettings(patch) {
    db.settings = Object.assign({}, db.settings, patch);
    save();
    return db.settings;
  }

  /* ---------------- 导入导出 ---------------- */
  function exportJSON() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: db.settings, subs: db.subs, payments: db.payments }, null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
    var incoming = Array.isArray(data.subs) ? data.subs : (Array.isArray(data) ? data : null);
    if (!incoming) throw new Error('没有找到订阅数据');
    var added = 0, merged = 0;
    incoming.forEach(function (raw) {
      var s = normalizeSub(raw);
      var dup = db.subs.find(function (x) { return x.name === s.name && x.startDate === s.startDate; });
      if (dup) {
        Object.assign(dup, s, { id: dup.id, updatedAt: new Date().toISOString() });
        merged++;
      } else {
        s.id = U.uid('sub');
        db.subs.push(s);
        added++;
      }
    });
    if (data.settings) db.settings = Object.assign({}, db.settings, data.settings);
    save();
    return { added: added, merged: merged };
  }

  function reset() {
    db = blank();
    save();
  }

  /** 载入示例数据（首次使用引导） */
  function seedDemo() {
    var t = U.today();
    var demo = [
      { name: 'Netflix', cat: 'video', color: '#E50914', price: 15.49, currency: 'USD', cycle: 'monthly', offset: 3, payMethod: '信用卡' },
      { name: 'Spotify', cat: 'music', color: '#1DB954', price: 10.99, currency: 'USD', cycle: 'monthly', offset: 8, payMethod: '信用卡' },
      { name: 'ChatGPT Plus', cat: 'ai', color: '#10A37F', price: 20, currency: 'USD', cycle: 'monthly', offset: 12, payMethod: '信用卡' },
      { name: 'iCloud+', cat: 'cloud', color: '#3693F3', price: 3, currency: 'CNY', cycle: 'monthly', offset: 5, payMethod: 'Apple Pay' },
      { name: '腾讯视频', cat: 'video', color: '#FF6022', price: 25, currency: 'CNY', cycle: 'monthly', offset: 19, payMethod: '微信支付' },
      { name: 'B站大会员', cat: 'video', color: '#FB7299', price: 148, currency: 'CNY', cycle: 'yearly', offset: -40, payMethod: '支付宝' },
      { name: 'GitHub Copilot', cat: 'dev', color: '#24292F', price: 100, currency: 'CNY', cycle: 'monthly', offset: 22, payMethod: '支付宝' },
      { name: '京东PLUS', cat: 'life', color: '#E1251B', price: 149, currency: 'CNY', cycle: 'yearly', offset: 96, payMethod: '微信支付' },
      { name: '网易云音乐', cat: 'music', color: '#C20C0C', price: 15, currency: 'CNY', cycle: 'monthly', offset: 1, payMethod: '支付宝' },
      { name: 'Keep 会员', cat: 'fitness', color: '#00D8A0', price: 25, currency: 'CNY', cycle: 'monthly', offset: 60, status: 'paused', payMethod: '微信支付' }
    ];
    demo.forEach(function (d) {
      var due = U.addDays(t, d.offset);
      db.subs.push(normalizeSub({
        name: d.name,
        category: d.cat,
        color: d.color,
        price: d.price,
        currency: d.currency,
        cycle: d.cycle,
        startDate: U.fmtDate(U.addMonths(due, -1)),
        nextDue: U.fmtDate(due),
        status: d.status || 'active',
        payMethod: d.payMethod,
        autoRenew: true,
        remindDays: null,
        note: ''
      }));
    });
    save();
  }

  global.Store = {
    get db() { return db; },
    load: load,
    save: save,
    subscribe: subscribe,
    list: list,
    sortList: sortList,
    get: get,
    upsert: upsert,
    remove: remove,
    setStatus: setStatus,
    markPaid: markPaid,
    paymentsOf: paymentsOf,
    summary: summary,
    byCategory: byCategory,
    upcoming: upcoming,
    dueInRange: dueInRange,
    forecast: forecast,
    cycleSplit: cycleSplit,
    nextDueDate: nextDueDate,
    daysUntilDue: daysUntilDue,
    cycleMonths: cycleMonths,
    cycleLabel: cycleLabel,
    monthlyCost: monthlyCost,
    yearlyCost: yearlyCost,
    monthlyBase: monthlyBase,
    yearlyBase: yearlyBase,
    moneyLabel: moneyLabel,
    rollForward: rollForward,
    updateSettings: updateSettings,
    exportJSON: exportJSON,
    importJSON: importJSON,
    reset: reset,
    seedDemo: seedDemo,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS
  };
})(window);
