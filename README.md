# 订阅管家 · H5（subtrack-h5）

跨平台订阅付费管理与到期提醒，**手机 / 平板 / 电脑自适应**。纯静态、零依赖、无后端、无登录、无追踪，数据只存在本机浏览器。

## 上手

**在线直接用（推荐）**：https://lnyuqian.github.io/subtrack-h5/
手机浏览器打开后可「添加到主屏幕」，离线可用。

本地两种方式，功能差异只有 PWA 一处：

| 方式 | 全部功能 | PWA 安装 / 离线 |
|---|---|---|
| 双击 `index.html`（`file://`） | ✅ | ❌ Service Worker 需要 http(s) |
| 本地服务 | ✅ | ✅ |

```powershell
cd 'D:\dsh-web\做项目\subtrack-h5'
python -m http.server 8848 --bind 127.0.0.1
# 打开 http://127.0.0.1:8848/index.html
```

首次打开是空态，去「设置 → 载入示例数据」可以灌 10 条常见订阅先看效果。

## 版本

- **v1.2.0**（2026-11-03）第 2 批优化：付款记录页（时间轴 + 年度支出）、涨价追踪（`priceHistory` + 涨跌幅标签）、CSV 导入导出（中英双语表头 + 别名容错）
- **v1.1.0**（2026-11-03）第一批优化：币种符号去重、付款历史、图表脚注、汇率可编辑、导入合并键、PWA + 离线、今日扣费启动提醒、存储写满兜底
- v1.0.0 初版：订阅管理 / 多币种 / 到期提醒 / 日历 / 统计 / iCal 导出

## 仓库

https://github.com/lnyuqian/subtrack-h5

```powershell
git clone https://github.com/lnyuqian/subtrack-h5.git
```


## 参考仓库（按 GitHub star 排序，均有真实 Web UI）

| # | 仓库 | Star | 语言 | 许可 | 采用了什么 |
|---|---|---|---|---|---|
| 1 | [ellite/Wallos](https://github.com/ellite/Wallos) | 8,783 | PHP | GPL-3.0 | 订阅清单 + 自定义分类 + 多币种折算 + 统计视角 + 移动视图 + 多通道提醒思路 |
| 2 | [huhusmang/Subscription-Management](https://github.com/huhusmang/Subscription-Management) | 899 | TypeScript | MIT | 仪表盘 KPI + 到期倒计时 + 分类统计 + 搜索筛选 + 深浅色 + 导入导出 |
| 3 | [meceware/wapy.dev](https://github.com/meceware/wapy.dev) | 528 | JavaScript | MIT + Commons Clause | 提醒计划可配 + 标记本期已付 + 分类自定义颜色 + 支付方式 + PWA 式移动体验 |

> 未计入：`getlago/lago`（10,754★）是 B2B 计费计量引擎，`nguyenphutrong/quotio`（4,906★）是 macOS 菜单栏 AI 额度工具 —— 同主题不同题，故排除。
>
> 本项目为独立实现，未复制上述任何仓库的源码（三者分别为 PHP / React+TS / Next.js，与这里的原生 H5 技术栈不同）。

## 功能

- **订阅管理**：增删改、暂停/恢复/取消、自动续费开关、支付方式、管理链接、备注、标识色
- **周期与金额**：每周 / 每月 / 每季 / 每年 / 自定义 N 个月；任选币种（11 种），统一折算到基准币种
- **到期提醒**：下次扣费倒计时、提醒窗口可调（1–30 天）、提醒中心抽屉、浏览器通知（每日最多一条）
- **启动提醒**：当天有扣费时弹窗列出明细，每天最多一次
- **付款记录**：实付时间轴按年月分组、累计/年度实付统计、按年筛选
- **涨价追踪**：记录价格变更历史，卡片上标出涨跌幅（hover 看具体区间）
- **日历**：月视图按日显示扣费事件，可按周一/周日起始，本月预计支出
- **统计**：未来 12 个月扣费预测、月费排行、付费周期构成、分类明细占比、合计与高峰月脚注
- **数据进出**：JSON 备份、CSV 导入导出（中英双语表头 + 别名容错 + **自动识别 UTF-8/GBK**）、`.ics` 导出到系统日历
- **主题**：浅色 / 深色 / 跟随系统

## 目录

```
subtrack-h5/
├── index.html          页面骨架
├── css/style.css       全部样式（含 3 个响应式断点）
├── js/platforms.js     平台预设、分类、币种、汇率、支付方式
├── js/utils.js         日期/金额/DOM/图标工具
├── js/store.js         数据层（localStorage + 业务计算）
├── js/ics.js           iCalendar 导出
├── js/ui.js            渲染层（5 个视图 + 表单）
├── js/app.js           控制器（路由/事件/主题/提醒）
├── verify.js           Playwright 实测脚本（33 项）
└── shots/              实测截图与报告
```

## 自适应断点

| 断点 | 表现 |
|---|---|
| ≥1081px | 左侧固定侧栏 + 顶栏；订阅 3 列；概览/统计双列 |
| 861–1080px | 侧栏常驻；双列内容降为单列 |
| ≤860px | 侧栏变抽屉 + 底部 Tab 栏 + 中间悬浮新增按钮；订阅 2 列；弹窗改底部弹层 |
| ≤339px | 订阅退为 1 列 |
| 视口高 ≤520px | 弹窗改为**居中**并留 10px 上下边距（原来底部贴边会把页脚顶出屏外） |
| 视口高 ≤380px | 弹窗整体滚动，头部与页脚 `sticky`，「保存」始终可见可点 |

> 矮视口断点专门覆盖「DSH 右侧栏 / 手机模拟预览未全屏」这类又窄又矮的容器。

## 新增订阅

「订阅名称」是**自由输入框**，任何平台都能填，不受预设限制。
下面的「从常用平台快速填充」默认折叠，点开可一键带入名称 / 分类 / 周期 / 币种 / 参考价。

## 实测

一条命令跑全部（D8：本地即 CI）：

```powershell
node run-tests.js          # 全部四套，约 79s
node run-tests.js main     # 只跑主回归
node run-tests.js tiny     # 只跑矮视口
node run-tests.js opt1     # 只跑第 1 批 AC
node run-tests.js opt2     # 只跑第 2 批 AC
```

等价的逐套命令（需要先设 `NODE_PATH`）：

```powershell
$env:NODE_PATH = 'C:\Users\1、\AppData\Roaming\npm\node_modules'
node verify.js        # 主回归：1440 / 768 / 375 + 深色，34 项
node verify-tiny.js   # 矮视口专项：120–600px 高共 8 种尺寸，16 项
node verify-opt1.js   # 第 1 批 AC1–AC10，23 项
node verify-opt2.js   # 第 2 批 AC11–AC21，26 项
```

合计 **99 项断言全绿，零控制台错误**。报告见 `shots/report*.json`。

> **`test.cmd` 的环境限制**：`test.cmd` 内部也是调 `run-tests.js`，但在 **DSH 沙箱里经 `cmd.exe` 启动 Playwright 会挂起**（同一条命令用 `node run-tests.js` 直跑 15–79s 正常）。
> 已实测排除脚本自身问题：cmd 里 `node --version` 0.1s、cmd 里嵌套 spawn 正常、Playwright 模块定位正确。
> 结论：这是沙箱对 `cmd.exe` → Chromium 子进程链的限制，**在普通终端里 `test.cmd` 可正常使用**；在此环境请用 `node run-tests.js`。

基线对照（勿删）：
- `css/style.before-fix.css` —— 矮视口修复前的旧样式
- `*.before-opt1.*` —— 第一批优化前的全部源文件
- `*.before-opt2.*` —— 第二批优化前的全部源文件

## PWA

| 文件 | 作用 |
|---|---|
| `manifest.webmanifest` | 应用名、图标、独立窗口、快捷方式 |
| `sw.js` | 离线缓存：导航走 network-first（保证拿新版），静态资源走 stale-while-revalidate |
| `icons/` | 192 / 512 / maskable 三种图标 |

`sw.js` 改版时记得同步改 `VERSION` 常量，否则旧缓存不会清。

已知边界（有意为之）：
- 浏览器通知只在**页面打开时**触发；关掉页面不会推 —— 需要真·离线推送请用导出的 `.ics`，或用 PWA 安装后配合系统日历
- 汇率默认是内置近似值，可在「设置 → 汇率」里手改；金额折算只用于本机统计，扣费金额始终显示原币种
- 数据在 `localStorage`，换设备/清缓存会丢，请用 JSON 导出备份；写满时会自动裁剪 24 个月前的付款记录，仍失败则明确报错
