/* model.js
   منطق الحساب والتوصيات فقط. لا يلمس الصفحة ولا يرسل أي بيانات.
   يعمل في المتصفح (window.BudgetModel) وفي Node للاختبار (module.exports). */
(function (root) {
  'use strict';

  var MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

  /* ---------- تنسيق ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmt(n) {
    var r = Math.round(n);
    return (r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US');
  }
  function num(t) { return '<span class="num">' + t + '</span>'; }
  function money(n) { return num(fmt(n)) + '<span class="unit"> د.ع</span>'; }
  function pct(n) { return num(Math.round(n) + '%'); }
  function fmtMonths(n) {
    n = Math.round(n);
    if (n < 12) return n === 1 ? 'شهر واحد' : n === 2 ? 'شهرين' : n + (n <= 10 ? ' أشهر' : ' شهراً');
    var y = Math.floor(n / 12), r = n % 12;
    var ys = y === 1 ? 'سنة' : y === 2 ? 'سنتين' : y + (y <= 10 ? ' سنوات' : ' سنة');
    return r ? ys + ' و' + (r === 1 ? 'شهر' : r === 2 ? 'شهرين' : r + (r <= 10 ? ' أشهر' : ' شهراً')) : ys;
  }
  function monthLabel(i) { return MONTHS[(new Date().getMonth() + i) % 12]; }
  function monthYear(i) {
    var d = new Date(), idx = d.getMonth() + i;
    return MONTHS[idx % 12] + ' ' + (d.getFullYear() + Math.floor(idx / 12));
  }

  /* ---------- الحساب ---------- */
  /* g: تغيير المصروفات المتغيرة %، gOb: تغيير الالتزامات الثابتة % */
  function effAmount(it, g, gOb) {
    return it.kind === 'ex' ? it.amount * (1 + g / 100) : it.amount * (1 + (gOb || 0) / 100);
  }

  function totals(state, g, gOb) {
    var ob = 0, ex = 0;
    state.items.forEach(function (it) { if (it.kind === 'ex') ex += effAmount(it, g, gOb); else ob += effAmount(it, g, gOb); });
    return { ob: ob, ex: ex };
  }

  /* دخل الشهر رقم m (0 = الشهر الحالي). عند تفعيل الدخل المتغير تُقرأ قيم الأشهر. */
  function incomeAt(state, m) {
    if (state.varIncome) {
      var v = +(state.incomeMonths || [])[m];
      return isNaN(v) ? state.salary + state.other : Math.max(0, v);
    }
    return state.salary + state.other;
  }

  /* محاكاة 12 شهراً. المعاملات p:
       gEx تغيير المصروفات المتغيرة %، gOb تغيير الالتزامات %، goal هدف الادخار الشهري،
       incExtra دخل إضافي شهري، extraDebt دفعة إضافية شهرية للدين الأعلى فائدة.
     الدين يحمل فائدة شهرية، والادخار = الأقل من الهدف والفائض. ما يزيد عن الهدف فائض حر.
     والعجز يُسحب من المدخرات. */
  function runSim(state, p) {
    var t = totals(state, p.gEx, p.gOb), r = state.ret / 1200, bal = state.start;
    var debts = state.debts.map(function (d) { return { name: d.name, b: d.balance, r: d.rate / 1200, p: d.payment, rate: d.rate }; });
    var order = debts.map(function (_, i) { return i; }).sort(function (x, y) { return (debts[y].rate - debts[x].rate) || (debts[x].b - debts[y].b); });
    var rows = [];
    for (var m = 0; m < 12; m++) {
      var inc = incomeAt(state, m) + (p.incExtra || 0), debtPay = 0, parts = [];
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
      var exp = t.ob + t.ex, surplus = inc - exp - debtPay;
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

  function analyze(state) {
    var g = state.g, t = totals(state, g, 0);
    var rows = runSim(state, { gEx: g, gOb: 0, goal: state.goal, incExtra: 0, extraDebt: 0 });
    var baseRows = g === 0 ? rows : simulate(state, 0, state.goal);
    var vi = !!state.varIncome;
    function avg(f) { return rows.reduce(function (s, r) { return s + f(r); }, 0) / rows.length; }
    function pick(f) { return vi ? avg(f) : f(rows[0]); }
    var inc = pick(function (r) { return r.income; }), debtPay = pick(function (r) { return r.debtPay; });
    var contrib = pick(function (r) { return r.contrib; }), free = pick(function (r) { return r.free; });
    var outflow = t.ob + t.ex + debtPay, surplus = inc - outflow;
    var incs = rows.map(function (r) { return r.income; });
    return {
      varIncome: vi, inc: inc, incMin: Math.min.apply(null, incs), incMax: Math.max.apply(null, incs),
      ob: t.ob, ex: t.ex, debtPay: debtPay, outflow: outflow, surplus: surplus,
      contrib: contrib, free: free, rate: inc > 0 ? contrib / inc * 100 : 0,
      dti: inc > 0 ? debtPay / inc : 0, cover: outflow > 0 ? state.start / outflow : Infinity,
      rows: rows, baseRows: baseRows, target: targetPath(state)
    };
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
    var avgNote = a.varIncome ? ' في المتوسط' : '';

    // التنبيهات
    if (a.surplus < 0) {
      alerts.push({ level: 'bad', title: 'عجز شهري', text: 'مصروفاتك وأقساطك تزيد عن دخلك بمقدار ' + money(-a.surplus) + avgNote + '.' + (goal > 0 ? ' لا يمكن تحقيق هدف الادخار في هذه الحالة.' : '') });
    } else if (a.varIncome && goal > 0 && goal > a.contrib + 0.5) {
      alerts.push({ level: 'warn', title: 'هدف الادخار لا يتحقق في كل الأشهر',
        text: 'الهدف ' + money(goal) + ' شهرياً، لكن المحاكاة تدخر ' + money(a.contrib) + ' في المتوسط لأن الفائض في بعض الأشهر أقل من الهدف.' });
    } else if (!a.varIncome && goal > 0 && goal > a.surplus + 0.5) {
      alerts.push({ level: 'warn', title: 'هدف الادخار أكبر من الفائض المتاح',
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
    } else if (a.varIncome && goal > 0 && goal > a.contrib + 0.5) {
      recs.push({ pri: 'important', title: 'اضبط هدف الادخار على أضعف الأشهر',
        body: 'هدفك ' + money(goal) + ' لا يتحقق في كل الأشهر، ومتوسط ما تدخره فعلياً ' + money(a.contrib) + '. اخفض الهدف إلى مستوى تغطيه الأشهر الضعيفة، أو اخفض المصروفات المتغيرة لرفع الفائض.',
        impact: 'متوسط الفجوة ' + money(goal - a.contrib) + ' شهرياً' });
    } else if (!a.varIncome && goal > 0 && goal > a.surplus + 0.5) {
      var need2 = goal - a.surplus, p2 = ex > 0 ? need2 / ex * 100 : Infinity;
      recs.push({ pri: 'important', title: 'اضبط هدف الادخار على الفائض',
        body: 'هدفك ' + money(goal) + ' أعلى من الفائض ' + money(a.surplus) + '. اخفض الهدف إلى ' + money(a.surplus) + (p2 <= 100 ? '، أو اخفض المصروفات المتغيرة بنسبة ' + pct(Math.ceil(p2)) + ' لتحقق الهدف كاملاً.' : '.'),
        impact: 'الفرق ' + money(need2) + ' شهرياً' });
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

    var vars = state.items.filter(function (it) { return it.kind === 'ex' && effAmount(it, state.g) > 0; })
      .sort(function (x, y) { return effAmount(y, state.g) - effAmount(x, state.g); }).slice(0, 2);
    if (vars.length) {
      var gain = vars.reduce(function (s, it) { return s + effAmount(it, state.g) * 0.1; }, 0);
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
      .sort(function (x, y) { return (order[x.pri] - order[y.pri]) || (x._i - y._i); }).slice(0, 8);

    return { alerts: alerts, recs: recs };
  }

  var api = { MONTHS: MONTHS, esc: esc, fmt: fmt, num: num, money: money, pct: pct, fmtMonths: fmtMonths, monthLabel: monthLabel, monthYear: monthYear,
    effAmount: effAmount, totals: totals, incomeAt: incomeAt, runSim: runSim, simulate: simulate, targetPath: targetPath, debtMonths: debtMonths,
    payoff: payoff, analyze: analyze, scenarioMetrics: scenarioMetrics, compare: compare, advice: advice };
  root.BudgetModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
