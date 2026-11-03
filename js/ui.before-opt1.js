/* ==========================================================================
   ui.js · 渲染层（概览 / 订阅 / 日历 / 统计 / 设置 + 弹窗表单）
   只负责「把数据画成 DOM」，交互事件由 app.js 绑定
   ========================================================================== */
(function (global) {
  'use strict';

  var U = global.U, P = global.Platforms, S = global.Store;
  var h = U.el, icon = U.icon;

  /* ---------------- 小部件 ---------------- */

  function avatar(name, color, cls) {
    var div = h('div', { class: cls || 'avatar', style: 'background:' + (color || U.autoColor(name)) });
    div.textContent = U.initial(name);
    return div;
  }

  function avatarLg(name, color) {
    var d = h('div', { class: 'sc-avatar', style: 'background:' + (color || U.autoColor(name)) });
    d.textContent = U.initial(name);
    return d;
  }

  function subCard(sub, settings) {
    var days = S.daysUntilDue(sub);
    var dueCls = days < 0 ? 'due-now' : (days <= 3 ? 'due-now' : (days <= (settings.reminderDays || 7) ? 'due-soon' : 'due-ok'));
    var cat = P.cat(sub.category);

    var priceText = U.moneySmart(sub.price);
    var card = h('article', {
      class: 'sub-card' + (sub.status === 'active' && days <= (settings.reminderDays || 7) ? ' is-due' : ''),
      style: '--accent:' + (sub.color || cat.color),
      dataset: { id: sub.id },
      role: 'button',
      tabindex: '0',
      'aria-label': sub.name + '，' + priceText + '，' + S.cycleLabel(sub) + '，' + U.relDay(S.nextDueDate(sub)) + '续费'
    });

    var top = h('div', { class: 'sc-top' }, [
      avatarLg(sub.name, sub.color),
      h('div', { class: 'sc-ident' }, [
        h('div', { class: 'sc-name', text: sub.name }),
        h('div', { class: 'sc-meta' }, [
          cat.name,
          h('i', { class: 'sep' }),
          S.cycleLabel(sub),
          sub.status === 'paused' ? h('span', { class: 'badge', text: '已暂停' }) : null,
          sub.status === 'cancelled' ? h('span', { class: 'badge danger', text: '已取消' }) : null
        ])
      ])
    ]);

    var priceRow = h('div', { class: 'sc-price' }, [
      h('span', { class: 'amt', text: priceText }),
      h('span', { class: 'cur', text: sub.currency }),
      h('span', { class: 'cycle', text: S.moneyLabel(S.monthlyBase(sub, settings), settings) + '/月' })
    ]);

    var countIcon = icon('clock');
    var count = h('span', { class: 'sc-count ' + (sub.status === 'active' ? dueCls : '') }, [countIcon]);
    count.appendChild(document.createTextNode(sub.status === 'active' ? U.relDay(S.nextDueDate(sub)) : '—'));

    var foot = h('div', { class: 'sc-foot' }, [
      count,
      h('span', { class: 'sc-cat' }, [
        h('i', { style: 'background:' + cat.color }),
        h('span', { text: cat.name })
      ])
    ]);

    card.appendChild(top);
    card.appendChild(priceRow);
    card.appendChild(foot);
    return card;
  }

  function emptyBox(title, desc, actionText, onAction, iconName) {
    var box = h('div', { class: 'empty' }, [
      h('div', { class: 'empty-icon' }, [icon(iconName || 'wallet')]),
      h('b', { text: title }),
      h('p', { text: desc })
    ]);
    if (actionText) {
      box.appendChild(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: onAction }, [
        icon('plus'), h('span', { text: actionText })
      ]));
    }
    return box;
  }

  function kpi(label, iconName, valueHTML, footHTML, tint) {
    var box = h('div', { class: 'kpi', style: tint ? '--kpi-tint:' + tint : null }, [
      h('div', { class: 'kpi-label' }, [icon(iconName), h('span', { text: label })])
    ]);
    var v = h('div', { class: 'kpi-value' });
    v.innerHTML = valueHTML;
    box.appendChild(v);
    if (footHTML) {
      var f = h('div', { class: 'kpi-foot' });
      f.innerHTML = footHTML;
      box.appendChild(f);
    }
    return box;
  }

  /* ---------------- 概览 ---------------- */
  function renderDashboard(root, ctx) {
    var settings = S.db.settings;
    var sum = S.summary(settings);
    root.innerHTML = '';

    // 提醒条
    var banner = U.$('#alertBanner');
    var soon = sum.upcoming.filter(function (x) { return x.days <= (settings.reminderDays || 7); });
    if (soon.length) {
      banner.hidden = false;
      banner.innerHTML = '';
      banner.appendChild(h('div', { class: 'alert-icon' }, [icon('bell')]));
      var txt = h('div', {}, [
        h('div', {}, [h('strong', { text: soon.length + ' 项订阅' }), document.createTextNode(' 即将扣费')])
      ]);
      var tags = h('div', { class: 'alert-list' });
      soon.slice(0, 4).forEach(function (x) {
        tags.appendChild(h('span', {
          class: 'alert-tag',
          text: x.sub.name + ' ' + (x.days <= 0 ? (x.days === 0 ? '今天' : '已逾期') : x.days + '天')
        }));
      });
      if (soon.length > 4) tags.appendChild(h('span', { class: 'alert-tag', text: '+' + (soon.length - 4) }));
      txt.appendChild(tags);
      banner.appendChild(txt);
      banner.appendChild(h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.openReminders(); }
      }, [h('span', { text: '查看全部' })]));
    } else {
      banner.hidden = true;
    }

    // KPI
    var kpis = h('div', { class: 'kpi-grid' });
    var sym = U.currencySymbol(settings.currency);
    kpis.appendChild(kpi('每月支出', 'wallet',
      '<small>' + sym + '</small>' + U.moneySmart(sum.monthly),
      '日均 ' + sym + U.moneySmart(sum.daily),
      'color-mix(in srgb, var(--brand) 10%, transparent)'));
    kpis.appendChild(kpi('每年支出', 'trend',
      '<small>' + sym + '</small>' + U.moneySmart(sum.yearly),
      '约 ' + sum.counts.active + ' 项在用订阅',
      'color-mix(in srgb, var(--ok) 9%, transparent)'));
    kpis.appendChild(kpi('近 ' + (settings.reminderDays || 7) + ' 天待扣', 'clock',
      soon.length + ' <small style="font-size:12px;font-family:var(--font-sans)">笔</small>',
      soon.length ? (sym + U.moneySmart(soon.reduce(function (a, x) {
        return a + U.convert(x.sub.price, x.sub.currency, settings.currency, settings.rates);
      }, 0))) : '暂无即将扣费',
      'color-mix(in srgb, var(--warn) 12%, transparent)'));
    kpis.appendChild(kpi('平均单订阅', 'chart',
      '<small>' + sym + '</small>' + U.moneySmart(sum.avg),
      '按月折算 · 共 ' + sum.counts.total + ' 条记录',
      'color-mix(in srgb, var(--info) 10%, transparent)'));

    // 两列
    var cols = h('div', { class: 'dash-cols' });

    // 左：即将到期
    var left = h('div', { class: 'card' });
    var leftHead = h('div', { class: 'card-head' }, [
      h('h3', { text: '即将扣费' }),
      h('span', { class: 'sub', text: '按时间排序' }),
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.go('subs'); }
      }, [h('span', { text: '全部订阅' })])
    ]);
    left.appendChild(leftHead);

    var dueList = S.upcoming(settings, 60);
    if (!dueList.length) {
      left.appendChild(emptyBox('还没有订阅', '添加第一个订阅，开始追踪每月支出。', '新增订阅', ctx.openAdd, 'wallet'));
    } else {      var rows = h('div', { class: 'due-list' });
      dueList.slice(0, 8).forEach(function (x) {
        var row = h('div', { class: 'due-row', role: 'button', tabindex: '0', dataset: { id: x.sub.id } }, [
          avatar(x.sub.name, x.sub.color),
          h('div', { class: 'info' }, [
            h('b', { text: x.sub.name }),
            h('span', {}, [
              document.createTextNode(U.fmtCN(S.nextDueDate(x.sub)) + ' · ' + S.cycleLabel(x.sub)),
              x.days <= 3 ? h('span', { class: 'badge ' + (x.days <= 0 ? 'danger' : 'warn'), text: x.days <= 0 ? '已逾期' : x.days + '天' }) : null
            ])
          ]),
          h('div', { class: 'price' }, [
            h('b', { text: U.currencySymbol(x.sub.currency) + U.moneySmart(x.sub.price) }),
            h('span', { text: U.relDay(S.nextDueDate(x.sub)) })
          ])
        ]);
        rows.appendChild(row);
      });
      left.appendChild(rows);
    }
    cols.appendChild(left);

    // 右：分类占比
    var right = h('div', { class: 'card' });
    right.appendChild(h('div', { class: 'card-head' }, [
      h('h3', { text: '分类占比' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'sub', text: '按月折算' })
    ]));
    if (!sum.byCategory.length) {
      right.appendChild(emptyBox('暂无数据', '添加订阅后这里会显示分类构成。', null, null, 'chart'));
    } else {
      var bars = h('div', { class: 'cat-bars' });
      var total = sum.monthly || 1;
      sum.byCategory.slice(0, 6).forEach(function (c) {
        var pct = Math.round(c.amount / total * 100);
        bars.appendChild(h('div', {}, [
          h('div', { class: 'cat-bar-head' }, [
            h('i', { class: 'cat-dot', style: 'background:' + c.color }),
            h('span', { text: c.name }),
            h('span', { class: 'amt', text: sym + U.moneySmart(c.amount) }),
            h('span', { class: 'pct', text: pct + '%' })
          ]),
          h('div', { class: 'bar-track' }, [
            h('div', { class: 'bar-fill', style: 'width:' + Math.max(2, pct) + '%;background:' + c.color })
          ])
        ]));
      });
      right.appendChild(bars);
    }
    cols.appendChild(right);

    root.appendChild(kpis);
    root.appendChild(cols);

    /* ---- 全部订阅（卡片网格）---- */
    var allSubs = S.sortList(S.list({ status: 'active' }), 'next');
    if (allSubs.length) {
      var secHead = h('div', { class: 'section-title' }, [
        h('h2', { text: '我的订阅' }),
        h('span', { text: allSubs.length + ' 项使用中 · 按月费从近到远' })
      ]);
      root.appendChild(secHead);
      var grid = h('div', { class: 'subs-grid' });
      allSubs.slice(0, 12).forEach(function (sub) { grid.appendChild(subCard(sub, settings)); });
      root.appendChild(grid);

      if (allSubs.length > 12) {
        root.appendChild(h('div', { style: 'display:flex;justify-content:center;margin-top:2px' }, [
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: function () { ctx.go('subs'); }
          }, [h('span', { text: '查看全部 ' + allSubs.length + ' 项订阅' }), icon('chevronRight')])
        ]));
      }
    }
  }

  /* ---------------- 订阅列表 ---------------- */
  function renderSubs(root, ctx, state) {
    var settings = S.db.settings;
    var arr = S.sortList(S.list({ category: state.category, q: state.q }), state.sort);
    root.innerHTML = '';

    if (!arr.length) {
      var isFiltered = state.q || state.category !== 'all';
      root.appendChild(emptyBox(
        isFiltered ? '没有匹配的订阅' : '还没有订阅',
        isFiltered ? '换个关键词或分类试试。' : '添加你正在付费的平台，之后就不会错过续费了。',
        isFiltered ? null : '新增订阅',
        isFiltered ? null : ctx.openAdd,
        isFiltered ? 'search' : 'wallet'
      ));
      return;
    }

    var grid = h('div', { class: 'subs-grid' });
    arr.forEach(function (sub) { grid.appendChild(subCard(sub, settings)); });
    root.appendChild(grid);
  }

  function renderChips(root, ctx, state) {
    var settings = S.db.settings;
    root.innerHTML = '';
    var all = S.list({});
    var counts = {};
    all.forEach(function (s) { counts[s.category] = (counts[s.category] || 0) + 1; });

    function chip(id, name, n, color) {
      var b = h('button', {
        class: 'chip', type: 'button', role: 'tab',
        'aria-selected': String(state.category === id),
        onclick: function () { ctx.setCategory(id); }
      }, []);
      if (color) b.appendChild(h('i', { style: 'width:8px;height:8px;border-radius:2px;background:' + color }));
      b.appendChild(document.createTextNode(name));
      if (n != null) b.appendChild(h('em', { text: String(n) }));
      return b;
    }

    root.appendChild(chip('all', '全部', all.length));
    P.CATEGORIES.forEach(function (c) {
      if (!counts[c.id]) return;
      root.appendChild(chip(c.id, c.name, counts[c.id], c.color));
    });
  }

  /* ---------------- 日历 ---------------- */
  function renderCalendar(root, ctx, state) {
    var settings = S.db.settings;
    var cursor = state.calCursor || U.today();
    var y = cursor.getFullYear(), m = cursor.getMonth();
    var first = new Date(y, m, 1);
    var weekStart = settings.weekStart === 0 ? 0 : 1;
    var lead = (first.getDay() - weekStart + 7) % 7;
    var gridStart = U.addDays(first, -lead);
    var totalDays = 42;
    // 6 行够用时用 5 行
    var daysInMonth = U.daysInMonth(y, m);
    if (lead + daysInMonth <= 35) totalDays = 35;

    var events = S.dueInRange(gridStart, U.addDays(gridStart, totalDays - 1));

    root.innerHTML = '';
    var card = h('div', { class: 'card' });

    // 头
    var head = h('div', { class: 'cal-head' }, [
      h('div', { class: 'cal-title', text: y + ' 年 ' + (m + 1) + ' 月' }),
      h('div', { class: 'cal-nav' }, [
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': '上月',
          onclick: function () { ctx.shiftMonth(-1); }
        }, [icon('chevronLeft')]),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { ctx.shiftMonth(0); }
        }, [h('span', { text: '今天' })]),
        h('button', {
          class: 'icon-btn', type: 'button', 'aria-label': '下月',
          onclick: function () { ctx.shiftMonth(1); }
        }, [icon('chevronRight')])
      ])
    ]);
    card.appendChild(head);

    // 星期
    var week = h('div', { class: 'cal-week' });
    var wdNames = settings.weekStart === 0
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['一', '二', '三', '四', '五', '六', '日'];
    wdNames.forEach(function (w) { week.appendChild(h('span', { text: w })); });
    card.appendChild(week);

    // 网格
    var grid = h('div', { class: 'cal-grid' });
    var byDate = {};
    events.forEach(function (e) {
      var k = U.fmtDate(e.date);
      (byDate[k] = byDate[k] || []).push(e);
    });

    var todayStr = U.fmtDate(U.today());
    for (var i = 0; i < totalDays; i++) {
      var d = U.addDays(gridStart, i);
      var key = U.fmtDate(d);
      var dim = d.getMonth() !== m;
      var cell = h('div', {
        class: 'cal-cell' + (dim ? ' dim' : '') + (key === todayStr ? ' today' : '')
      }, [h('div', { class: 'dnum', text: String(d.getDate()) })]);

      var list = byDate[key] || [];
      list.slice(0, 3).forEach(function (e) {
        var ev = h('div', {
          class: 'cal-ev',
          style: '--ev:' + (e.sub.color || P.cat(e.sub.category).color),
          title: e.sub.name + ' ' + U.currencySymbol(e.sub.currency) + U.moneySmart(e.sub.price),
          dataset: { id: e.sub.id }
        }, [document.createTextNode(e.sub.name)]);
        cell.appendChild(ev);
      });
      if (list.length > 3) {
        cell.appendChild(h('div', { class: 'cal-more', text: '+' + (list.length - 3) + ' 项' }));
      }
      grid.appendChild(cell);
    }
    card.appendChild(grid);

    // 图例
    var legend = h('div', { class: 'cal-legend' });
    var monthTotal = events.filter(function (e) {
      return e.date.getMonth() === m && e.sub.status === 'active';
    }).reduce(function (a, e) {
      return a + U.convert(e.sub.price, e.sub.currency, settings.currency, settings.rates);
    }, 0);
    legend.appendChild(h('span', {}, [
      document.createTextNode('本月预计支出 '),
      h('b', { style: 'color:var(--text);font-family:var(--font-num)', text: U.currencySymbol(settings.currency) + U.moneySmart(monthTotal) })
    ]));
    legend.appendChild(h('span', {}, [
      document.createTextNode('共 ' + events.filter(function (e) { return e.date.getMonth() === m; }).length + ' 笔扣费')
    ]));
    card.appendChild(legend);

    root.appendChild(card);
  }

  /* ---------------- 统计 ---------------- */
  function renderStats(root, ctx) {
    var settings = S.db.settings;
    var sum = S.summary(settings);
    var sym = U.currencySymbol(settings.currency);
    root.innerHTML = '';

    if (!sum.counts.active) {
      root.appendChild(h('div', { class: 'card' }, [
        emptyBox('暂无统计数据', '添加订阅后，这里会显示支出趋势与排行。', '新增订阅', ctx.openAdd, 'chart')
      ]));
      return;
    }

    // 12 个月预测柱状图
    var fc = S.forecast(settings, 12);
    var maxV = Math.max.apply(null, fc.map(function (x) { return x.total; }).concat([1]));

    var chartCard = h('div', { class: 'card' });
    chartCard.appendChild(h('div', { class: 'card-head' }, [
      h('h3', { text: '未来 12 个月扣费预测' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'sub', text: '按各订阅实际扣费月份计算' })
    ]));
    var wrap = h('div', { class: 'chart-wrap' });

    var W = 720, H = 220, padL = 8, padR = 8, padT = 14, padB = 30;
    var bw = (W - padL - padR) / fc.length;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '未来 12 个月扣费预测柱状图');

    // 基线
    var base = document.createElementNS(svgNS, 'line');
    base.setAttribute('x1', padL); base.setAttribute('x2', W - padR);
    base.setAttribute('y1', H - padB); base.setAttribute('y2', H - padB);
    base.setAttribute('stroke', 'currentColor');
    base.setAttribute('stroke-opacity', '0.12');
    svg.appendChild(base);

    var barColor = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#4f6ef7';

    fc.forEach(function (x, i) {
      var hgt = Math.max(2, (x.total / maxV) * (H - padT - padB));
      var rect = document.createElementNS(svgNS, 'rect');
      var x0 = padL + i * bw + bw * 0.18;
      var rw = bw * 0.64;
      rect.setAttribute('x', x0);
      rect.setAttribute('y', H - padB - hgt);
      rect.setAttribute('width', rw);
      rect.setAttribute('height', hgt);
      rect.setAttribute('rx', '5');
      rect.setAttribute('fill', barColor);
      rect.setAttribute('opacity', i === 0 ? '1' : '0.78');
      svg.appendChild(rect);

      var label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x0 + rw / 2);
      label.setAttribute('y', H - padB + 17);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', 'currentColor');
      label.setAttribute('opacity', '0.55');
      label.textContent = x.label;
      svg.appendChild(label);

      if (x.total > 0) {
        var amt = document.createElementNS(svgNS, 'text');
        amt.setAttribute('x', x0 + rw / 2);
        amt.setAttribute('y', H - padB - hgt - 6);
        amt.setAttribute('text-anchor', 'middle');
        amt.setAttribute('font-size', '10.5');
        amt.setAttribute('fill', 'currentColor');
        amt.setAttribute('opacity', '0.7');
        amt.setAttribute('font-family', 'ui-monospace, monospace');
        amt.textContent = U.moneySmart(x.total);
        svg.appendChild(amt);
      }
    });

    wrap.appendChild(svg);
    chartCard.appendChild(wrap);

    // 右列
    var rightCol = h('div', {}, []);
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = 'var(--gap)';

    // 排行
    var rankCard = h('div', { class: 'card' });
    rankCard.appendChild(h('div', { class: 'card-head' }, [
      h('h3', { text: '月费排行' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'sub', text: '按月折算' })
    ]));
    var ranked = S.list({ status: 'active' })
      .map(function (s) { return { sub: s, m: S.monthlyBase(s, settings) }; })
      .sort(function (a, b) { return b.m - a.m; })
      .slice(0, 8);
    var rl = h('div', { class: 'rank-list' });
    ranked.forEach(function (x, i) {
      rl.appendChild(h('div', { class: 'rank-row', dataset: { id: x.sub.id }, role: 'button', tabindex: '0' }, [
        h('span', { class: 'rank-no', text: String(i + 1) }),
        avatar(x.sub.name, x.sub.color, 'avatar'),
        h('span', { class: 'rank-name', text: x.sub.name }),
        h('span', { class: 'rank-amt', text: sym + U.moneySmart(x.m) })
      ]));
    });
    rankCard.appendChild(rl);
    rightCol.appendChild(rankCard);

    // 周期构成
    var split = S.cycleSplit(settings);
    var splitCard = h('div', { class: 'card' });
    splitCard.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: '付费周期构成' })]));
    var splitBars = h('div', { class: 'cat-bars' });
    var totalSplit = Object.keys(split).reduce(function (a, k) { return a + split[k]; }, 0) || 1;
    [
      { k: 'monthly', n: '月付', c: '#4f6ef7' },
      { k: 'quarterly', n: '季付', c: '#0ea5e9' },
      { k: 'yearly', n: '年付', c: '#12a06a' },
      { k: 'weekly', n: '周付', c: '#e08a00' },
      { k: 'custom', n: '自定义', c: '#8b5cf6' }
    ].forEach(function (it) {
      var v = split[it.k] || 0;
      if (v <= 0) return;
      var pct = Math.round(v / totalSplit * 100);
      splitBars.appendChild(h('div', {}, [
        h('div', { class: 'cat-bar-head' }, [
          h('i', { class: 'cat-dot', style: 'background:' + it.c }),
          h('span', { text: it.n }),
          h('span', { class: 'amt', text: sym + U.moneySmart(v) }),
          h('span', { class: 'pct', text: pct + '%' })
        ]),
        h('div', { class: 'bar-track' }, [
          h('div', { class: 'bar-fill', style: 'width:' + Math.max(2, pct) + '%;background:' + it.c })
        ])
      ]));
    });
    splitCard.appendChild(splitBars);
    rightCol.appendChild(splitCard);

    var cols = h('div', { class: 'stats-cols' }, [chartCard, rightCol]);
    root.appendChild(cols);

    // 分类明细表
    var catCard = h('div', { class: 'card' });
    catCard.appendChild(h('div', { class: 'card-head' }, [
      h('h3', { text: '分类明细' }),
      h('span', { class: 'spacer' }),
      h('span', { class: 'sub', text: sum.byCategory.length + ' 个分类' })
    ]));
    var cb = h('div', { class: 'cat-bars' });
    var totalCat = sum.monthly || 1;
    sum.byCategory.forEach(function (c) {
      var pct = Math.round(c.amount / totalCat * 100);
      cb.appendChild(h('div', {}, [
        h('div', { class: 'cat-bar-head' }, [
          h('i', { class: 'cat-dot', style: 'background:' + c.color }),
          h('span', { text: c.name + ' · ' + c.count + ' 项' }),
          h('span', { class: 'amt', text: sym + U.moneySmart(c.amount) }),
          h('span', { class: 'pct', text: pct + '%' })
        ]),
        h('div', { class: 'bar-track' }, [
          h('div', { class: 'bar-fill', style: 'width:' + Math.max(2, pct) + '%;background:' + c.color })
        ])
      ]));
    });
    catCard.appendChild(cb);
    root.appendChild(catCard);
  }

  /* ---------------- 设置 ---------------- */
  function renderSettings(root, ctx) {
    var settings = S.db.settings;
    root.innerHTML = '';

    // 偏好
    var pref = h('div', { class: 'card' });
    pref.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: '偏好设置' })]));
    var prefBody = h('div', { class: 'set-group' });

    // 基准币种
    var curSel = h('select', { class: 'select', 'aria-label': '基准币种' });
    P.CURRENCIES.forEach(function (c) {
      curSel.appendChild(h('option', { value: c.code, selected: c.code === settings.currency, text: c.code + ' · ' + c.name }));
    });
    curSel.addEventListener('change', function () { ctx.updateSettings({ currency: curSel.value }); });
    prefBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [
        h('b', { text: '基准币种' }),
        h('span', { text: '所有统计与总额都折算到这个币种' })
      ]),
      curSel
    ]));

    // 提醒提前天数
    var daySel = h('select', { class: 'select', 'aria-label': '提前提醒天数' });
    [1, 3, 5, 7, 10, 14, 30].forEach(function (n) {
      daySel.appendChild(h('option', { value: n, selected: n === settings.reminderDays, text: '提前 ' + n + ' 天' }));
    });
    daySel.addEventListener('change', function () { ctx.updateSettings({ reminderDays: parseInt(daySel.value, 10) }); });
    prefBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [
        h('b', { text: '提醒提前量' }),
        h('span', { text: '进入这个窗口的订阅会出现在提醒中心' })
      ]),
      daySel
    ]));

    // 每周起始
    var wsSel = h('select', { class: 'select', 'aria-label': '每周起始日' });
    wsSel.appendChild(h('option', { value: '1', selected: settings.weekStart !== 0, text: '周一' }));
    wsSel.appendChild(h('option', { value: '0', selected: settings.weekStart === 0, text: '周日' }));
    wsSel.addEventListener('change', function () { ctx.updateSettings({ weekStart: parseInt(wsSel.value, 10) }); });
    prefBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [h('b', { text: '日历起始日' }), h('span', { text: '影响日历视图的第一列' })]),
      wsSel
    ]));

    // 深色模式
    var themeSel = h('select', { class: 'select', 'aria-label': '外观主题' });
    [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].forEach(function (t) {
      themeSel.appendChild(h('option', { value: t[0], selected: settings.theme === t[0], text: t[1] }));
    });
    themeSel.addEventListener('change', function () { ctx.updateSettings({ theme: themeSel.value }); });
    prefBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [h('b', { text: '外观' }), h('span', { text: '默认跟随系统深浅色' })]),
      themeSel
    ]));

    pref.appendChild(prefBody);
    root.appendChild(pref);

    // 提醒与日历
    var rem = h('div', { class: 'card' });
    rem.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: '提醒' })]));
    var remBody = h('div', { class: 'set-group' });

    if ('Notification' in global) {
      var sw = h('button', {
        class: 'switch', type: 'button', role: 'switch',
        'aria-checked': String(settings.notifications && Notification.permission === 'granted'),
        'aria-label': '浏览器通知'
      });
      sw.addEventListener('click', function () {
        var granted = Notification.permission === 'granted';
        if (granted) {
          ctx.updateSettings({ notifications: !settings.notifications });
        } else {
          Notification.requestPermission().then(function (p) {
            if (p === 'granted') {
              ctx.updateSettings({ notifications: true });
              ctx.toast('已开启浏览器通知', 'ok');
            } else {
              ctx.toast('浏览器拒绝了通知权限', 'err');
            }
          }).catch(function () { ctx.toast('当前环境不支持通知', 'err'); });
        }
      });
      remBody.appendChild(h('div', { class: 'set-row' }, [
        h('div', { class: 'set-info' }, [
          h('b', { text: '浏览器通知' }),
          h('span', { text: '打开页面时若进入提醒窗口，弹一条系统通知' })
        ]),
        sw
      ]));
    }

    remBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [
        h('b', { text: '导出到系统日历' }),
        h('span', { text: '生成 .ics 文件，导入 iOS / Google / Outlook 日历，由系统按时提醒' })
      ]),
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.exportICS(); }
      }, [icon('download'), h('span', { text: '导出 .ics' })])
    ]));

    remBody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [
        h('b', { text: '测试通知' }),
        h('span', { text: '立即发一条通知，检查浏览器是否放行' })
      ]),
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.testNotify(); }
      }, [icon('bell'), h('span', { text: '发一条' })])
    ]));

    rem.appendChild(remBody);
    root.appendChild(rem);

    // 数据
    var data = h('div', { class: 'card' });
    data.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: '数据' })]));
    var dbody = h('div', { class: 'set-group' });

    dbody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [
        h('b', { text: '数据存储位置' }),
        h('span', { text: '仅保存在本机浏览器 localStorage，不上传任何服务器' })
      ]),
      h('span', { class: 'badge ok', text: '本地' })
    ]));

    dbody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [h('b', { text: '导出数据' }), h('span', { text: 'JSON 备份，可用于换设备或版本回滚' })]),
      h('div', { style: 'display:flex;gap:8px' }, [
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { ctx.exportJSON(); }
        }, [icon('download'), h('span', { text: '导出' })]),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { ctx.importJSON(); }
        }, [icon('upload'), h('span', { text: '导入' })])
      ])
    ]));

    dbody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [h('b', { text: '载入示例数据' }), h('span', { text: '填充 10 条常见订阅，方便先看效果' })]),
      h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.seedDemo(); }
      }, [icon('sparkles'), h('span', { text: '载入' })])
    ]));

    dbody.appendChild(h('div', { class: 'set-row' }, [
      h('div', { class: 'set-info' }, [h('b', { text: '清空全部数据' }), h('span', { text: '删除所有订阅与记录，不可恢复' })]),
      h('button', {
        class: 'btn btn-danger btn-sm', type: 'button',
        onclick: function () { ctx.resetAll(); }
      }, [icon('trash'), h('span', { text: '清空' })])
    ]));

    data.appendChild(dbody);
    root.appendChild(data);

    // 关于
    var about = h('div', { class: 'card' });
    about.appendChild(h('div', { class: 'card-head' }, [h('h3', { text: '关于' })]));
    var ab = h('div', { class: 'card-pad', style: 'font-size:13px;color:var(--text-2);line-height:1.75' });
    ab.innerHTML = '订阅管家 H5 · v1.0<br>' +
      '参考仓库：<b>ellite/Wallos</b>（8.7k★）、<b>huhusmang/Subscription-Management</b>（899★）、<b>meceware/wapy.dev</b>（528★）<br>' +
      '纯前端实现，无后端、无登录、无追踪。数据只在本机浏览器。';
    about.appendChild(ab);
    root.appendChild(about);
  }

  /* ---------------- 提醒抽屉 ---------------- */
  function renderReminders(root, ctx) {
    var settings = S.db.settings;
    var list = S.upcoming(settings, 60);
    root.innerHTML = '';
    if (!list.length) {
      root.appendChild(emptyBox('暂无即将扣费', '未来 60 天内没有需要处理的订阅。', null, null, 'check'));
      return;
    }
    list.forEach(function (x) {
      var now = x.days <= 0;
      root.appendChild(h('div', { class: 'rem-item', dataset: { id: x.sub.id }, role: 'button', tabindex: '0' }, [
        h('div', { class: 'rem-icon' + (now ? ' now' : '') }, [icon(now ? 'circleAlert' : 'clock')]),
        h('div', { class: 'rem-body' }, [
          h('b', { text: x.sub.name }),
          h('span', { text: (now ? (x.days === 0 ? '今天扣费' : '已逾期 ' + Math.abs(x.days) + ' 天') : U.relDay(S.nextDueDate(x.sub)) + ' · ' + U.fmtCN(S.nextDueDate(x.sub))) })
        ]),
        h('div', { class: 'rem-amt', text: U.currencySymbol(x.sub.currency) + U.moneySmart(x.sub.price) })
      ]));
    });
  }

  /* ---------------- 表单 ---------------- */
  function buildForm(sub, ctx, opts) {
    opts = opts || {};
    var isEdit = !!(sub && sub.id);
    var d = sub || {
      name: '', category: 'video', color: '',
      price: '', currency: S.db.settings.currency, cycle: 'monthly', customMonths: 1,
      startDate: U.fmtDate(U.today()), nextDue: U.fmtDate(U.addMonths(U.today(), 1)),
      status: 'active', autoRenew: true, payMethod: '', url: '', note: '', remindDays: null
    };

    var form = h('form', { class: 'form', novalidate: 'novalidate' });
    var grid = h('div', { class: 'field-grid' });

    /* -- 名称（手填优先，常用平台折叠在下面给快捷填充） -- */
    var nameWrap = h('div', { class: 'field', style: 'grid-column:1/-1' });
    nameWrap.appendChild(h('label', {}, [document.createTextNode('订阅名称'), h('span', { class: 'req', text: '*' })]));
    var nameInput = h('input', {
      class: 'input', type: 'text', name: 'name', value: d.name,
      placeholder: '直接输入任意平台名，如 迅雷会员、公司食堂卡', autocomplete: 'off', required: true
    });
    nameWrap.appendChild(nameInput);
    nameWrap.appendChild(h('span', {
      class: 'hint',
      text: '任何平台都能填，不受下面列表限制；列表只是快捷填充。'
    }));

    // 预设折叠区：默认收起，避免盖住「名称可自由输入」这件事
    var presetToggle = h('button', {
      class: 'preset-toggle', type: 'button', 'aria-expanded': 'false'
    }, [
      icon('sparkles'),
      h('span', { text: '从常用平台快速填充（' + P.PRESETS.length + ' 个）' })
    ]);
    var presetList = h('div', { class: 'chips', hidden: true, style: 'padding:8px 0 0;flex-wrap:wrap;overflow:visible' });
    P.PRESETS.forEach(function (p) {
      presetList.appendChild(h('button', {
        class: 'chip', type: 'button', style: 'height:28px;font-size:12px',
        onclick: function (e) {
          e.preventDefault();
          nameInput.value = p.name;
          if (catSel) catSel.value = p.cat;
          if (cycleSel) cycleSel.value = p.cycle;
          if (!colorInput.value) colorInput.value = p.color;
          if (!priceInput.value) priceInput.value = p.price;
          if (curSel) curSel.value = S.db.settings.currency;
          previewAvatar();
          updatePreview();
        }
      }, [h('i', { style: 'width:8px;height:8px;border-radius:2px;background:' + p.color }), h('span', { text: p.name })]));
    });
    presetToggle.addEventListener('click', function () {
      var open = presetToggle.getAttribute('aria-expanded') === 'true';
      presetToggle.setAttribute('aria-expanded', String(!open));
      presetList.hidden = open;
      presetToggle.querySelector('span').textContent =
        (open ? '从常用平台快速填充（' + P.PRESETS.length + ' 个）' : '收起常用平台');
    });
    nameWrap.appendChild(presetToggle);
    nameWrap.appendChild(presetList);
    grid.appendChild(nameWrap);

    /* -- 分类 -- */
    var catField = h('div', { class: 'field' });
    catField.appendChild(h('label', { text: '分类' }));
    var catSel = h('select', { class: 'select', name: 'category' });
    P.CATEGORIES.forEach(function (c) {
      catSel.appendChild(h('option', { value: c.id, selected: c.id === d.category, text: c.name }));
    });
    catField.appendChild(catSel);
    grid.appendChild(catField);

    /* -- 价格 + 币种 -- */
    var priceField = h('div', { class: 'field' });
    priceField.appendChild(h('label', {}, [document.createTextNode('每期金额'), h('span', { class: 'req', text: '*' })]));
    var priceInput = h('input', {
      class: 'input', type: 'number', name: 'price', value: d.price === '' ? '' : d.price,
      step: '0.01', min: '0', inputmode: 'decimal', placeholder: '0.00', required: true
    });
    var curSel = h('select', { class: 'select', name: 'currency', style: 'flex:0 0 108px' });
    P.CURRENCIES.forEach(function (c) {
      curSel.appendChild(h('option', { value: c.code, selected: c.code === d.currency, text: c.symbol + ' ' + c.code }));
    });
    priceField.appendChild(h('div', { class: 'input-group' }, [priceInput, curSel]));
    grid.appendChild(priceField);

    /* -- 周期 -- */
    var cycleField = h('div', { class: 'field' });
    cycleField.appendChild(h('label', { text: '付费周期' }));
    var cycleSel = h('select', { class: 'select', name: 'cycle' });
    P.CYCLES.forEach(function (c) {
      cycleSel.appendChild(h('option', { value: c.id, selected: c.id === d.cycle, text: c.name }));
    });
    cycleField.appendChild(cycleSel);
    var customField = h('input', {
      class: 'input', type: 'number', name: 'customMonths', min: '1', step: '1',
      value: d.customMonths || 1, placeholder: '每几个月'
    });
    customField.hidden = d.cycle !== 'custom';
    cycleField.appendChild(customField);
    grid.appendChild(cycleField);

    /* -- 下次扣费 -- */
    var dueField = h('div', { class: 'field' });
    dueField.appendChild(h('label', {}, [document.createTextNode('下次扣费日'), h('span', { class: 'req', text: '*' })]));
    var dueInput = h('input', { class: 'input', type: 'date', name: 'nextDue', value: d.nextDue, required: true });
    dueField.appendChild(dueInput);
    dueField.appendChild(h('span', { class: 'hint', text: '到期后若开启自动续费，会按周期自动往后推' }));
    grid.appendChild(dueField);

    /* -- 开始日期 -- */
    var startField = h('div', { class: 'field' });
    startField.appendChild(h('label', { text: '订阅开始日' }));
    var startInput = h('input', { class: 'input', type: 'date', name: 'startDate', value: d.startDate });
    startField.appendChild(startInput);
    grid.appendChild(startField);

    /* -- 支付方式 -- */
    var payField = h('div', { class: 'field' });
    payField.appendChild(h('label', { text: '支付方式' }));
    var paySel = h('select', { class: 'select', name: 'payMethod' });
    paySel.appendChild(h('option', { value: '', text: '未指定' }));
    P.PAY_METHODS.forEach(function (m) {
      paySel.appendChild(h('option', { value: m, selected: m === d.payMethod, text: m }));
    });
    payField.appendChild(paySel);
    grid.appendChild(payField);

    /* -- 状态 -- */
    var statusField = h('div', { class: 'field' });
    statusField.appendChild(h('label', { text: '状态' }));
    var statusSel = h('select', { class: 'select', name: 'status' });
    [['active', '使用中'], ['paused', '已暂停'], ['cancelled', '已取消']].forEach(function (s) {
      statusSel.appendChild(h('option', { value: s[0], selected: s[0] === d.status, text: s[1] }));
    });
    statusField.appendChild(statusSel);
    grid.appendChild(statusField);

    /* -- 自动续费 -- */
    var renewField = h('div', { class: 'field' });
    renewField.appendChild(h('label', { text: '自动续费' }));
    var renewSwitch = h('button', {
      class: 'switch', type: 'button', role: 'switch',
      'aria-checked': String(d.autoRenew !== false), 'aria-label': '自动续费',
      style: 'margin-top:2px'
    });
    renewSwitch.addEventListener('click', function () {
      renewSwitch.setAttribute('aria-checked', renewSwitch.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
    renewField.appendChild(h('div', { style: 'display:flex;align-items:center;gap:9px' }, [
      renewSwitch,
      h('span', { style: 'font-size:12.5px;color:var(--text-3)', text: '到期自动推下一期' })
    ]));
    grid.appendChild(renewField);

    /* -- 颜色 -- */
    var colorField = h('div', { class: 'field' });
    colorField.appendChild(h('label', { text: '标识色' }));
    var colorInput = h('input', {
      class: 'input', type: 'color', name: 'color', value: d.color || U.autoColor(d.name || 'sub'),
      style: 'padding:3px;height:38px;cursor:pointer'
    });
    colorField.appendChild(colorInput);
    grid.appendChild(colorField);

    /* -- 链接 -- */
    var urlField = h('div', { class: 'field', style: 'grid-column:1/-1' });
    urlField.appendChild(h('label', { text: '管理链接（选填）' }));
    urlField.appendChild(h('input', {
      class: 'input', type: 'url', name: 'url', value: d.url || '',
      placeholder: 'https://…  取消订阅时会用得上', inputmode: 'url'
    }));
    grid.appendChild(urlField);

    /* -- 备注 -- */
    var noteField = h('div', { class: 'field', style: 'grid-column:1/-1' });
    noteField.appendChild(h('label', { text: '备注（选填）' }));
    noteField.appendChild(h('textarea', {
      class: 'textarea', name: 'note', rows: '2', placeholder: '例如：家庭共享、年付折扣、找谁分摊…'
    })).value = d.note || '';
    grid.appendChild(noteField);

    form.appendChild(grid);

    /* -- 实时折算预览 -- */
    var preview = h('div', {
      style: 'margin-top:14px;padding:11px 14px;border-radius:11px;background:var(--bg-soft);' +
        'font-size:12.5px;color:var(--text-2);display:flex;align-items:center;gap:8px;flex-wrap:wrap'
    });
    var pvAvatar = h('div', {
      style: 'width:28px;height:28px;border-radius:8px;display:grid;place-items:center;' +
        'color:#fff;font-size:12px;font-weight:700;flex:none'
    });
    var pvText = h('span', {});
    preview.appendChild(pvAvatar);
    preview.appendChild(pvText);
    form.appendChild(preview);

    var extra = h('div', { style: 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap' }, []);
    if (isEdit) {
      extra.appendChild(h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: function () { ctx.markPaid(d.id); ctx.closeModal(); }
      }, [icon('check'), h('span', { text: '标记本期已付' })]));
      if (d.status === 'active') {
        extra.appendChild(h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { ctx.setStatus(d.id, 'paused'); ctx.closeModal(); }
        }, [icon('pausable'), h('span', { text: '暂停' })]));
      } else {
        extra.appendChild(h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          onclick: function () { ctx.setStatus(d.id, 'active'); ctx.closeModal(); }
        }, [icon('repeat'), h('span', { text: '恢复' })]));
      }
    }
    form.appendChild(extra);

    /* -- 联动 -- */
    function previewAvatar() {
      var nm = nameInput.value || '?';
      pvAvatar.style.background = colorInput.value || U.autoColor(nm);
      pvAvatar.textContent = U.initial(nm);
    }

    function updatePreview() {
      previewAvatar();
      var price = U.toNum(priceInput.value);
      var cyc = cycleSel.value;
      var months = cyc === 'custom' ? Math.max(1, U.toNum(customField.value) || 1)
        : (cyc === 'weekly' ? 12 / 52 : P.cycle(cyc).months);
      var perMonth = price / months;
      var settings = S.db.settings;
      var base = U.convert(perMonth, curSel.value, settings.currency, settings.rates);
      var sym = U.currencySymbol(settings.currency);
      pvText.innerHTML = '';
      pvText.appendChild(document.createTextNode('折算 '));
      var b1 = h('b', { style: 'color:var(--text);font-family:var(--font-num)', text: sym + U.moneySmart(base) });
      pvText.appendChild(b1);
      pvText.appendChild(document.createTextNode(' / 月 · '));
      var b2 = h('b', { style: 'color:var(--text);font-family:var(--font-num)', text: sym + U.moneySmart(base * 12) });
      pvText.appendChild(b2);
      pvText.appendChild(document.createTextNode(' / 年'));
      if (curSel.value !== settings.currency) {
        pvText.appendChild(document.createTextNode('（' + U.currencySymbol(curSel.value) + U.moneySmart(price) + ' 已按本机汇率折算）'));
      }
    }

    cycleSel.addEventListener('change', function () {
      customField.hidden = cycleSel.value !== 'custom';
      updatePreview();
    });
    [nameInput, priceInput, curSel, customField].forEach(function (n) {
      n.addEventListener('input', updatePreview);
      n.addEventListener('change', updatePreview);
    });
    colorInput.addEventListener('input', updatePreview);
    catSel.addEventListener('change', function () {
      if (!d.color) colorInput.value = P.cat(catSel.value).color;
      updatePreview();
    });

    updatePreview();

    /* -- 读取表单 -- */
    function read() {
      return {
        id: d.id,
        name: nameInput.value.trim(),
        category: catSel.value,
        price: U.toNum(priceInput.value),
        currency: curSel.value,
        cycle: cycleSel.value,
        customMonths: U.toNum(customField.value) || 1,
        startDate: startInput.value || U.fmtDate(U.today()),
        nextDue: dueInput.value || U.fmtDate(U.today()),
        status: statusSel.value,
        autoRenew: renewSwitch.getAttribute('aria-checked') === 'true',
        payMethod: paySel.value,
        color: colorInput.value,
        url: '', // 由下面覆盖
        note: ''
      };
    }

    // url / note 单独取（它们在 grid 里）
    var urlInput = form.querySelector('input[name="url"]');
    var noteArea = form.querySelector('textarea[name="note"]');
    var origRead = read;
    read = function () {
      var v = origRead();
      v.url = urlInput ? urlInput.value.trim() : '';
      v.note = noteArea ? noteArea.value.trim() : '';
      return v;
    };

    return {
      form: form,
      read: read,
      focus: function () { setTimeout(function () { nameInput.focus(); }, 60); }
    };
  }

  global.UI = {
    avatar: avatar,
    subCard: subCard,
    emptyBox: emptyBox,
    renderDashboard: renderDashboard,
    renderSubs: renderSubs,
    renderChips: renderChips,
    renderCalendar: renderCalendar,
    renderStats: renderStats,
    renderSettings: renderSettings,
    renderReminders: renderReminders,
    buildForm: buildForm
  };
})(window);
