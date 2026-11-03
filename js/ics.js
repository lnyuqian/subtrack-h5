/* ==========================================================================
   ics.js · 导出 iCalendar（.ics），可导入 iOS 日历 / Google 日历 / Outlook
   每个订阅生成一个「重复事件 + 提前 N 天 VALARM」
   ========================================================================== */
(function (global) {
  'use strict';

  var U = global.U;

  function pad(n) { return String(n).padStart(2, '0'); }

  /** 本地日期 → iCal 日期串（全天事件） */
  function dstr(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  /** Date → UTC 时间戳串 */
  function dtstamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  /** RFC 5545 文本转义 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** 长行折行（75 字节，按 UTF-8） */
  function fold(line) {
    var bytes = 0, out = '', i = 0;
    for (; i < line.length; i++) {
      var ch = line[i];
      var code = line.charCodeAt(i);
      var size = code < 128 ? 1 : (code < 2048 ? 2 : 3);
      if (bytes + size > 73) { out += '\r\n '; bytes = 1; }
      out += ch;
      bytes += size;
    }
    return out;
  }

  /** 周期 → RRULE 片段 */
  function rrule(sub, mod) {
    var m = global.Store.cycleMonths(sub);
    if (sub.cycle === 'weekly') return 'FREQ=WEEKLY;INTERVAL=1';
    if (sub.cycle === 'monthly') return 'FREQ=MONTHLY;INTERVAL=1';
    if (sub.cycle === 'yearly') return 'FREQ=YEARLY;INTERVAL=1';
    if (sub.cycle === 'quarterly') return 'FREQ=MONTHLY;INTERVAL=3';
    // 自定义月数
    if (m % 12 === 0) return 'FREQ=YEARLY;INTERVAL=' + (m / 12);
    return 'FREQ=MONTHLY;INTERVAL=' + m;
  }

  function unitLabel(sub) {
    var m = global.Store.cycleMonths(sub);
    if (sub.cycle === 'weekly') return { unit: 'WEEKLY', n: 1 };
    if (m % 12 === 0) return { unit: 'YEARLY', n: m / 12 };
    return { unit: 'MONTHLY', n: m };
  }

  /**
   * 生成 ics
   * @param {Array} subs 订阅数组
   * @param {Object} settings 设置（提醒天数、基准币种）
   */
  function build(subs, settings) {
    settings = settings || global.Store.db.settings;
    var remind = Math.max(0, U.toNum(settings.reminderDays) || 7);
    var lines = [];
    var now = new Date();

    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//SubTrack H5//Subscription Tracker//ZH');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('X-WR-CALNAME:订阅管家 · 续费提醒');
    lines.push('X-WR-TIMEZONE:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'));
    lines.push('X-WR-CALDESC:由订阅管家导出的订阅续费提醒，导入后由日历负责提醒。');

    (subs || []).forEach(function (sub) {
      if (sub.status === 'cancelled') return;
      var due = global.Store.nextDueDate(sub);
      var desc = [];
      desc.push('金额：' + U.currencySymbol(sub.currency) + U.moneySmart(sub.price) + ' / ' + global.Store.cycleLabel(sub));
      desc.push('折算月费：' + U.currencySymbol(settings.currency) + U.moneySmart(global.Store.monthlyBase(sub, settings)));
      if (sub.payMethod) desc.push('支付方式：' + sub.payMethod);
      if (sub.category) desc.push('分类：' + global.Platforms.cat(sub.category).name);
      if (sub.note) desc.push('备注：' + sub.note);
      if (sub.status === 'paused') desc.push('状态：已暂停（此条仅供参考）');

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + sub.id + '@subtrack.h5');
      lines.push('DTSTAMP:' + dtstamp(now));
      lines.push('DTSTART;VALUE=DATE:' + dstr(due));

      var u = unitLabel(sub);
      // 重复 2 年，避免无限重复占用日历
      var ruleYears = 2;
      var endDate = new Date(due.getFullYear() + ruleYears, due.getMonth(), due.getDate());
      lines.push('RRULE:FREQ=' + u.unit + ';INTERVAL=' + Math.max(1, Math.round(u.n)) + ';UNTIL=' + dstr(endDate));

      lines.push('SUMMARY:' + esc('续费 · ' + sub.name));
      lines.push('DESCRIPTION:' + esc(desc.join('\n')));
      if (sub.url) lines.push('URL:' + esc(sub.url));
      lines.push('CATEGORIES:' + esc(global.Platforms.cat(sub.category).name));
      lines.push('TRANSP:TRANSPARENT');

      if (remind > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER:-P' + remind + 'D');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:' + esc(sub.name + ' 将在 ' + remind + ' 天后续费'));
        lines.push('END:VALARM');
      }
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');

    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function download(subs, settings) {
    var text = build(subs, settings);
    var name = '订阅续费提醒-' + U.fmtDate(U.today()) + '.ics';
    U.download(name, text, 'text/calendar;charset=utf-8');
    return name;
  }

  global.ICS = { build: build, download: download };
})(window);
