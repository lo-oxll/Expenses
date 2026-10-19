/* app.js
   الواجهة: الإدخالات، الدخل المتغير، البنود المتكررة، الأهداف، الصدمة، الرسوم، السيناريوهات،
   الفعلي مقابل المخطط، التصدير والنسخ الاحتياطي. يعتمد على model.js، وعلى Chart.js إن توفر
   وإلا على charts-lite.js. لا يرسل أي بيانات إلى أي جهة. */
(function () {
  'use strict';
  var M = window.BudgetModel;
  var KEY = 'budget-lab-v4', OLD_KEYS = ['budget-lab-v3', 'budget-lab-v2'], DKEY = 'budget-lab-digits';
  var MAX_SCN = 3;
  var uid = 1;
  var ChartC = typeof window.Chart !== 'undefined' ? window.Chart : (window.ChartLite || null);

  function $(id) { return document.getElementById(id); }
  var clamp = M.clamp;
  function numOr(v, def) { v = parseFloat(v); return isNaN(v) ? def : v; }
  function mk(name, amount, kind, sched, month) { return { id: uid++, name: name, amount: amount, base: amount > 0 ? amount : 100000, kind: kind, sched: sched || 'm', month: month || 0 }; }
  function mkDebt(name, balance, rate, payment) { return { id: uid++, name: name, balance: balance, rate: rate, payment: payment }; }
  function mkScn(name, gEx, gOb, goal, incExtra, extraDebt) { return { id: uid++, name: name, gEx: gEx, gOb: gOb, goal: goal, incExtra: incExtra, extraDebt: extraDebt }; }
  function mkGoal(name, amount, months) { return { id: uid++, name: name, amount: amount, months: months }; }

  function example() {
    uid = 1;
    var st = {
      salary: 1250000, other: 150000, start: 500000, ret: 0, goal: 200000, g: 0, inflation: 3, raise: { pct: 10, month: 6 },
      varIncome: false, incomeMonths: [1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000, 1400000],
      items: [
        mk('الإيجار', 350000, 'ob'), mk('اشتراك المولدة', 60000, 'ob'), mk('الإنترنت', 35000, 'ob'), mk('تأمين السيارة', 360000, 'ob', 'y'),
        mk('الطعام والمواد الغذائية', 300000, 'ex'), mk('المواصلات', 80000, 'ex'), mk('الاتصالات', 25000, 'ex'),
        mk('الصحة', 50000, 'ex'), mk('الترفيه', 60000, 'ex'), mk('الملابس', 40000, 'ex'), mk('مناسبة عائلية', 300000, 'ex', 'o', 4)
      ],
      debts: [mkDebt('سلفة مصرفية', 3000000, 7, 150000), mkDebt('قرض أجهزة منزلية', 1200000, 0, 100000)],
      scenarios: [mkScn('خطة التقشف', -25, 0, 250000, 0, 0)],
      goals: [mkGoal('صندوق الطوارئ', 1500000, 12), mkGoal('رحلة صيفية', 600000, 6)],
      shock: { on: true, lossPct: 50, lossStart: 2, lossMonths: 3, emAmount: 500000, emMonth: 5 },
      actuals: {}
    };
    st.actuals[M.monthKey(-2).key] = 1020000;
    st.actuals[M.monthKey(-1).key] = 1130000;
    return st;
  }

  /* تنظيف أي بيانات قادمة من التخزين أو من ملف مستورد. يعيد null إن لم تصلح. */
  function sanitize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.items) || !Array.isArray(s.debts)) return null;
    var max = 0;
    function seen(id) { id = +id || 0; if (id > max) max = id; return id; }
    var sh = s.shock || {}, rz = s.raise || {};
    var out = { salary: Math.max(0, +s.salary || 0), other: Math.max(0, +s.other || 0), start: Math.max(0, +s.start || 0),
      ret: clamp(s.ret, 0, 30), goal: Math.max(0, +s.goal || 0), g: clamp(s.g, -40, 40), inflation: clamp(s.inflation, 0, 100),
      raise: { pct: clamp(rz.pct, 0, 200), month: clamp(rz.month, 0, 11) | 0 }, varIncome: !!s.varIncome,
      incomeMonths: [], items: [], debts: [], scenarios: [], goals: [],
      shock: { on: !!sh.on, lossPct: clamp(numOr(sh.lossPct, 50), 0, 100), lossStart: clamp(numOr(sh.lossStart, 2), 0, 11) | 0,
        lossMonths: clamp(numOr(sh.lossMonths, 3), 1, 12) | 0, emAmount: Math.max(0, numOr(sh.emAmount, 500000)), emMonth: clamp(numOr(sh.emMonth, 5), 0, 11) | 0 },
      actuals: {} };
    var fixed = out.salary + out.other;
    for (var i = 0; i < 12; i++) { var v = s.incomeMonths && s.incomeMonths[i]; out.incomeMonths.push(v === undefined || v === null || isNaN(+v) ? fixed : Math.max(0, +v)); }
    s.items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      out.items.push({ id: seen(it.id), name: String(it.name || '').slice(0, 80), amount: Math.max(0, +it.amount || 0), base: Math.max(1, +it.base || 100000),
        kind: it.kind === 'ex' ? 'ex' : 'ob', sched: it.sched === 'y' || it.sched === 'o' ? it.sched : 'm', month: clamp(it.month, 0, 11) | 0 });
    });
    s.debts.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      out.debts.push({ id: seen(d.id), name: String(d.name || '').slice(0, 80), balance: Math.max(0, +d.balance || 0), rate: clamp(d.rate, 0, 100), payment: Math.max(0, +d.payment || 0) });
    });
    if (Array.isArray(s.goals)) s.goals.slice(0, 20).forEach(function (g) {
      if (!g || typeof g !== 'object') return;
      out.goals.push({ id: seen(g.id), name: String(g.name || '').slice(0, 80), amount: Math.max(0, +g.amount || 0), months: Math.max(1, Math.min(120, Math.round(+g.months || 12))) });
    });
    if (s.actuals && typeof s.actuals === 'object') Object.keys(s.actuals).forEach(function (k) {
      var v2 = +s.actuals[k]; if (/^\d{4}-\d{2}$/.test(k) && isFinite(v2) && v2 >= 0) out.actuals[k] = v2;
    });
    if (Array.isArray(s.scenarios)) s.scenarios.slice(0, MAX_SCN).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      out.scenarios.push({ id: seen(c.id), name: String(c.name || '').slice(0, 80), gEx: clamp(c.gEx, -50, 50), gOb: clamp(c.gOb, -30, 30),
        goal: Math.max(0, +c.goal || 0), incExtra: Math.max(0, +c.incExtra || 0), extraDebt: Math.max(0, +c.extraDebt || 0) });
    });
    uid = max + 1;
    if (!Array.isArray(s.scenarios)) out.scenarios = [mkScn('خطة التقشف', -25, 0, 250000, 0, 0)];
    return out;
  }

  function load() {
    try {
      var keys = [KEY].concat(OLD_KEYS);
      for (var i = 0; i < keys.length; i++) {
        var raw = localStorage.getItem(keys[i]);
        if (raw) { var s = sanitize(JSON.parse(raw)); if (s) return s; }
      }
    } catch (e) {}
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var state = load() || example();
  var suspend = false, lastA = null, scList = [], lastTsv = '';

  /* ---------- أرقام عربية هندية ---------- */
  function loadDigits() { try { return localStorage.getItem(DKEY) === 'hindi' ? 'hindi' : 'latin'; } catch (e) { return 'latin'; } }
  function syncDigitsBtn() {
    var h = M.getDigits() === 'hindi', b = $('digits');
    b.textContent = 'الأرقام: ' + (h ? '١٢٣' : '123'); b.setAttribute('aria-pressed', h ? 'true' : 'false');
  }

  /* ---------- القوائم المنسدلة ---------- */
  function monthOpts() {
    var h = ''; for (var i = 0; i < 12; i++) h += '<option value="' + i + '">' + M.monthLabel(i) + '</option>'; return h;
  }
  function fillSel(id, html, val) { var s = $(id), keep = val !== undefined ? val : s.value; s.innerHTML = html; if (keep !== '' && keep !== undefined) s.value = keep; }
  function buildSelects() {
    var mo = monthOpts(), du = '';
    for (var n = 1; n <= 12; n++) du += '<option value="' + n + '">' + M.fmtMonths(n) + '</option>';
    fillSel('raise-m', mo, state.raise.month); fillSel('st-ls', mo, state.shock.lossStart); fillSel('st-ems', mo, state.shock.emMonth); fillSel('st-lm', du, state.shock.lossMonths);
  }

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
        '<div class="withunit"><input class="inp" id="amt-' + it.id + '" type="number" min="0" step="5000" inputmode="numeric" aria-label="المبلغ"><span class="u">د.ع</span></div>' +
        '<button class="del" type="button" aria-label="حذف البند">×</button>' +
      '</div>' +
      '<div class="row-sub">' +
        '<input type="range" id="sl-' + it.id + '" min="0" max="' + sliderMax(it) + '" step="5000" aria-label="تعديل المبلغ">' +
        '<span class="share" id="sh-' + it.id + '"></span>' +
      '</div>' +
      '<div class="row-sch">' +
        '<select class="inp sel" id="sc-' + it.id + '" data-f="sched" aria-label="تكرار البند"><option value="m">شهري</option><option value="y">سنوي، يُوزَّع على 12 شهراً</option><option value="o">مرة واحدة</option></select>' +
        '<select class="inp sel" id="sm-' + it.id + '" data-f="month" aria-label="شهر الدفع">' + monthOpts() + '</select>' +
      '</div>';
    d.querySelector('.nm').value = it.name;
    d.querySelector('#amt-' + it.id).value = it.amount;
    d.querySelector('#sl-' + it.id).value = it.amount;
    d.querySelector('#sc-' + it.id).value = it.sched;
    d.querySelector('#sm-' + it.id).value = it.month;
    d.querySelector('#sm-' + it.id).hidden = it.sched !== 'o';
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

  function buildGoalRow(g) {
    var d = document.createElement('div');
    d.className = 'row'; d.setAttribute('data-id', g.id);
    d.innerHTML =
      '<div class="row-main dm">' +
        '<input class="inp" id="gn-' + g.id + '" data-f="name" type="text" placeholder="اسم الهدف" aria-label="اسم الهدف">' +
        '<button class="del" type="button" aria-label="حذف الهدف">×</button>' +
      '</div>' +
      '<div class="dfields two">' +
        '<div class="field"><label for="ga-' + g.id + '">المبلغ المستهدف</label><input class="inp" id="ga-' + g.id + '" data-f="amount" type="number" min="0" step="50000" inputmode="numeric"></div>' +
        '<div class="field"><label for="gm-' + g.id + '">المدة بالأشهر</label><input class="inp" id="gm-' + g.id + '" data-f="months" type="number" min="1" max="120" step="1" inputmode="numeric"></div>' +
      '</div>' +
      '<div class="share" id="gsh-' + g.id + '"></div>';
    d.querySelector('[data-f=name]').value = g.name;
    d.querySelector('[data-f=amount]').value = g.amount;
    d.querySelector('[data-f=months]').value = g.months;
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
    var gl = $('list-gl'); gl.innerHTML = '';
    if (!state.goals.length) gl.appendChild(emptyNote('لا توجد أهداف. أضف هدفاً مثل سيارة أو سفر أو صندوق طوارئ.'));
    state.goals.forEach(function (g) { gl.appendChild(buildGoalRow(g)); });
    update();
    if (focusId) { var f = $('nm-' + focusId) || $('dn-' + focusId) || $('gn-' + focusId); if (f) f.focus(); }
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

  /* ---------- الصدمة والفعلي ---------- */
  function renderShock() {
    var s = state.shock;
    $('st-on').checked = s.on;
    $('st-pct').value = s.lossPct; $('st-em').value = s.emAmount;
    ['st-pct', 'st-ls', 'st-lm', 'st-em', 'st-ems'].forEach(function (id) { $(id).disabled = !s.on; });
  }

  function renderActuals() {
    var body = $('act-body'); body.innerHTML = '';
    M.actualKeys().forEach(function (k, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + k.label + '</td><td class="n" id="ap-' + i + '"></td>' +
        '<td class="in"><div class="withunit"><input class="inp" id="ac-' + i + '" data-key="' + k.key + '" type="number" min="0" step="10000" inputmode="numeric" aria-label="الإنفاق الفعلي في ' + k.label + '"><span class="u">د.ع</span></div></td>' +
        '<td class="diff" id="ad-' + i + '"></td>';
      var v = state.actuals[k.key]; if (v !== undefined) tr.querySelector('input').value = v;
      body.appendChild(tr);
    });
  }
  function updateActuals(a) {
    var sum = M.actualsSummary(state, a);
    sum.entries.forEach(function (e, i) {
      $('ap-' + i).innerHTML = M.fmt(e.planned);
      var c = $('ad-' + i);
      if (e.actual === null) { c.innerHTML = '—'; return; }
      var over = e.diff > 0, w = Math.min(100, Math.abs(e.pct) * 2);
      c.innerHTML = '<span class="num ' + (over ? 'neg' : '') + '">' + (over ? '+' : e.diff < 0 ? '−' : '') + M.digits(Math.abs(Math.round(e.diff)).toLocaleString('en-US')) + '</span> ' +
        '<small>(' + M.pct(Math.abs(e.pct)) + (over ? ' فوق' : e.diff < 0 ? ' تحت' : '') + ')</small>' +
        '<span class="dbar"><i class="' + (over ? 'over' : '') + '" style="width:' + w + '%"></i></span>';
    });
    var box = $('act-sum');
    if (!sum.count) box.innerHTML = '<span class="share">سجّل إنفاق شهر واحد على الأقل لتظهر المقارنة.</span>';
    else box.innerHTML = 'في ' + M.fmtMonths(sum.count) + ' مسجلة: ' + (sum.totalDiff > 0 ? 'أنفقت ' + M.money(sum.totalDiff) + ' فوق الخطة' : sum.totalDiff < 0 ? 'وفّرت ' + M.money(-sum.totalDiff) + ' عن الخطة' : 'أنفقت كما خططت') + ' (' + M.pct(Math.abs(sum.avgPct)) + ' في المتوسط).';
  }

  function updateStress(a) {
    var box = $('st-result'), S = a.stress;
    if (!S) { box.innerHTML = '<div class="empty">فعّل الاختبار لترى أثر الصدمة على رصيدك.</div>'; return; }
    function tile(label, v, neg) { return '<div class="tile"><span>' + label + '</span><b class="' + (neg && v < 0 ? 'neg' : '') + '">' + M.money(v) + '</b></div>'; }
    var bad = S.negIdx >= 0, msg;
    if (bad) msg = (S.negIdx === 0 ? 'ينفد رصيدك منذ الشهر الأول' : 'يصمد رصيدك ' + M.fmtMonths(S.negIdx) + ' ثم ينفد') + ' (شهر ' + M.monthLabel(S.negIdx) + '). تحتاج ' + M.money(-S.minBal) + ' إضافية في مدخراتك لتصمد.';
    else msg = 'تصمد مدخراتك أمام الصدمة. أدنى رصيد يصله حسابك ' + M.money(S.minBal) + ' في شهر ' + M.monthLabel(S.minIdx) + '.';
    box.innerHTML = '<div class="st-tiles">' + tile('أدنى رصيد خلال السنة', S.minBal, true) + tile('رصيدك بعد 12 شهراً مع الصدمة', S.endBal, true) + tile('الأثر على رصيد نهاية السنة', S.delta, true) + '</div>' +
      '<div class="st-verdict' + (bad ? ' bad' : '') + '"><i></i><span>' + msg + '</span></div>';
  }

  /* ---------- الرسوم ---------- */
  var donut = null, line = null, scLine = null, theme = {};
  function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function hexA(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function readTheme() {
    theme = { ink: cv('--ink'), muted: cv('--muted'), line: cv('--line'), surface: cv('--surface'), accent: cv('--accent'), good: cv('--good'), bad: cv('--bad'), free: cv('--free'), pal: [] };
    for (var i = 1; i <= 8; i++) theme.pal.push(cv('--c' + i));
  }
  function compact(v) {
    var a = Math.abs(v), n, unit = '';
    if (a >= 1e6) { n = (a / 1e6).toFixed(a % 1e6 === 0 ? 0 : 1); unit = ' م'; }
    else if (a >= 1e3) { n = String(Math.round(a / 1e3)); unit = ' ألف'; }
    else n = String(a);
    n = M.digits(n);
    if (v < 0) n = '⁦−' + n + '⁩';   // يبقى الناقص قبل الرقم داخل النص العربي
    return n + unit;
  }
  /* ألوان الفئات: ثمانية ألوان أساسية، ثم درجات أفتح منها عند تجاوز الثمانية حتى لا تتكرر */
  function palColor(i) {
    var base = theme.pal[i % 8], cyc = Math.floor(i / 8);
    if (!cyc) return base;
    var h = base.replace('#', ''); if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16), t = Math.min(0.7, cyc * 0.38);
    function mix(c) { return Math.round(c + (255 - c) * t); }
    return 'rgb(' + mix(n >> 16 & 255) + ',' + mix(n >> 8 & 255) + ',' + mix(n & 255) + ')';
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
    if (!ChartC) { $('fallback').hidden = false; return; }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    ChartC.defaults.font.family = "'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ChartC.defaults.animation = reduce ? false : { duration: 250 };
    readTheme();
    donut = new ChartC($('donut'), {
      type: 'doughnut',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: theme.surface, borderWidth: 2, hoverOffset: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '66%',
        plugins: { legend: { display: false }, tooltip: Object.assign({}, TIP, { callbacks: { label: function (c) {
          var tot = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
          return ' ' + c.label + ': ' + M.fmt(c.parsed) + ' د.ع (' + M.digits(Math.round(c.parsed / tot * 100)) + '%)'; } } }) } }
    });
    line = new ChartC($('line'), {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'المتوقع', data: [], borderColor: theme.accent, backgroundColor: hexA(theme.accent, 0.14), borderWidth: 3, fill: 'origin', tension: 0.2,
          pointRadius: function (c) { return c.dataIndex === 11 ? 6 : 0; }, pointHoverRadius: 6, pointBackgroundColor: theme.accent, pointBorderColor: theme.surface, pointBorderWidth: 2 },
        { label: 'بلا تعديل', data: [], borderColor: theme.muted, borderDash: [6, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 },
        { label: 'مسار الهدف', data: [], borderColor: theme.good, borderDash: [2, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 },
        { label: 'بعد الصدمة', data: [], borderColor: theme.bad, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.2 }
      ] },
      options: lineOptions()
    });
    scLine = new ChartC($('scline'), { type: 'line', data: { labels: [], datasets: [] }, options: lineOptions() });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { update(); });
  }

  /* ---------- التحديث ---------- */
  function setMoney(id, n, neg) { var el = $(id); el.innerHTML = M.money(n); if (neg !== undefined) el.className = neg && n < 0 ? 'neg' : ''; }

  function update() {
    if (suspend) return;
    var a = M.analyze(state), adv = M.advice(a, state), g = state.g, inc = a.inc, vi = a.varIncome;
    var rows = a.rows, F = rows[11].bal, F0 = a.baseRows[11].bal;
    var avgNote = a.varies ? ' في المتوسط' : '';
    lastA = a;
    readTheme();

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

    $('t-inc-l').textContent = a.varies ? 'متوسط الدخل الشهري' : 'الدخل الشهري';
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
      var avg = M.itemAvg(state, it, g, 0), parts = [];
      if (it.sched === 'y') parts.push('يُوزَّع على 12 شهراً');
      if (it.sched === 'o') parts.push('مرة واحدة في ' + M.monthLabel(it.month));
      if (it.sched !== 'm' || (it.kind === 'ex' && g !== 0)) parts.push(M.money(avg) + ' شهرياً في المتوسط');
      parts.push(share(avg) + ' من الدخل');
      el.innerHTML = parts.join(' · ');
    });
    state.debts.forEach(function (d) {
      var el = $('dsh-' + d.id); if (!el) return;
      var m = M.debtMonths(d);
      if (d.balance <= 0.5) { el.className = 'share'; el.textContent = 'لا يوجد رصيد متبقٍ.'; }
      else if (m === null) { el.className = 'share bad'; el.textContent = 'القسط لا يكفي لإنهاء هذا الدين.'; }
      else { el.className = 'share'; el.innerHTML = 'ينتهي خلال ' + M.fmtMonths(m) + ' (' + M.monthYear(m - 1) + ').'; }
    });

    // الأهداف
    var gp = M.goalPlan(state, a);
    $('sub-gl').innerHTML = gp.list.length ? 'المطلوب ' + M.money(gp.total) + ' شهرياً' : '';
    state.goals.forEach(function (gl) {
      var el = $('gsh-' + gl.id); if (!el) return;
      var info = gp.byId[gl.id];
      if (!info) { el.className = 'share'; el.textContent = 'أدخل مبلغاً ومدة صحيحين.'; return; }
      if (info.ok) { el.className = 'share okk'; el.innerHTML = 'تحتاج ' + M.money(info.req) + ' شهرياً حتى ' + info.date + '، ويكفيه ادخارك.'; }
      else { el.className = 'share bad'; el.innerHTML = 'تحتاج ' + M.money(info.req) + ' شهرياً حتى ' + info.date + '، وينقصك ' + M.money(info.short) + ' شهرياً' + (info.ext ? ' أو مدّد الموعد إلى ' + M.fmtMonths(info.ext) + '.' : '.'); }
    });

    // الرسم الدائري وقائمته: متوسط الشهر
    var slices = [];
    state.items.forEach(function (it) {
      var e = M.itemAvg(state, it, g, 0); if (e <= 0) return;
      slices.push({ name: it.name || 'بدون اسم', tag: it.kind === 'ex' ? 'متغير' : 'التزام', val: e, c: 'pal' });
    });
    state.debts.forEach(function (d, i) {
      var p = rows.reduce(function (s, r) { return s + (r.parts[i] ? r.parts[i].pay : 0); }, 0) / rows.length;
      if (p > 0.5) slices.push({ name: d.name || 'دين بلا اسم', tag: 'قسط', val: p, c: 'pal' });
    });
    if (a.contrib > 0) slices.push({ name: 'الادخار', tag: '', val: a.contrib, c: 'good' });
    if (a.free > 0.5) slices.push({ name: 'فائض حر', tag: '', val: a.free, c: 'free' });

    $('donut-total').innerHTML = M.money(a.outflow);
    var lg = $('legend'); lg.innerHTML = ''; var k = 0;
    slices.forEach(function (s) {
      var idx = s.c === 'pal' ? k++ : -1;
      var li = document.createElement('li');
      var sw = s.c === 'good' ? 'var(--good)' : s.c === 'free' ? 'var(--free)' : palColor(idx);
      li.innerHTML = '<i style="--sw:' + sw + '"></i><span class="n">' + M.esc(s.name) + (s.tag ? ' <small>· ' + s.tag + '</small>' : '') + '</span><span>' + M.money(s.val) + '</span><span class="p">' + share(s.val) + '</span>';
      lg.appendChild(li);
    });
    $('lk-base').hidden = g === 0;
    $('lk-target').hidden = state.goal <= 0;
    $('lk-shock').hidden = !a.stress;

    // الجدول الشهري
    function td(v) { return '<td class="n' + (v < -0.5 ? ' neg' : '') + '">' + M.fmt(v) + '</td>'; }
    var html = '', tsv = ['الشهر\tالدخل\tالمصروفات\tالأقساط\tالادخار\tفائض حر\tرصيد المدخرات\tالدين المتبقي'];
    var sums = { income: 0, exp: 0, debtPay: 0, contrib: 0, free: 0 };
    rows.forEach(function (r, i) {
      html += '<tr><td>' + M.monthLabel(i) + '</td>' + td(r.income) + td(r.exp) + td(r.debtPay) + td(r.contrib) + td(r.free) + td(r.bal) + td(r.debtLeft) + '</tr>';
      tsv.push([M.monthLabel(i), M.fmtPlain(r.income), M.fmtPlain(r.exp), M.fmtPlain(r.debtPay), M.fmtPlain(r.contrib), M.fmtPlain(r.free), M.fmtPlain(r.bal), M.fmtPlain(r.debtLeft)].join('\t'));
      sums.income += r.income; sums.exp += r.exp; sums.debtPay += r.debtPay; sums.contrib += r.contrib; sums.free += r.free;
    });
    $('tbody').innerHTML = html;
    var last = rows[11];
    $('tfoot').innerHTML = '<tr><td>المجموع</td>' + td(sums.income) + td(sums.exp) + td(sums.debtPay) + td(sums.contrib) + td(sums.free) + td(last.bal) + td(last.debtLeft) + '</tr>';
    tsv.push(['المجموع', M.fmtPlain(sums.income), M.fmtPlain(sums.exp), M.fmtPlain(sums.debtPay), M.fmtPlain(sums.contrib), M.fmtPlain(sums.free), M.fmtPlain(last.bal), M.fmtPlain(last.debtLeft)].join('\t'));
    lastTsv = tsv.join('\n');

    // التنبيهات والتوصيات
    $('alerts').innerHTML = adv.alerts.map(function (x) {
      return '<li class="al ' + x.level + '"><i></i><div><b>' + x.title + '</b><span class="t">' + x.text + '</span></div></li>';
    }).join('');
    var priLabel = { urgent: 'عاجل', important: 'مهم', improve: 'تحسين' };
    $('recs').innerHTML = adv.recs.length ? adv.recs.map(function (r) {
      return '<article class="rec ' + r.pri + '"><span class="pri"><i></i>' + priLabel[r.pri] + '</span><h3>' + r.title + '</h3><p>' + r.body + '</p>' +
        (r.impact ? '<div class="impact">' + r.impact + '</div>' : '') + '</article>';
    }).join('') : '<div class="empty">أدخل دخلك وبنودك لتظهر التوصيات.</div>';

    updateStress(a);
    updateActuals(a);
    updateScenarios();
    refreshCharts(a, slices);
  }

  /* ---------- مقارنة السيناريوهات ---------- */
  function updateScenarios() {
    scList = M.compare(state);
    state.scenarios.forEach(function (s) {
      var a = $('sgv-' + s.id), b = $('sov-' + s.id);
      if (a) a.innerHTML = signed(s.gEx, 'زيادة ', 'تقليص ');
      if (b) b.innerHTML = signed(s.gOb, 'زيادة ', 'تقليص ');
    });
    $('sc-legend').innerHTML = scList.map(function (s, i) {
      return '<span><i class="ln' + (i === 0 ? ' dash' : '') + '" style="--lc:' + scVar(i) + '"></i>' + M.esc(s.name) + '</span>';
    }).join('');

    var base = scList[0].m;
    var defs = scDefs();
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
          if (Math.abs(dv) >= 0.5) {
            var good = dv * d.better > 0, ad = Math.abs(dv);
            var plain = d.pct ? Math.round(ad) + '%' : d.int ? String(ad) : M.fmtPlain(ad);
            diff = '<small class="diff ' + (good ? 'pos' : 'neg') + '">' + M.num((dv > 0 ? '+' : '−') + plain) + '</small>';
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
  function scDefs() {
    return [
      { l: 'رصيد المدخرات بعد 12 شهراً', f: function (m) { return m.finalBal; }, better: 1 },
      { l: 'إجمالي ما ادُّخر خلال السنة', f: function (m) { return m.saved; }, better: 1 },
      { l: 'متوسط الفائض الشهري', f: function (m) { return m.avgSurplus; }, better: 1 },
      { l: 'معدل الادخار من الدخل', f: function (m) { return m.rate; }, better: 1, pct: true },
      { l: 'الدين المتبقي بعد 12 شهراً', f: function (m) { return m.debtLeft; }, better: -1 },
      { l: 'موعد انتهاء الديون', text: function (m) { return !m.hasDebt ? '—' : m.debtFree === null ? 'بعد أكثر من سنة' : M.monthLabel(m.debtFree); }, plain: function (m) { return !m.hasDebt ? '' : m.debtFree === null ? 'بعد أكثر من سنة' : M.monthLabel(m.debtFree); } },
      { l: 'أشهر العجز', f: function (m) { return m.deficitMonths; }, better: -1, int: true }
    ];
  }

  function refreshCharts(a, slices) {
    if (!donut || !line) return;
    readTheme();
    var labels = [], data = [], colors = [], k = 0;
    slices.forEach(function (s) {
      labels.push(s.name); data.push(s.val);
      colors.push(s.c === 'good' ? theme.good : s.c === 'free' ? theme.free : palColor(k++));
    });
    if (!data.length) { labels = ['لا توجد بنود']; data = [1]; colors = [theme.line]; }
    donut.data.labels = labels; donut.data.datasets[0].data = data; donut.data.datasets[0].backgroundColor = colors; donut.data.datasets[0].borderColor = theme.surface;
    donut.update();

    var lab = []; for (var i = 0; i < 12; i++) lab.push(M.monthLabel(i));
    line.data.labels = lab;
    var s0 = line.data.datasets[0], s1 = line.data.datasets[1], s2 = line.data.datasets[2], s3 = line.data.datasets[3];
    s0.data = a.rows.map(function (r) { return r.bal; });
    s0.borderColor = theme.accent; s0.backgroundColor = hexA(theme.accent, 0.14); s0.pointBackgroundColor = theme.accent; s0.pointBorderColor = theme.surface;
    s1.data = a.baseRows.map(function (r) { return r.bal; }); s1.borderColor = theme.muted; s1.hidden = state.g === 0;
    s2.data = a.target; s2.borderColor = theme.good; s2.hidden = state.goal <= 0;
    s3.data = a.stress ? a.stress.rows.map(function (r) { return r.bal; }) : []; s3.borderColor = theme.bad; s3.hidden = !a.stress;
    applyLineTheme(line);
    line.update();
  }

  /* ---------- التصدير والنسخ ---------- */
  function copyText(text, cb) {
    function fallback() {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;inset-inline-start:0;top:0';
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand && document.execCommand('copy'); ta.remove(); cb(!!ok);
      } catch (e) { cb(false); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  function download(name, text, mime, bom) {
    try {
      var blob = new Blob([(bom ? '﻿' : '') + text], { type: mime });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) { return false; }
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function flash(id, text, bad, ms) {
    var el = $(id); el.textContent = text; if (bad !== undefined) el.className = bad ? 'share bad' : (id === 'bk-msg' ? 'share' : '');
    clearTimeout(el._t); el._t = setTimeout(function () { el.textContent = ''; }, ms || 5000);
  }

  function buildCSV() {
    var a = lastA, r2 = function (v) { return Math.round(v); };
    var rows = [['الشهر', 'الدخل', 'المصروفات', 'الأقساط', 'الادخار', 'فائض حر', 'رصيد المدخرات', 'الدين المتبقي']];
    a.rows.forEach(function (r, i) { rows.push([M.monthLabel(i), r2(r.income), r2(r.exp), r2(r.debtPay), r2(r.contrib), r2(r.free), r2(r.bal), r2(r.debtLeft)]); });
    rows.push([]); rows.push(['مقارنة السيناريوهات']);
    rows.push(['المقياس'].concat(scList.map(function (s) { return s.name; })));
    scDefs().forEach(function (d) {
      rows.push([d.l].concat(scList.map(function (s) {
        if (d.plain) return d.plain(s.m);
        var v = d.f(s.m); return d.pct ? Math.round(v * 10) / 10 : r2(v);
      })));
    });
    return M.csv(rows);
  }

  function exportText() { return JSON.stringify({ app: 'budget-lab', version: 4, exportedAt: new Date().toISOString(), state: state }, null, 2); }
  function doImport(text) {
    var msg = $('bk-msg');
    function fail(t) { msg.className = 'share bad'; msg.textContent = t; }
    if (!text || !text.trim()) return fail('الصق نص النسخة الاحتياطية أولاً.');
    if (text.length > 2000000) return fail('النص كبير جداً ولا يبدو نسخة من هذه الأداة.');
    var obj; try { obj = JSON.parse(text); } catch (e) { return fail('النص ليس JSON صالحاً. انسخ النسخة كاملة كما صدّرتها.'); }
    var imported = sanitize(obj && obj.state ? obj.state : obj);
    if (!imported) return fail('لم أجد بيانات ميزانية صالحة في هذا النص.');
    state = imported; renderAll(); save();
    msg.className = 'share'; msg.textContent = 'تم الاستيراد. حُدّثت كل الأرقام في الصفحة.';
  }

  /* ---------- إعادة رسم كل شيء ---------- */
  function syncInputs() {
    $('salary').value = state.salary; $('other').value = state.other; $('start').value = state.start;
    $('goal').value = state.goal; $('ret').value = state.ret; $('gs').value = state.g;
    $('infl').value = state.inflation; $('raise-pct').value = state.raise.pct;
  }
  function renderAll() {
    suspend = true;
    syncInputs(); syncVarUI(); buildSelects(); renderIncomeMonths(); renderShock(); renderActuals(); renderScnCards(); renderLists();
    suspend = false; update();
  }

  /* ---------- الأحداث ---------- */
  ['salary', 'other', 'start', 'goal', 'ret'].forEach(function (key) {
    $(key).addEventListener('input', function (e) {
      var v = parseFloat(e.target.value); v = isNaN(v) ? 0 : Math.max(0, v);
      if (key === 'ret') v = Math.min(30, v);
      state[key] = v; update(); save();
    });
  });
  $('infl').addEventListener('input', function (e) { state.inflation = clamp(e.target.value, 0, 100); update(); save(); });
  $('raise-pct').addEventListener('input', function (e) { state.raise.pct = clamp(e.target.value, 0, 200); update(); save(); });
  $('raise-m').addEventListener('change', function (e) { state.raise.month = clamp(e.target.value, 0, 11) | 0; update(); save(); });
  $('gs').addEventListener('input', function (e) { state.g = +e.target.value; update(); save(); });

  $('varinc').addEventListener('change', function (e) { state.varIncome = e.target.checked; syncVarUI(); renderIncomeMonths(); update(); save(); });
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
    var t = e.target, f = t.getAttribute('data-f');
    if (f === 'sched') { it.sched = t.value === 'y' || t.value === 'o' ? t.value : 'm'; row.querySelector('[data-f=month]').hidden = it.sched !== 'o'; }
    else if (f === 'month') it.month = clamp(t.value, 0, 11) | 0;
    else if (t.classList.contains('nm')) it.name = t.value;
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
  function onGoalInput(e) {
    var row = e.target.closest('.row'); if (!row) return;
    var g = findIn(state.goals, +row.getAttribute('data-id')); if (!g) return;
    var f = e.target.getAttribute('data-f'); if (!f) return;
    if (f === 'name') g.name = e.target.value;
    else { var v = parseFloat(e.target.value); v = isNaN(v) ? 0 : v; g[f] = f === 'months' ? Math.max(1, Math.min(120, Math.round(v) || 1)) : Math.max(0, v); }
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
      else if (listKey === 'goals') state.goals = state.goals.filter(function (g) { return g.id !== id; });
      else state.items = state.items.filter(function (i) { return i.id !== id; });
      renderLists(); save();
    };
  }
  ['list-ob', 'list-ex'].forEach(function (id) { $(id).addEventListener('input', onItemInput); $(id).addEventListener('click', onDelete('items')); });
  $('list-db').addEventListener('input', onDebtInput); $('list-db').addEventListener('click', onDelete('debts'));
  $('list-gl').addEventListener('input', onGoalInput); $('list-gl').addEventListener('click', onDelete('goals'));
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
  $('add-gl').addEventListener('click', function () { var g = mkGoal('', 0, 12); state.goals.push(g); renderLists(g.id); save(); });
  $('add-scn').addEventListener('click', function () {
    if (state.scenarios.length >= MAX_SCN) return;
    var s = mkScn('سيناريو ' + (state.scenarios.length + 1), -10, 0, state.goal, 0, 0);
    state.scenarios.push(s); renderScnCards(s.id); save();
  });

  // الصدمة
  $('st-on').addEventListener('change', function (e) { state.shock.on = e.target.checked; renderShock(); update(); save(); });
  $('st-pct').addEventListener('input', function (e) { state.shock.lossPct = clamp(e.target.value, 0, 100); update(); save(); });
  $('st-ls').addEventListener('change', function (e) { state.shock.lossStart = clamp(e.target.value, 0, 11) | 0; update(); save(); });
  $('st-lm').addEventListener('change', function (e) { state.shock.lossMonths = clamp(e.target.value, 1, 12) | 0; update(); save(); });
  $('st-em').addEventListener('input', function (e) { state.shock.emAmount = Math.max(0, numOr(e.target.value, 0)); update(); save(); });
  $('st-ems').addEventListener('change', function (e) { state.shock.emMonth = clamp(e.target.value, 0, 11) | 0; update(); save(); });

  // الفعلي
  $('act-body').addEventListener('input', function (e) {
    var key = e.target.getAttribute('data-key'); if (!key) return;
    var v = parseFloat(e.target.value);
    if (isNaN(v) || e.target.value === '') delete state.actuals[key]; else state.actuals[key] = Math.max(0, v);
    update(); save();
  });

  // الجدول والتصدير
  $('copy').addEventListener('click', function () {
    copyText(lastTsv, function (ok) { flash('copy-msg', ok ? 'تم نسخ الجدول. الصقه في Excel أو أي محرر.' : 'تعذر النسخ تلقائياً. حدّد الجدول وانسخه يدوياً.'); });
  });
  $('csv-copy').addEventListener('click', function () {
    copyText(buildCSV(), function (ok) { flash('copy-msg', ok ? 'تم نسخ CSV. الصقه في ملف نصي أو في Excel.' : 'تعذر النسخ تلقائياً.'); });
  });
  $('csv-dl').addEventListener('click', function () {
    var ok = download('budget-lab-' + stamp() + '.csv', buildCSV(), 'text/csv;charset=utf-8', true);
    flash('copy-msg', ok ? 'بدأ التنزيل. إن لم يظهر ملف فاستخدم «نسخ CSV».' : 'تعذر التنزيل في هذا المتصفح. استخدم «نسخ CSV».');
  });

  // النسخة الاحتياطية
  $('bk-export').addEventListener('click', function () {
    $('bk-text').value = exportText();
    var m = $('bk-msg'); m.className = 'share'; m.textContent = 'النسخة جاهزة في الحقل. انسخها أو نزّلها كملف.';
  });
  $('bk-copy').addEventListener('click', function () {
    var ta = $('bk-text'); if (!ta.value.trim()) ta.value = exportText();
    copyText(ta.value, function (ok) { var m = $('bk-msg'); m.className = ok ? 'share' : 'share bad'; m.textContent = ok ? 'تم النسخ. احفظه في مكان آمن.' : 'تعذر النسخ تلقائياً. حدّد النص وانسخه يدوياً.'; });
  });
  $('bk-download').addEventListener('click', function () {
    var ta = $('bk-text'); if (!ta.value.trim()) ta.value = exportText();
    var ok = download('budget-lab-backup-' + stamp() + '.json', ta.value, 'application/json', false), m = $('bk-msg');
    m.className = ok ? 'share' : 'share bad';
    m.textContent = ok ? 'بدأ التنزيل. إن لم يظهر ملف (بعض المعاينات تمنعه) فانسخ النص واحفظه بنفسك.' : 'تعذر التنزيل. انسخ النص واحفظه بنفسك.';
  });
  $('bk-import').addEventListener('click', function () { doImport($('bk-text').value); });
  $('bk-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 2000000) { var m = $('bk-msg'); m.className = 'share bad'; m.textContent = 'الملف كبير جداً.'; e.target.value = ''; return; }
    var rd = new FileReader();
    rd.onload = function () { $('bk-text').value = String(rd.result || ''); doImport($('bk-text').value); e.target.value = ''; };
    rd.onerror = function () { var m2 = $('bk-msg'); m2.className = 'share bad'; m2.textContent = 'تعذرت قراءة الملف.'; e.target.value = ''; };
    rd.readAsText(f);
  });

  $('reset').addEventListener('click', function () { state = example(); renderAll(); save(); });
  $('digits').addEventListener('click', function () {
    var next = M.getDigits() === 'hindi' ? 'latin' : 'hindi';
    M.setDigits(next); try { localStorage.setItem(DKEY, next); } catch (e) {}
    syncDigitsBtn(); suspend = true; buildSelects(); renderActuals(); suspend = false; update();
  });

  function onTheme() { update(); }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme); else if (mq.addListener) mq.addListener(onTheme);
  }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  M.setDigits(loadDigits());
  syncDigitsBtn();
  initCharts();
  renderAll();

  /* تطبيق PWA: يُسجَّل فقط عند وجود manifest في الصفحة وعند التشغيل عبر http(s) */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel="manifest"]')) {
    window.addEventListener('load', function () { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} });
  }
})();
