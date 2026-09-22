/* ═══════════════════════════════════════════════════════════════════
   levels-ui.js — «دَرْب نور»: قسم المراحل الاثنتي عشرة، مبنيٌّ من جديد.

   الطلب: ترقيم لاتينيّ (I … XII) بدل «المرحلة ١»، وحذف صور المراحل
   الاثنتي عشرة (Nour_*.png) واستبدالها بشاراتٍ **مرسومة** بالكامل،
   وإبقاء صورة نور الرمزيّة (nour.png) وحدها، وتهنئةٌ فخمة عند إتمام
   طَورٍ أو إتمام الرحلة كلّها، ولكل نافذةٍ صوتها، وبلا أيّ إيموجي.

   المعمار — نفس نهج PZH: وحدةٌ واحدة تبني كامل الشاشة في الذاكرة ثم
   تُركّبها دفعةً واحدة، والنصّ كلّه عبر L()/T() فالحاوية `data-no-i18n`
   (مسح الـDOM لا يلمسها، وإلّا ترجم الشارات مرّتين).

   قاعدتا الرسم المتوارثتان من لوحة الألغاز، ولا تُكسران:
   1) كل حركةٍ transform/opacity فقط — درس الومضة #140.
   2) داخل الـSVG: إزاحةٌ فقط (لا scale/rotate عبر CSS؛ تحتاج
      transform-box:fill-box ودعمه في WebView القديم متفاوت). الدوران
      الثابت الوحيد المسموح هو سمة `transform` الأصليّة على العنصر.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const NLV = (function () {

    /* ── أدوات صغيرة ───────────────────────────────────────────── */
    const L = (ar, en) => (typeof LP === 'function' ? LP(ar, en) : ar);
    const X = (ar) => (typeof T === 'function' ? T(ar) : ar);
    const q = (s, r) => (r || document).querySelector(s);
    const el = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const sfx = (name) => { try { if (window.SFX && SFX[name]) SFX[name](); } catch (e) { } };
    const n1 = (v) => Math.round(v * 10) / 10;

    /* ── الترقيم اللاتينيّ ──────────────────────────────────────
       اثنتا عشرة مرحلة، فجدولٌ ثابت أوضح وأسرع من مولّدٍ عامّ. */
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

    /* ── الأطوار الأربعة ────────────────────────────────────────
       المراحل تتجمّع في أربعة أطوار، لكلٍّ معدنه ولونه: نحاسٌ ثم
       فضّةٌ ثم ذهبٌ ثم تاج. الشارة تتبدّل معدنها مع الطَّور فيقرأ
       اللاعب تقدّمه من لمحةٍ واحدة بلا قراءة رقم. */
    const TIERS = [
      {
        key: 'dawn', ar: 'طَورُ البداية', en: 'The Opening', from: 0, to: 3,
        m0: '#d9a06a', m1: '#a1653a', m2: '#66391c', line: '#e8b782', ink: '#ffe9d2',
        glow: 'rgba(217,160,106,.45)',
      },
      {
        key: 'climb', ar: 'طَورُ الصعود', en: 'The Ascent', from: 4, to: 7,
        m0: '#b8c4da', m1: '#78849e', m2: '#424c63', line: '#cfd9ec', ink: '#f4f8ff',
        glow: 'rgba(184,196,218,.42)',
      },
      {
        key: 'mastery', ar: 'طَورُ الإتقان', en: 'Mastery', from: 8, to: 9,
        m0: '#f2cf82', m1: '#bd9441', m2: '#7c5f1f', line: '#f0d68a', ink: '#fff6d8',
        glow: 'rgba(242,207,130,.48)',
      },
      {
        key: 'crown', ar: 'طَورُ التاج', en: 'The Crown', from: 10, to: 11,
        m0: '#c0a4f2', m1: '#7f5fc6', m2: '#4a3382', line: '#cdb6fa', ink: '#f3ebff',
        glow: 'rgba(192,164,242,.48)',
      },
    ];
    /* لوحة المرحلة المقفولة: معدنٌ بارد بلا بريق — «لم تُطرَق بعد». */
    const LOCK = { m0: '#525a70', m1: '#373f53', m2: '#232a3c', line: '#5e6880', ink: '#98a1b6', glow: 'rgba(0,0,0,0)' };

    const tierOf = (id) => (id <= 3 ? 0 : id <= 7 ? 1 : id <= 9 ? 2 : 3);
    const tierName = (t) => L(TIERS[t].ar, TIERS[t].en);

    /* عددُ المراحل الكلّي يُقرأ من التعريف لا يُكتب رقمًا، فلو زادت
       المراحل يومًا لا يبقى «12» محفورًا في مكانين. */
    const defs = () => (typeof LEVELS_DEF !== 'undefined' ? LEVELS_DEF : []);

    let _uid = 0;

    /* ═══════════════════════════════════════════════════════════
       الشارة المرسومة — بديل صور المراحل
       درعٌ معدنيّ بتدرّجٍ رأسيّ، عليه الرقم اللاتينيّ محفورًا (نسخةٌ
       داكنة مزاحة ثم النسخة المضيئة فوقها = إحساس الحفر)، وحِليةٌ
       تكبر مع الطَّور: لا شيء ← غُصنا غار ← غارٌ ونجمة ← تاج.
       ═══════════════════════════════════════════════════════════ */
    function crest(id, state) {
      const t = tierOf(id);
      const P = state === 'locked' ? LOCK : TIERS[t];
      const u = 'nlvg' + (++_uid);
      const rn = ROMAN[id] || String(id + 1);
      const fs = rn.length >= 4 ? 17 : rn.length === 3 ? 21.5 : 26;

      const SH = 'M36 14L68 24V52C68 70 54 84 36 88C18 84 4 70 4 52V24Z';
      const IN = 'M36 21L61 29.5V52C61 66 50 77 36 81C22 77 11 66 11 52V29.5Z';

      let s = '<svg class="nlvC" viewBox="0 0 72 92" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
        + '<defs><linearGradient id="' + u + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0" stop-color="' + P.m0 + '"/>'
        + '<stop offset=".52" stop-color="' + P.m1 + '"/>'
        + '<stop offset="1" stop-color="' + P.m2 + '"/></linearGradient></defs>'
        /* ظلٌّ تحت الدرع: نسخةٌ مزاحة لا فلتر — أرخص بكثير على WebView */
        + '<path d="' + SH + '" transform="translate(0 3)" fill="#000" opacity=".38"/>'
        + '<path d="' + SH + '" fill="url(#' + u + ')" stroke="' + P.line + '" stroke-width="2"/>'
        + '<path d="' + IN + '" fill="none" stroke="rgba(0,0,0,.32)" stroke-width="2"/>'
        /* لمعةُ الكتف العلويّ */
        + '<path d="M36 21L61 29.5V38L36 46.5L11 38V29.5Z" fill="#ffffff" opacity=".11"/>';

      /* غُصنا الغار — من الطَّور الثاني فصاعدًا */
      if (t >= 1 && state !== 'locked') {
        s += '<g fill="' + P.line + '" opacity=".92">'
          + '<path d="M13 42C5 53 7 68.5 19 77.5C10.5 67 9.5 53 16 43Z"/>'
          + '<path d="M12.2 50C5 48 2 52.5 3.2 57.5C8.5 58.5 12.4 55.2 12.2 50Z"/>'
          + '<path d="M11.4 59.5C4.2 59.5 2.2 64.5 4.4 68.5C9.4 67.4 12 64.2 11.4 59.5Z"/>'
          + '<path d="M13.4 68.5C7.2 70.5 6.2 75.5 9.4 78.5C13.6 76.6 15.4 72.6 13.4 68.5Z"/>'
          + '<path d="M59 42C67 53 65 68.5 53 77.5C61.5 67 62.5 53 56 43Z"/>'
          + '<path d="M59.8 50C67 48 70 52.5 68.8 57.5C63.5 58.5 59.6 55.2 59.8 50Z"/>'
          + '<path d="M60.6 59.5C67.8 59.5 69.8 64.5 67.6 68.5C62.6 67.4 60 64.2 60.6 59.5Z"/>'
          + '<path d="M58.6 68.5C64.8 70.5 65.8 75.5 62.6 78.5C58.4 76.6 56.6 72.6 58.6 68.5Z"/>'
          + '</g>';
      }

      /* الرقم اللاتينيّ محفورًا */
      s += '<text class="nlvC__rn" x="36" y="' + (t === 3 ? 62 : 61) + '" text-anchor="middle"'
        + ' font-size="' + fs + '" fill="rgba(0,0,0,.48)" transform="translate(0 1.8)">' + rn + '</text>'
        + '<text class="nlvC__rn" x="36" y="' + (t === 3 ? 62 : 61) + '" text-anchor="middle"'
        + ' font-size="' + fs + '" fill="' + P.ink + '">' + rn + '</text>';

      /* الحِلية العلويّة */
      if (state !== 'locked' && t === 2) {
        s += '<path d="M36 0L38 5.25L43.6 5.53L39.2 9.05L40.7 14.47L36 11.4L31.3 14.47L32.8 9.05L28.4 5.53L34 5.25Z"'
          + ' fill="' + P.line + '"/>';
      }
      if (state !== 'locked' && t === 3) {
        s += '<path d="M13.5 13.5L19.5 1.5L25.5 9.5L36 0L46.5 9.5L52.5 1.5L58.5 13.5Z" fill="' + P.m0 + '"/>'
          + '<rect x="12.5" y="11" width="47" height="6.6" rx="2.2" fill="' + P.line + '"/>'
          + '<circle cx="19.5" cy="4.6" r="2" fill="#f4756f"/>'
          + '<circle cx="36" cy="3.4" r="2.5" fill="#6fc3d8"/>'
          + '<circle cx="52.5" cy="4.6" r="2" fill="#7cd19a"/>';
      }

      /* شارةُ الحالة أسفل الدرع: صحٌّ للمكتملة، قفلٌ للمقفولة */
      if (state === 'done') {
        s += '<circle cx="55" cy="74" r="11" fill="#0b1120" opacity=".92"/>'
          + '<circle cx="55" cy="74" r="11" fill="none" stroke="#48D982" stroke-width="2"/>'
          + '<path d="M49.6 74.2L53.4 78L60.6 69.8" fill="none" stroke="#48D982" stroke-width="2.7"'
          + ' stroke-linecap="round" stroke-linejoin="round"/>';
      } else if (state === 'locked') {
        s += '<circle cx="55" cy="74" r="11" fill="#0b1120" opacity=".94"/>'
          + '<circle cx="55" cy="74" r="11" fill="none" stroke="#5e6880" stroke-width="2"/>'
          + '<rect x="50" y="73.4" width="10" height="7.8" rx="2" fill="#98a1b6"/>'
          + '<path d="M52.1 73.4V70.6C52.1 67.7 57.9 67.7 57.9 70.6V73.4" fill="none"'
          + ' stroke="#98a1b6" stroke-width="2"/>';
      }
      return s + '</svg>';
    }

    /* نجمةٌ صغيرة مرسومة لصفّ التقييم — لا محارف ولا إيموجي */
    const STAR_D = 'M8 .8L9.82 5.49L14.85 5.77L10.95 8.96L12.23 13.83L8 11.1'
      + 'L3.77 13.83L5.05 8.96L1.15 5.77L6.18 5.49Z';
    function starSVG(on) {
      return '<svg class="nlvS' + (on ? ' is-on' : '') + '" viewBox="0 0 16 16" aria-hidden="true">'
        + '<path d="' + STAR_D + '"/></svg>';
    }

    /* سهمُ الدخول — العنصر الحاوي HTML فينقلب مع الاتجاه بأمان */
    const GO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8"'
      + ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'
      + ' stroke-linejoin="round"/></svg>';

    /* ختمُ الطَّور في رأس المجموعة: ماساتٌ بعدد الطَّور، وتاجٌ للأخير */
    function tierSigil(t) {
      let s = '<svg class="nlvT__sig" viewBox="0 0 44 20" aria-hidden="true">';
      if (t === 3) {
        s += '<path d="M6 17L10 4L15 11L22 2L29 11L34 4L38 17Z" fill="currentColor"/>'
          + '<rect x="5" y="15" width="34" height="3.6" rx="1.4" fill="currentColor"/>';
      } else {
        const n = t + 1, w = 11, x0 = 22 - (n * w) / 2 + w / 2;
        for (let i = 0; i < n; i++) {
          const cx = n1(x0 + i * w);
          s += '<path d="M' + cx + ' 4L' + n1(cx + 5) + ' 10L' + cx + ' 16L' + n1(cx - 5) + ' 10Z"'
            + ' fill="currentColor"/>';
        }
      }
      return s + '</svg>';
    }

    /* ═══════════════════════════════════════════════════════════
       بناء الشاشة
       ═══════════════════════════════════════════════════════════ */
    let _busy = false;

    async function build() {
      const host = document.getElementById('s-levels');
      if (!host || _busy) return;
      _busy = true;
      try {
        const LV = (typeof LVL !== 'undefined') ? LVL : null;
        const D = defs();
        const total = D.length || 12;
        const p = LV ? await LV.get() : {};

        let done = 0, stars = 0;
        for (const lv of D) {
          if (p[lv.id] && p[lv.id].done) done++;
          stars += (p[lv.id] && p[lv.id].stars) || 0;
        }

        /* المرحلة الجارية = أوّل مفتوحةٍ غير مكتملة، وإلّا الأخيرة */
        let cur = -1;
        for (const lv of D) {
          const ok = LV ? await LV.unlocked(lv.id) : lv.id === 0;
          if (ok && !(p[lv.id] && p[lv.id].done)) { cur = lv.id; break; }
        }
        if (cur < 0) cur = total - 1;

        const root = el('div', 'nlv');
        root.setAttribute('data-no-i18n', '');

        /* ── الرأس: نور وحلقةُ التقدّم ─────────────────────────── */
        root.appendChild(heroEl(done, total, stars, cur));

        /* ── الطريق: أربعة أطوارٍ وبطاقاتها ────────────────────── */
        const road = el('div', 'nlv__road');
        for (let t = 0; t < TIERS.length; t++) {
          const TI = TIERS[t];
          let tdone = 0, tcount = 0;
          for (const lv of D) if (tierOf(lv.id) === t) { tcount++; if (p[lv.id] && p[lv.id].done) tdone++; }

          const head = el('div', 'nlvT' + (tdone === tcount && tcount ? ' is-full' : ''));
          head.style.setProperty('--tc', TI.line);
          const sig = el('span', 'nlvT__ic');
          sig.innerHTML = tierSigil(t);
          head.appendChild(sig);
          head.appendChild(el('b', 'nlvT__nm', tierName(t)));
          head.appendChild(el('span', 'nlvT__ct', tdone + ' / ' + tcount));
          road.appendChild(head);

          const grp = el('div', 'nlv__grp');
          for (const lv of D) {
            if (tierOf(lv.id) !== t) continue;
            grp.appendChild(await cardEl(lv, p, LV, cur));
          }
          road.appendChild(grp);
        }
        root.appendChild(road);

        /* ── زرّ العودة ───────────────────────────────────────── */
        const back = el('button', 'back-btn nlv__back',
          L('← العودة للقائمة', 'Back to menu ←'));
        back.onclick = () => { sfx('btn'); try { Nav.menu(); } catch (e) { } };
        root.appendChild(back);

        host.innerHTML = '';
        host.appendChild(root);
      } finally { _busy = false; }
    }

    function heroEl(done, total, stars, cur) {
      const hero = el('div', 'nlv__hero');
      const frac = total ? done / total : 0;
      const C = 2 * Math.PI * 48;                    /* محيطُ حلقة التقدّم */

      const av = el('div', 'nlv__av');
      av.innerHTML = '<svg class="nlv__ring" viewBox="0 0 104 104" aria-hidden="true">'
        + '<circle class="nlv__ringBg" cx="52" cy="52" r="48"/>'
        + '<circle class="nlv__ringOn" cx="52" cy="52" r="48" transform="rotate(-90 52 52)"'
        + ' stroke-dasharray="' + n1(C) + '" stroke-dashoffset="' + n1(C * (1 - frac)) + '"/>'
        + '</svg>';
      /* صورةُ نور الرمزيّة — هي الصورة الوحيدة الباقية في القسم */
      const img = el('img', 'nlv__face');
      img.src = 'nour.png';
      img.alt = '';
      img.setAttribute('loading', 'eager');
      av.appendChild(img);
      const pct = el('span', 'nlv__pct', Math.round(frac * 100) + '%');
      av.appendChild(pct);
      hero.appendChild(av);

      const hx = el('div', 'nlv__hx');
      hx.appendChild(el('span', 'nlv__kick', L('دَرْبُ نور', "Nour's Path")));
      hx.appendChild(el('h2', 'nlv__ttl', L('من I إلى XII', 'From I to XII')));
      hx.appendChild(el('p', 'nlv__sub',
        done >= total
          ? L('اكتملت الرحلة. لا مرحلةَ بعد الخالد.', 'The journey is complete. Nothing lies beyond the Immortal.')
          : L('أنت الآن عند ' + ROMAN[cur] + ' — ' + tierName(tierOf(cur)),
            'You are at ' + ROMAN[cur] + ' — ' + tierName(tierOf(cur)))));

      const chips = el('div', 'nlv__chips');
      chips.appendChild(chip(L('مكتملة', 'Cleared'), done + ' / ' + total));
      chips.appendChild(chip(L('النجوم', 'Stars'), stars + ' / ' + (total * 3)));
      chips.appendChild(chip(L('الطَّور', 'Stage'), (tierOf(cur) + 1) + ' / ' + TIERS.length));
      hx.appendChild(chips);
      hero.appendChild(hx);
      return hero;
    }

    function chip(k, v) {
      const c = el('span', 'nlv__chip');
      c.appendChild(el('i', 'nlv__chipK', k));
      c.appendChild(el('b', 'nlv__chipV', v));
      return c;
    }

    async function cardEl(lv, p, LV, cur) {
      const isDone = !!(p[lv.id] && p[lv.id].done);
      const open = LV ? await LV.unlocked(lv.id) : lv.id === 0;
      const st = !open ? 'locked' : isDone ? 'done' : 'open';
      const t = tierOf(lv.id);
      const sc = (p[lv.id] && p[lv.id].stars) || 0;

      const card = el('div', 'nlvL is-' + st + (lv.id === cur && open && !isDone ? ' is-now' : ''));
      card.style.setProperty('--tc', (st === 'locked' ? LOCK.line : TIERS[t].line));
      card.style.setProperty('--tg', (st === 'locked' ? LOCK.glow : TIERS[t].glow));

      const cw = el('div', 'nlvL__cr');
      cw.innerHTML = crest(lv.id, st);
      card.appendChild(cw);

      const b = el('div', 'nlvL__b');
      const top = el('div', 'nlvL__top');
      top.appendChild(el('span', 'nlvL__rn', L('المرحلة ', 'Level ') + ROMAN[lv.id]));
      if (lv.id === cur && open && !isDone) top.appendChild(el('span', 'nlvL__now', L('هنا أنت', 'You are here')));
      b.appendChild(top);
      b.appendChild(el('h3', 'nlvL__nm', X(lv.name)));
      b.appendChild(el('p', 'nlvL__ds', X(lv.desc)));

      const ft = el('div', 'nlvL__ft');
      const bd = el('span', 'nlvL__bd is-' + st,
        st === 'locked' ? L('مقفولة', 'Locked') : isDone ? L('مكتملة', 'Cleared') : L('العب الآن', 'Play now'));
      ft.appendChild(bd);
      if (isDone) {
        const sr = el('span', 'nlvL__st');
        sr.innerHTML = starSVG(sc >= 1) + starSVG(sc >= 2) + starSVG(sc >= 3);
        ft.appendChild(sr);
      }
      b.appendChild(ft);
      card.appendChild(b);

      const go = el('div', 'nlvL__go');
      go.innerHTML = GO_SVG;
      card.appendChild(go);

      if (open) {
        card.onclick = () => { sfx('btn'); try { G.startLevel(lv.id); } catch (e) { } };
      } else {
        /* المقفولة تردّ بحركةٍ قصيرة وسببٍ واضح بدل صمتٍ محيّر */
        card.onclick = () => {
          sfx('err');
          card.classList.remove('is-shake'); void card.offsetWidth; card.classList.add('is-shake');
          const prev = ROMAN[lv.id - 1] || ROMAN[0];
          let h = q('.nlvL__hint', card);
          if (!h) { h = el('p', 'nlvL__hint'); card.querySelector('.nlvL__b').appendChild(h); }
          h.textContent = L('أتمِمْ ' + prev + ' أوّلًا لتُفتَح.', 'Clear ' + prev + ' first to unlock.');
        };
      }
      return card;
    }

    /* ═══════════════════════════════════════════════════════════
       التهنئة — طَورٌ اكتمل، أو الرحلةُ كلّها
       نافذةٌ على ثيم التطبيق (.ds-overlay/.ds-dialog) بلا إيموجي،
       رسمُها SVG، ولكلّ نوعٍ صوته عبر data-sfx الذي يقرأه DSOverlay.
       ═══════════════════════════════════════════════════════════ */
    function hailHost() {
      let ov = document.getElementById('nlv-hail');
      if (ov) return ov;
      ov = document.createElement('div');
      ov.id = 'nlv-hail';
      ov.className = 'ds-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      const d = el('div', 'ds-dialog nlvh');
      d.id = 'nlv-hail-body';
      d.setAttribute('data-no-i18n', '');
      ov.appendChild(d);
      ov.addEventListener('click', (e) => { if (e.target === ov) closeHail(); });
      document.body.appendChild(ov);
      return ov;
    }
    function closeHail() {
      try { DSOverlay.close('nlv-hail'); } catch (e) {
        const o = document.getElementById('nlv-hail'); if (o) o.classList.remove('is-open');
      }
    }

    /* أشعّةٌ خلف الشارة: اثنتا عشرة شعاعًا رفيعة تدور بالـopacity فقط */
    function raysSVG() {
      let s = '<svg class="nlvh__rays" viewBox="0 0 200 200" aria-hidden="true">';
      for (let i = 0; i < 12; i++) {
        const a = (i * 30) * Math.PI / 180;
        const x1 = n1(100 + Math.cos(a) * 34), y1 = n1(100 + Math.sin(a) * 34);
        const x2 = n1(100 + Math.cos(a) * 96), y2 = n1(100 + Math.sin(a) * 96);
        s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"'
          + ' stroke="currentColor" stroke-width="' + (i % 2 ? 1.4 : 3) + '"'
          + ' stroke-linecap="round" opacity="' + (i % 2 ? .28 : .5) + '"/>';
      }
      return s + '</svg>';
    }

    /* إكليلُ النهاية: اثنتا عشرة شارةً صغيرة في دائرةٍ حول تاج — كلٌّ
       منها رقمُ مرحلةٍ قُهرت. يُرسم مرّةً واحدة عند إتمام الرحلة. */
    function wreathSVG() {
      let s = '<svg class="nlvh__wreath" viewBox="0 0 220 220" aria-hidden="true">'
        + '<circle cx="110" cy="110" r="84" fill="none" stroke="rgba(240,214,138,.22)" stroke-width="1.6"/>';
      for (let i = 0; i < 12; i++) {
        const a = (-90 + i * 30) * Math.PI / 180;
        const cx = n1(110 + Math.cos(a) * 84), cy = n1(110 + Math.sin(a) * 84);
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="15" fill="#151b2e"'
          + ' stroke="#f0d68a" stroke-width="1.6"/>'
          + '<text x="' + cx + '" y="' + n1(cy + 4.4) + '" text-anchor="middle"'
          + ' font-size="' + (ROMAN[i].length >= 4 ? 8.5 : ROMAN[i].length === 3 ? 10.5 : 12.5) + '"'
          + ' fill="#f0d68a" class="nlvC__rn">' + ROMAN[i] + '</text>';
      }
      /* التاج في القلب */
      s += '<g transform="translate(110 108)">'
        + '<path d="M-38 22L-26 -16L-13 2L0 -26L13 2L26 -16L38 22Z" fill="#f2cf82"/>'
        + '<rect x="-40" y="18" width="80" height="12" rx="4" fill="#b8923f"/>'
        + '<circle cx="-26" cy="-6" r="4.6" fill="#f4756f"/>'
        + '<circle cx="0" cy="-14" r="5.6" fill="#6fc3d8"/>'
        + '<circle cx="26" cy="-6" r="4.6" fill="#7cd19a"/>'
        + '</g>';
      return s + '</svg>';
    }

    function celebrate(kind, data) {
      const ov = hailHost();
      const body = q('#nlv-hail-body');
      if (!body) return;
      data = data || {};
      body.innerHTML = '';
      body.classList.toggle('is-crown', kind === 'crown');
      ov.dataset.sfx = kind === 'crown' ? 'lvlCrown' : 'lvlTier';

      const art = el('div', 'nlvh__art');
      if (kind === 'crown') {
        art.innerHTML = wreathSVG();
      } else {
        const t = data.tier || 0;
        art.style.setProperty('--tc', TIERS[t].line);
        art.innerHTML = raysSVG() + '<span class="nlvh__crest">' + crest(TIERS[t].to, 'done') + '</span>';
      }
      body.appendChild(art);

      body.appendChild(el('span', 'nlvh__kick',
        kind === 'crown' ? L('نهايةُ الدَّرْب', 'End of the path') : L('طَورٌ اكتمل', 'Stage complete')));

      if (kind === 'crown') {
        body.appendChild(el('h3', 'nlvh__ttl', L('قهرتَ نور', 'You have beaten Nour')));
        body.appendChild(el('p', 'nlvh__tx',
          L('اثنتا عشرة مرحلة، من I إلى XII، سقطت كلُّها. لم يبقَ لنور ما يُخفيه عنك — '
            + 'ولم يبقَ فوق الخالدِ أحد.',
            'Twelve levels, I through XII, every one of them cleared. Nour has nothing left to hide — '
            + 'and nothing stands above the Immortal.')));
      } else {
        const t = data.tier || 0;
        body.appendChild(el('h3', 'nlvh__ttl', tierName(t)));
        const nx = data.next;
        body.appendChild(el('p', 'nlvh__tx',
          nx != null
            ? L('أتممتَ ' + ROMAN[TIERS[t].from] + ' حتى ' + ROMAN[TIERS[t].to] + '. '
              + 'نور يصعد معك الآن — ' + tierName(tierOf(nx)) + ' مفتوحٌ من ' + ROMAN[nx] + '.',
              'You cleared ' + ROMAN[TIERS[t].from] + ' through ' + ROMAN[TIERS[t].to] + '. '
              + 'Nour rises with you — ' + tierName(tierOf(nx)) + ' opens at ' + ROMAN[nx] + '.')
            : L('أتممتَ ' + ROMAN[TIERS[t].from] + ' حتى ' + ROMAN[TIERS[t].to] + '.',
              'You cleared ' + ROMAN[TIERS[t].from] + ' through ' + ROMAN[TIERS[t].to] + '.')));
      }

      const btn = el('button', 'ds-btn ds-btn--primary nlvh__ok',
        kind === 'crown' ? L('أكملُ الرحلة', 'Carry on') : L('إلى الطَّور التالي', 'On to the next stage'));
      btn.onclick = () => { sfx('btn'); closeHail(); };
      body.appendChild(btn);

      try { DSOverlay.open(ov); } catch (e) { ov.classList.add('is-open'); }
      try { if (typeof spawnConfetti === 'function') spawnConfetti(); } catch (e) { }
      try { if (navigator.vibrate) navigator.vibrate(kind === 'crown' ? [40, 60, 40, 60, 120] : [30, 50, 70]); } catch (e) { }
    }

    /* يُنادى من LVL.save بعد حفظ المرحلة: هل أغلق هذا الفوزُ طَورًا؟ */
    function afterSave(id, progress) {
      try {
        const D = defs();
        const p = progress || {};
        const t = tierOf(id);
        const TI = TIERS[t];
        /* الرحلةُ كلّها أوّلًا — لو تمّت فلا معنى للافتة الطَّور */
        let all = D.length > 0;
        for (const lv of D) if (!(p[lv.id] && p[lv.id].done)) { all = false; break; }
        if (all) { setTimeout(() => celebrate('crown'), 900); return; }
        /* الطَّور: تُرفع اللافتة فقط حين تكتمل كل مراحله */
        if (id !== TI.to) return;
        for (let i = TI.from; i <= TI.to; i++) if (!(p[i] && p[i].done)) return;
        setTimeout(() => celebrate('tier', { tier: t, next: TI.to + 1 < D.length ? TI.to + 1 : null }), 900);
      } catch (e) { }
    }

    function relang() {
      const scr = document.getElementById('s-levels');
      if (scr && scr.classList.contains('active')) build();
    }

    return { build, celebrate, afterSave, relang, ROMAN, TIERS, tierOf, crest };
  })();

  window.NLV = NLV;
  try {
    window.addEventListener('amkh:lang', () => { try { NLV.relang(); } catch (e) { } });
  } catch (e) { }
})();
