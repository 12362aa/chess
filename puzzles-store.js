/* ══════════════════════════════════════════════════════════════════
   PUZZLES — المخزن: البيانات الأوفلاين + سجلّ اللاعب
   ══════════════════════════════════════════════════════════════════
   طبقتان في ملفّ واحد لأنّهما وجهان لشيء واحد: «هات لي اللغز التالي»
   تحتاج الأرشيف وتحتاج تاريخ اللاعب في نفس اللحظة.

   ── الأرشيف ──────────────────────────────────────────────────────
   ٣٦٬٣٠٠ لغز مختارة من أرشيف lichess (CC0) مقسّمة على ٢٥ شريحة تصنيف
   بعرض ١٠٠ نقطة في puzzles/pz-XXXX.txt. لا نحمّل الأرشيف كلّه أبدًا:
   نحمّل الشريحة (أو الشريحتين) حول تصنيف اللاعب فقط ونحتفظ بأربع
   شرائح في الذاكرة على الأكثر. الشريحة ≈ ١٥٠ كيلوبايت.

   صيغة السطر (مفصولة بـ|، ولا حقل فيه هذا الرمز):
     id|fen|moves|rating|rd|popularity|plays|themes|openingTags

   ── السجلّ ───────────────────────────────────────────────────────
   IndexedDB أساسًا ونسخة في localStorage — نفس ازدواجية Rec وLVL،
   عشان لو واحد فشل الشاشة تفضل شغّالة. كل شيء يعمل أوفلاين بالكامل:
   الحساب يستقبل نسخة مختصرة لاحقًا، لكن اللعب لا ينتظر شبكة أبدًا.

   ★ الحفظ بعد كل تغيير لا بمؤقّت — نفس درس بناء ٣٧: اللي يقفل التطبيق
     بعد لغز مباشرةً كان تقدّمه بيضيع.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZS = (() => {

  const KEY = 'puzzles-v1';
  const DIR = 'puzzles/';
  const MAX_ATTEMPTS = 80;     /* آخر ٨٠ محاولة تكفي كل الإحصاءات المعروضة */
  const MAX_SEEN = 600;        /* ذاكرة «لا تكرّر عليّ لغزًا» */
  const MAX_DAYS = 200;
  const MAX_BANDS = 4;         /* شرائح محفوظة في الذاكرة */

  /* شرائح لغز اليوم — تدور فتختلف صعوبة اليوم عن أمس */
  const DAILY_BANDS = [1200, 1500, 1800, 1400, 2000, 1600, 1300];

  let state = null;
  let index = null;
  const bands = new Map();     /* file → Array<row> */
  const bandOrder = [];

  /* ── تحميل الملفات: fetch في المتصفّح، القرص في الاختبار ──────────
     الفحص على window لا على fetch: نود الحديث عنده fetch عامّ كمان،
     فلو اتّكلنا عليه وحده كان الاختبار بيحاول يجيب «puzzles/index.json»
     كعنوان شبكة ويفشل. */
  async function readText(path) {
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const res = await fetch(path, { cache: 'force-cache' });
      if (!res || !res.ok) throw new Error('تعذّر تحميل ' + path);
      return res.text();
    }
    const fs = require('fs');
    return fs.readFileSync(path, 'utf8');
  }

  async function loadIndex() {
    if (index) return index;
    index = JSON.parse(await readText(DIR + 'index.json'));
    return index;
  }

  function parseRow(line) {
    const f = line.split('|');
    if (f.length < 8) return null;
    return {
      id: f[0], fen: f[1], moves: f[2],
      rating: +f[3], rd: +f[4], popularity: +f[5], plays: +f[6],
      themes: f[7], openingTags: f[8] || '',
    };
  }

  async function loadBand(file) {
    if (bands.has(file)) return bands.get(file);
    const text = await readText(DIR + file);
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const r = parseRow(line);
      if (r) rows.push(r);
    }
    bands.set(file, rows);
    bandOrder.push(file);
    while (bandOrder.length > MAX_BANDS) bands.delete(bandOrder.shift());
    return rows;
  }

  /* الشرائح المتقاطعة مع نافذة تصنيف */
  async function bandsFor(lo, hi) {
    const idx = await loadIndex();
    return idx.bands.filter(b => b.hi >= lo && b.lo <= hi);
  }

  /* ── السجلّ ──────────────────────────────────────────────────────── */
  function blank() {
    return {
      v: 1,
      rating: PZR.blank(),
      attempts: [],
      themes: {},            /* key → {seen, solved} */
      seen: [],
      days: [],              /* أيام الحلّ — لسلسلة الأيام */
      daily: null,           /* {day, id, hearts, done, solved, hints} */
      best: { rush: 0, streak: 0, racer: 0, survival: 0 },
      totals: { solved: 0, failed: 0, assisted: 0, ms: 0 },
    };
  }

  function dayKey(t) {
    const d = new Date(t || Date.now());
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  /* رقم اليوم المحلّي — نفس حساب Rec.dayIndex بالحرف عشان تحدّيات
     اليوم ولغز اليوم يتقلبوا في نفس اللحظة لا بفارق ساعات. */
  function dayIndex(t) {
    const d = new Date(t || Date.now());
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  }

  async function load() {
    if (state) return state;
    let d = null;
    try { if (typeof IDB !== 'undefined') d = await IDB.kget(KEY); } catch (e) {}
    if (!d) {
      try {
        const s = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
        if (s) d = JSON.parse(s);
      } catch (e) {}
    }
    state = merge(d);
    return state;
  }

  /* الدمج لا الثقة: نسخة قديمة أو بلوب ناقص مايكسرش الشاشة */
  function merge(d) {
    const b = blank();
    if (!d || typeof d !== 'object') return b;
    b.rating = Object.assign(b.rating, d.rating || {});
    b.attempts = Array.isArray(d.attempts) ? d.attempts.slice(0, MAX_ATTEMPTS) : [];
    b.themes = (d.themes && typeof d.themes === 'object') ? d.themes : {};
    b.seen = Array.isArray(d.seen) ? d.seen.slice(0, MAX_SEEN) : [];
    b.days = Array.isArray(d.days) ? d.days.slice(0, MAX_DAYS) : [];
    b.daily = (d.daily && typeof d.daily === 'object') ? d.daily : null;
    b.best = Object.assign(b.best, d.best || {});
    b.totals = Object.assign(b.totals, d.totals || {});
    return b;
  }

  async function save() {
    const d = state || blank();
    try { if (typeof IDB !== 'undefined') await IDB.kset(KEY, d); } catch (e) {}
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    try { if (typeof window !== 'undefined' && window.amkhAuth &&
              typeof window.amkhAuth.markPuzzlesDirty === 'function') {
      window.amkhAuth.markPuzzlesDirty();
    } } catch (e) {}
    return d;
  }

  /* ── اختيار اللغز التالي ─────────────────────────────────────────
     المرشّحون = كل ألغاز الشرائح المتقاطعة مع النافذة، ناقص ما رآه
     اللاعب، وبموضوعٍ بعينه لو طلبه. لو ضاقت النافذة حتى خلت، نوسّعها
     مرّتين ثمّ نُسقِط شرط «غير مرئي» — أن يعيد لغزًا قديمًا أفضل من
     أن تقف الشاشة فارغة. */
  async function pick(opts) {
    const o = opts || {};
    const st = await load();
    const r = o.rating != null ? o.rating : st.rating.r;
    const seen = new Set(st.seen);
    const theme = o.theme || null;
    let win = PZR.window(r, o.difficulty || 'rated', o.progress);

    for (let attempt = 0; attempt < 4; attempt++) {
      const list = await bandsFor(win.lo, win.hi);
      const pool = [];
      for (const b of list) {
        const rows = await loadBand(b.file);
        for (const row of rows) {
          if (row.rating < win.lo || row.rating > win.hi) continue;
          if (theme && (' ' + row.themes + ' ').indexOf(' ' + theme + ' ') < 0) continue;
          if (attempt < 3 && seen.has(row.id)) continue;
          pool.push(row);
        }
      }
      if (pool.length) {
        const row = pool[Math.floor(Math.random() * pool.length)];
        return PZ.build(row);
      }
      win = { lo: Math.max(400, win.lo - 250), hi: win.hi + 250 };
    }
    return null;
  }

  /* لغز اليوم: واحد للجميع. لا عشوائية — رقم اليوم وحده يحدّده، فلاعبان
     على جهازين مختلفين يريان نفس اللغز ويصحّ الحديث عنه بينهما. */
  async function daily(t) {
    const di = dayIndex(t);
    const band = DAILY_BANDS[((di % DAILY_BANDS.length) + DAILY_BANDS.length) % DAILY_BANDS.length];
    const idx = await loadIndex();
    const meta = idx.bands.find(b => b.lo === band) || idx.bands[Math.floor(idx.bands.length / 2)];
    const rows = await loadBand(meta.file);
    if (!rows.length) return null;
    /* خلط ثابت: ضرب في عدد أوّليّ كبير يمنع «لغز الغد هو التالي مباشرةً» */
    const at = Math.abs((di * 2654435761) % rows.length);
    return PZ.build(rows[at]);
  }

  /* مجموعة صفوف خام لمواجهة الألغاز: المُتحدِّي يختارها من أرشيفه حول
     نطاق تصنيفه ويبعتها للطرفين، فيحلّان نفس الألغاز بالضبط بلا اعتماد
     على تطابق النسخ. نرجّع الصفوف الخام (لا PZ.build) عشان الطرف الآخر
     يبنيها عنده. count صفوف متمايزة، صعوبتها تصاعدية زي الرش. */
  async function battleRows(opts, count) {
    const o = opts || {};
    const n = Math.min(60, Math.max(5, count || 40));
    const base = o.rating != null ? o.rating : (await load()).rating.r;
    const out = [];
    const used = new Set();
    /* نمرّ على نافذة تتّسع مع التقدّم عشان الصعوبة تصعد داخل الجولة */
    for (let step = 0; step < n && out.length < n; step++) {
      const win = PZR.window(base, 'rush', step / n);
      const list = await bandsFor(win.lo, win.hi);
      const pool = [];
      for (const b of list) {
        const rows = await loadBand(b.file);
        for (const row of rows) {
          if (row.rating < win.lo || row.rating > win.hi) continue;
          if (used.has(row.id)) continue;
          pool.push(row);
        }
      }
      if (!pool.length) continue;
      const row = pool[Math.floor(Math.random() * pool.length)];
      used.add(row.id);
      out.push({ id: row.id, fen: row.fen, moves: row.moves, rating: row.rating, themes: row.themes });
    }
    return out;
  }

  return {
    load, save, dayIndex, dayKey, blank,
    get state() { return state; },

    /* للاختبار والتشخيص: تفريغ ما في الذاكرة */
    _reset() { state = null; index = null; bands.clear(); bandOrder.length = 0; },

    async rating() { return (await load()).rating; },
    async rank() { return PZR.rank((await load()).rating.r); },

    next(opts) { return pick(opts); },
    battleRows,
    daily,

    /* هل لغز اليوم مُنجَز؟ الحالة تُصفَّر تلقائيًّا مع تغيّر اليوم. */
    async dailyState(t) {
      const st = await load();
      const key = dayKey(t);
      if (!st.daily || st.daily.day !== key) {
        st.daily = { day: key, hearts: 5, done: false, solved: false, hints: 0 };
        await save();
      }
      return st.daily;
    },

    async setDailyState(patch) {
      const st = await load();
      const cur = await this.dailyState();
      st.daily = Object.assign(cur, patch || {});
      await save();
      return st.daily;
    },

    /* ── تسجيل محاولة ────────────────────────────────────────────
       res: { solved, mistakes, hintsUsed, gaveUp, ms }
       meta: { mode } — الوضع الذي لُعب فيه اللغز
       بيرجّع كل ما تحتاجه الشاشة لعرض النتيجة دفعة واحدة. */
    async record(puzzle, res, meta) {
      const st = await load();
      const m = meta || {};
      const out = PZR.apply(st.rating, puzzle, res);
      st.rating = out.player;

      const solved = !!(res && res.solved) && !(res && res.gaveUp);
      const assisted = (Number(res && res.hintsUsed) || 0) > 0;
      if (assisted) st.totals.assisted++;
      else if (solved) st.totals.solved++;
      else st.totals.failed++;
      st.totals.ms += Math.max(0, Number(res && res.ms) || 0);

      /* إحصاء المواضيع: الأسماء المعروضة من PZT، والأرقام هنا — هي
         أساس لوحة «نقاط قوّتك وضعفك». */
      for (const th of (puzzle.themes || [])) {
        const e = st.themes[th] || (st.themes[th] = { seen: 0, solved: 0 });
        e.seen++;
        if (solved && !assisted && !(Number(res && res.mistakes) || 0)) e.solved++;
      }

      st.attempts.unshift({
        t: Date.now(), id: puzzle.id, r: puzzle.rating,
        d: out.delta, ok: solved ? 1 : 0,
        mi: Number(res && res.mistakes) || 0,
        hi: Number(res && res.hintsUsed) || 0,
        ms: Math.max(0, Number(res && res.ms) || 0),
        mode: m.mode || 'rated',
      });
      if (st.attempts.length > MAX_ATTEMPTS) st.attempts.length = MAX_ATTEMPTS;

      if (puzzle.id) {
        st.seen = st.seen.filter(x => x !== puzzle.id);
        st.seen.unshift(puzzle.id);
        if (st.seen.length > MAX_SEEN) st.seen.length = MAX_SEEN;
      }

      /* يوم الحلّ يُسجَّل عند حلّ ناجح فقط — «سلسلة» تعدّ الفتحات
         بلا حلّ ليست سلسلة. */
      if (solved) {
        const dk = dayKey();
        if (st.days[0] !== dk) {
          st.days = st.days.filter(x => x !== dk);
          st.days.unshift(dk);
          if (st.days.length > MAX_DAYS) st.days.length = MAX_DAYS;
        }
      }

      await save();
      return {
        delta: out.delta, rated: out.rated, out: out.out,
        rating: st.rating, rank: PZR.rank(st.rating.r),
        streak: this.dayStreak(st.days),
      };
    },

    async setBest(key, value) {
      const st = await load();
      const v = Number(value) || 0;
      if (!st.best[key] || v > st.best[key]) { st.best[key] = v; await save(); return true; }
      return false;
    },

    /* سلسلة الأيام — نفس قاعدة Rec: تُحسب من آخر يوم لو كان اليوم أو
       أمس، وإلّا فقد انقطعت فعلًا. */
    dayStreak(days) {
      const list = days || (state ? state.days : []);
      if (!list || !list.length) return 0;
      const idx = list.map(s => {
        const p = s.split('-');
        return dayIndex(new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0));
      }).sort((a, b) => b - a);
      const today = dayIndex();
      if (idx[0] !== today && idx[0] !== today - 1) return 0;
      let n = 1, prev = idx[0];
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] === prev - 1) { n++; prev = idx[i]; }
        else if (idx[i] < prev - 1) break;
      }
      return n;
    },

    /* عدد الألغاز المحلولة اليوم — تحدّيات اليوم تقرأ من هنا */
    async solvedToday(t) {
      const st = await load();
      const dk = dayKey(t);
      return st.attempts.filter(a => a.ok && dayKey(a.t) === dk).length;
    },

    async stats() {
      const st = await load();
      const a = st.attempts;
      const rated = a.filter(x => !x.hi);
      const ok = rated.filter(x => x.ok && !x.mi).length;
      return {
        rating: st.rating.r,
        provisional: PZR.isProvisional(st.rating),
        rank: PZR.rank(st.rating.r),
        best: st.rating.best,
        hardest: st.rating.hardest,
        solved: st.totals.solved,
        failed: st.totals.failed,
        assisted: st.totals.assisted,
        accuracy: rated.length ? Math.round(ok / rated.length * 100) : 0,
        streak: this.dayStreak(st.days),
        records: st.best,
        recent: a.slice(0, 10),
        days: st.days.slice(0, 14),   /* شريط آخر أسبوع في اللوحة */
      };
    },

    /* نقاط القوّة والضعف: المواضيع التي حاولها ٤ مرّات فأكثر مرتّبة
       بنسبة النجاح. أقلّ من ذلك عيّنة لا تكفي للحكم على أحد. */
    async themeStats(minSeen) {
      const st = await load();
      const min = minSeen || 4;
      const out = [];
      for (const key of Object.keys(st.themes)) {
        const e = st.themes[key];
        if (!e || e.seen < min || !PZT.has(key)) continue;
        if (PZT.group(key) === 'length' || PZT.group(key) === 'origin') continue;
        out.push({
          key, name: PZT.name(key), group: PZT.group(key),
          seen: e.seen, solved: e.solved,
          rate: Math.round(e.solved / e.seen * 100),
        });
      }
      out.sort((x, y) => y.rate - x.rate || y.seen - x.seen);
      return { strong: out.slice(0, 5), weak: out.slice(-5).reverse(), all: out };
    },

    /* عدد ألغاز الأرشيف لكل نمط — ورقة المواضيع تقرأ من هنا لتُخفي
       الأنماط الخالية بدل أن تعرض زرًّا لا يجد لغزًا وراءه. من الفهرس
       مباشرةً، فلا تحميل شريحة واحدة. */
    async themeCounts() {
      const idx = await loadIndex();
      return (idx && idx.themes) ? idx.themes : {};
    },

    /* نسخة مختصرة للحساب: التصنيف والأرقام لا كل المحاولات. */
    async exportForSync() {
      const st = await load();
      return {
        v: 1, rating: st.rating, totals: st.totals,
        best: st.best, days: st.days.slice(0, 60), daily: st.daily,
        themes: st.themes,
        /* «لا تكرّر عليّ لغزًا» لازم يسافر مع الحساب كمان: من غيره الجهاز
           الجديد بيرجّع للاعب ألغازًا حلّها على جهازه القديم. مقصوص على
           ٣٠٠ عشان البلوب يفضل صغيرًا. */
        seen: st.seen.slice(0, 300),
      };
    },

    /* الدمج من الحساب: الأعلى يفوز في الأرقام التراكمية، والتصنيف
       يؤخذ من الأحدث عددًا للمحاولات — الجهاز الذي لعب أكثر أصدق. */
    async importFromSync(remote) {
      if (!remote || typeof remote !== 'object') return false;
      const st = await load();
      const r = remote.rating || {};
      /* أيُّ السجلّين أحدث؟ عدد المحاولات وحده (games) كان بيخون: اللغز
         المحلول بمساعد مابيزوّدش games، فلاعب حلّ عشرة بمساعد على جهاز
         تاني كان سجلّه يُهمَل بالكامل. المقياس هنا كل ما جرى فعلًا. */
      const act = x => (Number(x && x.games) || 0) + (Number(x && x.assisted) || 0)
                     + (Number(x && x.solved) || 0) + (Number(x && x.failed) || 0);
      if (act(r) > act(st.rating)) st.rating = Object.assign(PZR.blank(), r);
      /* القمّة وأصعب لغز لا ينزلان أبدًا مهما كان الفائز في المقارنة */
      st.rating.best = Math.max(Number(st.rating.best) || 0, Number(r.best) || 0);
      st.rating.hardest = Math.max(Number(st.rating.hardest) || 0, Number(r.hardest) || 0);
      for (const k of Object.keys(st.totals)) {
        st.totals[k] = Math.max(st.totals[k] || 0, Number(remote.totals && remote.totals[k]) || 0);
      }
      for (const k of Object.keys(st.best)) {
        st.best[k] = Math.max(st.best[k] || 0, Number(remote.best && remote.best[k]) || 0);
      }
      if (Array.isArray(remote.days)) {
        const all = new Set(st.days.concat(remote.days));
        st.days = [...all].sort().reverse().slice(0, MAX_DAYS);
      }
      if (Array.isArray(remote.seen)) {
        const all = new Set(st.seen.concat(remote.seen));
        st.seen = [...all].slice(0, MAX_SEEN);
      }
      /* ── لغز اليوم ──
         كان غائبًا عن الدمج تمامًا، فالحساب كان بيرجع بسجلّ بلا حالة
         اليوم — واللاعب اللي حلّ لغز اليوم ثم سجّل الدخول من جديد كان
         بيلاقيه مفتوحًا للّعب تاني (بلاغ أحمد). القاعدة: لغز اليوم
         محسوم لصالح «حُلّ»، لأن نسيان حلٍّ حصل أسوأ من تكرار عرضه. */
      const rd2 = remote.daily;
      if (rd2 && typeof rd2 === 'object' && rd2.day) {
        const today = dayKey();
        const mine = st.daily;
        if (!mine || !mine.day || rd2.day > mine.day) {
          /* سجلّ الحساب أحدث (أو ما عندناش حاجة) → نأخذه كما هو */
          st.daily = Object.assign({}, rd2);
        } else if (mine.day === rd2.day) {
          st.daily = {
            day: mine.day,
            id: mine.id || rd2.id || null,
            hearts: Math.min(Number(mine.hearts) >= 0 ? mine.hearts : 5,
                             Number(rd2.hearts) >= 0 ? rd2.hearts : 5),
            done: !!(mine.done || rd2.done),
            solved: !!(mine.solved || rd2.solved),
            hints: Math.max(Number(mine.hints) || 0, Number(rd2.hints) || 0),
          };
        }
        /* لو حالة اليوم المدموجة «حُلّ» فاليوم لازم يبقى في سلسلة الأيام */
        if (st.daily && st.daily.day === today && st.daily.solved && st.days[0] !== today) {
          st.days = [today].concat(st.days.filter(d => d !== today)).slice(0, MAX_DAYS);
        }
      }
      if (remote.themes && typeof remote.themes === 'object') {
        for (const k of Object.keys(remote.themes)) {
          const rem = remote.themes[k] || {}, cur = st.themes[k] || { seen: 0, solved: 0 };
          st.themes[k] = {
            seen: Math.max(cur.seen || 0, Number(rem.seen) || 0),
            solved: Math.max(cur.solved || 0, Number(rem.solved) || 0),
          };
        }
      }
      await save();
      return true;
    },
  };
})();

if (typeof window !== 'undefined') window.PZS = PZS;
if (typeof module !== 'undefined' && module.exports) module.exports = PZS;
