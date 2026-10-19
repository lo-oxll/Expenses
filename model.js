/* model.js
   منطق الحساب والتوصيات فقط. لا يلمس الصفحة ولا يرسل أي بيانات.
   يعمل في المتصفح (window.BudgetModel) وفي Node للاختبار (module.exports). */
(function (root) {
  'use strict';

  var MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  /* ---------- الأرقام: لاتينية أو عربية هندية ---------- */
  var digitMode = 'latin';
  var HD = '٠١٢٣٤٥٦٧٨٩';
  function setDigits(m) { digitMode = m === 'hindi' ? 'hindi' : 'latin'; }
  function getDigits() { return digitMode; }
  function digits(s) {
    s = String(s);
    if (digitMode !== 'hindi') return s;
    return s.replace(/(\d),(?=\d)/g, '$1٬').replace(/(\d)\.(?=\d)/g, '$1٫')
      .replace(/[0-9]/g, function (d) { return HD.charAt(+d); });
  }

  /* ---------- تنسيق ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmtPlain(n) {
    var r = Math.round(n);
    return (r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US');
  }
  function fmt(n) { return digits(fmtPlain(n)); }
  function num(t) { return '<span class="num">' + digits(t) + '</span>'; }
  function money(n) { return num(fmtPlain(n)) + '<span class="unit"> د.ع</span>'; }
  function pct(n) { return num(Math.round(n) + '%'); }
  function fmtMonths(n) {
    n = Math.round(n);
    var s;
    if (n < 12) s = n === 1 ? 'شهر واحد' : n === 2 ? 'شهرين' : n + (n <= 10 ? ' أشهر' : ' شهراً');
    else {
      var y = Math.floor(n / 12), r = n % 12;
      var ys = y === 1 ? 'سنة' : y === 2 ? 'سنتين' : y + (y <= 10 ? ' سنوات' : ' سنة');
      s = r ? ys + ' و' + (r === 1 ? 'شهر' : r === 2 ? 'شهرين' : r + (r <= 10 ? ' أشهر' : ' شهراً')) : ys;
    }
    return digits(s);
  }
  function monthLabel(i) { return MONTHS[(new Date().getMonth() + i) % 12]; }
  function monthYear(i) {
    var d = new Date(), idx = d.getMonth() + i;
    return MONTHS[idx % 12] + ' ' + digits(d.getFullYear() + Math.floor(idx / 12));
  }
  function clamp(v, lo, hi) { v = +v; if (isNaN(v)) v = 0; return Math.min(hi, Math.max(lo, v)); }

  /* ---------- البنود: شهري، سنوي (يوزع على 12 شهراً)، مرة واحدة في شهر محدد ---------- */
  function itemBase(it, m) {
    var s = it.sched || 'm';
    if (s === 'y') return it.amount / 12;
    if (s === 'o') return m === (it.month | 0) ? it.amount : 0;
    return it.amount;
  }
  function inflF(state, m) {
    var r = +state.inflation || 0;
    return r > 0 ? Math.pow(1 + r / 100, m / 12) : 1;
  }
  function itemAt(state, it, m, g, gOb) {
    return itemBase(it, m) * (1 + (it.kind === 'ex' ? g : (gOb || 0)) / 100) * inflF(state, m);
  }
  function itemAvg(state, it, g, gOb) {
    var s = 0;
    for (var m = 0; m < 12; m++) s += itemAt(state, it, m, g, gOb);
    return s / 12;
  }
  function monthTotals(state, m, g, gOb) {
    var ob = 0, ex = 0;
    state.items.forEach(function (it) { var v = itemAt(state, it, m, g, gOb); if (it.kind === 'ex') ex += v; else ob += v; });
    return { ob: ob, ex: ex };
  }
  function totals(state, g, gOb) {
    var ob = 0, ex = 0;
    for (var m = 0; m < 12; m++) { var t = monthTotals(state, m, g, gOb); ob += t.ob; ex += t.ex; }
    return { ob: ob / 12, ex: ex / 12 };
  }

  /* ---------- الدخل: ثابت أو لكل شهر، مع زيادة راتب اختيارية ---------- */
  function baseIncomeAt(state, m) {
    var fixed = state.salary + state.other;
    if (state.varIncome) {
      var v = +(state.incomeMonths || [])[m];
      return isNaN(v) ? fixed : Math.max(0, v);
    }
    return fixed;
  }
  function incomeAt(state, m) {
    var base = baseIncomeAt(state, m), rz = state.raise;
    if (rz && +rz.pct > 0 && m >= (rz.month | 0)) base *= 1 + rz.pct / 100;
    return base;
  }

  /* ---------- المحاكاة ----------
     p: gEx تغيير المصروفات المتغيرة %، gOb تغيير الالتزامات %، goal هدف الادخار،
        incExtra دخل إضافي شهري، extraDebt دفعة إضافية للدين الأعلى فائدة،
        shock (اختياري): lossPct, lossStart, lossMonths, emAmount, emMonth.
     الدين يحمل فائدة شهرية. الادخار = الأقل من الهدف والفائض. ما يزيد فائض حر. والعجز يُسحب من المدخرات. */
  function runSim(state, p) {
    var r = state.ret / 1200, bal = state.start, sh = p.shock;
    var debts = state.debts.map(function (d) { return { name: d.name, b: d.balance, r: d.rate / 1200, p: d.payment, rate: d.rate }; });
    var order = debts.map(function (_, i) { return i; }).sort(function (x, y) { return (debts[y].rate - debts[x].rate) || (debts[x].b - debts[y].b); });
    var rows = [];
    for (var m = 0; m < 12; m++) {
      var inc = incomeAt(state, m) + (p.incExtra || 0);
      if (sh && sh.lossPct > 0 && m >= sh.lossStart && m < sh.lossStart + sh.lossMonths) inc *= 1 - sh.lossPct / 100;
      var mt = monthTotals(state, m, p.gEx, p.gOb);
      var exp = mt.ob + mt.ex + (sh && sh.emAmount > 0 && m === sh.emMonth ? sh.emAmount : 0);
      var debtPay = 0, parts = [];
      debts.forEach(function (d) {
        d.b += d.b * d.r;
        var pay = Math.min(d.p, d.b);
        d.b -= pay; debtPay += pay; parts.push({ name: d.name, pay: pay });
      });
      var left = p.extraDebt || 0;
      for (var k = 0; k < order.length && left > 0; k++) {
        var q = Math.min(left, debts[order[k]].b);
        if (q > 0) { debts[order[k]].b -= q; left -= q; debtPay += q; }
      }
      var surplus = inc - exp - debtPay;
      var contrib = surplus > 0 ? Math.min(p.goal, surplus) : 0;
      var free = surplus > 0 ? surplus - contrib : 0;
      var draw = surplus < 0 ? surplus : 0;
      bal = bal * (1 + r) + contrib + draw;
      rows.push({ month: m, income: inc, exp: exp, debtPay: debtPay, parts: parts, surplus: surplus, contrib: contrib, free: free, draw: draw, bal: bal,
        debtLeft: debts.reduce(function (s, d) { return s + d.b; }, 0) });
    }
    return rows;
  }

  function simulate(state, g, goal) {
    return runSim(state, { gEx: g, gOb: 0, goal: goal, incExtra: 0, extraDebt: 0 });
  }

  function targetPath(state) {
    var b = state.start, r = state.ret / 1200, out = [];
    for (var i = 0; i < 12; i++) { b = b * (1 + r) + state.goal; out.push(b); }
    return out;
  }

  /* مدة سداد دين واحد بقسطه الحالي. null يعني أن القسط لا يكفي. */
  function debtMonths(d) {
    var b = d.balance, r = d.rate / 1200;
    if (b <= 0.5) return 0;
    for (var m = 1; m <= 600; m++) {
      b += b * r;
      var p = Math.min(d.payment, b);
      if (p <= 0) return null;
      b -= p;
      if (b <= 0.5) return m;
    }
    return null;
  }

  /* مدة سداد كل الديون وإجمالي الفوائد.
     roll=false: كل دين يُسدد بقسطه فقط.
     roll=true: الأقساط المحررة والمبلغ الإضافي تذهب أولاً إلى الدين الأعلى فائدة. */
  function payoff(state, roll, extra) {
    var ds = state.debts, b = ds.map(function (d) { return d.balance; });
    var rates = ds.map(function (d) { return d.rate / 1200; });
    var pay = ds.map(function (d) { return d.payment; });
    var order = b.map(function (_, i) { return i; }).sort(function (x, y) { return (ds[y].rate - ds[x].rate) || (ds[x].balance - ds[y].balance); });
    var budget = pay.reduce(function (s, x) { return s + x; }, 0) + (roll ? extra : 0);
    var months = 0, interest = 0;
    if (b.every(function (x) { return x <= 0.5; })) return { months: 0, interest: 0, never: false };
    while (months < 600 && b.some(function (x) { return x > 0.5; })) {
      months++;
      var left = budget, i;
      for (i = 0; i < b.length; i++) { var it = b[i] * rates[i]; interest += it; b[i] += it; }
      for (i = 0; i < b.length; i++) { var p = Math.min(pay[i], b[i]); b[i] -= p; left -= p; }
      if (roll) {
        for (var k = 0; k < order.length && left > 0; k++) {
          var j = order[k], q = Math.min(left, b[j]);
          if (q > 0) { b[j] -= q; left -= q; }
        }
      }
    }
    return { months: months, interest: interest, never: b.some(function (x) { return x > 0.5; }) };
  }

  /* ---------- اختبار الصدمة: فقدان دخل ومصروف طارئ ---------- */
  function stress(state, a) {
    var s = state.shock;
    if (!s || !s.on) return null;
    var sh = { lossPct: clamp(s.lossPct, 0, 100), lossStart: clamp(s.lossStart, 0, 11) | 0, lossMonths: Math.max(1, clamp(s.lossMonths, 1, 12) | 0),
      emAmount: Math.max(0, +s.emAmount || 0), emMonth: clamp(s.emMonth, 0, 11) | 0 };
    var rows = runSim(state, { gEx: state.g, gOb: 0, goal: state.goal, incExtra: 0, extraDebt: 0, shock: sh });
    var minIdx = 0, negIdx = -1, i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].bal < rows[minIdx].bal) minIdx = i;
      if (negIdx < 0 && rows[i].bal < 0) negIdx = i;
    }
    return { rows: rows, sh: sh, minIdx: minIdx, minBal: rows[minIdx].bal, negIdx: negIdx, endBal: rows[11].bal, delta: rows[11].bal - a.rows[11].bal };
  }

  /* ---------- أهداف الادخار بتاريخ ---------- */
  function goalReq(amount, n, retAnnual) {
    var r = retAnnual / 1200;
    return r > 0 ? amount * r / (Math.pow(1 + r, n) - 1) : amount / n;
  }
  function monthsFor(amount, pay, retAnnual) {
    var r = retAnnual / 1200;
    return r > 0 ? Math.ceil(Math.log(1 + amount * r / pay) / Math.log(1 + r)) : Math.ceil(amount / pay);
  }
  /* الأهداف تُرتَّب بالأقرب موعداً وتتقاسم الادخار الشهري. لا تُحسب منها المدخرات الحالية. */
  function goalPlan(state, a) {
    var list = (state.goals || []).filter(function (g) { return g.amount > 0 && g.months >= 1; })
      .map(function (g) { return { id: g.id, name: g.name, amount: g.amount, months: Math.round(g.months) }; })
      .sort(function (x, y) { return x.months - y.months; });
    var cum = 0, cap = a.contrib;
    list.forEach(function (g) {
      var before = cum;
      g.req = goalReq(g.amount, g.months, state.ret);
      cum += g.req;
      g.ok = cum <= cap + 0.5;
      g.short = g.ok ? 0 : Math.min(g.req, cum - cap);
      var avail = Math.max(0, cap - before);
      g.ext = g.ok ? null : (avail > 0.5 ? monthsFor(g.amount, avail, state.ret) : null);
      g.date = monthYear(g.months - 1);
    });
    return { list: list, total: cum, cap: cap, byId: list.reduce(function (o, g) { o[g.id] = g; return o; }, {}) };
  }

  /* ---------- الفعلي مقابل المخطط ---------- */
  function monthKey(offset) {
    var d = new Date(), t = d.getFullYear() * 12 + d.getMonth() + offset, y = Math.floor(t / 12), m = t % 12;
    return { key: y + '-' + (m < 9 ? '0' : '') + (m + 1), label: MONTHS[m] + ' ' + digits(y), offset: offset };
  }
  function actualKeys() {
    var out = []; for (var o = -5; o <= 0; o++) out.push(monthKey(o)); return out;
  }
  function actualsSummary(state, a) {
    var planned = a.ob + a.ex, sumA = 0, sumP = 0, n = 0;
    var entries = actualKeys().map(function (k) {
      var v = state.actuals && state.actuals[k.key];
      var has = v !== undefined && v !== null && v !== '' && !isNaN(+v);
      var e = { key: k.key, label: k.label, planned: planned, actual: has ? +v : null, diff: null, pct: null };
      if (has) { e.diff = +v - planned; e.pct = planned > 0 ? e.diff / planned * 100 : 0; sumA += +v; sumP += planned; n++; }
      return e;
    });
    return { entries: entries, count: n, totalDiff: sumA - sumP, avgDiff: n ? (sumA - sumP) / n : 0, avgPct: sumP > 0 ? (sumA - sumP) / sumP * 100 : 0, planned: planned };
  }

  /* ---------- CSV ---------- */
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c === null || c === undefined ? '' : c);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  /* ---------- التحليل الرئيسي ---------- */
  function analyze(state) {
    var g = state.g, t = totals(state, g, 0);
    var rows = runSim(state, { gEx: g, gOb: 0, goal: state.goal, incExtra: 0, extraDebt: 0 });
    var baseRows = g === 0 ? rows : simulate(state, 0, state.goal);
    function avg(f) { return rows.reduce(function (s, r) { return s + f(r); }, 0) / rows.length; }
    var inc = avg(function (r) { return r.income; }), debtPay = avg(function (r) { return r.debtPay; });
    var contrib = avg(function (r) { return r.contrib; }), free = avg(function (r) { return r.free; });
    var outflow = t.ob + t.ex + debtPay, surplus = inc - outflow;
    var incs = rows.map(function (r) { return r.income; });
    var varies = !!state.varIncome || (state.raise && +state.raise.pct > 0) || (+state.inflation || 0) > 0 ||
      state.items.some(function (it) { return it.sched === 'y' || it.sched === 'o'; });
    var res = {
      varIncome: !!state.varIncome, varies: !!varies, inc: inc, incMin: Math.min.apply(null, incs), incMax: Math.max.apply(null, incs),
      ob: t.ob, ex: t.ex, debtPay: debtPay, outflow: outflow, surplus: surplus,
      contrib: contrib, free: free, rate: inc > 0 ? contrib / inc * 100 : 0,
      dti: inc > 0 ? debtPay / inc : 0, cover: outflow > 0 ? state.start / outflow : Infinity,
      rows: rows, baseRows: baseRows, target: targetPath(state)
    };
    res.stress = stress(state, res);
    return res;
  }

  /* ---------- مقارنة السيناريوهات ---------- */
  function scenarioMetrics(state, rows) {
    var n = rows.length;
    function sum(f) { return rows.reduce(function (s, r) { return s + f(r); }, 0); }
    var avgInc = sum(function (r) { return r.income; }) / n, saved = sum(function (r) { return r.contrib; });
    var hasDebt = state.debts.some(function (d) { return d.balance > 0.5; }), debtFree = null, i;
    if (hasDebt) { for (i = 0; i < n; i++) if (rows[i].debtLeft < 0.5) { debtFree = i; break; } }
    return {
      finalBal: rows[n - 1].bal, saved: saved, avgSurplus: sum(function (r) { return r.surplus; }) / n,
      debtLeft: rows[n - 1].debtLeft, hasDebt: hasDebt, debtFree: debtFree,
      deficitMonths: rows.filter(function (r) { return r.surplus < -0.5; }).length,
      rate: avgInc > 0 ? saved / n / avgInc * 100 : 0
    };
  }

  /* الوضع الحالي (أرقامك كما هي) ثم كل سيناريو مخصص. */
  function compare(state) {
    var list = [{ key: 'base', id: 0, name: 'الوضع الحالي', isBase: true, p: { gEx: 0, gOb: 0, goal: state.goal, incExtra: 0, extraDebt: 0 } }];
    (state.scenarios || []).forEach(function (s) {
      list.push({ key: 's' + s.id, id: s.id, name: s.name || 'سيناريو بلا اسم', isBase: false,
        p: { gEx: s.gEx, gOb: s.gOb, goal: s.goal, incExtra: s.incExtra, extraDebt: s.extraDebt } });
    });
    list.forEach(function (x) { x.rows = runSim(state, x.p); x.m = scenarioMetrics(state, x.rows); });
    return list;
  }

  /* ---------- التنبيهات والتوصيات ---------- */
  function advice(a, state) {
    var alerts = [], recs = [], goal = state.goal, i;
    var debtsLive = state.debts.filter(function (d) { return d.balance > 0.5; });
    var avgNote = a.varies ? ' في المتوسط' : '';
    var gp = goalPlan(state, a), act = actualsSummary(state, a);

    // التنبيهات
    if (a.surplus < 0) {
      alerts.push({ level: 'bad', title: 'عجز شهري', text: 'مصروفاتك وأقساطك تزيد عن دخلك بمقدار ' + money(-a.surplus) + avgNote + '.' + (goal > 0 ? ' لا يمكن تحقيق هدف الادخار في هذه الحالة.' : '') });
    } else if (goal > 0 && goal > a.contrib + 0.5) {
      if (a.varies) alerts.push({ level: 'warn', title: 'هدف الادخار لا يتحقق في كل الأشهر',
        text: 'الهدف ' + money(goal) + ' شهرياً، لكن المحاكاة تدخر ' + money(a.contrib) + ' في المتوسط لأن الفائض في بعض الأشهر أقل من الهدف.' });
      else alerts.push({ level: 'warn', title: 'هدف الادخار أكبر من الفائض المتاح',
        text: 'الهدف ' + money(goal) + ' والمتاح ' + money(a.surplus) + '. تدخر المحاكاة ' + money(a.contrib) + ' فقط، وينقصك ' + money(goal - a.surplus) + ' شهرياً.' });
    }
    var defMonths = [];
    a.rows.forEach(function (r, idx) { if (r.surplus < -0.5) defMonths.push(idx); });
    if (a.surplus >= 0 && defMonths.length) {
      var shown = defMonths.slice(0, 4).map(function (x) { return monthLabel(x); }).join('، ') + (defMonths.length > 4 ? ' وغيرها' : '');
      alerts.push({ level: 'warn', title: 'عجز في بعض الأشهر', text: 'يظهر عجز في ' + fmtMonths(defMonths.length) + ' (' + shown + ') رغم أن المتوسط يغطي الإنفاق.' });
    }
    if (a.dti > 0.43) alerts.push({ level: 'bad', title: 'الأقساط مرتفعة جداً', text: 'تأخذ أقساط الديون ' + pct(a.dti * 100) + ' من الدخل، والحد الآمن عادة أقل من 36%.' });
    else if (a.dti > 0.36) alerts.push({ level: 'warn', title: 'الأقساط مرتفعة', text: 'تأخذ أقساط الديون ' + pct(a.dti * 100) + ' من الدخل، والحد الآمن عادة أقل من 36%.' });
    for (i = 0; i < a.rows.length; i++) {
      if (a.rows[i].bal < 0) { alerts.push({ level: 'bad', title: 'الرصيد ينزل تحت الصفر', text: 'يصبح رصيد المدخرات سالباً في شهر ' + monthLabel(i) + '.' }); break; }
    }
    debtsLive.forEach(function (d) {
      if (d.payment <= d.balance * d.rate / 1200 + 0.5) alerts.push({ level: 'bad', title: 'قسط لا يغطي الفائدة', text: 'قسط ' + esc(d.name || 'دين بلا اسم') + ' لا يغطي فائدته الشهرية، فلا ينقص الدين.' });
    });
    if (isFinite(a.cover) && a.cover < 1) alerts.push({ level: 'warn', title: 'احتياطي الطوارئ ضعيف', text: 'مدخراتك الحالية تغطي أقل من شهر واحد من الإنفاق والأقساط.' });
    var shortGoals = gp.list.filter(function (g) { return !g.ok; });
    if (shortGoals.length) {
      alerts.push({ level: 'warn', title: 'هدف بتاريخ لا يتحقق بالادخار الحالي',
        text: shortGoals.map(function (g) { return esc(g.name || 'هدف بلا اسم'); }).join('، ') + ': تحتاج الأهداف ' + money(gp.total) + ' شهرياً والمتاح للادخار ' + money(gp.cap) + '.' });
    }
    if (a.stress && a.stress.negIdx >= 0) {
      alerts.push({ level: 'bad', title: 'الصدمة المفترضة تستنزف مدخراتك', text: 'في اختبار الصدمة ينفد رصيدك في شهر ' + monthLabel(a.stress.negIdx) + '.' });
    }
    if (act.count >= 2 && act.avgPct > 10) {
      alerts.push({ level: 'warn', title: 'إنفاقك الفعلي يتجاوز الخطة', text: 'في ' + fmtMonths(act.count) + ' مسجلة تجاوزت الخطة بنسبة ' + pct(act.avgPct) + ' (' + money(act.avgDiff) + ' شهرياً).' });
    }
    if (debtsLive.length && a.rows[11].debtLeft < 0.5) {
      for (i = 0; i < a.rows.length; i++) if (a.rows[i].debtLeft < 0.5) break;
      alerts.push({ level: 'good', title: 'ديونك تنتهي خلال السنة', text: 'تُسدَّد كل الديون في شهر ' + monthLabel(i) + '.' });
    }
    if (!alerts.length) alerts.push({ level: 'good', title: 'لا توجد تنبيهات', text: 'الخطة متوازنة بالأرقام الحالية.' });
    var rank = { bad: 0, warn: 1, good: 2 };
    alerts.sort(function (x, y) { return rank[x.level] - rank[y.level]; });

    // التوصيات
    var ex = a.ex;
    if (a.surplus < 0) {
      var need = -a.surplus, p = ex > 0 ? need / ex * 100 : Infinity;
      recs.push({ pri: 'urgent', title: 'أغلق العجز الشهري أولاً',
        body: p <= 100 ? 'خفض المصروفات المتغيرة بنسبة ' + pct(Math.ceil(p)) + ' يسدّ الفجوة بين دخلك وإنفاقك.'
          : 'حتى إلغاء كل المصروفات المتغيرة لا يسدّ الفجوة. راجع الدخل أو اطلب إعادة جدولة الأقساط.',
        impact: 'الفجوة ' + money(need) + ' شهرياً' + avgNote });
    } else if (goal > 0 && goal > a.contrib + 0.5) {
      var need2 = goal - a.contrib, p2 = ex > 0 ? need2 / ex * 100 : Infinity;
      if (a.varies) recs.push({ pri: 'important', title: 'اضبط هدف الادخار على أضعف الأشهر',
        body: 'هدفك ' + money(goal) + ' لا يتحقق في كل الأشهر، ومتوسط ما تدخره فعلياً ' + money(a.contrib) + '. اخفض الهدف إلى مستوى تغطيه الأشهر الضعيفة، أو اخفض المصروفات المتغيرة لرفع الفائض.',
        impact: 'متوسط الفجوة ' + money(need2) + ' شهرياً' });
      else recs.push({ pri: 'important', title: 'اضبط هدف الادخار على الفائض',
        body: 'هدفك ' + money(goal) + ' أعلى من الفائض ' + money(a.surplus) + '. اخفض الهدف إلى ' + money(a.surplus) + (p2 <= 100 ? '، أو اخفض المصروفات المتغيرة بنسبة ' + pct(Math.ceil(p2)) + ' لتحقق الهدف كاملاً.' : '.'),
        impact: 'الفرق ' + money(need2) + ' شهرياً' });
    }

    if (shortGoals.length) {
      var g0 = shortGoals[0];
      recs.push({ pri: 'important', title: 'أهدافك بتاريخ تحتاج ادخاراً أكبر',
        body: 'تحتاج أهدافك ' + money(gp.total) + ' شهرياً لتتحقق في مواعيدها، والمتاح ' + money(gp.cap) + '. ارفع الادخار بمقدار ' + money(Math.max(gp.total - gp.cap, 0)) +
          (g0.ext ? '، أو مدّد موعد «' + esc(g0.name || 'الهدف') + '» إلى ' + fmtMonths(g0.ext) + '.' : '، أو أجّل هدفاً منها.'),
        impact: 'الفجوة ' + money(Math.max(gp.total - gp.cap, 0)) + ' شهرياً' });
    }

    if (a.stress) {
      var st = a.stress;
      if (st.negIdx >= 0) recs.push({ pri: 'important', title: 'ابنِ حاجزاً ضد الصدمة',
        body: 'في الصدمة المفترضة ينفد رصيدك في شهر ' + monthLabel(st.negIdx) + ' ويصل أدنى رصيد إلى ' + money(st.minBal) + '. لتصمد تحتاج مدخرات إضافية بهذا المقدار قبل وقوعها.',
        impact: 'المطلوب ' + money(-st.minBal) });
      else recs.push({ pri: 'improve', title: 'تتحمل الصدمة المفترضة',
        body: 'أدنى رصيد يصله حسابك في الصدمة ' + money(st.minBal) + ' في شهر ' + monthLabel(st.minIdx) + '، وينتهي العام عند ' + money(st.endBal) + '. جرّب صدمة أقسى لتعرف حدّك.',
        impact: 'الأثر على رصيد نهاية السنة ' + money(st.delta) });
    }

    if (a.varIncome && a.incMax > a.incMin * 1.1) {
      var buf = a.rows.reduce(function (s, r) { return s + (r.surplus < 0 ? -r.surplus : 0); }, 0);
      var minI = a.rows.reduce(function (mi, r, idx) { return r.income < a.rows[mi].income ? idx : mi; }, 0);
      var range = 'دخلك يتراوح بين ' + money(a.incMin) + ' و' + money(a.incMax) + '. ';
      if (buf > 0.5) recs.push({ pri: 'important', title: 'خطّط لأضعف أشهرك دخلاً',
        body: range + 'أضعف شهر هو ' + monthLabel(minI) + ' ويظهر فيه عجز. احتفظ بمخزون من الأشهر القوية يغطي العجز المتراكم.',
        impact: 'العجز المتراكم ' + money(buf) });
      else recs.push({ pri: 'improve', title: 'ادّخر في الأشهر القوية',
        body: range + 'ويغطي إنفاقك حتى في أضعف شهر. ضع جزءاً ثابتاً من الأشهر القوية في حساب منفصل لتثبيت مستوى معيشتك.', impact: '' });
    }

    if (act.count >= 2 && act.avgPct > 10) {
      recs.push({ pri: 'important', title: 'راجع الفرق بين الخطة والفعلي',
        body: 'إنفاقك الفعلي يزيد عن الخطة بنسبة ' + pct(act.avgPct) + '. إما أن الخطة أقل من واقعك فعدّل بنودها، أو أن هناك إنفاقاً غير مخطط فسجّله كبند.',
        impact: 'المتوسط ' + money(act.avgDiff) + ' فوق الخطة شهرياً' });
    } else if (act.count >= 2 && act.avgPct < -10) {
      recs.push({ pri: 'improve', title: 'وجّه ما وفّرته إلى الادخار',
        body: 'أنفقت أقل من الخطة بنسبة ' + pct(-act.avgPct) + '. حوّل الفرق إلى حساب الادخار أو إلى الدين قبل أن يُصرف.',
        impact: 'المتوسط ' + money(-act.avgDiff) + ' شهرياً' });
    }

    if (debtsLive.length) {
      var top = debtsLive.slice().sort(function (x, y) { return (y.rate - x.rate) || (x.balance - y.balance); })[0];
      var base = payoff(state, false, 0);
      if (a.free > 0.5) {
        var fast = payoff(state, true, a.free), zero = top.rate === 0;
        var saved = base.never ? null : base.months - fast.months, intSaved = base.interest - fast.interest;
        recs.push({ pri: 'important', title: zero ? 'ابدأ بأصغر دين لتحرير قسطه' : 'وجّه الفائض الحر إلى الدين الأعلى فائدة',
          body: 'إضافة ' + money(a.free) + ' شهرياً إلى ' + esc(top.name || 'دين بلا اسم') + ' مع تدوير الأقساط المحررة تنهي الديون خلال ' + fmtMonths(fast.months) +
            ' (' + monthYear(fast.months - 1) + ') بدلاً من ' + (base.never ? 'مدة غير محددة' : fmtMonths(base.months)) + (!base.never && intSaved > 0.5 ? '، وتوفر ' + money(intSaved) + ' من الفوائد.' : '.'),
          impact: saved ? 'أسرع بـ ' + fmtMonths(saved) : 'ينهي دَيناً لا ينتهي بالقسط الحالي' });
      } else {
        recs.push({ pri: 'improve', title: 'رتّب أولويات سداد الديون',
          body: base.never ? 'بعض الأقساط لا تكفي لإنهاء الدين. ارفع القسط أو اطلب إعادة الجدولة.'
            : 'بالأقساط الحالية تنتهي ديونك خلال ' + fmtMonths(base.months) + ' (' + monthYear(base.months - 1) + '). أي مبلغ إضافي يتوفر لاحقاً يذهب أولاً إلى ' + esc(top.name || 'دين بلا اسم') + '.',
          impact: base.never ? '' : 'فوائد متوقعة ' + money(base.interest) });
      }
      if (top.rate > state.ret && top.rate > 0 && a.cover >= 1) {
        recs.push({ pri: 'improve', title: 'الدين أغلى من عائد المدخرات',
          body: 'فائدة ' + esc(top.name || 'الدين') + ' ' + pct(top.rate) + ' أعلى من عائد مدخراتك ' + pct(state.ret) + '. بعد أن يتوفر لديك احتياطي شهر على الأقل، يوفر لك سداد الدين أكثر من إيداع المبلغ.',
          impact: '' });
      }
    }

    if (isFinite(a.cover) && a.cover < 3) {
      var tgt = 3 * a.outflow, miss = tgt - state.start, mo = a.contrib > 0 ? Math.ceil(miss / a.contrib) : null;
      recs.push({ pri: a.cover < 1 ? 'urgent' : 'important', title: 'ابنِ احتياطي ثلاثة أشهر',
        body: 'مدخراتك تغطي ' + num(a.cover.toFixed(1)) + ' شهر من الإنفاق، والمعيار ثلاثة أشهر على الأقل. ينقصك ' + money(miss) +
          (mo ? '، ويتحقق ذلك خلال ' + fmtMonths(mo) + ' بالادخار الحالي.' : '. حدّد هدف ادخار شهرياً ليبدأ بناء الصندوق.'),
        impact: 'المطلوب ' + money(tgt) });
    }

    if (a.dti > 0.36) {
      recs.push({ pri: a.dti > 0.43 ? 'urgent' : 'important', title: 'خفّف عبء الأقساط',
        body: 'تأخذ الأقساط ' + pct(a.dti * 100) + ' من الدخل. أعد جدولة الدين الأطول أو ادمج ديونك بفائدة أقل لتنزل تحت 36%.',
        impact: 'الحد الآمن ' + money(a.inc * 0.36) + ' شهرياً' });
    }

    if (state.raise && +state.raise.pct > 0) {
      var rg = 0; for (var mm = 0; mm < 12; mm++) rg += baseIncomeAt(state, mm); rg = rg / 12 * (+state.raise.pct / 100);
      recs.push({ pri: 'improve', title: 'لا تدع الزيادة تُصرف',
        body: 'زيادة الدخل المتوقعة ' + pct(+state.raise.pct) + ' بدءاً من شهر ' + monthLabel(state.raise.month | 0) + ' تضيف نحو ' + money(rg) + ' شهرياً. وجّه نصفها على الأقل إلى الادخار أو الدين قبل أن يعتاد إنفاقك عليها.',
        impact: money(rg / 2) + ' شهرياً مقترح' });
    }

    if ((+state.inflation || 0) > 0 && a.outflow > 0) {
      var avgF = 0; for (var q2 = 0; q2 < 12; q2++) avgF += inflF(state, q2); avgF /= 12;
      var rise = (a.ob + a.ex) / avgF * (inflF(state, 11) - 1);
      recs.push({ pri: 'improve', title: 'التضخم يرفع إنفاقك خلال السنة',
        body: 'بنسبة تضخم ' + pct(+state.inflation) + ' سنوياً يرتفع إنفاقك الشهري بنحو ' + money(rise) + ' بنهاية الأشهر الاثني عشر. ثبّت الأسعار حيث تستطيع (اشتراكات، عقود) وراجع الدخل.',
        impact: '' });
    }

    var vars = state.items.filter(function (it) { return it.kind === 'ex' && itemAvg(state, it, state.g, 0) > 0; })
      .sort(function (x, y) { return itemAvg(state, y, state.g, 0) - itemAvg(state, x, state.g, 0); }).slice(0, 2);
    if (vars.length) {
      var gain = vars.reduce(function (s, it) { return s + itemAvg(state, it, state.g, 0) * 0.1; }, 0);
      var names = vars.map(function (it) { return esc(it.name || 'بدون اسم'); }).join(' و');
      recs.push({ pri: 'improve', title: 'اقتطع من أكبر بندين متغيرين',
        body: 'أكبر بنود المصروفات المتغيرة هي ' + names + '. خفض ' + (vars.length > 1 ? 'كل منهما' : 'البند') + ' بنسبة ' + pct(10) + ' يوفر ' + money(gain) + ' شهرياً.',
        impact: money(gain * 12) + ' خلال سنة' });
    }

    var gap = a.outflow - a.inc * 0.8;
    if (gap > 0 && a.inc > 0) {
      var run = state.start > 0 ? state.start / gap : 0;
      recs.push({ pri: run < 3 ? 'important' : 'improve', title: 'اختبار الضغط: نقص الدخل 20%',
        body: 'لو انخفض دخلك بنسبة ' + pct(20) + ' يظهر عجز ' + money(gap) + ' شهرياً، وتكفي مدخراتك ' + (run >= 1 ? fmtMonths(Math.floor(run)) : 'أقل من شهر') + '.',
        impact: 'احتياطي موصى به ' + money(gap * 3) });
    }

    if (a.inc > 0 && a.rate < 20) {
      recs.push({ pri: 'improve', title: 'قارن ادخارك بمعيار 20%',
        body: 'معدل ادخارك الفعلي ' + pct(a.rate) + ' من الدخل. المعيار المتعارف عليه 20% (قاعدة 50/30/20)، أي ' + money(a.inc * 0.2) + ' شهرياً.',
        impact: 'الفجوة ' + money(Math.max(a.inc * 0.2 - a.contrib, 0)) + ' شهرياً' });
    }

    if (goal > 0 && a.contrib > 0) {
      recs.push({ pri: 'improve', title: 'حوّل الادخار يوم استلام الراتب',
        body: 'حوّل ' + money(a.contrib) + ' إلى حساب منفصل قبل أي إنفاق. المبلغ الذي ينتظر آخر الشهر غالباً يُصرف.', impact: '' });
    }

    var order = { urgent: 0, important: 1, improve: 2 };
    recs = recs.map(function (r, idx) { r._i = idx; return r; })
      .sort(function (x, y) { return (order[x.pri] - order[y.pri]) || (x._i - y._i); }).slice(0, 10);

    return { alerts: alerts, recs: recs };
  }

  var api = { MONTHS: MONTHS, setDigits: setDigits, getDigits: getDigits, digits: digits, esc: esc, fmt: fmt, fmtPlain: fmtPlain, num: num, money: money, pct: pct,
    fmtMonths: fmtMonths, monthLabel: monthLabel, monthYear: monthYear, clamp: clamp,
    itemBase: itemBase, itemAt: itemAt, itemAvg: itemAvg, monthTotals: monthTotals, totals: totals, baseIncomeAt: baseIncomeAt, incomeAt: incomeAt,
    runSim: runSim, simulate: simulate, targetPath: targetPath, debtMonths: debtMonths, payoff: payoff, stress: stress,
    goalReq: goalReq, goalPlan: goalPlan, monthKey: monthKey, actualKeys: actualKeys, actualsSummary: actualsSummary, csv: csv,
    analyze: analyze, scenarioMetrics: scenarioMetrics, compare: compare, advice: advice };
  root.BudgetModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
