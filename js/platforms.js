/* ==========================================================================
   platforms.js · 常见订阅平台预设（名称 / 分类 / 品牌色 / 首字母）
   参考 Wallos 的 Logo 库思路，这里用「品牌色 + 首字母」代替图片，避免外链依赖
   ========================================================================== */
(function (global) {
  'use strict';

  /** 分类定义：id / 名称 / 颜色 */
  var CATEGORIES = [
    { id: 'video',   name: '影音娱乐', color: '#e0424f' },
    { id: 'music',   name: '音乐',     color: '#8b5cf6' },
    { id: 'ai',      name: 'AI 工具',  color: '#0ea5e9' },
    { id: 'dev',     name: '开发工具', color: '#4f6ef7' },
    { id: 'cloud',   name: '云存储',   color: '#12a06a' },
    { id: 'life',    name: '生活服务', color: '#e08a00' },
    { id: 'reading', name: '阅读学习', color: '#0891b2' },
    { id: 'fitness', name: '健康运动', color: '#ec4899' },
    { id: 'game',    name: '游戏',     color: '#7c3aed' },
    { id: 'other',   name: '其他',     color: '#64748b' }
  ];

  var CATEGORY_MAP = {};
  CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.id] = c; });

  function cat(id) { return CATEGORY_MAP[id] || CATEGORY_MAP.other; }

  /** 周期定义：id / 名称 / 每月折算系数（乘以单价=月费） */
  var CYCLES = [
    { id: 'monthly',   name: '每月', months: 1 },
    { id: 'quarterly', name: '每季', months: 3 },
    { id: 'yearly',    name: '每年', months: 12 },
    { id: 'weekly',    name: '每周', months: 12 / 52 },
    { id: 'custom',    name: '自定义', months: 1 }
  ];

  var CYCLE_MAP = {};
  CYCLES.forEach(function (c) { CYCLE_MAP[c.id] = c; });
  function cycle(id) { return CYCLE_MAP[id] || CYCLE_MAP.monthly; }

  /** 常用平台预设 */
  var PRESETS = [
    { name: 'Netflix',        cat: 'video',   color: '#E50914', cycle: 'monthly', price: 15.49 },
    { name: 'Disney+',        cat: 'video',   color: '#113CCF', cycle: 'monthly', price: 7.99 },
    { name: 'YouTube Premium',cat: 'video',   color: '#FF0000', cycle: 'monthly', price: 13.99 },
    { name: 'Spotify',        cat: 'music',   color: '#1DB954', cycle: 'monthly', price: 10.99 },
    { name: 'Apple Music',    cat: 'music',   color: '#FA243C', cycle: 'monthly', price: 10.99 },
    { name: '腾讯视频',        cat: 'video',   color: '#FF6022', cycle: 'monthly', price: 25 },
    { name: '爱奇艺',          cat: 'video',   color: '#00BE06', cycle: 'monthly', price: 25 },
    { name: '优酷',            cat: 'video',   color: '#1FA7FF', cycle: 'monthly', price: 25 },
    { name: '芒果TV',          cat: 'video',   color: '#FF7A00', cycle: 'monthly', price: 19 },
    { name: 'B站大会员',       cat: 'video',   color: '#FB7299', cycle: 'yearly',  price: 148 },
    { name: '网易云音乐',       cat: 'music',   color: '#C20C0C', cycle: 'monthly', price: 15 },
    { name: 'QQ音乐',          cat: 'music',   color: '#31C27C', cycle: 'monthly', price: 15 },
    { name: 'ChatGPT Plus',   cat: 'ai',      color: '#10A37F', cycle: 'monthly', price: 20 },
    { name: 'Claude Pro',     cat: 'ai',      color: '#D97757', cycle: 'monthly', price: 20 },
    { name: 'Gemini Advanced',cat: 'ai',      color: '#4285F4', cycle: 'monthly', price: 19.99 },
    { name: 'GitHub Copilot', cat: 'dev',     color: '#24292F', cycle: 'monthly', price: 10 },
    { name: 'Cursor',         cat: 'dev',     color: '#000000', cycle: 'monthly', price: 20 },
    { name: 'Midjourney',     cat: 'ai',      color: '#1A1A2E', cycle: 'monthly', price: 10 },
    { name: 'GitHub Pro',     cat: 'dev',     color: '#24292F', cycle: 'monthly', price: 4 },
    { name: 'iCloud+',        cat: 'cloud',   color: '#3693F3', cycle: 'monthly', price: 3 },
    { name: 'Google One',     cat: 'cloud',   color: '#4285F4', cycle: 'monthly', price: 2.99 },
    { name: 'Dropbox Plus',   cat: 'cloud',   color: '#0061FF', cycle: 'monthly', price: 11.99 },
    { name: '百度网盘',        cat: 'cloud',   color: '#2932E1', cycle: 'monthly', price: 25 },
    { name: '阿里云盘',        cat: 'cloud',   color: '#FF6A00', cycle: 'monthly', price: 12 },
    { name: 'Notion Plus',    cat: 'reading', color: '#000000', cycle: 'monthly', price: 10 },
    { name: '百度文库',        cat: 'reading', color: '#3385FF', cycle: 'monthly', price: 20 },
    { name: '微信读书',        cat: 'reading', color: '#2E5BFF', cycle: 'monthly', price: 19 },
    { name: '京东PLUS',       cat: 'life',    color: '#E1251B', cycle: 'yearly',  price: 149 },
    { name: '淘宝88VIP',      cat: 'life',    color: '#FF4400', cycle: 'yearly',  price: 88 },
    { name: '美团外卖会员',     cat: 'life',    color: '#FFD100', cycle: 'monthly', price: 15 },
    { name: 'Keep 会员',      cat: 'fitness', color: '#00D8A0', cycle: 'monthly', price: 25 },
    { name: 'Xbox Game Pass', cat: 'game',    color: '#107C10', cycle: 'monthly', price: 16.99 },
    { name: 'Steam 会员',     cat: 'game',    color: '#1B2838', cycle: 'monthly', price: 0 }
  ];

  /** 常用币种（符号必须全局唯一：CNY 与 JPY 历史上都用 ¥，此处 JPY 改用 JP¥） */
  var CURRENCIES = [
    { code: 'CNY', symbol: '¥',   name: '人民币' },
    { code: 'USD', symbol: 'US$', name: '美元' },
    { code: 'EUR', symbol: '€',   name: '欧元' },
    { code: 'GBP', symbol: '£',   name: '英镑' },
    { code: 'JPY', symbol: 'JP¥', name: '日元' },
    { code: 'HKD', symbol: 'HK$', name: '港币' },
    { code: 'TWD', symbol: 'NT$', name: '新台币' },
    { code: 'KRW', symbol: '₩',   name: '韩元' },
    { code: 'SGD', symbol: 'S$',  name: '新加坡元' },
    { code: 'AUD', symbol: 'A$',  name: '澳元' },
    { code: 'CAD', symbol: 'C$',  name: '加元' }
  ];

  var CURRENCY_MAP = {};
  CURRENCIES.forEach(function (c) { CURRENCY_MAP[c.code] = c; });

  /** 离线近似汇率：1 单位外币 = ? CNY（仅用于本地折算，可在设置里手改基准） */
  var RATES_TO_CNY = {
    CNY: 1, USD: 7.1, EUR: 7.75, GBP: 9.05, JPY: 0.047,
    HKD: 0.91, TWD: 0.22, KRW: 0.0051, SGD: 5.3, AUD: 4.68, CAD: 5.15
  };

  /** 支付方式预设 */
  var PAY_METHODS = [
    '支付宝', '微信支付', 'Apple Pay', '银行卡', '信用卡',
    'PayPal', 'Google Play', 'App Store', '其他'
  ];

  global.Platforms = {
    CATEGORIES: CATEGORIES,
    CATEGORY_MAP: CATEGORY_MAP,
    cat: cat,
    CYCLES: CYCLES,
    CYCLE_MAP: CYCLE_MAP,
    cycle: cycle,
    PRESETS: PRESETS,
    CURRENCIES: CURRENCIES,
    CURRENCY_MAP: CURRENCY_MAP,
    RATES_TO_CNY: RATES_TO_CNY,
    PAY_METHODS: PAY_METHODS
  };
})(window);
