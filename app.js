/* app.js
   الواجهة: الإدخالات، الدخل المتغير، الرسوم، السيناريوهات، الجدول، التنبيهات والتوصيات.
   يعتمد على model.js (الحسابات) وعلى Chart.js. لا يرسل أي بيانات إلى أي جهة. */
(function () {
  'use strict';
  var M = window.BudgetModel;
  var KEY = 'budget-lab-v3', OLD_KEY = 'budget-lab-v2';
  var MAX_SCN = 3;
  var uid = 1;

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { v = +v; if (isNaN(v)) v = 0; return Math.min(hi, Math.max(lo, v)); }
  function mk(name, amount, kind) { return { id: uid++, name: name, amount: amount, base: amount > 0 ? amount : 100000, kind: kind }; }
  function mkDebt(name, balance, rate, payment) { return { id: uid++, name: name, balance: balance, rate: rate, payment: payment }; }
  function mkScn(name, gEx, gOb, goal, incExtra, extraDebt) { return { id: uid++, name: name, gEx: gEx, gOb: gOb, goal: goal, incExtra: incExtra, extraDebt: extraDebt }; }

  function example() {
    uid = 1;
    return {
      salary: 1250000, other: 150000, start: 500000, ret: 0, goal: 200000, g: 0,
      varIncome: false, incomeMonths: [1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000],
      items: [
        mk('الإيجار', 350000, 'ob'), mk('اشتراك المولدة', 60000, 'ob'), mk('الإنترنت', 35000, 'ob'),
        mk('الطعام والمواد الغذائية', 300000, 'ex'), mk('المواصلات', 80000, 'ex'), mk('الاتصالات', 25000, 'ex'),
        mk('الصحة', 50000, 'ex'), mk('الترفيه', 60000, 'ex'), mk('الملابس', 40000, 'ex')
      ],
      debts: [mkDebt('سلفة مصرفية', 3000000, 7, 150000), mkDebt('قرض أجهزة منزلية', 1200000, 0, 100000)],
      scenarios: [mkScn('خطة التقشف', -25, 0, 250000, 0, 0)]
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); if (!raw) return null;
      var s = JSON.parse(raw); if (!s || !Array.isArray(s.items) || !Array.isArray(s.debts)) return null;
      var max = 0;
      function seen(id) { id = +id || 0; if (id > max) max = id; return id; }
      var out = { salary: Math.max(0, +s.salary || 0), other: Math.max(0, +s.other || 0), start: Math.max(0, +s.start || 0),
        ret: clamp(s.ret, 0, 30), goal: Math.max(0, +s.goal || 0), g: clamp(s.g, -40, 40), varIncome: !!s.varIncome,
        incomeMonths: [], items: [], debts: [], scenarios: [] };
      var fixed = out.salary + out.other;
      for (var i = 0; i < 12; i++) { var v = s.incomeMonths && s.incomeMonths[i]; out.incomeMonths.push(v === undefined || v === null || isNaN(+v) ? fixed : Math.max(0, +v)); }
      s.items.forEach(function (it) {
        out.items.push({ id: seen(it.id), name: String(it.name || ''), amount: Math.max(0, +it.amount || 0), base: Math.max(1, +it.base || 100000), kind: it.kind === 'ex' ? 'ex' : 'ob' });
      });
      s.debts.forEach(function (d) {
        out.debts.push({ id: seen(d.id), name: String(d.name || ''), balance: Math.max(0, +d.balance || 0), rate: clamp(d.rate, 0, 100), payment: Math.max(0, +d.payment || 0) });
      });
      if (Array.isArray(s.scenarios)) {
        s.scenarios.slice(0, MAX_SCN).forEach(function (c) {
          out.scenarios.push({ id: seen(c.id), name: String(c.name || ''), gEx: clamp(c.gEx, -50, 50), gOb: clamp(c.gOb, -30, 30),
            goal: Math.max(0, +c.goal || 0), incExtra: Math.max(0, +c.incExtra || 0), extraDebt: Math.max(0, +c.extraDebt || 0) });
        });
      }
      uid = max + 1;
      if (!Array.isArray(s.scenarios)) out.scenarios = [mkScn('خطة التقشف', -25, 0, 250000, 0, 0)];
      return out;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var state = load() || example();

  /* ---------- الدخل المتغير ---------- */
  function renderIncomeMonths() {
    var box = $('inc-months'); box.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var f = document.createElement('div'); f.className = 'field';
      f.innerHTML = '<label for="im-' + i + '">' + M.monthLabel(i) + '</label><input class="inp" id="im-' + i + '" type="number" min="0" step="10000" inputmode="numeric">';
      f.querySelector('input').value = state.incomeMonths[i];
      box.appendChild(f);
    }
  }
  function syncVarUI() {
    $('varinc').checked = state.varIncome;
    $('inc-box').hidden = !state.varIncome;
    $('salary').disabled = state.varIncome; $('other').disabled = state.varIncome;
  }

  /* ---------- الصفوف ---------- */
  function sliderMax(it) { return Math.max(5000, Math.ceil(it.base * 2 / 5000) * 5000); }

  function buildItemRow(it) {
    var d = document.createElement('div');
    d.className = 'row'; d.setAttribute('data-id', it.id);
    d.innerHTML =
      '<div class="row-main">' +
        '<input class="inp nm" id="nm-' + it.id + '" type="text" placeholder="اسم البند" aria-label="اسم البند">' +
        '<div class="withunit"><input class="inp" id="amt-' + it.id + '" type="number" min="0" step="5000" inputmode="numeric" aria-label="المبلغ الشهري"><span class="u">د.ع</span></div>' +
        '<button class="del" type="button" aria-label="حذف البند">×</button>' +
      '</div>' +
      '<div class="row-sub">' +
        '<input type="range" id="sl-' + it.id + '" min="0" max="' + sliderMax(it) + '" step="5000" aria-label="تعديل المبلغ">' +
        '<span class="share" id="sh-' + it.id + '"></span>' +
      '</div>';
    d.querySelector('.nm').value = it.name;
    d.querySelector('#amt-' + it.id).value = it.amount;
    d.querySelector('#sl-' + it.id).value = it.amount;
    return d;
  }

  function buildDebtRow(db) {
    var d = document.createElement('div');
    d.className = 'row'; d.setAttribute('data-id', db.id);
    d.innerHTML =
      '<div class="row-main dm">' +
        '<input class="inp" id="dn-' + db.id + '" data-f="name" type="text" placeholder="اسم الدين" aria-label="اسم الدين">' +
        '<button class="del" type="button" aria-label="حذف الدين">×</button>' +
      '</div>' +
      '<div class="dfields">' +
        '<div class="field"><label for="db-' + db.id + '">الرصيد المتبقي</label><input class="inp" id="db-' + db.id + '" data-f="balance" type="number" min="0" step="50000" inputmode="numeric"></div>' +
        '<div class="field"><label for="dr-' + db.id + '">الفائدة السنوية %</label><input class="inp" id="dr-' + db.id + '" data-f="rate" type="number" min="0" max="100" step="0.5" inputmode="decimal"></div>' +
        '<div class="field"><label for="dp-' + db.id + '">القسط الشهري</label><input class="inp" id="dp-' + db.id + '" data-f="payment" type="number" min="0" step="10000" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="share" id="dsh-' + db.id + '"></div>';
    d.querySelector('[data-f=name]').value = db.name;
    d.querySelector('[data-f=balance]').value = db.balance;
    d.querySelector('[data-f=rate]').value = db.rate;
    d.querySelector('[data-f=payment]').value = db.payment;
    return d;
  }

  function emptyNote(text) { var e = document.createElement('div'); e.className = 'empty'; e.textContent = text; return e; }

  function renderLists(focusId) {
    ['ob', 'ex'].forEach(function (k) {
      var box = $('list-' + k); box.innerHTML = '';
      var items = state.items.filter(function (i) { return i.kind === k; });
      if (!items.length) box.appendChild(emptyNote('لا توجد بنود. أضف أول بند من الزر بالأسفل.'));
      items.forEach(function (it) { box.appendChild(buildItemRow(it)); });
    });
    var db = $('list-db'); db.innerHTML = '';
    if (!state.debts.length) db.appendChild(emptyNote('لا توجد ديون مسجلة.'));
    state.debts.forEach(function (d) { db.appendChild(buildDebtRow(d)); });
    update();
    if (focusId) { var f = $('nm-' + focusId) || $('dn-' + focusId); if (f) f.focus(); }
  }
  function findIn(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  /* ---------- بطاقات السيناريوهات ---------- */
  var SC_VARS = ['--c1', '--c2', '--c4'];
  function scVar(i) { return i === 0 ? 'var(--ink)' : 'var(' + SC_VARS[(i - 1) % 3] + ')'; }

  function buildScnCard(s, idx) {
    var d = document.createElement('div');
    d.className = 'scn'; d.setAttribute('data-id', s.id);
    d.innerHTML =
      '<div class="scn-h"><span class="sw" style="--sw:' + scVar(idx + 1) + '"></span>' +
        '<input class="inp" id="sn-' + s.id + '" data-f="name" type="text" placeholder="اسم السيناريو" aria-label="اسم السيناريو">' +
        '<button class="del" type="button" aria-label="حذف السيناريو">×</button></div>' +
      '<div class="scn-f"><label for="sg-' + s.id + '">المصروفات المتغيرة <b id="sgv-' + s.id + '"></b></label>' +
        '<input type="range" id="sg-' + s.id + '" data-f="gEx" min="-50" max="50" step="5"></div>' +
      '<div class="scn-f"><label for="so-' + s.id + '">الالتزامات الثابتة <b id="sov-' + s.id + '"></b></label>' +
        '<input type="range" id="so-' + s.id + '" data-f="gOb" min="-30" max="30" step="5"></div>' +
      '<div class="fields">' +
        '<div class="field"><label for="sl-g-' + s.id + '">هدف الادخار الشهري</label><div class="withunit"><input class="inp" id="sl-g-' + s.id + '" data-f="goal" type="number" min="0" step="10000" inputmode="numeric"><span class="u">د.ع</span></div></div>' +
        '<div class="field"><label for="si-' + s.id + '">دخل إضافي شهري</label><div class="withunit"><input class="inp" id="si-' + s.id + '" data-f="incExtra" type="number" min="0" step="10000" inputmode="numeric"><span class="u">د.ع</span></div></div>' +
        '<div class="field"><label for="sd-' + s.id + '">دفعة إضافية للدين شهرياً</label><div class="withunit"><input class="inp" id="sd-' + s.id + '" data-f="extraDebt" type="number" min="0" step="10000" inputmode="numeric"><span class="u">د.ع</span></div></div>' +
      '</div>';
    d.querySelector('[data-f=name]').value = s.name;
    ['gEx', 'gOb', 'goal', 'incExtra', 'extraDebt'].forEach(function (f) { d.querySelector('[data-f=' + f + ']').value = s[f]; });
    return d;
  }
  function renderScnCards(focusId) {
    var box = $('scn-cards'); box.innerHTML = '';
    var base = document.createElement('div'); base.className = 'scn';
    base.innerHTML = '<div class="scn-h"><span class="sw" style="--sw:' + scVar(0) + '"></span><b>الوضع الحالي</b><span></span></div>' +
      '<p>أرقامك كما أدخلتها، بهدف الادخار الحالي وبلا أي تعديل. هو أساس المقارنة.</p>';
    box.appendChild(base);
    state.scenarios.forEach(function (s, i) { box.appendChild(buildScnCard(s, i)); });
    $('add-scn').disabled = state.scenarios.length >= MAX_SCN;
    update();
    if (focusId) { var f = $('sn-' + focusId); if (f) f.focus(); }
  }
  function signed(v, up, down) { return v === 0 ? 'بلا تغيير' : (v < 0 ? down : up) + M.pct(Math.abs(v)); }

  /* ---------- الرسوم ---------- */
  var donut = null, line = null, scLine = null, theme = {};
  function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function hexA(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function readTheme() {
    theme = { ink: cv('--ink'), muted: cv('--muted'), line: cv('--line'), surface: cv('--surface'), accent: cv('--accent'), good: cv('--good'), free: cv('--free'), pal: [] };
    for (var i = 1; i <= 8; i++) theme.pal.push(cv('--c' + i));
  }
  function compact(v) {
    var a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a % 1e6 === 0 ? 0 : 1) + ' م';
    if (a >= 1e3) return s + Math.round(a / 1e3) + ' ألف';
    return s + a;
  }
  var TIP = { rtl: true, textDirection: 'rtl', padding: 10, boxPadding: 4 };
  function lineOptions() {
    return { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, left: 6 } },
      plugins: { legend: { display: false }, tooltip: Object.assign({}, TIP, { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + M.fmt(c.parsed.y) + ' د.ع'; } } }) },
      scales: {
        x: { reverse: true, grid: { display: false }, border: { color: theme.line }, ticks: { color: theme.muted, maxRotation: 0, autoSkip: true } },
        y: { position: 'right', border: { display: false }, ticks: { color: theme.muted, callback: function (v) { return compact(v); } },
          grid: { color: function (c) { return c.tick.value === 0 ? theme.muted : theme.line; }, lineWidth: function (c) { return c.tick.value === 0 ? 1.5 : 1; } } }
      } };
  }
  function applyLineTheme(chart) {
    var sc = chart.options.scales;
    sc.x.ticks.color = theme.muted; sc.x.border.color = theme.line; sc.y.ticks.color = theme.muted;
  }
  function initCharts() {
    if (typeof Chart === 'undefined') { $('fallback').hidden = false; $('sc-fallback').hidden = false; return; }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    Chart.defaults.font.family = "'IBM Plex Sans Arabic', Tahoma, sans-serif";
    Chart.defaults.animation = reduce ? false : { duration: 250 };
    readTheme();
    donut = new Chart($('donut'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: theme.surface, borderWidth: 2, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { display: false }, tooltip: Object.assign({}, TIP, { callbacks: { label: function (c) {
          var tot = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
          return ' ' + c.label + ': ' + M.fmt(c.parsed) + ' د.ع (' + Math.round(c.parsed / tot * 100) + '%)'; } } }) } }
    });
    line = new Chart($('line'), {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'المتوقع', data: [], borderColor: theme.accent, backgroundColor: hexA(theme.accent, 0.14), borderWidth: 3, fill: 'origin', tension: 0.2,
          pointRadius: function (c) { return c.dataIndex === 11 ? 6 : 0; }, pointHoverRadius: 6, pointBackgroundColor: theme.accent, pointBorderColor: theme.surface, pointBorderWidth: 2 },
        { label: 'بلا تعديل', data: [], borderColor: theme.muted, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 },
        { label: 'مسار الهدف', data: [], borderColor: theme.good, borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 }
      ] },
      options: lineOptions()
    });
    scLine = new Chart($('scline'), { type: 'line', data: { labels: [], datasets: [] }, options: lineOptions() });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { update(); });
  }

  /* ---------- التحديث ---------- */
  var lastTsv = '';

  function setMoney(id, n, neg) { var el = $(id); el.innerHTML = M.money(n); if (neg !== undefined) el.className = neg && n < 0 ? 'neg' : ''; }

  function update() {
    var a = M.analyze(state), adv = M.advice(a, state), g = state.g, inc = a.inc, vi = a.varIncome;
    var rows = a.rows, F = rows[11].bal, F0 = a.baseRows[11].bal;
    var avgNote = vi ? ' في المتوسط' : '';

    // البطاقة العليا
    var big = $('hero-bal'); big.innerHTML = M.money(F); big.className = 'big' + (F < 0 ? ' neg' : '');
    $('hero-delta').innerHTML = g === 0 ? 'حرّك المؤشر لترى أثر تغيير الإنفاق على رصيدك.'
      : (F - F0 >= 0 ? 'أعلى بمقدار ' : 'أقل بمقدار ') + M.money(Math.abs(F - F0)) + ' مقارنة بلا تعديل.';
    var pill = $('pill'), pt;
    if (a.surplus < 0) { pill.className = 'pill bad'; pt = 'عجز شهري'; }
    else if (a.rate >= 20) { pill.className = 'pill good'; pt = 'ادخار ممتاز'; }
    else if (a.rate >= 10) { pill.className = 'pill ok'; pt = 'ادخار جيد'; }
    else { pill.className = 'pill warn'; pt = 'هامش ضيق'; }
    $('pill-t').textContent = pt;
    $('hero-note').innerHTML = a.surplus < 0 ? 'ينقصك ' + M.money(-a.surplus) + ' كل شهر' + avgNote + '.'
      : 'تدّخر ' + M.money(a.contrib) + ' شهرياً' + avgNote + (state.goal > 0 ? ' من هدف ' + M.money(state.goal) + '.' : '.');
    $('gval').innerHTML = signed(g, 'زيادة ', 'تقليص ');

    $('t-inc-l').textContent = vi ? 'متوسط الدخل الشهري' : 'الدخل الشهري';
    $('al-note').textContent = vi ? 'متوسط الشهر' : 'الشهر الأول';
    $('inc-stat').innerHTML = vi ? 'المتوسط ' + M.money(inc) + ' · الأدنى ' + M.money(a.incMin) + ' · الأعلى ' + M.money(a.incMax) : '';
    setMoney('t-inc', inc); setMoney('t-exp', a.ob + a.ex); setMoney('t-debt', a.debtPay); setMoney('t-sur', a.surplus, true);
    setMoney('sub-ob', a.ob); setMoney('sub-ex', a.ex);
    var debtTotal = state.debts.reduce(function (s, d) { return s + d.balance; }, 0);
    $('sub-db').innerHTML = 'الرصيد ' + M.money(debtTotal);

    // شريط التوزيع
    var total = Math.max(inc, a.ob + a.ex + a.debtPay, 1);
    function seg(id, v) { $(id).style.width = (Math.max(v, 0) / total * 100) + '%'; }
    seg('seg-ob', a.ob); seg('seg-ex', a.ex); seg('seg-db', a.debtPay); seg('seg-sv', a.contrib); seg('seg-fr', a.free);
    function share(v) { return M.pct(inc > 0 ? v / inc * 100 : 0); }
    $('al-ob').innerHTML = share(a.ob); $('al-ex').innerHTML = share(a.ex); $('al-db').innerHTML = share(a.debtPay);
    $('al-sv').innerHTML = share(a.contrib); $('al-fr').innerHTML = share(a.free);

    // ملاحظات الصفوف
    state.items.forEach(function (it) {
      var el = $('sh-' + it.id); if (!el) return;
      var e = M.effAmount(it, g);
      el.innerHTML = (it.kind === 'ex' && g !== 0 ? M.money(e) + ' · ' : '') + share(e) + ' من الدخل';
    });
    state.debts.forEach(function (d) {
      var el = $('dsh-' + d.id); if (!el) return;
      var m = M.debtMonths(d);
      if (d.balance <= 0.5) { el.className = 'share'; el.textContent = 'لا يوجد رصيد متبقٍ.'; }
      else if (m === null) { el.className = 'share bad'; el.textContent = 'القسط لا يكفي لإنهاء هذا الدين.'; }
      else { el.className = 'share'; el.innerHTML = 'ينتهي خلال ' + M.fmtMonths(m) + ' (' + M.monthYear(m - 1) + ').'; }
    });

    // الرسم الدائري وقائمته (الشهر الأول للبنود، ومتوسط الادخار والفائض)
    var slices = [];
    state.items.forEach(function (it) {
      var e = M.effAmount(it, g); if (e <= 0) return;
      slices.push({ name: it.name || 'بدون اسم', tag: it.kind === 'ex' ? 'متغير' : 'التزام', val: e, c: 'pal' });
    });
    rows[0].parts.forEach(function (p) { if (p.pay > 0) slices.push({ name: p.name || 'دين بلا اسم', tag: 'قسط', val: p.pay, c: 'pal' }); });
    if (a.contrib > 0) slices.push({ name: 'الادخار', tag: '', val: a.contrib, c: 'good' });
    if (a.free > 0.5) slices.push({ name: 'فائض حر', tag: '', val: a.free, c: 'free' });

    $('donut-total').innerHTML = M.money(a.outflow);
    var lg = $('legend'); lg.innerHTML = ''; var k = 0;
    slices.forEach(function (s) {
      var idx = s.c === 'pal' ? k++ : -1;
      var li = document.createElement('li');
      var sw = s.c === 'good' ? 'var(--good)' : s.c === 'free' ? 'var(--free)' : 'var(--c' + (idx % 8 + 1) + ')';
      li.innerHTML = '<i style="--sw:' + sw + '"></i><span class="n">' + M.esc(s.name) + (s.tag ? ' <small>· ' + s.tag + '</small>' : '') + '</span><span>' + M.money(s.val) + '</span><span class="p">' + share(s.val) + '</span>';
      lg.appendChild(li);
    });
    $('lk-base').hidden = g === 0;
    $('lk-target').hidden = state.goal <= 0;

    // الجدول الشهري
    function td(v) { return '<td class="n' + (v < -0.5 ? ' neg' : '') + '">' + M.fmt(v) + '</td>'; }
    var html = '', tsv = ['الشهر\tالدخل\tالمصروفات\tالأقساط\tالادخار\tفائض حر\tرصيد المدخرات\tالدين المتبقي'];
    var sums = { income: 0, exp: 0, debtPay: 0, contrib: 0, free: 0 };
    rows.forEach(function (r, i) {
      html += '<tr><td>' + M.monthLabel(i) + '</td>' + td(r.income) + td(r.exp) + td(r.debtPay) + td(r.contrib) + td(r.free) + td(r.bal) + td(r.debtLeft) + '</tr>';
      tsv.push([M.monthLabel(i), M.fmt(r.income), M.fmt(r.exp), M.fmt(r.debtPay), M.fmt(r.contrib), M.fmt(r.free), M.fmt(r.bal), M.fmt(r.debtLeft)].join('\t'));
      sums.income += r.income; sums.exp += r.exp; sums.debtPay += r.debtPay; sums.contrib += r.contrib; sums.free += r.free;
    });
    $('tbody').innerHTML = html;
    var last = rows[11];
    $('tfoot').innerHTML = '<tr><td>المجموع</td>' + td(sums.income) + td(sums.exp) + td(sums.debtPay) + td(sums.contrib) + td(sums.free) + td(last.bal) + td(last.debtLeft) + '</tr>';
    tsv.push(['المجموع', M.fmt(sums.income), M.fmt(sums.exp), M.fmt(sums.debtPay), M.fmt(sums.contrib), M.fmt(sums.free), M.fmt(last.bal), M.fmt(last.debtLeft)].join('\t'));
    lastTsv = tsv.join('\n');

    // التنبيهات
    $('alerts').innerHTML = adv.alerts.map(function (x) {
      return '<li class="al ' + x.level + '"><i></i><div><b>' + x.title + '</b><span class="t">' + x.text + '</span></div></li>';
    }).join('');

    // التوصيات
    var priLabel = { urgent: 'عاجل', important: 'مهم', improve: 'تحسين' };
    $('recs').innerHTML = adv.recs.length ? adv.recs.map(function (r) {
      return '<article class="rec ' + r.pri + '"><span class="pri"><i></i>' + priLabel[r.pri] + '</span><h3>' + r.title + '</h3><p>' + r.body + '</p>' +
        (r.impact ? '<div class="impact">' + r.impact + '</div>' : '') + '</article>';
    }).join('') : '<div class="empty">أدخل دخلك وبنودك لتظهر التوصيات.</div>';

    updateScenarios();
    refreshCharts(a, slices);
  }

  /* ---------- مقارنة السيناريوهات ---------- */
  var scList = [];
  function updateScenarios() {
    scList = M.compare(state);
    state.scenarios.forEach(function (s) {
      var a = $('sgv-' + s.id), b = $('sov-' + s.id);
      if (a) a.innerHTML = signed(s.gEx, 'زيادة ', 'تقليص ');
      if (b) b.innerHTML = signed(s.gOb, 'زيادة ', 'تقليص ');
    });

    // وسيلة الإيضاح
    $('sc-legend').innerHTML = scList.map(function (s, i) {
      return '<span><i class="ln' + (i === 0 ? ' dash' : '') + '" style="--lc:' + scVar(i) + '"></i>' + M.esc(s.name) + '</span>';
    }).join('');

    // الجدول
    var base = scList[0].m;
    var defs = [
      { l: 'رصيد المدخرات بعد 12 شهراً', f: function (m) { return m.finalBal; }, better: 1 },
      { l: 'إجمالي ما ادُّخر خلال السنة', f: function (m) { return m.saved; }, better: 1 },
      { l: 'متوسط الفائض الشهري', f: function (m) { return m.avgSurplus; }, better: 1 },
      { l: 'معدل الادخار من الدخل', f: function (m) { return m.rate; }, better: 1, pct: true },
      { l: 'الدين المتبقي بعد 12 شهراً', f: function (m) { return m.debtLeft; }, better: -1 },
      { l: 'موعد انتهاء الديون', text: function (m) { return !m.hasDebt ? '—' : m.debtFree === null ? 'بعد أكثر من سنة' : M.monthLabel(m.debtFree); } },
      { l: 'أشهر العجز', f: function (m) { return m.deficitMonths; }, better: -1, int: true }
    ];
    $('cmp-head').innerHTML = '<tr><th>المقياس</th>' + scList.map(function (s, i) {
      return '<th><span class="sw" style="--sw:' + scVar(i) + '"></span>' + M.esc(s.name) + '</th>';
    }).join('') + '</tr>';
    $('cmp-body').innerHTML = defs.map(function (d) {
      var cells = scList.map(function (s, i) {
        if (d.text) return '<td class="c">' + d.text(s.m) + '</td>';
        var v = d.f(s.m), shown = d.pct ? M.pct(v) : d.int ? M.num(String(v)) : M.fmt(v);
        var diff = '';
        if (i > 0) {
          var dv = v - d.f(base);
          if (Math.abs(dv) >= (d.pct ? 0.5 : 0.5)) {
            var good = dv * d.better > 0;
            var txt = d.pct ? M.pct(Math.abs(dv)) : d.int ? M.num(String(Math.abs(dv))) : M.fmt(Math.abs(dv));
            diff = '<small class="diff ' + (good ? 'pos' : 'neg') + '">' + (dv > 0 ? '+' : '−') + txt + '</small>';
          }
        }
        return '<td class="c"><span class="num">' + shown + '</span>' + diff + '</td>';
      }).join('');
      return '<tr><td>' + d.l + '</td>' + cells + '</tr>';
    }).join('');

    if (scLine) {
      readTheme();
      var palIdx = [0, 1, 3];
      scLine.data.labels = []; for (var i = 0; i < 12; i++) scLine.data.labels.push(M.monthLabel(i));
      scLine.data.datasets = scList.map(function (s, n) {
        var col = n === 0 ? theme.ink : theme.pal[palIdx[(n - 1) % 3]];
        return { label: s.name, data: s.rows.map(function (r) { return r.bal; }), borderColor: col, backgroundColor: col,
          borderWidth: n === 0 ? 3 : 2.5, borderDash: n === 0 ? [6, 5] : [], fill: false, tension: 0.2,
          pointRadius: function (c) { return c.dataIndex === 11 ? 5 : 0; }, pointHoverRadius: 5, pointBackgroundColor: col, pointBorderColor: theme.surface, pointBorderWidth: 2 };
      });
      applyLineTheme(scLine);
      scLine.update();
    }
  }

  function refreshCharts(a, slices) {
    if (!donut || !line) return;
    readTheme();
    var labels = [], data = [], colors = [], k = 0;
    slices.forEach(function (s) {
      labels.push(s.name); data.push(s.val);
      colors.push(s.c === 'good' ? theme.good : s.c === 'free' ? theme.free : theme.pal[k++ % 8]);
    });
    if (!data.length) { labels = ['لا توجد بنود']; data = [1]; colors = [theme.line]; }
    donut.data.labels = labels; donut.data.datasets[0].data = data; donut.data.datasets[0].backgroundColor = colors; donut.data.datasets[0].borderColor = theme.surface;
    donut.update();

    var lab = []; for (var i = 0; i < 12; i++) lab.push(M.monthLabel(i));
    line.data.labels = lab;
    var s0 = line.data.datasets[0], s1 = line.data.datasets[1], s2 = line.data.datasets[2];
    s0.data = a.rows.map(function (r) { return r.bal; });
    s0.borderColor = theme.accent; s0.backgroundColor = hexA(theme.accent, 0.14); s0.pointBackgroundColor = theme.accent; s0.pointBorderColor = theme.surface;
    s1.data = a.baseRows.map(function (r) { return r.bal; }); s1.borderColor = theme.muted; s1.hidden = state.g === 0;
    s2.data = a.target; s2.borderColor = theme.good; s2.hidden = state.goal <= 0;
    applyLineTheme(line);
    line.update();
  }

  /* ---------- الأحداث ---------- */
  ['salary', 'other', 'start', 'goal', 'ret'].forEach(function (key) {
    $(key).addEventListener('input', function (e) {
      var v = parseFloat(e.target.value); v = isNaN(v) ? 0 : Math.max(0, v);
      if (key === 'ret') v = Math.min(30, v);
      state[key] = v; update(); save();
    });
  });
  $('gs').addEventListener('input', function (e) { state.g = +e.target.value; update(); save(); });

  $('varinc').addEventListener('change', function (e) {
    state.varIncome = e.target.checked;
    syncVarUI(); renderIncomeMonths(); update(); save();
  });
  $('inc-months').addEventListener('input', function (e) {
    var m = /^im-(\d+)$/.exec(e.target.id || ''); if (!m) return;
    var v = parseFloat(e.target.value);
    state.incomeMonths[+m[1]] = isNaN(v) ? 0 : Math.max(0, v);
    update(); save();
  });
  $('inc-fill').addEventListener('click', function () {
    var fixed = state.salary + state.other;
    state.incomeMonths = state.incomeMonths.map(function () { return fixed; });
    renderIncomeMonths(); update(); save();
  });

  function onItemInput(e) {
    var row = e.target.closest('.row'); if (!row) return;
    var it = findIn(state.items, +row.getAttribute('data-id')); if (!it) return;
    var t = e.target;
    if (t.classList.contains('nm')) it.name = t.value;
    else if (t.type === 'number') { var v = parseFloat(t.value); it.amount = isNaN(v) ? 0 : Math.max(0, v); row.querySelector('input[type=range]').value = it.amount; }
    else if (t.type === 'range') { it.amount = +t.value; row.querySelector('input[type=number]').value = it.amount; }
    update(); save();
  }
  function onDebtInput(e) {
    var row = e.target.closest('.row'); if (!row) return;
    var d = findIn(state.debts, +row.getAttribute('data-id')); if (!d) return;
    var f = e.target.getAttribute('data-f'); if (!f) return;
    if (f === 'name') d.name = e.target.value;
    else { var v = parseFloat(e.target.value); v = isNaN(v) ? 0 : Math.max(0, v); d[f] = f === 'rate' ? Math.min(100, v) : v; }
    update(); save();
  }
  function onScnInput(e) {
    var card = e.target.closest('.scn'); if (!card) return;
    var s = findIn(state.scenarios, +card.getAttribute('data-id')); if (!s) return;
    var f = e.target.getAttribute('data-f'); if (!f) return;
    if (f === 'name') s.name = e.target.value;
    else {
      var v = parseFloat(e.target.value); v = isNaN(v) ? 0 : v;
      s[f] = f === 'gEx' ? clamp(v, -50, 50) : f === 'gOb' ? clamp(v, -30, 30) : Math.max(0, v);
    }
    update(); save();
  }
  function onDelete(listKey) {
    return function (e) {
      var b = e.target.closest('.del'); if (!b) return;
      var id = +b.closest('.row').getAttribute('data-id');
      if (listKey === 'debts') state.debts = state.debts.filter(function (d) { return d.id !== id; });
      else state.items = state.items.filter(function (i) { return i.id !== id; });
      renderLists(); save();
    };
  }
  ['list-ob', 'list-ex'].forEach(function (id) { $(id).addEventListener('input', onItemInput); $(id).addEventListener('click', onDelete('items')); });
  $('list-db').addEventListener('input', onDebtInput); $('list-db').addEventListener('click', onDelete('debts'));
  $('scn-cards').addEventListener('input', onScnInput);
  $('scn-cards').addEventListener('click', function (e) {
    var b = e.target.closest('.del'); if (!b) return;
    var id = +b.closest('.scn').getAttribute('data-id');
    state.scenarios = state.scenarios.filter(function (s) { return s.id !== id; });
    renderScnCards(); save();
  });
  $('add-ob').addEventListener('click', function () { var it = mk('', 0, 'ob'); state.items.push(it); renderLists(it.id); save(); });
  $('add-ex').addEventListener('click', function () { var it = mk('', 0, 'ex'); state.items.push(it); renderLists(it.id); save(); });
  $('add-db').addEventListener('click', function () { var d = mkDebt('', 0, 0, 0); state.debts.push(d); renderLists(d.id); save(); });
  $('add-scn').addEventListener('click', function () {
    if (state.scenarios.length >= MAX_SCN) return;
    var s = mkScn('سيناريو ' + (state.scenarios.length + 1), -10, 0, state.goal, 0, 0);
    state.scenarios.push(s); renderScnCards(s.id); save();
  });
  $('reset').addEventListener('click', function () { state = example(); syncInputs(); syncVarUI(); renderIncomeMonths(); renderScnCards(); renderLists(); save(); });

  $('copy').addEventListener('click', function () {
    var msg = $('copy-msg');
    function done(ok) { msg.textContent = ok ? 'تم نسخ الجدول. الصقه في Excel أو أي محرر.' : 'تعذر النسخ تلقائياً. حدّد الجدول وانسخه يدوياً.'; setTimeout(function () { msg.textContent = ''; }, 4000); }
    try {
      navigator.clipboard.writeText(lastTsv).then(function () { done(true); }, function () { done(false); });
    } catch (err) { done(false); }
  });

  function syncInputs() {
    $('salary').value = state.salary; $('other').value = state.other; $('start').value = state.start;
    $('goal').value = state.goal; $('ret').value = state.ret; $('gs').value = state.g;
  }
  function onTheme() { update(); }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme); else if (mq.addListener) mq.addListener(onTheme);
  }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  syncInputs();
  syncVarUI();
  renderIncomeMonths();
  initCharts();
  renderScnCards();
  renderLists();
})();
