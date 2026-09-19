/* ══════════════════════════════════════════════════════════════════
   PUZZLES — الشاشة
   ══════════════════════════════════════════════════════════════════
   كل ما يلمسه المستخدم في قسم الألغاز: اللوحة الرئيسية، رقعة الحلّ،
   شريط نور، الأوضاع الستّة، وأوراق النتيجة.

   ★ لماذا رقعة ثانية بدل رقعة اللعب؟ رقعة #board مربوطة بالحالة العامّة
     S (سجلّ، تراجع، ساعة، محرّك، مزامنة، متفرّجون…). تمرير لغز خلالها
     يعني تلويث حالة المباراة الحقيقية — ومباراة أونلاين جارية تنكسر.
     الرقعة هنا مستقلّة وصغيرة، وتستعير من التطبيق مظهره فقط: نفس
     أصناف ‎.sq/.piece‎ ونفس متغيّرات الألوان ونفس مجموعة القطع، فيتبع
     القسم ثيم المستخدم بلا سطر إعداد واحد.

   ★ الحركة بـtransform وحدها (درس #140): أي أنميشن يلمس عرضًا أو لونًا
     يجبر WebView على إعادة بناء الطبقة، وهذا هو الوميض بعينه.

   ★ كل النصوص هنا تُبنى بـ‎L(ar,en)‎ لا بالقاموس: أغلبها جمل مركّبة
     بأرقام ومتغيّرات، والقاموس مفاتيحه جمل كاملة. الحاويات في الـHTML
     عليها data-no-i18n فلا يمرّ عليها المسح أصلًا.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZU = (() => {

  function L(ar, en) { return (typeof LP === 'function') ? LP(ar, en) : ar; }
  const $ = id => document.getElementById(id);

  const COACH_KEY = 'amkh_pz_coach';   /* تفضيل جهاز، لا يُزامَن */

  /* ── الأوضاع ─────────────────────────────────────────────────────
     كل وضع سطر واحد: كيف يختار اللغز، وكيف ينتهي. البقيّة مشتركة. */
  const MODES = {
    rated:  { ar: 'مصنّف',      en: 'Rated',      dar: 'لغز تلو الآخر، وكل حلّ يحرّك تصنيفك.',
              den: 'One puzzle after another; every solve moves your rating.', diff: 'rated' },
    easy:   { ar: 'تدريب',      en: 'Practice',   dar: 'ألغاز أسهل من مستواك، بلا ضغط.',
              den: 'Puzzles below your level, no pressure.', diff: 'easy' },
    hard:   { ar: 'تحدٍّ',       en: 'Challenge',  dar: 'أصعب ممّا تحلّه عادةً. هنا يزيد الفارق.',
              den: 'Harder than you usually solve. This is where you gain.', diff: 'hard' },
    rush:   { ar: 'انطلاق',     en: 'Rush',       dar: 'ثلاث دقائق. كم لغزًا تحلّ؟ ثلاثة أخطاء تنهي الجولة.',
              den: 'Three minutes. How many can you solve? Three misses end it.',
              diff: 'rush', secs: 180, strikes: 3, best: 'rush' },
    streak: { ar: 'سلسلة',      en: 'Streak',     dar: 'بلا وقت وبلا خطأ: أوّل خطأ ينهي السلسلة، والصعوبة تصعد معك.',
              den: 'No clock, no mistakes: the first miss ends it, and difficulty climbs with you.',
              diff: 'rated', strikes: 1, best: 'streak' },
    racer:  { ar: 'سباق',       en: 'Racer',      dar: 'دقيقة واحدة. كل خطأ يأكل خمس ثوانٍ.',
              den: 'One minute. Every miss eats five seconds.',
              diff: 'easy', secs: 60, penalty: 5, best: 'racer' },
    daily:  { ar: 'لغز اليوم',  en: 'Daily puzzle', dar: 'لغز واحد للجميع، وخمسة قلوب.',
              den: 'One puzzle for everyone, and five hearts.', hearts: 5 },
    theme:  { ar: 'بالموضوع',   en: 'By theme',   dar: 'تمرين مركَّز على نمط واحد حتى تراه بلا تفكير.',
              den: 'Focused drilling on one motif until you see it without thinking.', diff: 'rated' },
    /* مواجهة صديق: رش مشترك، الأكثر حلًّا يفوز. المدّة والألغاز من
       المصافحة عبر السوكت لا من هنا، فلا secs ثابتة. */
    battle: { ar: 'مواجهة',     en: 'Battle',     dar: 'تحدَّ صديقًا: نفس الألغاز، الأكثر حلًّا يفوز.',
              den: 'Challenge a friend: same puzzles, most solved wins.', diff: 'rush' },
  };

  function modeName(k) { const m = MODES[k]; return m ? L(m.ar, m.en) : k; }
  function modeDesc(k) { const m = MODES[k]; return m ? L(m.dar, m.den) : ''; }

  /* ── أدوات بناء صغيرة ────────────────────────────────────────────
     نبني DOM لا innerHTML: أسماء المواضيع وأرقام اللاعب تمرّ من هنا،
     ونصّ واحد غير متوقَّع في innerHTML يفتح بابًا لا يُغلق. */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, text, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', () => { sfx('btn'); onClick(); });
    return b;
  }
  function sfx(name, arg) {
    try { if (window.SFX && typeof SFX[name] === 'function') SFX[name](arg); } catch (e) {}
  }
  /* اهتزاز خفيف مع اللحظات المهمّة. مربوط بإعداد الصوت: مين يطفّي الصوت
     غالبًا يريد جهازًا صامتًا. محاط بحماية لأنّ navigator.vibrate غير
     موجود على كل منصّة، ونداؤه على سطح مكتب بلا محرّك اهتزاز لا يضرّ. */
  function buzz(pattern) {
    try {
      if (window.Cfg && Cfg.data && Cfg.data.sound === false) return;
      if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch (e) {}
  }
  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  /* عدّاد متدحرج: يعرض الرقم يزحف من القديم للجديد. transform ما ينفعش
     هنا (نصّ متغيّر)، فنكتفي بتحديث textContent بوتيرة قصيرة — لا لون
     ولا عرض يتأنمت، فلا وميض. */
  function rollCount(node, from, to, ms) {
    if (!node) return;
    from = Math.round(from); to = Math.round(to);
    if (from === to) { node.textContent = String(to); return; }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dur = Math.max(200, ms || 700);
    const step = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);          /* ease-out */
      node.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
      else node.textContent = String(to);
    };
    requestAnimationFrame(step);
  }

  /* ══════════════════════════════════════════════════════════════
     الرقعة
     ══════════════════════════════════════════════════════════════ */
  const B = {
    built: false, flip: null, squares: [],

    build(flip) {
      const host = $('pz-board');
      if (!host) return;
      if (this.built && this.flip === flip) return;
      host.textContent = '';
      this.flip = flip; this.built = true; this.squares = [];
      const coords = !!(window.Cfg && Cfg.data && Cfg.data.coords);
      for (let ri = 0; ri < 8; ri++) {
        for (let ci = 0; ci < 8; ci++) {
          const r = flip ? 7 - ri : ri, c = flip ? 7 - ci : ci;
          const sq = el('div', 'sq ' + (((r + c) % 2 === 0) ? 'L' : 'D'));
          sq.dataset.r = r; sq.dataset.c = c;
          if (coords) {
            if (ci === 0) sq.appendChild(el('span', 'crd-r', String(flip ? r + 1 : 8 - r)));
            if (ri === 7) sq.appendChild(el('span', 'crd-f', 'abcdefgh'[c]));
          }
          sq.addEventListener('click', () => onSquare(r, c));
          host.appendChild(sq);
          this.squares.push(sq);
        }
      }
      /* صورة الرقعة المخصّصة تُطبَّق على #board وحدها في الإعدادات،
         فنعكسها هنا يدويًّا وإلّا ظهر القسم بثيم غير ثيم المستخدم. */
      try {
        const src = document.getElementById('board');
        if (src && src.classList.contains('has-bg-image')) {
          host.style.backgroundImage = src.style.backgroundImage;
          host.style.backgroundSize = 'cover';
          host.classList.add('has-bg-image');
          if (src.classList.contains('custom-board')) host.classList.add('custom-board');
        } else {
          host.style.backgroundImage = '';
          host.classList.remove('has-bg-image', 'custom-board');
        }
      } catch (e) {}
    },

    reset() { this.built = false; this.flip = null; this.squares = []; },

    at(r, c) {
      return this.squares.find(s => +s.dataset.r === r && +s.dataset.c === c) || null;
    },

    paint(v) {
      const flip = !!v.flip;
      this.build(flip);
      for (const sq of this.squares) {
        const r = +sq.dataset.r, c = +sq.dataset.c;
        const isL = (r + c) % 2 === 0;
        let cls = 'sq ';
        if (v.sel && v.sel[0] === r && v.sel[1] === c) cls += isL ? 'SL' : 'SD';
        else if (v.last && ((v.last.from[0] === r && v.last.from[1] === c) ||
                            (v.last.to[0] === r && v.last.to[1] === c))) cls += isL ? 'ML' : 'MD';
        else cls += isL ? 'L' : 'D';
        if (v.legal && v.legal.some(m => m[0] === r && m[1] === c)) {
          cls += v.bd[r][c] ? ' ring' : ' dot';
        }
        if (v.glow && v.glow[0] === r && v.glow[1] === c) cls += ' pz-glow';
        if (sq.className !== cls) sq.className = cls;

        const code = v.bd[r][c];
        const cur = sq.querySelector('.piece');
        if (code) {
          if (!cur || cur.dataset.pc !== code) {
            if (cur) cur.remove();
            const p = el('div', 'piece ' + code);
            p.dataset.pc = code;
            sq.appendChild(p);
          }
        } else if (cur) cur.remove();
      }
    },

    /* انزلاق النقلة: نرسم الوضع الجديد ثم ندفع القطعة إلى مكانها
       القديم بـtransform وندعها تعود. لا عرض ولا لون يتغيّر. */
    slide(from, to) {
      const a = this.at(from[0], from[1]), b = this.at(to[0], to[1]);
      const p = b && b.querySelector('.piece');
      if (!a || !b || !p) return;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      p.style.transition = 'none';
      p.style.transform = `translate(${ra.left - rb.left}px,${ra.top - rb.top}px)`;
      void p.offsetWidth;
      p.style.transition = 'transform .18s cubic-bezier(.22,.9,.3,1)';
      p.style.transform = '';
      setTimeout(() => { p.style.transition = ''; p.style.transform = ''; }, 240);
    },

    mark(rc, kind) {
      const sq = this.at(rc[0], rc[1]);
      if (!sq) return;
      const m = el('div', 'pz-mark pz-mark--' + kind);
      sq.appendChild(m);
      setTimeout(() => { try { m.remove(); } catch (e) {} }, 620);
    },
  };

  /* ══════════════════════════════════════════════════════════════
     الجلسة الجارية
     ══════════════════════════════════════════════════════════════ */
  let M = null;          /* حالة الوضع الجاري */
  let tick = null;       /* مؤقّت العرض */
  let busy = false;      /* أثناء أنميشن ردّ الخصم: لا نقبل نقرًا */

  function coachOn() {
    try { return localStorage.getItem(COACH_KEY) !== 'off'; } catch (e) { return true; }
  }
  function setCoach(on) {
    try { localStorage.setItem(COACH_KEY, on ? 'on' : 'off'); } catch (e) {}
    try { PZN.setMode(on ? 'normal' : 'silent'); } catch (e) {}
  }

  function say(text) {
    const box = $('pz-coach'), t = $('pz-coach-text');
    if (!box || !t) return;
    if (!text) { box.hidden = true; return; }
    box.hidden = false;
    /* إعادة تشغيل الظهور: إزالة الصنف ثم إضافته في الإطار التالي، وإلّا
       ظلّ السطر الثاني بلا حركة فبدا كأنّ نورًا لم يتكلّم. */
    t.classList.remove('is-in');
    t.textContent = text;
    requestAnimationFrame(() => t.classList.add('is-in'));
  }

  /* ── شريط الحالة فوق الرقعة ────────────────────────────────────── */
  function renderStatus() {
    const box = $('pz-status');
    if (!box || !M) return;
    box.textContent = '';

    const left = el('div', 'pzg__st-left');
    left.appendChild(el('span', 'pzg__st-mode', modeName(M.mode)));
    if (M.puzzle) {
      left.appendChild(el('span', 'pzg__st-rating',
        L('صعوبة ', 'Difficulty ') + M.puzzle.rating));
    }
    box.appendChild(left);

    const right = el('div', 'pzg__st-right');
    if (M.hearts != null) {
      const h = el('span', 'pzg__hearts');
      for (let i = 0; i < 5; i++) {
        let cls = 'pzg__heart' + (i < M.hearts ? '' : ' is-gone');
        if (i === M._brokeAt) cls += ' is-breaking';
        const d = el('i', cls);
        d.setAttribute('aria-hidden', 'true');
        h.appendChild(d);
      }
      h.title = L(M.hearts + ' قلوب باقية', M.hearts + ' hearts left');
      right.appendChild(h);
      M._brokeAt = -1;            /* حركة الكسر مرّة واحدة لا كل إعادة رسم */
    }
    if (M.strikes != null && M.hearts == null) {
      right.appendChild(el('span', 'pzg__st-strikes',
        L('أخطاء ' + M.misses + '/' + M.strikes, 'Misses ' + M.misses + '/' + M.strikes)));
    }
    if (M.mode === 'battle') {
      /* المواجهة: نتيجتك ونتيجة الخصم جنبًا إلى جنب، الأعلى مُبرَز */
      const vs = el('span', 'pzg__vs');
      vs.appendChild(el('b', 'pzg__vs-me' + ((M.score || 0) >= (M.oppScore || 0) ? ' is-lead' : ''), String(M.score || 0)));
      vs.appendChild(el('span', 'pzg__vs-sep', '·'));
      vs.appendChild(el('b', 'pzg__vs-opp' + ((M.oppScore || 0) > (M.score || 0) ? ' is-lead' : ''), String(M.oppScore || 0)));
      vs.title = L('أنت مقابل ' + (M.oppName || 'الخصم'), 'You vs ' + (M.oppName || 'opponent'));
      right.appendChild(vs);
    } else if (M.score != null) {
      right.appendChild(el('span', 'pzg__st-score', L('النتيجة ', 'Score ') + M.score));
    }
    if (M.deadline) {
      const t = el('span', 'pzg__st-clock', fmtTime(M.deadline - Date.now()));
      t.id = 'pz-clock';
      right.appendChild(t);
    }
    box.appendChild(right);
  }

  /* ── شريط الأزرار تحت الرقعة ───────────────────────────────────── */
  function renderBar() {
    const bar = $('pz-bar');
    if (!bar || !M) return;
    bar.textContent = '';

    if (M.finished) {
      /* اللغز انتهى: زرّ واحد كبير يمضي بالجولة قُدُمًا */
      const endsRound = (M.mode === 'daily') || M.roundOver;
      bar.appendChild(btn('pz-btn pz-btn--main',
        endsRound ? L('إنهاء', 'Finish') : L('اللغز التالي', 'Next puzzle'),
        () => { endsRound ? endRound() : nextPuzzle(); }));
      if (!endsRound) {
        bar.appendChild(btn('pz-btn', L('خروج', 'Leave'), () => endRound()));
      }
      return;
    }

    const hintLabel = M.sess && M.sess.hintsUsed
      ? L('تلميح أوضح', 'Clearer hint') : L('تلميح', 'Hint');
    const hb = btn('pz-btn', hintLabel, () => doHint());
    /* في الأوضاع المؤقَّتة التلميح معطَّل: الجولة نتيجتها رقم يُقارَن،
       ومساعدة في جولة ورقم بلا مساعدة في أخرى يجعلان الرقمين لا يُقارَنان. */
    if (M.timed) { hb.disabled = true; hb.title = L('لا تلميح في الجولات المؤقّتة', 'No hints in timed rounds'); }
    bar.appendChild(hb);

    bar.appendChild(btn('pz-btn', L('عرض الحلّ', 'Show solution'), () => doGiveUp()));
  }

  /* ── عرض اللغز ─────────────────────────────────────────────────── */
  function view(extra) {
    const s = M && M.sess;
    if (!s) return;
    B.paint(Object.assign({
      bd: s.board,
      flip: M.puzzle.playerCol === 'b',
      sel: M.sel,
      legal: M.legal,
      last: M.last,
    }, extra || {}));
  }

  function onSquare(r, c) {
    if (!M || !M.sess || M.finished || busy) return;
    const s = M.sess;
    const code = s.board[r][c];

    if (M.sel) {
      const isMine = code && code[0] === M.puzzle.playerCol;
      const hit = M.legal.some(m => m[0] === r && m[1] === c);
      if (hit) { playMove(M.sel, [r, c]); return; }
      M.sel = isMine ? [r, c] : null;
      M.legal = M.sel ? s.legalFrom(r, c) : [];
      if (M.sel) sfx('select');
      view();
      return;
    }
    if (!code || code[0] !== M.puzzle.playerCol) return;
    const legal = s.legalFrom(r, c);
    if (!legal.length) return;
    M.sel = [r, c]; M.legal = legal;
    sfx('select');
    view();
  }

  function playMove(from, to) {
    const s = M.sess;
    /* الترقية: لو النقلة المطلوبة ترقية نأخذ قطعتها من الحلّ نفسه،
       وإلّا فوزير. اللغز لا يترك للاعب اختيارًا هنا — الحلّ واحد. */
    let promo = null;
    const piece = s.board[from[0]][from[1]];
    if (piece && piece[1] === 'P' && (to[0] === 0 || to[0] === 7)) {
      const exp = PZ.parseUci(M.puzzle.solution[s.index] || '');
      promo = (exp && exp.from[0] === from[0] && exp.from[1] === from[1] &&
               exp.to[0] === to[0] && exp.to[1] === to[1] && exp.promo) ? exp.promo : 'Q';
    }
    const before = { bd: s.board, cas: s.cas, ep: s.ep, turn: s.turn };
    const res = s.tryMove(from, to, promo);
    M.sel = null; M.legal = [];

    if (res.status === 'wrong') {
      onWrong(before, from, to, promo);
      return;
    }
    if (!res.ok) { view(); return; }

    /* نقلة صحيحة */
    M.last = { from, to };
    view();
    B.slide(from, to);
    B.mark(to, 'ok');
    sfx(res.status === 'solved' && res.mate ? 'checkmate' : 'move');

    if (res.status === 'solved') { finish(true); return; }

    /* ردّ الخصم بعد مهلة قصيرة تكفي لرؤية نقلتنا */
    busy = true;
    const rep = res.reply;
    setTimeout(() => {
      if (!M || M.sess !== s) return;
      s.applyReply();
      if (rep) { M.last = { from: rep.from, to: rep.to }; }
      view();
      if (rep) B.slide(rep.from, rep.to);
      sfx('move');
      busy = false;
      if (s.finished) finish(true);
    }, 320);
  }

  function onWrong(before, from, to, promo) {
    sfx('illegal');
    buzz(40);
    B.mark(to, 'bad');
    view();
    if (coachOn()) {
      say(PZN.wrong({
        board: before.bd, cas: before.cas, ep: before.ep, turn: before.turn,
        from, to, promo,
      }));
    }
    M.misses = (M.misses || 0) + 1;
    if (M.hearts != null) {
      M.hearts = Math.max(0, M.hearts - 1);
      M._brokeAt = M.hearts;      /* القلب الذي انطفأ للتوّ — يُكسَر بحركة */
      persistDaily();
      if (M.hearts === 0) { renderStatus(); finish(false); return; }
    }
    if (M.penalty && M.deadline) M.deadline -= M.penalty * 1000;
    if (M.strikes != null && M.misses >= M.strikes) {
      M.roundOver = true;
      finish(false);
      return;
    }
    renderStatus();
  }

  function doHint() {
    if (!M || !M.sess || M.finished || M.timed) return;
    const h = M.sess.hint();
    if (!h) return;
    sfx('hint');
    if (h.level >= 2 && h.from) { view({ glow: h.from }); }
    else view();
    say(coachOn() ? PZN.hint(h) : null);
    if (M.hearts != null) persistDaily();
    renderBar();
  }

  function doGiveUp() {
    if (!M || !M.sess || M.finished) return;
    M.gaveUp = true;
    if (M.strikes != null) M.roundOver = true;
    const rest = M.sess.giveUp();
    replaySolution(rest.moves);
    finish(false);
  }

  /* عرض بقيّة الحلّ نقلةً نقلة — التعلّم يحصل هنا لا في كلمة «خسرت» */
  function replaySolution(moves) {
    if (!moves || !moves.length) return;
    const s = M.sess;
    let bd = E.clone(s.board), cas = JSON.parse(JSON.stringify(s.cas)),
        ep = s.ep ? [...s.ep] : null;
    let i = 0;
    const step = () => {
      if (!M || i >= moves.length) return;
      const m = PZ.parseUci(moves[i++]);
      if (!m) return;
      const r = E.apply(bd, m.from, m.to, cas, ep, m.promo || 'Q');
      bd = r.bd; cas = r.cas; ep = r.ep;
      M.last = { from: m.from, to: m.to };
      B.paint({ bd, flip: M.puzzle.playerCol === 'b', last: M.last });
      B.slide(m.from, m.to);
      sfx('move');
      setTimeout(step, 520);
    };
    setTimeout(step, 260);
  }

  /* ── نهاية لغز ─────────────────────────────────────────────────── */
  async function finish(solved) {
    if (!M || M.finished) return;
    M.finished = true;
    const s = M.sess;
    const res = {
      solved, mistakes: s.mistakes, hintsUsed: s.hintsUsed,
      gaveUp: !!M.gaveUp, ms: Date.now() - M.t0,
    };
    if (solved) { M.score = (M.score || 0) + 1; sfx(res.mistakes || res.hintsUsed ? 'pzSolved' : 'pzClean'); buzz(res.mistakes || res.hintsUsed ? 18 : [14, 30, 14]); }
    else { sfx('pzMiss'); buzz([50, 40, 50]); }

    say(coachOn() ? (solved ? PZN.solved(M.puzzle, res) : PZN.failed(M.puzzle)) : null);

    let out = null;
    try { out = await PZS.record(M.puzzle, res, { mode: M.mode }); } catch (e) {}
    if (M.mode === 'daily') {
      try { await PZS.setDailyState({ done: true, solved, hints: s.hintsUsed, hearts: M.hearts }); } catch (e) {}
    }
    /* الصعوبة تصعد مع السلسلة: اللاعب الذي يحلّ عشرة على التوالي
       لم يعد في مستوى اللغز الأوّل. */
    if (M.mode === 'streak' && solved) M.climb = (M.climb || 0) + 60;

    /* مواجهة: أبلغ الخصم بنتيجتك الحيّة بعد كل لغز (حلًّا كان أو استسلامًا) */
    if (M.mode === 'battle' && M.battleId) {
      battleSend({ type: 'puzzle:battle-score', battle_id: M.battleId, score: M.score || 0, idx: M.qi });
    }

    renderStatus();
    renderBar();
    if (!M.timed) showResult(res, out);
    else if (M.roundOver) endRound();
    /* في الأوضاع المؤقّتة نتقدّم للّغز التالي: المواجهة تتقدّم حتى بعد
       الاستسلام (سباق)، وباقي المؤقّتة عند الحلّ فقط. */
    else if (M.queue || solved) setTimeout(() => { if (M && M.finished) nextPuzzle(); }, 420);
  }

  function persistDaily() {
    if (!M || M.mode !== 'daily') return;
    try { PZS.setDailyState({ hearts: M.hearts, hints: M.sess ? M.sess.hintsUsed : 0 }); } catch (e) {}
  }

  /* ── ورقة نتيجة اللغز ──────────────────────────────────────────── */
  function showResult(res, out) {
    const ov = $('pz-result'), body = $('pz-result-body');
    if (!ov || !body) return;
    body.textContent = '';

    const solved = res.solved && !res.gaveUp;
    ov.dataset.sfx = solved ? 'pzSolved' : 'pzMiss';

    const head = el('div', 'pzr__head' + (solved ? ' is-win' : ''));
    head.appendChild(el('span', 'pzr__badge', solved
      ? (res.mistakes || res.hintsUsed ? L('حُلّ', 'Solved') : L('حُلّ من أوّل نظرة', 'Solved first look'))
      : (res.gaveUp ? L('عرضتَ الحلّ', 'Solution shown') : L('لم يُحلّ', 'Not solved'))));
    body.appendChild(head);

    /* التصنيف: الرقم والفارق. غير المحتسَب يُقال صراحةً ولا يُخفى. */
    let rankUp = false;
    if (out) {
      const row = el('div', 'pzr__rating');
      const rNode = el('b', 'pzr__r', String(out.rating.r));
      row.appendChild(rNode);
      if (out.rated) {
        const d = out.delta;
        row.appendChild(el('span', 'pzr__d ' + (d >= 0 ? 'is-up' : 'is-down'),
          (d >= 0 ? '+' : '−') + Math.abs(d)));
        /* رتبة جديدة؟ نقارن رتبة التصنيف قبل النقاط بعده. الصعود احتفال،
           لا مجرّد رقم يكبر. */
        try {
          const before = (typeof PZR !== 'undefined') ? PZR.rank(out.rating.r - d) : null;
          if (d > 0 && before && before.name !== out.rank.name) rankUp = true;
        } catch (e) {}
        /* العدّاد يزحف من القديم للجديد بعد فتح النافذة بلحظة */
        setTimeout(() => rollCount(rNode, out.rating.r - d, out.rating.r, 700), 120);
      } else {
        row.appendChild(el('span', 'pzr__d is-flat', L('بلا احتساب', 'Unrated')));
      }
      const rk = el('span', 'pzr__rank' + (rankUp ? ' is-up' : ''), out.rank.name);
      row.appendChild(rk);
      body.appendChild(row);
      if (rankUp) {
        body.appendChild(el('p', 'pzr__rankup',
          L(`رتبة جديدة: ${out.rank.name}`, `New rank: ${out.rank.name}`)));
      }
      if (out.out && out.out.text) body.appendChild(el('p', 'pzr__why', out.out.text));
    }

    /* الأنماط تُكشف الآن — قبل الحلّ كانت ستكون الجواب */
    const labels = PZT.labels(M.puzzle.themes, false);
    if (labels.length) {
      const tags = el('div', 'pzr__tags');
      for (const t of labels.slice(0, 6)) {
        const chip = el('button', 'pzr__tag', t.name);
        chip.type = 'button';
        chip.title = L('تمرَّن على هذا النمط', 'Drill this motif');
        chip.addEventListener('click', () => { close('pz-result'); start('theme', { theme: t.key }); });
        tags.appendChild(chip);
      }
      body.appendChild(tags);
    }

    /* اسأل نور: استفاضة اختيارية عبر النموذج، عند الطلب وحده ولا توقف
       اللعب. تظهر جوابًا مشذّبًا، أو سطرًا محلّيًّا لو الشبكة غابت. */
    if (coachOn() && typeof PZN !== 'undefined' && typeof PZN.explain === 'function') {
      const puzzle = M.puzzle;
      const ask = el('div', 'pzr__ask');
      const ansP = el('p', 'pzr__ans'); ansP.hidden = true;
      const askBtn = btn('pz-btn', L('اسأل نور', 'Ask Nour'), async () => {
        askBtn.disabled = true;
        ansP.hidden = false;
        ansP.textContent = L('نور يفكّر…', 'Nour is thinking…');
        let txt = null;
        try { txt = await PZN.explain(puzzle); } catch (e) {}
        ansP.textContent = txt || L('لا مزيد الآن؛ الفكرة في السطر أعلاه.', 'Nothing more right now; the idea is in the line above.');
        askBtn.disabled = false;
      });
      ask.appendChild(askBtn); ask.appendChild(ansP);
      body.appendChild(ask);
    }

    const act = el('div', 'pzr__actions');
    if (M.mode === 'daily') {
      act.appendChild(btn('pz-btn pz-btn--main', L('تمام', 'Done'),
        () => { close('pz-result'); endRound(); }));
    } else {
      act.appendChild(btn('pz-btn pz-btn--main', L('اللغز التالي', 'Next puzzle'),
        () => { close('pz-result'); nextPuzzle(); }));
      act.appendChild(btn('pz-btn', L('إنهاء', 'Finish'),
        () => { close('pz-result'); endRound(); }));
    }
    body.appendChild(act);

    /* الصعود لرتبة جديدة: النافذة نفسها تحمل فرحة أكبر — نغمة الرقم
       القياسي وقصاصات واهتزاز مميّز بدل صوت الحلّ العادي. */
    if (rankUp) ov.dataset.sfx = 'pzRecord';
    open('pz-result');
    if (rankUp) { try { spawnConfetti(); } catch (e) {} buzz([20, 40, 20, 40, 40]); }
  }

  function open(id) { try { DSOverlay.open(id); } catch (e) { const e2 = $(id); if (e2) e2.classList.add('is-open'); } }
  function close(id) { try { DSOverlay.close(id); } catch (e) { const e2 = $(id); if (e2) e2.classList.remove('is-open'); } }

  /* ── دورة الجولة ───────────────────────────────────────────────── */
  async function nextPuzzle() {
    if (!M) return;
    M.finished = false; M.gaveUp = false; M.sel = null; M.legal = []; M.last = null;
    say(L('نحضّر اللغز…', 'Loading the puzzle…'));

    let p = null;
    try {
      if (M.queue) {
        /* مواجهة: الألغاز من طابور مشترك أُرسل عبر السوكت، لا اختيار محلّي */
        while (M.qi < M.queue.length && !p) { p = PZ.build(M.queue[M.qi++]); }
      } else if (M.mode === 'daily') p = await PZS.daily();
      else {
        const base = (await PZS.rating()).r + (M.climb || 0);
        const prog = M.deadline && M.total
          ? 1 - Math.max(0, M.deadline - Date.now()) / M.total : 0;
        p = await PZS.next({
          rating: base,
          difficulty: MODES[M.mode].diff || 'rated',
          theme: M.theme || null,
          progress: prog,
        });
      }
    } catch (e) {}
    if (!p) {
      /* المواجهة: نفد الطابور قبل الوقت — ننتظر انتهاء المؤقّت لا نُنهي */
      if (M.queue) { say(L('انتهت الألغاز — انتظر الوقت.', 'Out of puzzles — wait for the clock.')); M.finished = true; renderBar(); return; }
      say(L('لم نجد لغزًا مناسبًا الآن.', 'No suitable puzzle right now.'));
      M.finished = true; M.roundOver = true; renderBar();
      return;
    }

    M.puzzle = p;
    M.t0 = Date.now();
    M.sess = PZ.session(p);

    /* نقلة الخصم الافتتاحية تُلعب أمام اللاعب: بدونها يبدأ من وضع
       لا يعرف كيف وصل إليه، وهذا نصف اللغز. */
    B.paint({ bd: p.fenBefore.bd, flip: p.playerCol === 'b' });
    renderStatus(); renderBar();
    busy = true;
    setTimeout(() => {
      if (!M || M.puzzle !== p) return;
      M.last = { from: p.opening.from, to: p.opening.to };
      view();
      B.slide(p.opening.from, p.opening.to);
      sfx('move');
      busy = false;
      say(coachOn() ? PZN.intro(p) : null);
    }, 420);
  }

  function startClock() {
    stopClock();
    if (!M || !M.deadline) return;
    tick = setInterval(() => {
      if (!M || !M.deadline) { stopClock(); return; }
      const left = M.deadline - Date.now();
      const c = $('pz-clock');
      if (c) c.textContent = fmtTime(left);
      if (left <= 0) { M.roundOver = true; endRound(); }
    }, 250);
  }
  function stopClock() { if (tick) { clearInterval(tick); tick = null; } }

  async function start(mode, opts) {
    const o = opts || {};
    /* مواجهة: إعداد مختلف تمامًا — طابور ألغاز مشترك، مؤقّت مُزامَن من
       الخادم، ونتيجة تُبلَّغ للخصم. لا اختيار محلّي للألغاز. */
    if (mode === 'battle') { startBattleRound(o); return; }
    const def = MODES[mode] || MODES.rated;
    stopClock();
    M = {
      mode, theme: o.theme || null,
      score: def.secs || def.strikes ? 0 : null,
      misses: 0,
      strikes: def.strikes != null ? def.strikes : null,
      hearts: def.hearts != null ? def.hearts : null,
      penalty: def.penalty || 0,
      timed: !!def.secs,
      total: def.secs ? def.secs * 1000 : 0,
      deadline: def.secs ? Date.now() + def.secs * 1000 : null,
      climb: 0, finished: false, roundOver: false,
      sel: null, legal: [], last: null, t0: Date.now(),
    };
    B.reset();
    try { PZN.setMode(coachOn() ? 'normal' : 'silent'); } catch (e) {}

    if (mode === 'daily') {
      let st = null;
      try { st = await PZS.dailyState(); } catch (e) {}
      M.hearts = st ? st.hearts : 5;
      if (st && st.done) {
        /* حُلّ اليوم: نعرضه للمراجعة لا للّعب مرّة ثانية */
        Nav.show('s-puzzle');
        await nextPuzzle();
        M.finished = true; M.roundOver = true;
        say(L('لغز اليوم انتهى. غدًا لغز جديد.', 'Today\'s puzzle is done. A new one tomorrow.'));
        renderBar();
        return;
      }
    }

    Nav.show('s-puzzle');
    await nextPuzzle();
    if (M && M.deadline) startClock();
  }

  /* ── نهاية الجولة ──────────────────────────────────────────────── */
  async function endRound() {
    stopClock();
    /* مواجهة: لا نُنهي محليًّا — نبلّغ الخادم بنتيجتنا وننتظر النتيجة
       النهائية (ورقة النتيجة تظهر من handleBattleFrame). نُبقي M عشان
       تحديثات نتيجة الخصم تظلّ تُرسَم. */
    if (M && M.mode === 'battle' && !M._ended) {
      M._ended = true; M.finished = true; M.roundOver = true;
      busy = false;
      try { battleSend({ type: 'puzzle:battle-end', battle_id: M.battleId, score: M.score || 0 }); } catch (e) {}
      say(L('انتهى وقتك — بانتظار الخصم…', 'Time up — waiting for your opponent…'));
      renderBar();
      return;
    }
    const m = M;
    M = null;
    busy = false;
    if (!m) { Nav.show('s-puzzles'); return; }

    const def = MODES[m.mode] || {};
    let record = false;
    if (def.best && m.score != null) {
      try { record = await PZS.setBest(def.best, m.score); } catch (e) {}
    }

    if (def.best && m.score != null) {
      const ov = $('pz-over'), body = $('pz-over-body');
      if (ov && body) {
        body.textContent = '';
        ov.dataset.sfx = record ? 'pzRecord' : 'pzOver';
        body.appendChild(el('div', 'ds-dialog__icon', record ? '★' : '◈'));
        body.appendChild(el('h2', 'ds-dialog__title',
          record ? L('رقم قياسي جديد', 'New personal best') : L('انتهت الجولة', 'Round over')));
        body.appendChild(el('p', 'pzo__score', String(m.score)));
        body.appendChild(el('p', 'ds-dialog__message',
          L('لغزًا في وضع ', 'puzzles in ') + modeName(m.mode)));
        const act = el('div', 'ds-dialog__actions');
        act.appendChild(btn('ds-btn ds-btn--secondary', L('إلى اللوحة', 'To the hub'),
          () => { close('pz-over'); openHub(); }));
        act.appendChild(btn('ds-btn ds-btn--primary', L('جولة أخرى', 'Play again'),
          () => { close('pz-over'); start(m.mode, { theme: m.theme }); }));
        body.appendChild(act);
        open('pz-over');
        if (record) { try { spawnConfetti(); } catch (e) {} }
        return;
      }
    }
    openHub();
  }

  /* الخروج من الشاشة بزرّ الرجوع: لا نافذة نتيجة، فقط إنهاء نظيف */
  function leave() {
    stopClock();
    M = null; busy = false;
    close('pz-result'); close('pz-over');
    openHub();
  }

  /* ══════════════════════════════════════════════════════════════
     اللوحة الرئيسية
     ══════════════════════════════════════════════════════════════ */
  async function openHub() {
    Nav.show('s-puzzles');
    await renderHub();
  }

  function card(cls) { return el('section', 'pzh__card ' + cls); }

  async function renderHub() {
    const host = $('pzh');
    if (!host) return;
    host.textContent = '';

    let st = null, daily = null, themes = null;
    try { st = await PZS.stats(); } catch (e) {}
    try { daily = await PZS.dailyState(); } catch (e) {}
    try { themes = await PZS.themeStats(); } catch (e) {}
    if (!st) {
      host.appendChild(el('p', 'pzh__empty', L('تعذّر فتح قسم الألغاز.', 'Could not open the puzzles section.')));
      return;
    }

    /* ── التصنيف والرتبة ── */
    const top = card('pzh__top');
    const rank = st.rank;
    const num = el('div', 'pzh__num');
    num.appendChild(el('b', 'pzh__rating', String(st.rating)));
    if (st.provisional) num.appendChild(el('span', 'pzh__prov', L('مبدئي', 'Provisional')));
    top.appendChild(num);
    top.appendChild(el('div', 'pzh__rank', rank.name));
    const track = el('div', 'pzh__track');
    const fill = el('span', 'pzh__fill');
    fill.style.width = Math.round(rank.progress * 100) + '%';
    track.appendChild(fill);
    top.appendChild(track);
    top.appendChild(el('div', 'pzh__next', rank.next
      ? L(`التالية: ${rank.next} عند ${rank.nextAt}`, `Next: ${rank.next} at ${rank.nextAt}`)
      : L('أعلى رتبة', 'Top rank')));
    host.appendChild(top);

    /* ── لغز اليوم ── */
    const d = card('pzh__daily');
    d.appendChild(el('span', 'pzh__eyebrow', L('لغز اليوم', 'Daily puzzle')));
    const dstate = !daily ? '' : daily.done
      ? (daily.solved ? L('حُلّ اليوم. أحسنت.', 'Solved today. Well done.')
                      : L('انتهى اليوم بلا حلّ. غدًا فرصة جديدة.', 'Today ended unsolved. Tomorrow is a new one.'))
      : L('لغز واحد للجميع، وخمسة قلوب.', 'One puzzle for everyone, and five hearts.');
    d.appendChild(el('p', 'pzh__dtext', dstate));
    if (st.streak > 0) {
      d.appendChild(el('span', 'pzh__streak',
        L(`سلسلة ${st.streak} من الأيام`, `${st.streak}-day streak`)));
    }
    d.appendChild(btn('pz-btn pz-btn--main',
      (daily && daily.done) ? L('راجع لغز اليوم', 'Review today\'s puzzle') : L('ابدأ', 'Start'),
      () => start('daily')));
    host.appendChild(d);

    /* ── الأوضاع ── */
    const modes = el('div', 'pzh__modes');
    for (const key of ['rated', 'rush', 'streak', 'racer', 'easy', 'hard']) {
      const m = MODES[key];
      const t = el('button', 'pzh__mode');
      t.type = 'button';
      t.appendChild(el('span', 'pzh__mode-title', L(m.ar, m.en)));
      t.appendChild(el('span', 'pzh__mode-desc', L(m.dar, m.den)));
      if (m.best && st.records && st.records[m.best]) {
        t.appendChild(el('span', 'pzh__mode-best',
          L('أفضل نتيجة ' + st.records[m.best], 'Best ' + st.records[m.best])));
      }
      t.addEventListener('click', () => { sfx('btn'); start(key); });
      modes.appendChild(t);
    }
    const tt2 = el('button', 'pzh__mode pzh__mode--wide');
    tt2.type = 'button';
    tt2.appendChild(el('span', 'pzh__mode-title', L(MODES.theme.ar, MODES.theme.en)));
    tt2.appendChild(el('span', 'pzh__mode-desc', L(MODES.theme.dar, MODES.theme.den)));
    tt2.addEventListener('click', () => { sfx('btn'); openThemes(); });
    modes.appendChild(tt2);
    host.appendChild(modes);

    /* ── الأرقام ── */
    const stats = card('pzh__stats');
    const grid = el('div', 'pzh__grid');
    const cell = (n, l) => {
      const c = el('div', 'pzh__cell');
      c.appendChild(el('b', 'pzh__cell-n', String(n)));
      c.appendChild(el('span', 'pzh__cell-l', l));
      return c;
    };
    grid.appendChild(cell(st.solved, L('حُلّت', 'Solved')));
    grid.appendChild(cell(st.accuracy + '%', L('الدقّة', 'Accuracy')));
    grid.appendChild(cell(st.best, L('أعلى تصنيف', 'Peak')));
    grid.appendChild(cell(st.hardest || '—', L('أصعب لغز', 'Hardest')));
    stats.appendChild(grid);
    host.appendChild(stats);

    /* ── القوّة والضعف ──
       لا نعرض اللوحة قبل أن تكون العيّنة كافية: أربع محاولات على نمط
       لا تكفي لنقول للاعب «هذا ضعفك». */
    if (themes && themes.all.length) {
      const tcard = card('pzh__themes');
      tcard.appendChild(el('span', 'pzh__eyebrow', L('نقاط قوّتك وضعفك', 'Your strengths and gaps')));
      const list = el('div', 'pzh__tlist');
      const rows = themes.weak.slice(0, 3).concat(themes.strong.slice(0, 3));
      const seen = new Set();
      for (const r of rows) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        const row = el('button', 'pzh__trow');
        row.type = 'button';
        row.appendChild(el('span', 'pzh__trow-name', r.name));
        const bar = el('span', 'pzh__trow-track');
        const f = el('span', 'pzh__trow-fill' + (r.rate >= 60 ? ' is-good' : ' is-weak'));
        f.style.width = Math.max(4, r.rate) + '%';
        bar.appendChild(f);
        row.appendChild(bar);
        row.appendChild(el('span', 'pzh__trow-rate', r.rate + '%'));
        row.addEventListener('click', () => { sfx('btn'); start('theme', { theme: r.key }); });
        list.appendChild(row);
      }
      tcard.appendChild(list);
      host.appendChild(tcard);
    }

    /* ── نور ── */
    const coach = card('pzh__coach');
    coach.appendChild(el('span', 'pzh__eyebrow', L('نور المدرّب', 'Nour the coach')));
    coach.appendChild(el('p', 'pzh__ctext', coachOn()
      ? L('نور يقول لك سبب الخطأ ويسمّي فكرة اللغز بعد الحلّ.',
          'Nour tells you why a move failed and names the idea after you solve it.')
      : L('نور صامت. لا شيء يظهر أثناء الحلّ.',
          'Nour is silent. Nothing appears while you solve.')));
    coach.appendChild(btn('pz-btn', coachOn() ? L('أسكِت نور', 'Silence Nour') : L('أعِد نورًا', 'Bring Nour back'),
      () => { setCoach(!coachOn()); renderHub(); }));
    host.appendChild(coach);
  }

  /* ── ورقة المواضيع ─────────────────────────────────────────────── */
  async function openThemes() {
    const body = $('pz-themes-body'), title = $('pz-themes-title');
    if (!body) return;
    if (title) title.textContent = L('اختر نمطًا', 'Pick a motif');
    body.textContent = '';

    let counts = {}, mine = {};
    try { counts = (await PZS.themeCounts()) || {}; } catch (e) {}
    try { (await PZS.themeStats(1)).all.forEach(x => { mine[x.key] = x; }); } catch (e) {}

    for (const g of PZT.groups()) {
      if (g.key === 'length' || g.key === 'origin') continue;
      const keys = PZT.inGroup(g.key).filter(k => counts[k] > 0);
      if (!keys.length) continue;
      body.appendChild(el('h4', 'pzt__group', g.title));
      const wrap = el('div', 'pzt__wrap');
      keys.sort((a, b) => counts[b] - counts[a]);
      for (const k of keys) {
        const b = el('button', 'pzt__chip');
        b.type = 'button';
        b.appendChild(el('span', 'pzt__chip-name', PZT.name(k)));
        if (mine[k]) b.appendChild(el('span', 'pzt__chip-rate', mine[k].rate + '%'));
        b.addEventListener('click', () => { sfx('btn'); close('pz-themes'); start('theme', { theme: k }); });
        wrap.appendChild(b);
      }
      body.appendChild(wrap);
    }
    try { DSOverlay.makeSheetDraggable('pz-themes', 'pz-themes-panel'); } catch (e) {}
    open('pz-themes');
  }

  /* ══════════════════════════════════════════════════════════════
     مواجهة الأصدقاء — رش مشترك عبر سوكت الحضور
     ══════════════════════════════════════════════════════════════
     النقل كلّه puzzle:battle-* على السوكت الموثَّق. الحلّ محلّي: لا
     مزامنة نقلة‑بنقلة، فقط النتيجة الحيّة. المُتحدِّي يبني المجموعة من
     أرشيفه ويبعتها، فيحلّ الطرفان نفس الألغاز بلا اعتماد على تطابق
     النسخ. */
  const _bt = { names: {}, pending: null };

  function battleSend(obj) {
    try {
      const A = window.amkhAuth, ws = A && A._presWs;
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    } catch (e) {}
    return false;
  }
  function toast(msg, title, icon) {
    try {
      if (window.amkhUI && typeof amkhUI.notify === 'function') { amkhUI.notify(msg, title || L('الألغاز', 'Puzzles'), icon || '◈'); return; }
    } catch (e) {}
    try { if (window.Modal && Modal.show) Modal.show(msg, title || L('الألغاز', 'Puzzles'), icon || '◈'); } catch (e) {}
  }

  /* يبدأها اللاعب من قائمة الأصدقاء: يدعو صديقًا لمواجهة */
  function inviteBattle(friendId, friendName) {
    if (!friendId) return;
    _bt.names[String(friendId)] = friendName || L('الخصم', 'opponent');
    _bt.pending = { friendId: Number(friendId) };
    if (!battleSend({ type: 'puzzle:battle-invite', friend_id: Number(friendId) })) {
      toast(L('تعذّر إرسال الدعوة — تحقّق من اتصالك.', 'Could not send the invite — check your connection.'));
      return;
    }
    toast(L('أُرسلت دعوة المواجهة. بانتظار ردّ صديقك…', 'Battle invite sent. Waiting for your friend…'),
          L('مواجهة ألغاز', 'Puzzle battle'), '◈');
  }

  /* المعالج المركزيّ لكل رسائل puzzle:battle-* — يُنادى من auth-client */
  async function handleBattleFrame(d) {
    if (!d || typeof d.type !== 'string') return;
    switch (d.type) {
      case 'puzzle:battle-incoming': {
        const from = d.from || {};
        _bt.names[String(d.battle_id)] = from.display_name || from.username || L('صديقك', 'your friend');
        showBattleInvite(d.battle_id, from);
        break;
      }
      case 'puzzle:battle-sent':
        /* التأكيد وصل — الرسالة عُرضت وقت الإرسال */
        break;
      case 'puzzle:battle-accepted': {
        /* أنا المُتحدِّي: أبني المجموعة من أرشيفي وأبعتها */
        try {
          const r = (await PZS.rating()).r;
          const rows = await PZS.battleRows({ rating: r }, 40);
          if (!rows.length) { toast(L('تعذّر تجهيز الألغاز.', 'Could not prepare the puzzles.')); return; }
          battleSend({ type: 'puzzle:battle-setup', battle_id: d.battle_id, puzzles: rows, duration: 180 });
        } catch (e) { toast(L('تعذّر بدء المواجهة.', 'Could not start the battle.')); }
        break;
      }
      case 'puzzle:battle-begin': {
        const name = _bt.names[String(d.battle_id)] || (_bt.pending && _bt.names[String(_bt.pending.friendId)]) || L('الخصم', 'opponent');
        start('battle', { battleId: d.battle_id, role: d.role, puzzles: d.puzzles || [],
          duration: d.duration || 180, startAt: d.start_at || Date.now(), oppName: name });
        break;
      }
      case 'puzzle:battle-opp': {
        if (M && M.mode === 'battle' && M.battleId === d.battle_id) {
          M.oppScore = Number(d.score) || 0;
          renderStatus();
        }
        break;
      }
      case 'puzzle:battle-result': {
        showBattleResult(d);
        break;
      }
      case 'puzzle:battle-declined':
        toast(L('اعتذر صديقك عن المواجهة.', 'Your friend declined the battle.'));
        break;
      case 'puzzle:battle-aborted':
        if (M && M.mode === 'battle') { stopClock(); }
        toast(d.reason === 'opponent-left'
          ? L('انقطع اتصال خصمك — انتهت المواجهة.', 'Your opponent disconnected — battle ended.')
          : L('انتهت المواجهة.', 'The battle ended.'));
        if (M && M.mode === 'battle') { M = null; busy = false; openHub(); }
        break;
      case 'puzzle:battle-error': {
        const why = d.reason === 'offline' ? L('صديقك غير متصل الآن.', 'Your friend is offline right now.')
          : d.reason === 'privacy' ? L('إعدادات صديقك لا تسمح بالدعوة.', 'Your friend’s settings don’t allow invites.')
          : d.reason === 'not-friend' ? L('لا بدّ أن يكون صديقًا أوّلًا.', 'They must be your friend first.')
          : d.reason === 'host-offline' ? L('انسحب المُتحدِّي.', 'The challenger left.')
          : L('تعذّرت المواجهة.', 'The battle failed.');
        toast(why);
        break;
      }
    }
  }

  /* نافذة الدعوة الواردة — بزرَّي رد/رفض وصوتها الخاصّ */
  function showBattleInvite(battleId, from) {
    const ov = $('pz-battle-invite'), body = $('pz-battle-invite-body');
    if (!ov || !body) {
      /* لا نافذة؟ نقبل ضمنيًّا برسالة نصّية بدل ضياع الدعوة */
      return;
    }
    body.textContent = '';
    ov.dataset.sfx = 'invite';
    body.appendChild(el('div', 'ds-dialog__icon', '◈'));
    body.appendChild(el('h2', 'ds-dialog__title', L('مواجهة ألغاز', 'Puzzle battle')));
    const nm = from.display_name || from.username || L('صديقك', 'your friend');
    body.appendChild(el('p', 'ds-dialog__message',
      L(nm + ' يتحدّاك — رش ثلاث دقائق، الأكثر حلًّا يفوز.',
        nm + ' challenges you — a three-minute rush, most solved wins.')));
    const act = el('div', 'ds-dialog__actions');
    act.appendChild(btn('ds-btn ds-btn--secondary', L('رفض', 'Decline'), () => {
      close('pz-battle-invite');
      battleSend({ type: 'puzzle:battle-respond', battle_id: battleId, action: 'decline' });
    }));
    act.appendChild(btn('ds-btn ds-btn--primary', L('قبول', 'Accept'), () => {
      close('pz-battle-invite');
      battleSend({ type: 'puzzle:battle-respond', battle_id: battleId, action: 'accept' });
      say(L('بدء المواجهة…', 'Starting the battle…'));
    }));
    body.appendChild(act);
    open('pz-battle-invite');
  }

  /* يبدأ جولة المواجهة من رسالة begin: طابور مشترك، مؤقّت مُزامَن */
  function startBattleRound(o) {
    stopClock();
    const startAt = Number(o.startAt) || Date.now();
    const dur = (Number(o.duration) || 180) * 1000;
    M = {
      mode: 'battle', battleId: o.battleId, role: o.role,
      queue: Array.isArray(o.puzzles) ? o.puzzles : [], qi: 0,
      oppName: o.oppName || L('الخصم', 'opponent'), oppScore: 0,
      score: 0, misses: 0, strikes: null, hearts: null, penalty: 0,
      timed: true, total: dur, deadline: startAt + dur,
      climb: 0, finished: false, roundOver: false, _ended: false,
      sel: null, legal: [], last: null, t0: Date.now(),
    };
    B.reset();
    /* المدرّب صامت في السباق: الكلام يبطّئ، والجولة نتيجتها رقم يُقارَن */
    try { PZN.setMode('silent'); } catch (e) {}
    Nav.show('s-puzzle');
    nextPuzzle().then(() => { if (M && M.deadline) startClock(); });
  }

  /* ورقة نتيجة المواجهة — تُعاد استعمال نافذة pz-over */
  function showBattleResult(d) {
    stopClock();
    const mine = Number(d.your_score) || 0, opp = Number(d.opp_score) || 0;
    const name = (M && M.oppName) || _bt.names[String(d.battle_id)] || L('الخصم', 'opponent');
    M = null; busy = false;
    const ov = $('pz-over'), body = $('pz-over-body');
    if (!ov || !body) { openHub(); return; }
    body.textContent = '';
    const won = d.outcome === 'win', draw = d.outcome === 'draw';
    ov.dataset.sfx = won ? 'pzRecord' : 'pzOver';
    body.appendChild(el('div', 'ds-dialog__icon', won ? '★' : draw ? '◈' : '◇'));
    body.appendChild(el('h2', 'ds-dialog__title',
      won ? L('فزتَ بالمواجهة', 'You won the battle')
          : draw ? L('تعادل', 'A draw') : L('خسرتَ المواجهة', 'You lost the battle')));
    const sc = el('p', 'pzo__score', mine + ' · ' + opp);
    body.appendChild(sc);
    body.appendChild(el('p', 'ds-dialog__message',
      L('أنت مقابل ' + name, 'You vs ' + name)));
    const act = el('div', 'ds-dialog__actions');
    act.appendChild(btn('ds-btn ds-btn--secondary', L('إلى اللوحة', 'To the hub'),
      () => { close('pz-over'); openHub(); }));
    body.appendChild(act);
    open('pz-over');
    if (won) { try { spawnConfetti(); } catch (e) {} buzz([20, 40, 20, 40, 40]); }
  }

  return {
    openHub, renderHub, start, leave, endRound, openThemes,
    coachOn, setCoach,
    inviteBattle, handleBattleFrame,
    MODES,
    /* للتشخيص: الحالة الجارية */
    get current() { return M; },
  };
})();

if (typeof window !== 'undefined') window.PZU = PZU;
