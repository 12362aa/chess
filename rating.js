'use strict';
/*
 * rating.js — نظام تقييم Glicko-2 (زي Lichess) لمباريات الأونلاين.
 * وحدة خالصة بدون أي اعتماد على قاعدة البيانات أو السيرفر عشان تتّختبر لوحدها.
 *
 * كل لاعب بيحمل 3 أرقام على المقياس العام (public scale):
 *   r   = التقييم (افتراضي 1500)
 *   rd  = انحراف التقييم / عدم اليقين (افتراضي 350؛ كل ما قلّ زاد الثبات)
 *   vol = التذبذب (volatility، افتراضي 0.06)
 *
 * المرجع: ورقة Glickman الرسمية glicko.net/glicko/glicko2.pdf
 */

const SCALE = 173.7178;          // = 400 / ln(10)
const DEFAULT_R = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOL = 0.06;
const TAU = 0.5;                 // ثابت النظام (يتحكم في سرعة تغيّر التذبذب)
const EPS = 0.000001;            // دقة تقارب حلّ التذبذب
const PROVISIONAL_RD = 110;      // فوقها التقييم مبدئي (provisional) ويظهر بعلامة ?
const MAX_RD = 350;              // سقف عدم اليقين

/*
 * سقف حركة التقييم في المباراة الواحدة.
 * ─────────────────────────────────────────────────────────────────────
 * Glicko-2 صافي بيسمح بقفزات مالهاش معنى للاعب أول ما يبدأ: لاعب
 * rd=350 لو فاز على لاعب 2000 ثابت بياخد +546 نقطة من مباراة واحدة،
 * ولاعب جمّع نقط من انتصارات على لاعبين مبدئيين ممكن يخسر 200+ نقطة
 * في مباراة واحدة (وكل الشكاوى اللي وصلتنا كانت من ده بالظبط).
 * رياضيًا الرقم صحيح — عدم اليقين لسه كبير — بس اللاعب مايقراهوش كده،
 * ومافيش موقع شطرنج كبير بيعرض حركة بالحجم ده.
 *
 * فبنسيب Glicko يحسب RD والتذبذب زي ما هما (دول اللي بيضبطوا سرعة
 * الاستقرار وترتيب لوحة الصدارة) وبنحدّ الرقم المعروض بس:
 *   • أول CALIB_GAMES مباراة مصنّفة: 80 نقطة — لسه بنعاير اللاعب،
 *     فمسموح يتحرّك أسرع (80×10 = مساحة 800 نقطة، أكتر من كفاية).
 *   • بعد كده: 40 نقطة — قريبة من K=32 المعروفة في Elo.
 * السقف متماثل: نفس الحد للفوز وللخسارة، فمفيش ميل لأي ناحية.
 */
const CALIB_GAMES = 10;
const CAP_CALIB = 80;
const CAP_STABLE = 40;

function capFor(games) {
  return num(games, 0) < CALIB_GAMES ? CAP_CALIB : CAP_STABLE;
}

/* قصّ حركة التقييم على السقف — بيرجّع التقييم الجديد بعد الحد */
function capDelta(before, after, games) {
  const cap = capFor(games);
  const d = num(after, before) - num(before, DEFAULT_R);
  if (d > cap) return num(before, DEFAULT_R) + cap;
  if (d < -cap) return num(before, DEFAULT_R) - cap;
  return num(after, before);
}

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}
function E(mu, muO, phiO) {
  return 1 / (1 + Math.exp(-g(phiO) * (mu - muO)));
}

/*
 * حدّث لاعبًا واحدًا بناءً على مجموعة مباريات في نفس الفترة.
 * player  = { r, rd, vol }
 * results = [ { r, rd, score } ...]  حيث score: فوز=1، تعادل=0.5، خسارة=0
 * بيرجّع { r, rd, vol } الجديدة على المقياس العام.
 */
function updatePlayer(player, results) {
  const r = num(player.r, DEFAULT_R);
  const rd = clampRd(num(player.rd, DEFAULT_RD));
  const vol = num(player.vol, DEFAULT_VOL);

  // خطوة 1: تحويل للمقياس الداخلي
  const mu = (r - DEFAULT_R) / SCALE;
  const phi = rd / SCALE;

  // لاعب من غير مباريات في الفترة دي: بس نكبّر RD بالتذبذب
  if (!results || results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + vol * vol);
    return {
      r,
      rd: clampRd(phiStar * SCALE),
      vol,
    };
  }

  // تحويل الخصوم + خطوتَي v و Δ
  const opp = results.map((o) => {
    const omu = (num(o.r, DEFAULT_R) - DEFAULT_R) / SCALE;
    const ophi = clampRd(num(o.rd, DEFAULT_RD)) / SCALE;
    const gphi = g(ophi);
    const e = E(mu, omu, ophi);
    return { gphi, e, score: num(o.score, 0) };
  });

  let vInv = 0;
  let delSum = 0;
  for (const o of opp) {
    vInv += o.gphi * o.gphi * o.e * (1 - o.e);
    delSum += o.gphi * (o.score - o.e);
  }
  const v = 1 / vInv;
  const delta = v * delSum;

  // خطوة 5: التذبذب الجديد (حل تكراري بخوارزمية Illinois)
  const newVol = solveVol(phi, v, delta, vol);

  // خطوة 6: RD قبل الفترة
  const phiStar = Math.sqrt(phi * phi + newVol * newVol);

  // خطوة 7: RD و µ الجديدة
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * delSum;

  // خطوة 8: رجوع للمقياس العام
  return {
    r: SCALE * newMu + DEFAULT_R,
    rd: clampRd(SCALE * newPhi),
    vol: newVol,
  };
}

// حل معادلة التذبذب f(x)=0 بطريقة Illinois (regula falsi معدّلة)
function solveVol(phi, v, delta, vol) {
  const a = Math.log(vol * vol);
  const d2 = delta * delta;
  const phi2 = phi * phi;
  const f = (x) => {
    const ex = Math.exp(x);
    const t1 = (ex * (d2 - phi2 - v - ex)) / (2 * Math.pow(phi2 + v + ex, 2));
    const t2 = (x - a) / (TAU * TAU);
    return t1 - t2;
  };

  let A = a;
  let B;
  if (d2 > phi2 + v) {
    B = Math.log(d2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPS && guard++ < 1000) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

function clampRd(rd) {
  if (!isFinite(rd) || rd <= 0) return DEFAULT_RD;
  return Math.min(rd, MAX_RD);
}
function num(x, dflt) {
  const n = Number(x);
  return isFinite(n) ? n : dflt;
}

/*
 * راحة لمباراة أونلاين واحدة بين لاعبين: بنحدّث الاتنين ضد بعض
 * باستخدام تقييمات ما قبل المباراة (snapshot) عشان العدل.
 * scoreA = نتيجة A (1/0.5/0)، وB بياخد المكمّل.
 * a/b ممكن يحملوا games = عدد المباريات المصنّفة قبل دي (لتحديد السقف).
 * بيرجّع { a:{r,rd,vol}, b:{r,rd,vol} }.
 */
function applyGame(a, b, scoreA) {
  const preA = { r: num(a.r, DEFAULT_R), rd: num(a.rd, DEFAULT_RD), vol: num(a.vol, DEFAULT_VOL) };
  const preB = { r: num(b.r, DEFAULT_R), rd: num(b.rd, DEFAULT_RD), vol: num(b.vol, DEFAULT_VOL) };
  const sA = num(scoreA, 0);
  const outA = updatePlayer(preA, [{ r: preB.r, rd: preB.rd, score: sA }]);
  const outB = updatePlayer(preB, [{ r: preA.r, rd: preA.rd, score: 1 - sA }]);
  // السقف على الرقم المعروض بس — RD والتذبذب زي ما Glicko حسبهم
  outA.r = capDelta(preA.r, outA.r, a.games);
  outB.r = capDelta(preB.r, outB.r, b.games);
  return { a: outA, b: outB };
}

// التقييم "المحافظ" للوحة المتصدّرين (زي TrueSkill): لا نرتّب لاعبًا مبدئيًا
function conservative(r, rd) {
  return num(r, DEFAULT_R) - 2 * clampRd(num(rd, DEFAULT_RD));
}
function isProvisional(rd) {
  return clampRd(num(rd, DEFAULT_RD)) > PROVISIONAL_RD;
}

// احتمال فوز A المتوقّع (للعرض الشفّاف بعد المباراة)
function expectedScore(a, b) {
  const mu = (num(a.r, DEFAULT_R) - DEFAULT_R) / SCALE;
  const omu = (num(b.r, DEFAULT_R) - DEFAULT_R) / SCALE;
  const ophi = clampRd(num(b.rd, DEFAULT_RD)) / SCALE;
  return E(mu, omu, ophi);
}

module.exports = {
  updatePlayer,
  applyGame,
  conservative,
  isProvisional,
  expectedScore,
  capFor,
  capDelta,
  DEFAULT_R,
  DEFAULT_RD,
  DEFAULT_VOL,
  PROVISIONAL_RD,
  CALIB_GAMES,
  CAP_CALIB,
  CAP_STABLE,
};
