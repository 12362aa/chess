/* ══════════════════════════════════════════════════════════════════
   PUZZLES — نور المدرّب
   ══════════════════════════════════════════════════════════════════
   نور هنا ليس صندوق محادثة. في مود الألغاز يتكلّم في أربع لحظات فقط،
   وسطرًا واحدًا في كل مرّة:

     ١) قبل اللغز   — يصف الهدف بلا حرق (المات في نقلتين، ميزة حاسمة…)
     ٢) عند الخطأ   — سببًا محدَّدًا من المحرّك لا جملة عامّة
     ٣) عند التلميح — فكرة لا حلًّا
     ٤) بعد الحلّ   — يسمّي النمط التكتيكي باسمه

   ★ «سببًا من المحرّك» هو الفرق كلّه. «حاول مرّة أخرى» لا تعلّم أحدًا.
     أمّا «بعد هذه النقلة يأخذ الخصم الرخّ» فتُري اللاعب ما لم يره.
     التحليل هنا محلّي بالكامل بالمحرّك E: نلعب نقلة اللاعب على نسخة من
     الرقعة وننظر في ردود الخصم — مات فوري؟ قطعة تسقط؟ أخذ رابح؟

   ★ وضع الصمت: بعض اللاعبين لا يريدون مدرّبًا. setMode('silent') يُسكته
     تمامًا فلا تظهر أسطره أصلًا — لا أن تظهر فارغة.

   ★ نور ولد، فكل خطاب له وعنه بصيغة المذكّر.

   ★ اللغتان: كل سطر مكتوب بالعربية والإنجليزية هنا مباشرةً عبر LP، ولا
     يمرّ على قاموس i18n-en أصلًا — لأنّ الجملة تُبنى وقت التشغيل بقيَم
     متغيّرة (اسم القطعة، المربّع)، والقاموس لا يعرف الجمل المُركَّبة.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZN = (() => {

  function L(ar, en) { return (typeof LP === 'function') ? LP(ar, en) : ar; }

  const PIECE = {
    P: ['البيدق', 'the pawn'], N: ['الحصان', 'the knight'],
    B: ['الفيل', 'the bishop'], R: ['الرخّ', 'the rook'],
    Q: ['الوزير', 'the queen'], K: ['الملك', 'the king'],
  };
  const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };

  function pieceName(code) {
    const k = code ? code[1] : null;
    return PIECE[k] ? L(PIECE[k][0], PIECE[k][1]) : L('القطعة', 'the piece');
  }

  function engine() {
    if (typeof E !== 'undefined' && E && E.apply) return E;
    if (typeof window !== 'undefined' && window.E && window.E.apply) return window.E;
    return null;
  }

  let mode = 'normal';         /* normal | silent */
  const last = {};             /* آخر صيغة استُعملت لكل لحظة — لا نكرّرها */

  /* اختيار متنوّع بلا تكرار مباشر: العشوائية وحدها تعيد نفس السطر
     مرّتين متتاليتين كثيرًا، وهو أسرع ما يكشف أنّ المدرّب آلة. */
  function vary(slot, options) {
    if (options.length === 1) return options[0];
    let i = Math.floor(Math.random() * options.length);
    if (i === last[slot]) i = (i + 1) % options.length;
    last[slot] = i;
    return options[i];
  }

  /* أفضل أخذٍ للخصم بعد نقلة اللاعب، مقيسًا بالصافي لا بالطمع.
     ★ لا يصحّ أن نسأل «هل المربّع محميّ؟» بتوليد نقلاتنا على الرقعة
       الحالية: المربّع عليه قطعتنا، فلا نقلة لنا تنتهي إليه، فتخرج كل
       قطعة «بلا حماية» وتكذب كل الرسائل. الحماية تُقاس بعد الأخذ:
       نلعب أخذ الخصم ثمّ نسأل هل نستطيع الاسترداد. */
  function bestCapture(E0, bd, cas, ep, mover, replies) {
    let best = null;
    for (const m of replies) {
      const victim = bd[m.to[0]][m.to[1]];
      if (!victim || victim[0] !== mover) continue;
      const attacker = bd[m.from[0]][m.from[1]];
      let r2;
      try { r2 = E0.apply(bd, m.from, m.to, cas, ep, 'Q'); } catch (e) { continue; }
      const ours = E0.allLegal(r2.bd, mover, r2.cas, r2.ep) || [];
      const recap = ours.some(x => x.to[0] === m.to[0] && x.to[1] === m.to[1]);
      const gain = VALUE[victim[1]] || 0;
      const net = recap ? gain - (VALUE[attacker[1]] || 0) : gain;
      if (!best || net > best.net) best = { net, victim, at: m.to, recap };
    }
    return best;
  }

  /* ── تحليل الخطأ بالمحرّك ────────────────────────────────────────
     بيرجّع {key, text} أو null. الترتيب من الأخطر للأهون: المات أوّلًا
     لأنّه ينهي كل شيء، ثمّ سقوط القطعة التي حرّكها اللاعب للتوّ (أشيع
     خطأ)، ثمّ أي خسارة مادّية أخرى. */
  function analyze(board, cas, ep, mover, from, to, promo) {
    const E0 = engine();
    if (!E0 || !board || !from || !to) return null;

    /* نقلة غير قانونية أصلًا: لا كلام. الشاشة لا تسمح بها، والتحليل
       على وضع مستحيل يعطي جملة واثقة وخاطئة — وهي أسوأ من الصمت. */
    let legal;
    try { legal = E0.legal(board, from[0], from[1], cas, ep) || []; }
    catch (e) { return null; }
    if (!legal.some(([r, c]) => r === to[0] && c === to[1])) return null;

    let res;
    try { res = E0.apply(board, from, to, cas, ep, promo || 'Q'); }
    catch (e) { return null; }

    const foe = mover === 'w' ? 'b' : 'w';
    const bd = res.bd;
    const moved = bd[to[0]][to[1]];
    const replies = E0.allLegal(bd, foe, res.cas, res.ep) || [];

    /* (١) مات في نقلة واحدة للخصم */
    for (const m of replies) {
      let r2;
      try { r2 = E0.apply(bd, m.from, m.to, res.cas, res.ep, 'Q'); } catch (e) { continue; }
      if (!E0.inChk(r2.bd, mover)) continue;
      const ours = E0.allLegal(r2.bd, mover, r2.cas, r2.ep) || [];
      if (ours.length === 0) {
        return {
          key: 'allowsMate',
          text: L('بعد هذه النقلة يأتي كش مات في الحال. انظر إلى ملكك أوّلًا.',
                  'This move allows checkmate at once. Look at your own king first.'),
        };
      }
    }

    /* الميزان: ما كسبته النقلة نفسها يُخصم ممّا يأخذه الخصم. بدون هذا
       الخصم يصير كل تبادل متكافئ «خطأً»، وأخذ الوزير بحصان يُستردّ
       يُروى للاعب كأنّه خسارة. */
    const won = res.cap ? (VALUE[res.cap[1]] || 0) : 0;
    const best = bestCapture(E0, bd, res.cas, res.ep, mover, replies);
    const netLoss = best ? best.net - won : 0;

    /* (٢) القطعة التي حرّكتها للتوّ هي الضحية — أشيع خطأ وأوضح درس */
    if (best && netLoss >= 1 && best.at[0] === to[0] && best.at[1] === to[1] && moved) {
      const nm = pieceName(moved);
      return {
        key: 'hangs',
        text: best.recap
          ? L(`${nm} الذي حرّكته يُؤخذ، والاسترداد لا يعوّض الفارق.`,
              `${nm} you just moved gets taken, and the recapture does not cover the difference.`)
          : L(`${nm} الذي حرّكته يسقط في النقلة التالية بلا مقابل.`,
              `${nm} you just moved drops next move for nothing.`),
      };
    }

    /* (٣) أخذ رابح للخصم في مكان آخر */
    if (best && netLoss >= 2) {
      const nm = pieceName(best.victim);
      const sq = (typeof PZ !== 'undefined') ? PZ.rcToSq(best.at[0], best.at[1]) : '';
      return {
        key: 'loses',
        text: L(`الخصم يردّ بأخذ ${nm} على ${sq}. النقلة تركت شيئًا بلا حماية.`,
                `The opponent replies by taking ${nm} on ${sq}. The move left something unguarded.`),
      };
    }

    /* (٤) كش بلا مضمون */
    if (E0.inChk(bd, foe)) {
      return {
        key: 'idleCheck',
        text: L('الكش ليس هدفًا في ذاته؛ الملك يفرّ ويبقى موقفك كما هو.',
                'A check is not a goal in itself; the king steps away and nothing changed.'),
      };
    }

    /* (٥) الخصم يملك ردودًا كثيرة — أي أنّ النقلة لم تُجبره على شيء */
    if (replies.length > 6) {
      return {
        key: 'noThreat',
        text: L('نقلة هادئة لا تُجبر الخصم على شيء، واللغز يحتاج نقلة لا جواب لها.',
                'A quiet move that forces nothing, and this puzzle needs a move with no answer.'),
      };
    }
    return null;
  }

  return {
    setMode(m) { mode = (m === 'silent') ? 'silent' : 'normal'; },
    get mode() { return mode; },
    get silent() { return mode === 'silent'; },
    pieceName,
    analyze,

    /* (١) قبل اللغز — الهدف بلا حرق */
    intro(puzzle) {
      if (mode === 'silent' || !puzzle) return null;
      const goal = (typeof PZT !== 'undefined') ? PZT.goalLine(puzzle.themes) : '';
      const side = puzzle.playerCol === 'w'
        ? L('أنت تلعب بالأبيض.', 'You are playing White.')
        : L('أنت تلعب بالأسود.', 'You are playing Black.');
      const open = vary('intro', [
        L('انظر إلى الموقف كلّه قبل أن تلمس قطعة.', 'Look at the whole position before you touch a piece.'),
        L('هنا نقلة واحدة أفضل من كل ما عداها.', 'One move here is better than every other.'),
        L('خذ وقتك؛ السرعة ليست مطلوبة.', 'Take your time; speed is not the point.'),
        L('ابدأ من ملك الخصم: ما الذي يحرسه؟', 'Start from the enemy king: what is guarding it?'),
      ]);
      return side + ' ' + goal + ' ' + open;
    },

    /* (٢) عند الخطأ — سبب محدَّد، وإلّا فسطر لا يدّعي معرفة */
    wrong(ctx) {
      if (mode === 'silent') return null;
      const c = ctx || {};
      const found = analyze(c.board, c.cas, c.ep, c.turn, c.from, c.to, c.promo);
      if (found) return found.text;
      return vary('wrong', [
        L('ليست هي. ابحث عن نقلة تُجبر الخصم على ردّ واحد.',
          'Not this one. Look for a move that leaves the opponent one answer.'),
        L('ليست هي. ما القطعة التي لا يستطيع الخصم حمايتها؟',
          'Not this one. Which piece can the opponent not defend?'),
      ]);
    },

    /* (٣) عند التلميح — فكرة لا حلّ، متدرّجة ومتنوّعة الصياغة. h من
       PZ.session().hint(). التنويع يمنع إحساس «جملة ثابتة في الكود». */
    hint(h) {
      if (mode === 'silent' || !h) return null;
      if (h.level === 1) {
        const where = h.side === 'kingside'
          ? L('جناح الملك', 'the kingside') : L('جناح الوزير', 'the queenside');
        return vary('hint1', [
          L(`القطعة الحاسمة عند ${where}. ابدأ بحثك هناك.`, `The key piece is on ${where}. Start your search there.`),
          L(`مفتاح الموقف في ${where}.`, `The key to this position is on ${where}.`),
          L(`انظر إلى ${where}؛ من هناك تبدأ النقلة.`, `Look at ${where}; that is where the move begins.`),
        ]);
      }
      const sq = (typeof PZ !== 'undefined') ? PZ.rcToSq(h.from[0], h.from[1]) : '';
      if (h.level === 2) {
        const nm = pieceName(h.piece);
        return vary('hint2', [
          L(`إنه ${nm} على ${sq}. إلى أين يذهب؟`, `It is ${nm} on ${sq}. Where does it go?`),
          L(`حرّك ${nm} من ${sq} — فكّر في أقوى وجهة له.`, `Move ${nm} from ${sq} — think of its strongest square.`),
        ]);
      }
      const a = sq;
      const b = (typeof PZ !== 'undefined') ? PZ.rcToSq(h.to[0], h.to[1]) : '';
      return vary('hint3', [
        L(`النقلة: من ${a} إلى ${b}. العبها وتأمّل لماذا تنجح.`, `The move: ${a} to ${b}. Play it and see why it works.`),
        L(`من ${a} إلى ${b} — هذه هي.`, `From ${a} to ${b} — this is it.`),
      ]);
    },

    /* (٤) بعد الحلّ — تسمية الفكرة. res: {mistakes, hintsUsed, ms} */
    solved(puzzle, res) {
      if (mode === 'silent') return null;
      const r = res || {};
      const idea = (typeof PZT !== 'undefined') ? PZT.idea(puzzle && puzzle.themes) : null;
      let head;
      if (r.hintsUsed) {
        head = vary('solvedHint', [
          L('حُلّ. جرّب اللغز القادم بلا مساعد.', 'Solved. Try the next one without a hint.'),
          L('وصلتَ إليه. المرّة القادمة ابحث أطول قليلًا قبل التلميح.',
            'You got there. Next time search a little longer before the hint.'),
        ]);
      } else if (r.mistakes) {
        head = vary('solvedMiss', [
          L('حُلّ بعد محاولة. الفكرة صارت واضحة الآن.',
            'Solved after a try. The idea is clear now.'),
          L('وصلتَ إليه. الخطأ الأوّل هو الذي علّمك.',
            'You got there. The first miss is what taught you.'),
        ]);
      } else {
        head = vary('solvedClean', [
          L('من أوّل نظرة. ممتاز.', 'First look. Excellent.'),
          L('نظيفة تمامًا.', 'Perfectly clean.'),
          L('هذه نقلة لاعب يرى.', 'That is the move of a player who sees.'),
        ]);
      }
      if (!idea) return head;
      return head + ' ' + L(`الفكرة: ${idea.name} — ${idea.idea}`,
                            `The idea: ${idea.name} — ${idea.idea}`);
    },

    /* بعد الفشل أو الاستسلام — نفس لحظة التعلّم، بلا تأنيب */
    failed(puzzle) {
      if (mode === 'silent') return null;
      const idea = (typeof PZT !== 'undefined') ? PZT.idea(puzzle && puzzle.themes) : null;
      const head = vary('failed', [
        L('انظر إلى الحلّ مرّة، ثمّ أعده بنفسك.', 'Look at the solution once, then replay it yourself.'),
        L('لا بأس. هذا النمط تعرفه المرّة القادمة.', 'No harm. You will know this pattern next time.'),
      ]);
      if (!idea) return head;
      return head + ' ' + L(`الفكرة: ${idea.name} — ${idea.idea}`,
                            `The idea: ${idea.name} — ${idea.idea}`);
    },

    /* استفاضة اختيارية عبر نموذج نور — عند الطلب وحده ولا توقف اللعب.
       لو الشبكة غائبة أو الردّ متأخّر، السطر المحلّي هو الجواب وكفى. */
    async explain(puzzle, question) {
      if (mode === 'silent') return null;
      if (typeof groqChat !== 'function') return null;
      const idea = (typeof PZT !== 'undefined') ? PZT.idea(puzzle && puzzle.themes) : null;
      const en = (typeof window !== 'undefined' && window.I18N && window.I18N.lang === 'en');
      const sys = en
        ? 'You are Nour, a young chess coach. Answer in English, at most three short sentences, plain and concrete. No emoji.'
        : 'أنت نور، مدرّب شطرنج صغير. أجب بالعربية الفصحى في ثلاث جمل قصيرة على الأكثر، واضحة ومحدّدة. بلا رموز تعبيرية.';
      const ctx = (en ? 'Puzzle idea: ' : 'فكرة اللغز: ') + (idea ? idea.name + ' — ' + idea.idea : '—');
      try {
        const json = await groqChat({
          model: (typeof GROQ_MODEL !== 'undefined') ? GROQ_MODEL : 'allam-2-7b',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: ctx + '\n' + (question || (en ? 'Explain the idea.' : 'اشرح الفكرة.')) },
          ],
          max_tokens: 180, temperature: 0.5,
        });
        const txt = json && json.choices && json.choices[0] &&
                    json.choices[0].message && json.choices[0].message.content;
        return (typeof txt === 'string' && txt.trim()) ? txt.trim() : null;
      } catch (e) { return null; }
    },
  };
})();

if (typeof window !== 'undefined') window.PZN = PZN;
if (typeof module !== 'undefined' && module.exports) module.exports = PZN;
