/* ══════════════════════════════════════════════════════════════════
   PUZZLES — نواة مود الألغاز
   ══════════════════════════════════════════════════════════════════
   الطبقة دي مالهاش أي علاقة بالـDOM: بيانات ومنطق بس. الشاشة والأنميشن
   في puzzles-ui.js، عشان نقدر نختبر المنطق من غير متصفّح.

   قاعدة البيانات مبنية على أرشيف lichess المفتوح (CC0). كل لغز صفّ فيه:
     PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays,
     Themes, GameUrl, OpeningTags
   والمصيدة الكبرى اللي لازم تتكتب هنا عشان محدش يقع فيها تاني:

     ★ الـFEN هو الوضع «قبل» نقلة الخصم، مش وضع بداية اللغز.
       يعني Moves[0] دي نقلة الخصم اللي بتتلعب تلقائيًا قدّام اللاعب،
       وحلّ اللاعب بيبدأ من Moves[1]. ولون اللاعب هو عكس الدور المكتوب
       في الـFEN. لو اتعاملنا مع الـFEN كوضع البداية، كل لغز هيبان
       مقلوب والحلّ هيبقى غلط.

   النقلات بصيغة UCI (e2e4, e7e8q) مش SAN.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZ = (() => {

  /* ── تحويل بين UCI ومربّعات المصفوفة ─────────────────────────────
     الرقعة عندنا bd[r][c] وr=0 هو الصفّ الثامن (فوق). فمربّع a8 = [0,0]
     وa1 = [7,0]. نفس اتفاق E وR بالظبط. */
  const FILES = 'abcdefgh';

  function sqToRC(sq) {
    const c = FILES.indexOf(sq[0]);
    const r = 8 - parseInt(sq[1], 10);
    return (c < 0 || r < 0 || r > 7) ? null : [r, c];
  }

  function rcToSq(r, c) { return FILES[c] + (8 - r); }

  /* uci → {from:[r,c], to:[r,c], promo:'Q'|null} */
  function parseUci(uci) {
    if (typeof uci !== 'string' || uci.length < 4) return null;
    const from = sqToRC(uci.slice(0, 2));
    const to = sqToRC(uci.slice(2, 4));
    if (!from || !to) return null;
    const p = uci.length > 4 ? uci[4].toUpperCase() : null;
    return { from, to, promo: (p && 'QRBN'.includes(p)) ? p : null };
  }

  function toUci(from, to, promo) {
    return rcToSq(from[0], from[1]) + rcToSq(to[0], to[1]) +
           (promo ? String(promo).toLowerCase() : '');
  }

  /* ── قارئ FEN ────────────────────────────────────────────────────
     عندنا bdToFen للكتابة (index.html) ومكانش ليها عكس، لأن التطبيق
     كان دايمًا بيبدأ من INIT_BD. الألغاز بتبدأ من أي وضع، فده أول
     حاجة ناقصة. بيرجّع نفس شكل الحالة اللي E بيفهمها:
       {bd, turn, cas, ep, halfmove, fullmove}
     وبيرجّع null لو الـFEN باظ — مانرميش استثناء عشان صفّ واحد تالف
     في قاعدة البيانات مايوقّفش القسم كله. */
  const FEN_PIECE = {
    p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK',
    P: 'wP', N: 'wN', B: 'wB', R: 'wR', Q: 'wQ', K: 'wK',
  };

  function fenToState(fen) {
    if (typeof fen !== 'string') return null;
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const rows = parts[0].split('/');
    if (rows.length !== 8) return null;

    const bd = [];
    for (const row of rows) {
      const line = [];
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          for (let i = 0; i < +ch; i++) line.push(null);
        } else if (FEN_PIECE[ch]) {
          line.push(FEN_PIECE[ch]);
        } else {
          return null;
        }
      }
      if (line.length !== 8) return null;
      bd.push(line);
    }

    const turn = parts[1] === 'b' ? 'b' : 'w';

    /* حقوق التبييت بنفس شكل S.cas: {w:{K,Q}, b:{K,Q}} */
    const rights = parts[2] || '-';
    const cas = {
      w: { K: rights.includes('K'), Q: rights.includes('Q') },
      b: { K: rights.includes('k'), Q: rights.includes('q') },
    };

    /* ep عندنا [r,c] لمربّع العبور، مش نصّ */
    const epStr = parts[3] || '-';
    const ep = (epStr && epStr !== '-') ? sqToRC(epStr) : null;

    return {
      bd, turn, cas, ep,
      halfmove: parseInt(parts[4], 10) || 0,
      fullmove: parseInt(parts[5], 10) || 1,
    };
  }

  /* ── بناء لغز جاهز للّعب من صفّ القاعدة ──────────────────────────
     بياخد الصفّ الخام وبيرجّع كائن اللغز بعد ما يحلّ مصيدة الـFEN:
       start      = الوضع بعد نقلة الخصم الأولى (ده اللي اللاعب بيشوفه)
       opening    = نقلة الخصم الأولى (بتتلعب بأنميشن قبل ما الدور يجي له)
       solution   = نقلات الحلّ بالتناوب: اللاعب، الخصم، اللاعب…
       playerCol  = لون اللاعب (عكس دور الـFEN)
     بيرجّع null لو الصفّ تالف. */
  function build(row) {
    if (!row || !row.fen || !row.moves) return null;

    const st = fenToState(row.fen);
    if (!st) return null;

    const moves = Array.isArray(row.moves) ? row.moves : String(row.moves).trim().split(/\s+/);
    if (moves.length < 2) return null;   /* لازم نقلة خصم + نقلة حلّ واحدة على الأقل */

    /* ★ النقلة الأولى للخصم — بنلعبها إحنا مش اللاعب */
    const first = parseUci(moves[0]);
    if (!first) return null;

    const E = _engine();
    if (!E) return null;

    const res = E.apply(st.bd, first.from, first.to, st.cas, st.ep, first.promo || 'Q');

    return {
      id: String(row.id || row.PuzzleId || ''),
      rating: parseInt(row.rating, 10) || 1500,
      rd: parseInt(row.rd, 10) || 75,
      popularity: parseInt(row.popularity, 10) || 0,
      plays: parseInt(row.plays, 10) || 0,
      themes: _themeList(row.themes),
      openingTags: _themeList(row.openingTags),
      gameUrl: row.gameUrl || '',

      /* الوضع اللي يشوفه اللاعب أول ما يفتح اللغز */
      start: { bd: res.bd, turn: st.turn === 'w' ? 'b' : 'w', cas: res.cas, ep: res.ep },
      /* نقلة الخصم الافتتاحية — تتلعب بأنميشن من وضع الـFEN الأصلي */
      fenBefore: st,
      opening: { ...first, uci: moves[0] },
      /* الحلّ: فهرس زوجي = نقلة اللاعب، فردي = ردّ الخصم */
      solution: moves.slice(1),
      playerCol: st.turn === 'w' ? 'b' : 'w',
    };
  }

  function _themeList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v).trim().split(/\s+/).filter(Boolean);
  }

  /* E معرّف في index.html كـconst في نطاق الوحدة، مش على window.
     بنقراه بمرونة عشان الملف ده يشتغل في الاختبار من غير متصفّح كمان. */
  function _engine() {
    if (typeof E !== 'undefined' && E && E.apply) return E;
    if (typeof window !== 'undefined' && window.E && window.E.apply) return window.E;
    return null;
  }

  /* ── جلسة لغز ─────────────────────────────────────────────────────
     بتمسك الوضع الحالي وبتحكم على كل نقلة يلعبها اللاعب. مالهاش DOM.
     الاستعمال:
       const s = PZ.session(puzzle);
       s.tryMove(from, to, promo)  →  {ok, status, ...}
     الحالات اللي بترجع في status:
       'wrong'    نقلة غلط — اللغز مايخلصش، اللاعب يقدر يعيد
       'correct'  نقلة صح والباقي لسه
       'solved'   خلص اللغز كله
     ولو صح والباقي لسه، بيرجّع معاها reply = ردّ الخصم عشان الشاشة
     تلعبه بأنميشن، وبعدين تنادي applyReply().

     ★ قاعدة الحلول البديلة: lichess بيقبل أي نقلة توصل لنفس النتيجة
       في حالتين بس — (١) مات في نقلة واحدة بأي طريقة، (٢) لو فضلت
       نقلة واحدة والباقي مات. بدون ده، لاعب يلاقي مات أسرع ويتقاله
       «غلط» وده أسوأ إحساس ممكن في قسم ألغاز. */
  function session(puzzle) {
    const E = _engine();
    if (!puzzle || !E) return null;

    let bd = E.clone(puzzle.start.bd);
    let turn = puzzle.start.turn;
    let cas = JSON.parse(JSON.stringify(puzzle.start.cas));
    let ep = puzzle.start.ep ? [...puzzle.start.ep] : null;
    let idx = 0;              /* فهرسنا في مصفوفة solution */
    let wrongCount = 0;       /* عدد الأخطاء — يحدّد التصنيف والنجوم */
    let hintLevel = 0;        /* 0 بلا تلميح، 1 لمحة، 2 قطعة، 3 نقلة */
    let done = false;

    /* هل الوضع الحالي مات للخصم؟ */
    function isMateFor(board, colour, castling, enp) {
      return E.inChk(board, colour) &&
             E.allLegal(board, colour, castling, enp).length === 0;
    }

    /* النقلة المتوقّعة دلوقتي */
    function expected() {
      return idx < puzzle.solution.length ? parseUci(puzzle.solution[idx]) : null;
    }

    function _applyMove(m, promo) {
      const res = E.apply(bd, m.from, m.to, cas, ep, promo || m.promo || 'Q');
      bd = res.bd; cas = res.cas; ep = res.ep;
      turn = turn === 'w' ? 'b' : 'w';
      return res;
    }

    return {
      get board() { return bd; },
      get turn() { return turn; },
      get cas() { return cas; },
      get ep() { return ep; },
      get index() { return idx; },
      get mistakes() { return wrongCount; },
      get hintsUsed() { return hintLevel; },
      get finished() { return done; },
      get puzzle() { return puzzle; },
      /* كام نقلة لاعب فاضلة — للعدّاد على الشاشة */
      get remaining() { return Math.ceil((puzzle.solution.length - idx) / 2); },

      legalFrom(r, c) { return E.legal(bd, r, c, cas, ep); },

      tryMove(from, to, promo) {
        if (done) return { ok: false, status: 'finished' };

        const exp = expected();
        if (!exp) return { ok: false, status: 'finished' };

        const played = toUci(from, to, promo);
        const wanted = toUci(exp.from, exp.to, exp.promo);
        let accepted = (played === wanted);

        /* حلّ بديل: النقلة مش المكتوبة بس بتعمل مات فورًا، واللغز أصلًا
           كان هيخلص بمات. نقبلها — النتيجة واحدة. */
        if (!accepted) {
          const legal = E.legal(bd, from[0], from[1], cas, ep);
          const isLegalHere = legal.some(([r, c]) => r === to[0] && c === to[1]);
          if (isLegalHere) {
            const trial = E.apply(bd, from, to, cas, ep, promo || 'Q');
            if (isMateFor(trial.bd, turn === 'w' ? 'b' : 'w', trial.cas, trial.ep)) {
              accepted = true;
            }
          }
        }

        if (!accepted) {
          wrongCount++;
          return { ok: false, status: 'wrong', expectedUci: wanted, playedUci: played };
        }

        _applyMove({ from, to, promo: promo || exp.promo }, promo || exp.promo);
        idx++;

        /* خلص الحلّ؟ أو عملنا مات بحلّ بديل قبل ما نكمّل السطر؟ */
        const mated = isMateFor(bd, turn, cas, ep);
        if (idx >= puzzle.solution.length || mated) {
          done = true;
          return { ok: true, status: 'solved', mate: mated, mistakes: wrongCount, hintsUsed: hintLevel };
        }

        /* لسه فيه ردّ للخصم — الشاشة تلعبه بأنميشن وبعدين تنادي applyReply */
        const rep = expected();
        return {
          ok: true, status: 'correct',
          reply: rep ? { from: rep.from, to: rep.to, promo: rep.promo, uci: puzzle.solution[idx] } : null,
        };
      },

      /* الشاشة بتنادي دي بعد ما تخلص أنميشن ردّ الخصم */
      applyReply() {
        if (done) return null;
        const rep = expected();
        if (!rep) return null;
        const res = _applyMove(rep, rep.promo);
        idx++;
        if (idx >= puzzle.solution.length) done = true;
        return res;
      },

      /* التلميح المتدرّج — لا يكشف الحلّ إلا في الدرجة الثالثة.
         كل درجة بتلغي نقاط التصنيف (زي chess.com: التلميح محاولة فاشلة). */
      hint() {
        const exp = expected();
        if (!exp) return null;
        hintLevel = Math.min(3, hintLevel + 1);
        if (hintLevel === 1) {
          /* لمحة: ناحية الرقعة بس */
          const side = exp.from[1] <= 3 ? 'queenside' : 'kingside';
          return { level: 1, side, piece: bd[exp.from[0]][exp.from[1]] };
        }
        if (hintLevel === 2) return { level: 2, from: exp.from, piece: bd[exp.from[0]][exp.from[1]] };
        return { level: 3, from: exp.from, to: exp.to, promo: exp.promo };
      },

      /* عرض الحلّ كامل — اللاعب استسلم. اللغز بيتحسب فاشل. */
      giveUp() {
        done = true;
        return { moves: puzzle.solution.slice(idx), mistakes: wrongCount };
      },
    };
  }

  return { sqToRC, rcToSq, parseUci, toUci, fenToState, build, session, _engine };
})();

if (typeof window !== 'undefined') window.PZ = PZ;
if (typeof module !== 'undefined' && module.exports) module.exports = PZ;
