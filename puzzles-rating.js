/* ══════════════════════════════════════════════════════════════════
   PUZZLES — تصنيف الألغاز (Glicko-2)
   ══════════════════════════════════════════════════════════════════
   تصنيف الألغاز منفصل تمامًا عن تصنيف المباريات: لاعب يحلّ ألغازًا ممتازة
   وهو ضعيف في إدارة المباراة، والعكس. خلطهما يعطي رقمًا لا يصف شيئًا.

   نفس محرّك Glicko-2 المستعمل في الأونلاين (rating.js) — مش نسخة تانية
   من الرياضة، عشان مايجيش يوم وتختلف النتيجتان. الفرق في الاستعمال:

     ١) اللغز هو «الخصم»، وتصنيفه لا يتغيّر أبدًا. تصنيفات lichess
        محسوبة على ملايين المحاولات، فنحن نستهلكها ولا نعدّلها.
     ٢) اللغز خصم «مستقرّ» (games كبير) عشان معامل K مايتضخّمش: بدون ده
        كان كل لغز هيتعامل كأنه لاعب جديد فيهزّ تصنيف اللاعب بلا داعٍ.
     ٣) قاعدة الاحتساب — وهي قاعدة أحمد الثابتة: لا نقاط على لغز
        استُعين فيه بالمساعد. والخطأ الواحد يكفي لاعتبار المحاولة خسارة
        (زي lichess): اللغز له حلّ واحد صحيح، والتجريب ليس حلًّا.

   البداية ١٢٠٠ لا ١٥٠٠: جمهورنا مبتدئ في أغلبه، والبدء من رقم أعلى من
   المستوى الحقيقي معناه سلسلة هزائم في أول عشرة ألغاز. RD المرتفع
   بيصحّح الرقم خلال محاولات قليلة في الاتجاهين.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZR = (() => {

  const R = (typeof window !== 'undefined' && window.RATING) ? window.RATING
          : (typeof require === 'function' ? require('./rating.js') : null);

  const START_R = 1200;
  const START_RD = 350;
  const START_VOL = 0.06;

  /* اللغز خصم مستقرّ: games عالية تُنزِل K إلى مستوى اللاعب الثابت */
  const PUZZLE_GAMES = 9999;

  function L(ar, en) { return (typeof LP === 'function') ? LP(ar, en) : ar; }

  /* ── الرتب ──────────────────────────────────────────────────────
     تسع رتب بدل ثمانٍ أو عشر بلا سبب: الفارق بينها ٣٠٠ نقطة، وهو
     الفارق اللي اللاعب بيحسّه فعلًا في صعوبة الألغاز. */
  const RANKS = [
    { key: 'beginner',  min: 0,    ar: 'مبتدئ',  en: 'Beginner' },
    { key: 'novice',    min: 800,  ar: 'هاوٍ',    en: 'Novice' },
    { key: 'rising',    min: 1100, ar: 'صاعد',    en: 'Rising' },
    { key: 'skilled',   min: 1400, ar: 'متمرّس',  en: 'Skilled' },
    { key: 'sharp',     min: 1700, ar: 'حادّ',     en: 'Sharp' },
    { key: 'tactician', min: 2000, ar: 'تكتيكي',  en: 'Tactician' },
    { key: 'expert',    min: 2300, ar: 'خبير',    en: 'Expert' },
    { key: 'master',    min: 2600, ar: 'أستاذ',   en: 'Master' },
    { key: 'legend',    min: 2900, ar: 'أسطورة',  en: 'Legend' },
  ];

  function num(v, dflt) {
    const n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  function blank() {
    return {
      r: START_R, rd: START_RD, vol: START_VOL,
      games: 0,      /* محاولات محتسَبة — أساس معامل K */
      solved: 0,     /* حُلّت بلا خطأ ولا مساعد */
      failed: 0,
      assisted: 0,   /* حُلّت بمساعد — لا تُحتسب في التصنيف */
      best: START_R, /* أعلى تصنيف بلغه */
      hardest: 0,    /* أصعب لغز حلّه نظيفًا */
    };
  }

  function norm(p) {
    const b = blank();
    if (!p || typeof p !== 'object') return b;
    for (const k of Object.keys(b)) {
      const v = Number(p[k]);
      if (isFinite(v)) b[k] = v;
    }
    return b;
  }

  /* ── نتيجة المحاولة ─────────────────────────────────────────────
     res من جلسة PZ: { solved, mistakes, hintsUsed, gaveUp } */
  function outcome(res) {
    const hints = Number(res && res.hintsUsed) || 0;
    const mistakes = Number(res && res.mistakes) || 0;
    const solved = !!(res && res.solved) && !(res && res.gaveUp);

    if (hints > 0) {
      return {
        rated: false, score: solved ? 1 : 0, clean: false,
        reason: 'assisted',
        text: L('استعنتَ بالمساعد، فلا تُحتسب هذه المحاولة في التصنيف.',
                'You used a hint, so this attempt does not count toward your rating.'),
      };
    }
    if (!solved) {
      return {
        rated: true, score: 0, clean: false, reason: 'failed',
        text: L('لم يُحلّ.', 'Not solved.'),
      };
    }
    if (mistakes > 0) {
      return {
        rated: true, score: 0, clean: false, reason: 'mistakes',
        text: L('حُلّ بعد خطأ، واللغز له حلّ واحد — فالمحاولة خسارة.',
                'Solved after a wrong move; a puzzle has one solution, so this counts as a loss.'),
      };
    }
    return {
      rated: true, score: 1, clean: true, reason: 'clean',
      text: L('حُلّ من أوّل محاولة.', 'Solved first try.'),
    };
  }

  return {
    START_R, RANKS, blank,

    /* حالة اللاعب بعد محاولة واحدة.
       بيرجّع { player, delta, rated, out } — player جديد لا يعدّل القديم. */
    apply(player, puzzle, res) {
      const p = norm(player);
      const out = outcome(res);
      const pr = Math.round(Number(puzzle && puzzle.rating) || 1500);
      const prd = Math.min(Math.max(Number(puzzle && puzzle.rd) || 75, 30), 120);

      /* الإحصاء يُسجَّل دائمًا حتى لو المحاولة غير محتسَبة */
      if (out.reason === 'assisted') p.assisted++;
      else if (out.score === 1) p.solved++;
      else p.failed++;

      if (!out.rated || !R) {
        return { player: p, delta: 0, rated: false, out };
      }

      const opp = { r: pr, rd: prd, vol: START_VOL, games: PUZZLE_GAMES };
      const pre = { r: p.r, rd: p.rd, vol: p.vol, games: p.games };

      /* Glicko-2 لعدم اليقين، والفرق المعروض متماثل (Elo) — نفس
         الانقسام المتعمَّد في تصنيف المباريات. */
      const g2 = R.updatePlayer({ r: pre.r, rd: pre.rd, vol: pre.vol },
                                [{ r: opp.r, rd: opp.rd, score: out.score }]);
      const delta = R.displayDelta(pre, opp, out.score);

      p.r = Math.max(100, pre.r + delta);
      p.rd = g2.rd;
      p.vol = g2.vol;
      p.games++;
      if (p.r > p.best) p.best = p.r;
      if (out.clean && pr > p.hardest) p.hardest = pr;

      return { player: p, delta, rated: true, out };
    },

    /* احتمال الحلّ المتوقّع — يُعرض كـ«صعوبة» لا كنسبة تنبؤ */
    expected(player, puzzle) {
      const p = norm(player);
      if (!R) return 0.5;
      return R.eloExpect(p.r, Math.round(Number(puzzle && puzzle.rating) || 1500));
    },

    isProvisional(player) {
      const p = norm(player);
      return R ? R.isProvisional(p.rd) : p.rd > 110;
    },

    /* الرتبة الحالية مع تقدّمها نحو التالية — لشريط الرتبة */
    rank(r) {
      const v = num(r, START_R);
      let i = 0;
      for (let k = 0; k < RANKS.length; k++) if (v >= RANKS[k].min) i = k;
      const cur = RANKS[i], next = RANKS[i + 1] || null;
      const lo = cur.min, hi = next ? next.min : cur.min + 300;
      return {
        key: cur.key,
        index: i,
        name: L(cur.ar, cur.en),
        next: next ? L(next.ar, next.en) : null,
        nextAt: next ? next.min : null,
        progress: Math.max(0, Math.min(1, (v - lo) / (hi - lo))),
      };
    },

    /* نافذة تصنيف اللغز القادم.
         'rated'  أصعب قليلًا من اللاعب — هناك يتعلّم
         'easy'   أسهل — للإحماء وبعد سلسلة إخفاقات
         'hard'   تحدٍّ صريح
         'rush'   يتدرّج مع الوقت فتبدأ الجولة سهلة وتشتدّ
       الحدّ الأدنى ٤٠٠ لأنّ الأرشيف عندنا يبدأ من هناك. */
    window(r, mode, progress) {
      const v = num(r, START_R);
      let lo, hi;
      if (mode === 'easy') { lo = v - 350; hi = v - 50; }
      else if (mode === 'hard') { lo = v + 150; hi = v + 500; }
      else if (mode === 'rush') {
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        lo = v - 400 + Math.round(t * 500);
        hi = lo + 300;
      } else { lo = v - 100; hi = v + 200; }
      return { lo: Math.max(400, Math.round(lo)), hi: Math.max(600, Math.round(hi)) };
    },
  };
})();

if (typeof window !== 'undefined') window.PZR = PZR;
if (typeof module !== 'undefined' && module.exports) module.exports = PZR;
