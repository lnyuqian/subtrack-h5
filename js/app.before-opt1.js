/* ==========================================================================
   app.js · 控制器（路由 / 事件 / 主题 / 提醒 / 导入导出）
   ========================================================================== */
(function (global) {
  'use strict';

  var U = global.U, S = global.Store, UI = global.UI, P = global.Platforms;
  var $ = U.$, $$ = U.$$;

  var state = {
    view: 'dashboard',
    category: 'all',
    q: '',
    sort: 'next',
    calCursor: U.today(),
    editingId: null
  };

  var VIEW_META = {
    dashboard: { title: '概览', sub: '今天需要留意的订阅' },
    subs: { title: '订阅', sub: '管理全部订阅与周期' },
    calendar: { title: '日历', sub: '按日期查看扣费安排' },
    stats: { title: '统计', sub: '支出构成与未来预测' },
    settings: { title: '设置', sub: '偏好、提醒与数据' }
  };

  /* ======================= 主题 ======================= */
  var mediaDark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function effectiveTheme() {
    var t = S.db.settings.theme || 'auto';
    if (t === 'auto') return mediaDark && mediaDark.matches ? 'dark' : 'light';
    return t;
  }

  function applyTheme() {
    var t = effectiveTheme();
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0b0f16' : '#f4f6fa');
    var label = $('#sidebarThemeLabel');
    if (label) label.textContent = t === 'dark' ? '浅色模式' : '深色模式';
    var btn = $('#sidebarTheme');
    if (btn) {
      btn.innerHTML = '';
      btn.appendChild(U.icon(t === 'dark' ? 'sun' : 'moon'));
      btn.appendChild(U.el('span', { id: 'sidebarThemeLabel', text: t === 'dark' ? '浅色模式' : '深色模式' }));
    }
  }

  function toggleTheme() {
    var cur = effectiveTheme();
    ctx.updateSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
  }

  if (mediaDark) {
    var onScheme = function () {
      if ((S.db.settings.theme || 'auto') === 'auto') applyTheme();
    };
    if (mediaDark.addEventListener) mediaDark.addEventListener('change', onScheme);
    else if (mediaDark.addListener) mediaDark.addListener(onScheme);
  }

  /* ======================= Toast ======================= */
  var toastTimer = null;
  function toast(msg, kind) {
    var wrap = $('#toastWrap');
    var node = U.el('div', { class: 'toast ' + (kind || '') });
    node.appendChild(U.icon(kind === 'err' ? 'circleAlert' : 'check'));
    node.appendChild(U.el('span', { text: msg }));
    wrap.appendChild(node);
    setTimeout(function () {
      node.style.transition = 'opacity .2s, transform .2s';
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      setTimeout(function () { node.remove(); }, 220);
    }, 2400);
  }

  /* ======================= 路由 ======================= */
  function go(view) {
    if (!VIEW_META[view]) view = 'dashboard';
    state.view = view;
    closeNav();

    $$('.view').forEach(function (v) { v.hidden = v.dataset.view !== view; });
    $$('.nav-item, .tab-item').forEach(function (a) {
      a.classList.toggle('active', a.dataset.view === view);
    });

    var meta = VIEW_META[view];
    $('#viewTitle').textContent = meta.title;
    $('#viewSubtitle').textContent = meta.sub;

    if (location.hash !== '#' + view) {
      history.replaceState(null, '', '#' + view);
    }
    render();
    // 滚回顶部（仅主文档滚动）
    var main = document.querySelector('.main');
    if (main && main.scrollTop) main.scrollTop = 0;
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  function render() {
    var settings = S.db.settings;
    switch (state.view) {
      case 'dashboard':
        UI.renderDashboard($('#dashboardBody'), ctx);
        break;
      case 'subs':
        UI.renderChips($('#catChips'), ctx, state);
        UI.renderSubs($('#subsBody'), ctx, state);
        break;
      case 'calendar':
        UI.renderCalendar($('#calendarBody'), ctx, state);
        break;
      case 'stats':
        UI.renderStats($('#statsBody'), ctx);
        break;
      case 'settings':
        UI.renderSettings($('#settingsBody'), ctx);
        break;
    }
    updateChrome(settings);
  }

  /** 侧栏 / 顶栏上的数字 */
  function updateChrome(settings) {
    settings = settings || S.db.settings;
    var sum = S.summary(settings);
    var n = sum.counts.active;

    var c = $('#navCountSubs');
    if (c) c.textContent = String(n);

    var sideM = $('#sideMonthly');
    var sideY = $('#sideYearly');
    if (sideM) sideM.textContent = U.currencySymbol(settings.currency) + U.moneySmart(sum.monthly);
    if (sideY) sideY.textContent = U.currencySymbol(settings.currency) + U.moneySmart(sum.yearly);

    var due = S.upcoming(settings, settings.reminderDays || 7);
    var badge = $('#bellBadge');
    if (badge) {
      badge.textContent = String(due.length);
      badge.hidden = due.length === 0;
    }
    document.title = (due.length ? '(' + due.length + ') ' : '') + '订阅管家 · 跨平台订阅付费管理';

    // 提醒条（概览页）
    if (state.view === 'dashboard') {
      var banner = $('#alertBanner');
      if (banner && !due.length) banner.hidden = true;
    }
  }

  /* ======================= 移动端导航 ======================= */
  function openNav() { $('#app').classList.add('nav-open'); }
  function closeNav() { $('#app').classList.remove('nav-open'); }

  /* ======================= 弹窗 ======================= */
  var modalCleanup = null;

  function openModal(title, body, footer, opts) {
    opts = opts || {};
    var root = $('#modalRoot');
    $('#modalTitle').textContent = title;
    var bodyEl = $('#modalBody');
    var footEl = $('#modalFoot');
    bodyEl.innerHTML = '';
    footEl.innerHTML = '';
    if (body) bodyEl.appendChild(body);
    (footer || []).forEach(function (b) { footEl.appendChild(b); });
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    modalCleanup = opts.onClose || null;
    // 焦点
    setTimeout(function () {
      var f = bodyEl.querySelector('input, select, textarea, button');
      if (f) f.focus({ preventScroll: true });
    }, 80);
  }

  function closeModal() {
    var root = $('#modalRoot');
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.style.overflow = '';
    if (modalCleanup) { try { modalCleanup(); } catch (e) {} modalCleanup = null; }
  }

  function openReminders() {
    var root = $('#drawerRoot');
    UI.renderReminders($('#drawerBody'), ctx);
    root.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    var root = $('#drawerRoot');
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.style.overflow = '';
  }

  /* ======================= 订阅表单 ======================= */
  function openAdd() {
    var built = UI.buildForm(null, ctx);
    state.editingId = null;

    var cancel = U.el('button', {
      class: 'btn btn-ghost', type: 'button', onclick: closeModal
    }, [U.el('span', { text: '取消' })]);

    var save = U.el('button', {
      class: 'btn btn-primary', type: 'button'
    }, [U.icon('check'), U.el('span', { text: '保存' })]);

    save.addEventListener('click', function () {
      var data = built.read();
      if (!data.name) { toast('请填写订阅名称', 'err'); built.form.querySelector('input[name="name"]').focus(); return; }
      if (!(data.price >= 0)) { toast('请填写金额', 'err'); return; }
      S.upsert(data);
      closeModal();
      toast('已新增「' + data.name + '」', 'ok');
      render();
    });

    built.form.addEventListener('submit', function (e) { e.preventDefault(); save.click(); });

    openModal('新增订阅', built.form, [cancel, save]);
    built.focus();
  }

  function openEdit(id) {
    var sub = S.get(id);
    if (!sub) return;
    state.editingId = id;
    var built = UI.buildForm(sub, ctx);

    var del = U.el('button', {
      class: 'btn btn-danger', type: 'button',
      onclick: function () { confirmDelete(sub); }
    }, [U.icon('trash'), U.el('span', { text: '删除' })]);

    var cancel = U.el('button', {
      class: 'btn btn-ghost', type: 'button', onclick: closeModal
    }, [U.el('span', { text: '取消' })]);

    var save = U.el('button', {
      class: 'btn btn-primary', type: 'button'
    }, [U.icon('check'), U.el('span', { text: '保存' })]);

    save.addEventListener('click', function () {
      var data = built.read();
      if (!data.name) { toast('请填写订阅名称', 'err'); return; }
      S.upsert(data);
      closeModal();
      toast('已保存修改', 'ok');
      render();
    });

    built.form.addEventListener('submit', function (e) { e.preventDefault(); save.click(); });

    openModal('编辑订阅', built.form, [del, cancel, save]);
    // 编辑时不自动聚焦，避免手机键盘立刻弹出挡住内容
  }

  function confirmDelete(sub) {
    var built = U.el('div', {}, [
      U.el('p', { style: 'font-size:14px;line-height:1.7;color:var(--text-2)' }, [
        document.createTextNode('确定删除「'),
        U.el('b', { style: 'color:var(--text)', text: sub.name }),
        document.createTextNode('」吗？相关付款记录也会一起删除，此操作不可撤销。')
      ])
    ]);

    var cancel = U.el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { openEdit(sub.id); } }, [U.el('span', { text: '再想想' })]);
    var ok = U.el('button', {
      class: 'btn btn-danger', type: 'button',
      onclick: function () {
        S.remove(sub.id);
        closeModal();
        toast('已删除', 'ok');
        render();
      }
    }, [U.icon('trash'), U.el('span', { text: '确认删除' })]);

    openModal('删除订阅', built, [cancel, ok]);
  }

  /* ======================= 提醒 ======================= */
  var notifiedKey = 'subtrack.notified.v1';

  function checkNotify() {
    var settings = S.db.settings;
    if (!settings.notifications) return;
    if (!('Notification' in global) || Notification.permission !== 'granted') return;

    var due = S.upcoming(settings, settings.reminderDays || 7);
    if (!due.length) return;

    var todayKey = U.fmtDate(U.today());
    var sent = {};
    try { sent = JSON.parse(localStorage.getItem(notifiedKey) || '{}'); } catch (e) { sent = {}; }
    if (sent[todayKey]) return; // 每天最多提醒一次

    var names = due.slice(0, 3).map(function (x) { return x.sub.name; }).join('、');
    var more = due.length > 3 ? ' 等 ' + due.length + ' 项' : '';
    try {
      new Notification('订阅提醒', {
        body: names + more + ' 即将扣费',
        tag: 'subtrack-daily',
        icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2216%22 fill=%22%234f6ef7%22/%3E%3C/svg%3E'
      });
      sent[todayKey] = true;
      localStorage.setItem(notifiedKey, JSON.stringify(sent));
    } catch (e) { /* 忽略 */ }
  }

  function testNotify() {
    if (!('Notification' in global)) { toast('当前浏览器不支持通知', 'err'); return; }
    if (Notification.permission !== 'granted') {
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { toast('已授权，再点一次即可发送', 'ok'); }
        else { toast('权限被拒绝，可在浏览器设置里放开', 'err'); }
      });
      return;
    }
    try {
      new Notification('订阅管家', { body: '这是一条测试通知，说明提醒已经可用。', tag: 'subtrack-test' });
      toast('已发送测试通知', 'ok');
    } catch (e) { toast('发送失败：' + e.message, 'err'); }
  }

  /* ======================= 导入导出 ======================= */
  function exportICS() {
    var subs = S.db.subs.filter(function (s) { return s.status !== 'cancelled'; });
    if (!subs.length) { toast('还没有可导出的订阅', 'err'); return; }
    var name = global.ICS.download(subs, S.db.settings);
    toast('已生成 ' + name, 'ok');
  }

  function exportJSON() {
    var name = '订阅管家备份-' + U.fmtDate(U.today()) + '.json';
    U.download(name, S.exportJSON(), 'application/json;charset=utf-8');
    toast('已导出备份', 'ok');
  }

  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var r = S.importJSON(String(reader.result));
          toast('导入完成：新增 ' + r.added + ' 条，更新 ' + r.merged + ' 条', 'ok');
          render();
        } catch (e) {
          toast('导入失败：' + e.message, 'err');
        }
      };
      reader.readAsText(f, 'utf-8');
    });
    input.click();
  }

  function resetAll() {
    var body = U.el('div', {}, [
      U.el('p', { style: 'font-size:14px;line-height:1.7;color:var(--text-2)' }, [
        document.createTextNode('这会删除本机保存的全部订阅与付款记录，且无法恢复。建议先导出备份。')
      ])
    ]);
    var cancel = U.el('button', { class: 'btn btn-ghost', type: 'button', onclick: closeModal }, [U.el('span', { text: '取消' })]);
    var ok = U.el('button', {
      class: 'btn btn-danger', type: 'button',
      onclick: function () {
        S.reset();
        closeModal();
        toast('已清空全部数据', 'ok');
        render();
      }
    }, [U.icon('trash'), U.el('span', { text: '确认清空' })]);
    openModal('清空全部数据', body, [cancel, ok]);
  }

  function seedDemo() {
    if (S.db.subs.length) {
      var body = U.el('p', { style: 'font-size:14px;line-height:1.7;color:var(--text-2)' , text: '当前已有 ' + S.db.subs.length + ' 条订阅。载入示例会追加 10 条演示数据，不影响已有内容。' });
      var cancel = U.el('button', { class: 'btn btn-ghost', type: 'button', onclick: closeModal }, [U.el('span', { text: '取消' })]);
      var ok = U.el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: function () { S.seedDemo(); closeModal(); toast('已载入示例数据', 'ok'); render(); }
      }, [U.el('span', { text: '继续载入' })]);
      openModal('载入示例数据', body, [cancel, ok]);
      return;
    }
    S.seedDemo();
    toast('已载入 10 条示例订阅', 'ok');
    render();
  }

  /* ======================= 提供给 UI 的 ctx ======================= */
  var ctx = {
    go: go,
    openAdd: openAdd,
    openEdit: openEdit,
    openReminders: openReminders,
    closeModal: closeModal,
    toast: toast,
    setCategory: function (id) { state.category = id; render(); },
    shiftMonth: function (delta) {
      if (delta === 0) state.calCursor = U.today();
      else state.calCursor = U.addMonths(state.calCursor, delta);
      render();
    },
    updateSettings: function (patch) {
      S.updateSettings(patch);
      applyTheme();
      render();
    },
    markPaid: function (id) {
      S.markPaid(id);
      toast('已记录付款，下次扣费已顺延', 'ok');
      render();
    },
    setStatus: function (id, st) {
      S.setStatus(id, st);
      toast(st === 'paused' ? '已暂停' : '已恢复', 'ok');
      render();
    },
    exportICS: exportICS,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    seedDemo: seedDemo,
    testNotify: testNotify
  };

  /* ======================= 事件绑定 ======================= */
  function bindEvents() {
    // 导航
    $$('.nav-item, .tab-item').forEach(function (a) {
      if (!a.dataset.view) return;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        go(a.dataset.view);
      });
    });

    // 手机菜单
    var openBtn = $('#openNav');
    if (openBtn) openBtn.addEventListener('click', openNav);
    $('#app').addEventListener('click', function (e) {
      if ($('#app').classList.contains('nav-open') && e.target === $('#app')) closeNav();
    });

    // 主题
    var themeBtn = $('#sidebarTheme');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // 新增
    $('#btnAdd').addEventListener('click', openAdd);
    var tabAdd = $('#tabAdd');
    if (tabAdd) tabAdd.addEventListener('click', function (e) { e.preventDefault(); openAdd(); });

    // 提醒中心
    $('#btnBell').addEventListener('click', openReminders);

    // 弹窗关闭
    $('#modalRoot').addEventListener('click', function (e) {
      if (e.target.dataset.close) closeModal();
    });
    $('#drawerRoot').addEventListener('click', function (e) {
      if (e.target.dataset.close) closeDrawer();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); closeDrawer(); closeNav(); }
    });

    // 搜索
    var search = $('#searchInput');
    search.addEventListener('input', U.debounce(function () {
      state.q = search.value.trim();
      UI.renderSubs($('#subsBody'), ctx, state);
    }, 160));

    // 排序
    var sortSel = $('#sortSelect');
    sortSel.addEventListener('change', function () {
      state.sort = sortSel.value;
      UI.renderSubs($('#subsBody'), ctx, state);
    });

    // 卡片点击（事件委托）
    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-id]');
      if (!card) return;
      var id = card.dataset.id;
      if (!id) return;
      if (e.target.closest('.cal-ev')) { openEdit(id); return; }
      if (card.classList.contains('sub-card') || card.classList.contains('due-row') ||
          card.classList.contains('rem-item') || card.classList.contains('rank-row')) {
        if (card.classList.contains('rem-item')) closeDrawer();
        openEdit(id);
      }
    });

    // 键盘可达
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest && e.target.closest('[role="button"][data-id]');
      if (!card) return;
      e.preventDefault();
      openEdit(card.dataset.id);
    });

    // hash 路由
    window.addEventListener('hashchange', function () {
      var v = location.hash.replace('#', '') || 'dashboard';
      if (v !== state.view) go(v);
    });

    // 回到前台时重算（跨零点）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        S.rollForward();
        render();
      }
    });
  }

  /* ======================= 启动 ======================= */
  function boot() {
    S.load();
    S.rollForward();
    applyTheme();

    var hash = location.hash.replace('#', '');
    state.view = VIEW_META[hash] ? hash : 'dashboard';

    bindEvents();
    go(state.view);

    // 首次访问：空数据时给个引导，但不强塞示例数据
    if (!S.db.subs.length) {
      // 概览页已经有空态引导
    }

    // 稍后检查通知（不阻塞首屏）
    setTimeout(checkNotify, 1200);

    // 每分钟检查一次跨零点
    setInterval(function () {
      var before = state.__day;
      var now = U.fmtDate(U.today());
      if (before && before !== now) {
        S.rollForward();
        render();
      }
      state.__day = now;
    }, 60000);
    state.__day = U.fmtDate(U.today());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
