/* ==========================================================================
   utils.js · 纯函数工具（日期 / 金额 / DOM / 转义）
   不依赖任何框架；所有函数挂在 window.U 上
   ========================================================================== */
(function (global) {
  'use strict';

  var DAY = 86400000;

  /* ---------------- 日期 ---------------- */
  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function today() { return startOfDay(new Date()); }

  /** 解析 YYYY-MM-DD → 本地 Date（避免 new Date('2024-01-01') 的 UTC 偏移） */
  function parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return startOfDay(str);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str).trim());
    if (!m) {
      var d = new Date(str);
      return isNaN(d) ? null : startOfDay(d);
    }
    return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  }

  function fmtDate(d) {
    if (!d) return '';
    var x = d instanceof Date ? d : parseDate(d);
    if (!x) return '';
    var mm = String(x.getMonth() + 1).padStart(2, '0');
    var dd = String(x.getDate()).padStart(2, '0');
    return x.getFullYear() + '-' + mm + '-' + dd;
  }

  function fmtCN(d) {
    var x = d instanceof Date ? d : parseDate(d);
    if (!x) return '';
    return (x.getMonth() + 1) + '月' + x.getDate() + '日';
  }

  /** 相差天数（b - a，按自然日） */
  function daysBetween(a, b) {
    var x = startOfDay(a).getTime();
    var y = startOfDay(b).getTime();
    return Math.round((y - x) / DAY);
  }

  /** 相对今天的自然语言 */
  function relDay(d) {
    var n = daysBetween(today(), d);
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    if (n > 0) return n + ' 天后';
    return Math.abs(n) + ' 天前';
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addMonths(d, n) {
    var x = new Date(d);
    var day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    var last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function weekdayCN(d) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }

  /** 该月第一天 / 天数 */
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  /* ---------------- 金额 ---------------- */
  function toNum(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /** 金额格式化：保留必要小数，不用科学计数 */
  function money(n, opts) {
    opts = opts || {};
    var digits = opts.digits;
    if (digits == null) digits = Math.abs(n) >= 1000 ? 0 : 2;
    var fixed = Number(n).toFixed(digits);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /** 更聪明的金额：整数就不带小数，非整数保留两位 */
  function moneySmart(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (Math.abs(v - Math.round(v)) < 0.005) return money(v, { digits: 0 });
    return money(v, { digits: 2 });
  }

  function currencySymbol(code) {
    var c = global.Platforms && global.Platforms.CURRENCY_MAP[code];
    return c ? c.symbol : (code || '¥');
  }

  /** 折算到基准币种 */
  function convert(amount, from, to, rates) {
    if (from === to) return amount;
    var r = rates || (global.Platforms && global.Platforms.RATES_TO_CNY) || {};
    var rf = r[from], rt = r[to];
    if (!rf || !rt) return amount;
    return amount * rf / rt;
  }

  /* ---------------- DOM ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset') {
          Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        } else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      });
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  }

  /** SVG 图标（24 网格，path d） */
  var ICONS = {
    bell: 'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
    check: 'M9.5 17.5 4.5 12.5l1.4-1.4 3.6 3.6 8.6-8.6 1.4 1.4-10 10Z',
    close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z',
    wallet: 'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm2 0h12v1H5V7Zm0 3v7h12v-7H5Zm9 2h2v3h-2v-3Z',
    calendar: 'M7 3v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V3h-2v2H9V3H7ZM5 11h14v8H5v-8Z',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-1 3v6l4.5 2.7.8-1.4-4.3-2.5V7h-1Z',
    trend: 'M3.5 18.5 9 13l4 4 5.5-6.5H15V8h7v7h-2.5v-2.6l-6.2 7.3-4-4-4 4-1.8-1.2Z',
    chart: 'M5 21V9h3v12H5Zm5.5 0V3h3v18h-3ZM16 21v-7h3v7h-3Z',
    trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h1v-8H9Zm3 0v8h1v-8h-1Zm3 0v8h1v-8h-1Z',
    edit: 'M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5ZM6 17.6l9.5-9.5 1.4 1.4L7.4 19H6v-1.4Z',
    export: 'M12 3 7.5 7.5 9 9l2-2v8h2V7l2 2 1.5-1.5L12 3ZM5 18h14v2H5v-2Z',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.4 4c0 .4 0 .8-.1 1.2l2 1.6-1.9 3.3-2.4-.9c-.6.5-1.3.9-2 1.2l-.4 2.6h-3.8l-.4-2.6c-.7-.3-1.4-.7-2-1.2l-2.4.9-1.9-3.3 2-1.6c-.1-.4-.1-.8-.1-1.2s0-.8.1-1.2l-2-1.6 1.9-3.3 2.4.9c.6-.5 1.3-.9 2-1.2l.4-2.6h3.8l.4 2.6c.7.3 1.4.7 2 1.2l2.4-.9 1.9 3.3-2 1.6c.1.4.1.8.1 1.2Z',
    moon: 'M12 3a9 9 0 1 0 9 9c0-.5-.4-.9-.9-.8A7.1 7.1 0 0 1 12.8 3.9c.1-.5-.3-.9-.8-.9Z',
    sun: 'M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-12.5 1.5 2.2-2.9.1L12 4.5Zm0 15 .1-2.9 2.8-.1-1.4 2.2-1.5.8ZM4.5 12l2.2-1.4.1 2.9L4.5 12Zm15 0-2.2 1.5-.1-2.9L19.5 12Z',
    star: 'M12 3.5 14.6 9l6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 20l1.1-6L3.4 9.8l6-.8L12 3.5Z',
    circleAlert: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v7h-2V7Zm0 9h2v2h-2v-2Z',
    tag: 'M3 5a2 2 0 0 1 2-2h5.6a2 2 0 0 1 1.4.6l8.4 8.4a2 2 0 0 1 0 2.8l-5.6 5.6a2 2 0 0 1-2.8 0L3.6 12A2 2 0 0 1 3 10.6V5Zm4 1.5A1.5 1.5 0 1 0 7 9.5a1.5 1.5 0 0 0 0-3Z',
    creditCard: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3V6Zm0 4h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm3 5h5v2H6v-2Z',
    repeat: 'M7 7h9V4l4 4-4 4V9H7V7Zm10 10H8v3l-4-4 4-4v3h9v2Z',
    chevronLeft: 'M14.5 6 16 7.5 11.5 12 16 16.5 14.5 18l-6-6 6-6Z',
    chevronRight: 'M9.5 6 8 7.5 12.5 12 8 16.5 9.5 18l6-6-6-6Z',
    download: 'M11 3h2v9.2l3.1-3.1 1.4 1.4L12 16.3 6.5 10.5l1.4-1.4L11 12.2V3ZM5 18h14v2H5v-2Z',
    upload: 'M11 16V6.8L7.9 9.9 6.5 8.5 12 3l5.5 5.5-1.4 1.4L13 6.8V16h-2ZM5 18h14v2H5v-2Z',
    sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Zm6 10 .9 2.3 2.3.9-2.3.9L18 19.4l-.9-2.3-2.3-.9 2.3-.9L18 13Z',
    search: 'M10 4a6 6 0 1 0 3.7 10.7l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
    pausable: 'M8 5h3v14H8V5Zm5 0h3v14h-3V5Z'
  };

  function icon(name, size) {
    var d = ICONS[name] || ICONS.circleAlert;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---------------- 颜色 ---------------- */
  function hashHue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }

  function autoColor(name) {
    return 'hsl(' + hashHue(String(name || 'x')) + ' 62% 48%)';
  }

  /** 由名称取首字（中文取 1 字，英文取首字母，最多 2 字符） */
  function initial(name) {
    var s = String(name || '?').trim();
    if (!s) return '?';
    var cjk = /[\u4e00-\u9fa5]/;
    if (cjk.test(s[0])) return s.slice(0, 2);
    var words = s.split(/[\s\-_.]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }

  /* ---------------- 其它 ---------------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /* ---------------- CSV（RFC 4180 子集） ----------------
     自己写而非引库：需求只有「读表头 + 取列」，引一个 20KB 的库不划算（D2）。
     支持：双引号包裹、引号内逗号/换行、"" 转义、CRLF/LF、BOM。 */
  function parseCSV(text) {
    var s = String(text || '').replace(/^\uFEFF/, ''); // 去 BOM
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;

    while (i < s.length) {
      var c = s[i];

      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }

      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

      field += c; i++;
    }
    // 收尾（末行可能没有换行）
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // 丢掉完全空白的行
    rows = rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
    return rows;
  }

  /** 转义一个 CSV 字段（导出用） */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  global.U = {
    DAY: DAY,
    startOfDay: startOfDay,
    today: today,
    parseDate: parseDate,
    fmtDate: fmtDate,
    fmtCN: fmtCN,
    daysBetween: daysBetween,
    relDay: relDay,
    addDays: addDays,
    addMonths: addMonths,
    weekdayCN: weekdayCN,
    monthStart: monthStart,
    monthEnd: monthEnd,
    daysInMonth: daysInMonth,
    toNum: toNum,
    money: money,
    moneySmart: moneySmart,
    currencySymbol: currencySymbol,
    convert: convert,
    $: $, $$: $$, el: el, icon: icon,
    escapeHTML: escapeHTML,
    autoColor: autoColor,
    initial: initial,
    uid: uid,
    debounce: debounce,
    clamp: clamp,
    download: download,
    parseCSV: parseCSV,
    csvCell: csvCell,
    toCSV: toCSV
  };
})(window);
