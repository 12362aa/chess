'use strict';
/*
 * economy.js — العمود الفقري لاقتصاد Am-Kh Coins (المرحلة ١).
 * ────────────────────────────────────────────────────────────────────
 * كل شيء موثوق من الخادم: العملات وXP والملكية والإنجازات تُكتب هنا فقط
 * عبر req.user.id، لا من أي بلوب عميلي. coin_ledger أساس-إلحاقيّ = مصدر
 * الحقيقة، وwallet.coins نسخة مشتقّة مخزّنة للسرعة تُطابَق مع مجموع الدفتر.
 * لا Pay-to-Win: العملات/XP تجميليّة بحتة ولا تمسّ تقييم Glicko إطلاقًا.
 */

const db = require('./db.js');
const { authenticateToken } = require('./auth.js');
const express = require('express');
const router = express.Router();

/* ══ أرقام الكسب (قابلة للضبط، متوازنة ضد الاستغلال) ══ */
const AWARD = {
  game_win:  { coins: 25, xp: 40 },
  game_draw: { coins: 12, xp: 25 },
  game_loss: { coins: 8,  xp: 15 },   // مشاركة: لا يُعاقَب الخاسر
  puzzle:    { coins: 10, xp: 12 },
  beat_nour: { coins: 15, xp: 20 },
};
const WELCOME_COINS = 200;            // منحة الإطلاق للحسابات الموجودة/الجديدة
const PUZZLE_DAILY_CAP = 20;          // سقف ألغاز مكسِبة يوميًّا (مضادّ للتفريخ)
const MAX_LEVEL = 50;

/* منحنى الخبرة: كلفة الانتقال من مستوى n إلى n+1 = 100 + (n-1)*25.
   تراكميًّا حتى المستوى 50 ≈ 122500 XP. دالّة نقيّة يتّفق عليها العميل والخادم. */
function xpToReach(level) {
  let total = 0;
  for (let n = 1; n < level; n++) total += 100 + (n - 1) * 25;
  return total;
}
function levelForXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= xpToReach(L + 1)) L++;
  return L;
}

/* ══ تعريفات الإنجازات (بذرة المرحلة ١، توسعةٌ كبرى في البناء ٦٢) ══
   retro=true تُحسَب بأثر رجعي من سجلّ الخادم عند أول دخول بعد التحديث.
   ar/en/desc ثنائيّة اللغة تُرسَل للعميل عبر /catalog (لا تسريب i18n).
   icon: مُعرّفٌ يرسمه العميل SVG. tier: برونز/فضّة/ذهب/أسطورة (بطاقةٌ مرسومةٌ
   لكلِّ رتبة). cat: مجموعةُ العرضِ (قتال/إتقان/ألغاز/مقتنيات/خاصّ).
   كلُّها تمنح coins + xp معًا — لا إنجازَ بلا خبرة. */
const ACHIEVEMENTS = [
  /* ── قتال: انتصاراتٌ ومبارياتٌ وسلاسل ── */
  { id: 'first_win',   coins: 30,  xp: 50,   retro: true,  icon: 'sword',  tier: 'bronze', cat: 'battle', test: s => s.wins >= 1,
    ar: 'أوّلُ انتصار',        en: 'First Win',        descAr: 'فُزْ بأوّلِ مباراةٍ لك.',            descEn: 'Win your first game.' },
  { id: 'wins_10',     coins: 80,  xp: 120,  retro: true,  icon: 'sword',  tier: 'bronze', cat: 'battle', test: s => s.wins >= 10,
    ar: 'عشرةُ انتصارات',      en: '10 Wins',          descAr: 'فُزْ بعشرِ مباريات.',               descEn: 'Win 10 games.' },
  { id: 'wins_50',     coins: 200, xp: 300,  retro: true,  icon: 'sword',  tier: 'silver', cat: 'battle', test: s => s.wins >= 50,
    ar: 'خمسونَ انتصارًا',     en: '50 Wins',          descAr: 'فُزْ بخمسينَ مباراة.',              descEn: 'Win 50 games.' },
  { id: 'wins_100',    coins: 400, xp: 600,  retro: true,  icon: 'sword',  tier: 'gold',   cat: 'battle', test: s => s.wins >= 100,
    ar: 'مئةُ انتصار',         en: '100 Wins',         descAr: 'فُزْ بمئةِ مباراة.',                descEn: 'Win 100 games.' },
  { id: 'wins_250',    coins: 900, xp: 1200, retro: true,  icon: 'trophy', tier: 'legend', cat: 'battle', test: s => s.wins >= 250,
    ar: 'مئتانِ وخمسون انتصارًا', en: '250 Wins',      descAr: 'فُزْ بمئتينِ وخمسينَ مباراة.',      descEn: 'Win 250 games.' },
  { id: 'games_10',    coins: 40,  xp: 60,   retro: true,  icon: 'board',  tier: 'bronze', cat: 'battle', test: s => s.games >= 10,
    ar: 'عشرُ مباريات',        en: '10 Games',         descAr: 'العَبْ عشرَ مباريات.',               descEn: 'Play 10 games.' },
  { id: 'games_100',   coins: 150, xp: 200,  retro: true,  icon: 'board',  tier: 'silver', cat: 'battle', test: s => s.games >= 100,
    ar: 'مئةُ مباراة',         en: '100 Games',        descAr: 'العَبْ مئةَ مباراة.',                descEn: 'Play 100 games.' },
  { id: 'games_500',   coins: 600, xp: 800,  retro: true,  icon: 'board',  tier: 'gold',   cat: 'battle', test: s => s.games >= 500,
    ar: 'خمسُ مئةِ مباراة',    en: '500 Games',        descAr: 'العَبْ خمسَ مئةِ مباراة.',           descEn: 'Play 500 games.' },
  { id: 'draws_10',    coins: 90,  xp: 140,  retro: true,  icon: 'shield', tier: 'silver', cat: 'battle', test: s => s.draws >= 10,
    ar: 'صمودُ العشرة',        en: 'Ten Standoffs',    descAr: 'أنهِ عشرَ مبارياتٍ بالتعادل.',       descEn: 'Draw 10 games.' },
  { id: 'streak_3',    coins: 70,  xp: 110,  retro: true,  icon: 'flame',  tier: 'bronze', cat: 'battle', test: s => s.streak >= 3,
    ar: 'سلسلةُ ثلاثة',        en: '3-Win Streak',     descAr: 'فُزْ بثلاثِ مبارياتٍ متتالية.',     descEn: 'Win 3 games in a row.' },
  { id: 'streak_5',    coins: 140, xp: 220,  retro: true,  icon: 'flame',  tier: 'silver', cat: 'battle', test: s => s.streak >= 5,
    ar: 'سلسلةُ خمسة',        en: '5-Win Streak',     descAr: 'فُزْ بخمسِ مبارياتٍ متتالية.',      descEn: 'Win 5 games in a row.' },
  { id: 'streak_10',   coins: 350, xp: 500,  retro: true,  icon: 'flame',  tier: 'gold',   cat: 'battle', test: s => s.streak >= 10,
    ar: 'سلسلةُ عشرة',        en: '10-Win Streak',    descAr: 'فُزْ بعشرِ مبارياتٍ متتالية.',      descEn: 'Win 10 games in a row.' },
  /* ── إتقان: تقييمٌ ومستوى ── */
  { id: 'rating_1600', coins: 120, xp: 160,  retro: true,  icon: 'crown',  tier: 'silver', cat: 'mastery', test: s => s.rating >= 1600,
    ar: 'تقييمُ ١٦٠٠',         en: 'Rating 1600',      descAr: 'ابلغْ تقييمَ ١٦٠٠ أونلاين.',         descEn: 'Reach a 1600 online rating.' },
  { id: 'rating_1800', coins: 300, xp: 420,  retro: true,  icon: 'crown',  tier: 'gold',   cat: 'mastery', test: s => s.rating >= 1800,
    ar: 'تقييمُ ١٨٠٠',         en: 'Rating 1800',      descAr: 'ابلغْ تقييمَ ١٨٠٠ أونلاين.',         descEn: 'Reach an 1800 online rating.' },
  { id: 'rating_2000', coins: 700, xp: 950,  retro: true,  icon: 'crown',  tier: 'legend', cat: 'mastery', test: s => s.rating >= 2000,
    ar: 'تقييمُ ٢٠٠٠',         en: 'Rating 2000',      descAr: 'ابلغْ تقييمَ ٢٠٠٠ أونلاين.',         descEn: 'Reach a 2000 online rating.' },
  { id: 'level_5',     coins: 80,  xp: 60,   retro: true,  icon: 'level',  tier: 'bronze', cat: 'mastery', test: s => s.level >= 5,
    ar: 'المستوى ٥',           en: 'Level 5',          descAr: 'ابلغْ المستوى الخامس.',              descEn: 'Reach level 5.' },
  { id: 'level_10',    coins: 180, xp: 150,  retro: true,  icon: 'level',  tier: 'silver', cat: 'mastery', test: s => s.level >= 10,
    ar: 'المستوى ١٠',          en: 'Level 10',         descAr: 'ابلغْ المستوى العاشر.',              descEn: 'Reach level 10.' },
  { id: 'level_25',    coins: 500, xp: 400,  retro: true,  icon: 'level',  tier: 'gold',   cat: 'mastery', test: s => s.level >= 25,
    ar: 'المستوى ٢٥',          en: 'Level 25',         descAr: 'ابلغْ المستوى الخامسَ والعشرين.',    descEn: 'Reach level 25.' },
  { id: 'level_50',    coins: 1500,xp: 1000, retro: true,  icon: 'level',  tier: 'legend', cat: 'mastery', test: s => s.level >= 50,
    ar: 'القمّةُ: المستوى ٥٠',  en: 'Peak: Level 50',   descAr: 'ابلغْ المستوى الخمسين — أقصى ما يُنال.', descEn: 'Reach level 50 — the very top.' },
  /* ── ألغاز ── */
  { id: 'puzzle_10',   coins: 40,  xp: 60,   retro: true,  icon: 'bulb',   tier: 'bronze', cat: 'puzzle', test: s => s.puzzles >= 10,
    ar: 'عشرةُ ألغاز',         en: '10 Puzzles',       descAr: 'حُلَّ عشرةَ ألغاز.',                 descEn: 'Solve 10 puzzles.' },
  { id: 'puzzle_50',   coins: 90,  xp: 120,  retro: true,  icon: 'bulb',   tier: 'silver', cat: 'puzzle', test: s => s.puzzles >= 50,
    ar: 'خمسونَ لغزًا',        en: '50 Puzzles',       descAr: 'حُلَّ خمسينَ لغزًا.',                descEn: 'Solve 50 puzzles.' },
  { id: 'puzzle_200',  coins: 300, xp: 400,  retro: true,  icon: 'bulb',   tier: 'gold',   cat: 'puzzle', test: s => s.puzzles >= 200,
    ar: 'مئتا لغز',            en: '200 Puzzles',      descAr: 'حُلَّ مئتَي لغز.',                   descEn: 'Solve 200 puzzles.' },
  { id: 'puzzle_500',  coins: 800, xp: 1000, retro: true,  icon: 'brain',  tier: 'legend', cat: 'puzzle', test: s => s.puzzles >= 500,
    ar: 'خمسُ مئةِ لغز',       en: '500 Puzzles',      descAr: 'حُلَّ خمسَ مئةِ لغز.',               descEn: 'Solve 500 puzzles.' },
  /* ── مقتنيات: المتجرُ والمخزون ── */
  { id: 'collect_5',   coins: 60,  xp: 80,   retro: true,  icon: 'gem',    tier: 'bronze', cat: 'collect', test: s => s.owned >= 5,
    ar: 'خمسُ مقتنيات',        en: '5 Cosmetics',      descAr: 'امتلكْ خمسةَ عناصرَ تجميليّة.',      descEn: 'Own 5 cosmetic items.' },
  { id: 'collect_15',  coins: 200, xp: 260,  retro: true,  icon: 'gem',    tier: 'silver', cat: 'collect', test: s => s.owned >= 15,
    ar: 'خمسَ عشرةَ مقتنيات',  en: '15 Cosmetics',     descAr: 'امتلكْ خمسةَ عشرَ عنصرًا تجميليًّا.', descEn: 'Own 15 cosmetic items.' },
  { id: 'collect_30',  coins: 500, xp: 650,  retro: true,  icon: 'gem',    tier: 'gold',   cat: 'collect', test: s => s.owned >= 30,
    ar: 'ثلاثونَ مقتنى',       en: '30 Cosmetics',     descAr: 'امتلكْ ثلاثينَ عنصرًا تجميليًّا.',   descEn: 'Own 30 cosmetic items.' },
  { id: 'own_legendary',coins: 180,xp: 240,  retro: true,  icon: 'trophy', tier: 'silver', cat: 'collect', test: s => s.legendary >= 1,
    ar: 'أوّلُ أسطوريّ',       en: 'First Legendary',  descAr: 'امتلكْ عنصرًا أسطوريًّا واحدًا.',    descEn: 'Own one legendary item.' },
  { id: 'own_mythic',  coins: 400, xp: 500,  retro: true,  icon: 'dragon', tier: 'legend', cat: 'collect', test: s => s.mythic >= 1,
    ar: 'صائدُ الميثِك',       en: 'Mythic Hunter',    descAr: 'امتلكْ عنصرًا من أعلى ندرة (Mythic).', descEn: 'Own an item of the highest rarity (Mythic).' },
  /* ── خاصّ ── */
  { id: 'beat_nour',   coins: 60,  xp: 80,   retro: false, icon: 'star',   tier: 'silver', cat: 'special', test: () => false,
    ar: 'هزيمةُ نور',          en: 'Beat Nour',        descAr: 'اهزِمْ نورَ في وضعِ اللعبِ ضدّه.',   descEn: 'Beat Nour in a match against him.' },
];

/* ══ المهام اليومية/الأسبوعية الذكيّة (البناء ٦٠) ══
   لم تعد ٦ مهامّ ثابتة للكلّ، بل مولّدة لكلّ لاعب: تُختار ٣ قوالب يوميّة
   و٣ أسبوعيّة بترجيحٍ مشتقٍّ من سلوكه الفعليّ (تكيّف)، وتتدرّج أهدافها مع
   مستواه (تدرّج). الاختيار حتميّ بالبذرة (period+periodKey+userId) ويُثبَّت
   في جدول missions عند أوّل لمسةٍ للدورة (bumpMissions/snapshot/claim) فلا
   يتغيّر لو تبدّلت الإحصاءات أثناء الدورة. metrics المدعومة:
   games | wins | puzzles | checkmate | streak | nour | draws.
   النصوص دوالٌّ تأخذ الهدف t فتُبنى ثنائيّة اللغة ديناميكيًّا (لا تسريب i18n).
   coins = coinsPer*target، xp = xpPer*target، target = base + per*floor(level/5). */
function _arNum(n) { return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]); }
/* تمييزٌ عربيٌّ صحيحٌ نحويًّا حسب العدد: [مفرد، مثنّى، جمع ٣-١٠، تمييز >١٠]. */
function _ar_p(n, f) { return n === 1 ? f[0] : n === 2 ? f[1] : (n >= 3 && n <= 10) ? f[2] : f[3]; }
const _AR_MATCH  = ['مباراة', 'مباراتين', 'مباريات', 'مباراة'];
const _AR_WIN    = ['فوزٍ', 'فوزين', 'انتصارات', 'فوزًا'];
const _AR_PUZ    = ['لغزٍ', 'لغزين', 'ألغاز', 'لغزًا'];
const _AR_TIME   = ['مرّة', 'مرّتين', 'مرّات', 'مرّة'];
function _s(n) { return n === 1 ? '' : 's'; }

const MISSION_TEMPLATES = {
  daily: [
    { key: 'games',     metric: 'games',     base: 3, per: 1, cpt: 10, xpt: 13,
      ar: t => `العَبْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)}`,        en: t => `Play ${t} game${_s(t)}`,
      descAr: t => `العَبْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} اليوم.`, descEn: t => `Play ${t} game${_s(t)} today.` },
    { key: 'wins',      metric: 'wins',      base: 1, per: 1, cpt: 40, xpt: 50,
      ar: t => `فُزْ بـ${_arNum(t)} ${_ar_p(t, _AR_MATCH)}`,       en: t => `Win ${t} game${_s(t)}`,
      descAr: t => `فُزْ بـ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} اليوم.`, descEn: t => `Win ${t} game${_s(t)} today.` },
    { key: 'puzzles',   metric: 'puzzles',   base: 5, per: 2, cpt: 7,  xpt: 9,
      ar: t => `حُلَّ ${_arNum(t)} ${_ar_p(t, _AR_PUZ)}`,          en: t => `Solve ${t} puzzle${_s(t)}`,
      descAr: t => `حُلَّ ${_arNum(t)} ${_ar_p(t, _AR_PUZ)} اليوم.`,  descEn: t => `Solve ${t} puzzle${_s(t)} today.` },
    { key: 'checkmate', metric: 'checkmate', base: 1, per: 1, cpt: 45, xpt: 55,
      ar: t => `سدّدْ ${_arNum(t)} كش-مات`,                        en: t => `Deliver ${t} checkmate${_s(t)}`,
      descAr: t => `أنهِ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} بكش-مات اليوم.`, descEn: t => `Win ${t} game${_s(t)} by checkmate today.` },
    { key: 'streak',    metric: 'streak',    base: 2, per: 1, cpt: 30, xpt: 40,
      ar: t => `سلسلةُ ${_arNum(t)} انتصارات`,                     en: t => `${t}-win streak`,
      descAr: t => `فُزْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} متتالية دون خسارة.`, descEn: t => `Win ${t} games in a row without a loss.` },
    { key: 'nour',      metric: 'nour',      base: 1, per: 0, cpt: 50, xpt: 60,
      ar: t => `اهزِمْ نورَ ${_arNum(t)} ${_ar_p(t, _AR_TIME)}`,    en: t => `Beat Nour ${t} time${_s(t)}`,
      descAr: t => `اهزِمْ نورَ ${_arNum(t)} ${_ar_p(t, _AR_TIME)} اليوم.`, descEn: t => `Beat Nour ${t} time${_s(t)} today.` },
    { key: 'draws',     metric: 'draws',     base: 1, per: 0, cpt: 25, xpt: 30,
      ar: t => `تعادَلْ ${_arNum(t)} ${_ar_p(t, _AR_TIME)}`,       en: t => `Draw ${t} game${_s(t)}`,
      descAr: t => `أنهِ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} بالتعادل اليوم.`, descEn: t => `Draw ${t} game${_s(t)} today.` },
  ],
  weekly: [
    { key: 'games',     metric: 'games',     base: 20, per: 3, cpt: 8,  xpt: 10,
      ar: t => `العَبْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)}`,        en: t => `Play ${t} game${_s(t)}`,
      descAr: t => `العَبْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} هذا الأسبوع.`, descEn: t => `Play ${t} game${_s(t)} this week.` },
    { key: 'wins',      metric: 'wins',      base: 10, per: 2, cpt: 22, xpt: 28,
      ar: t => `فُزْ بـ${_arNum(t)} ${_ar_p(t, _AR_MATCH)}`,       en: t => `Win ${t} game${_s(t)}`,
      descAr: t => `فُزْ بـ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} هذا الأسبوع.`, descEn: t => `Win ${t} game${_s(t)} this week.` },
    { key: 'puzzles',   metric: 'puzzles',   base: 30, per: 5, cpt: 7,  xpt: 8,
      ar: t => `حُلَّ ${_arNum(t)} ${_ar_p(t, _AR_PUZ)}`,          en: t => `Solve ${t} puzzle${_s(t)}`,
      descAr: t => `حُلَّ ${_arNum(t)} ${_ar_p(t, _AR_PUZ)} هذا الأسبوع.`, descEn: t => `Solve ${t} puzzle${_s(t)} this week.` },
    { key: 'checkmate', metric: 'checkmate', base: 5, per: 1, cpt: 30, xpt: 38,
      ar: t => `سدّدْ ${_arNum(t)} كش-مات`,                        en: t => `Deliver ${t} checkmate${_s(t)}`,
      descAr: t => `أنهِ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} بكش-مات هذا الأسبوع.`, descEn: t => `Win ${t} game${_s(t)} by checkmate this week.` },
    { key: 'streak',    metric: 'streak',    base: 4, per: 1, cpt: 50, xpt: 60,
      ar: t => `سلسلةُ ${_arNum(t)} انتصارات`,                     en: t => `${t}-win streak`,
      descAr: t => `فُزْ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} متتالية دون خسارة.`, descEn: t => `Win ${t} games in a row without a loss.` },
    { key: 'nour',      metric: 'nour',      base: 3, per: 0, cpt: 40, xpt: 50,
      ar: t => `اهزِمْ نورَ ${_arNum(t)} ${_ar_p(t, _AR_TIME)}`,    en: t => `Beat Nour ${t} time${_s(t)}`,
      descAr: t => `اهزِمْ نورَ ${_arNum(t)} ${_ar_p(t, _AR_TIME)} هذا الأسبوع.`, descEn: t => `Beat Nour ${t} time${_s(t)} this week.` },
    { key: 'draws',     metric: 'draws',     base: 3, per: 0, cpt: 25, xpt: 30,
      ar: t => `تعادَلْ ${_arNum(t)} ${_ar_p(t, _AR_TIME)}`,       en: t => `Draw ${t} game${_s(t)}`,
      descAr: t => `أنهِ ${_arNum(t)} ${_ar_p(t, _AR_MATCH)} بالتعادل هذا الأسبوع.`, descEn: t => `Draw ${t} game${_s(t)} this week.` },
  ],
};
/* فهرسٌ للقالب من mission_id (`${period}_${key}`) لإعادة اشتقاق النصّ/المكافأة. */
const MISSION_TPL_BY_ID = Object.create(null);
for (const period of ['daily', 'weekly']) {
  for (const t of MISSION_TEMPLATES[period]) MISSION_TPL_BY_ID[period + '_' + t.key] = Object.assign({ period }, t);
}

/* ══════════════════════════════════════════════════════════════════
   المتجر (المرحلة ٢): كتالوج تجميليّ بحت + دوران حتميّ كل ٤ ساعات.
   ────────────────────────────────────────────────────────────────
   كل عنصر تجميليّ فقط (إطار/خلفية/شارة/احتفال فوز/مؤثّر كش-مات) — لا
   يمسّ التقييم ولا اللعب. الأسعار حسب الندرة. الدوران دالّة نقيّة على
   epoch (رقم النافذة الزمنيّة) يتّفق عليها الخادم والعميل دون تنسيق:
   نفس الـepoch ⇒ نفس العناصر عند الجميع. الخادم مرجعُ الوقت والشراء.
   الاسمان (ar/en) يُرسَلان من الخادم مباشرةً فلا تسريب i18n ولا ازدواج. */
const STORE_PERIOD_MS = 4 * 3600 * 1000;   // نافذة الدوران: ٤ ساعات
const STORE_SLOTS = 6;                      // عدد العناصر المعروضة كل نافذة
const RARITY_PRICE = { common: 120, rare: 300, epic: 650, legendary: 1400, seasonal: 1000, mythic: 3000 };

const STORE_CATALOG = [
  // إطارات الأفاتار (تظهر حول صورة اللاعب في كل مكان — المرحلة ٣)
  { id: 'frame_gold',    type: 'frame',       rarity: 'rare',      ar: 'إطارٌ ذهبيّ',        en: 'Golden Frame' },
  { id: 'frame_neon',    type: 'frame',       rarity: 'epic',      ar: 'إطارٌ نيونيّ',       en: 'Neon Frame' },
  { id: 'frame_flame',   type: 'frame',       rarity: 'epic',      ar: 'إطارُ اللهب',        en: 'Flame Frame' },
  { id: 'frame_frost',   type: 'frame',       rarity: 'rare',      ar: 'إطارُ الصقيع',       en: 'Frost Frame' },
  { id: 'frame_royal',   type: 'frame',       rarity: 'legendary', ar: 'إطارٌ ملكيّ',        en: 'Royal Frame' },
  { id: 'frame_ocean',   type: 'frame',       rarity: 'rare',      ar: 'إطارُ المحيط',       en: 'Ocean Frame' },
  { id: 'frame_aurora',  type: 'frame',       rarity: 'legendary', ar: 'إطارُ الشفق القطبيّ', en: 'Aurora Frame' },
  // خلفيات البطاقة
  { id: 'bg_aurora',     type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ الشفق',       en: 'Aurora Background' },
  { id: 'bg_nebula',     type: 'background',  rarity: 'legendary', ar: 'خلفيّةُ السديم',      en: 'Nebula Background' },
  { id: 'bg_sunset',     type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ الغروب',      en: 'Sunset Background' },
  { id: 'bg_forest',     type: 'background',  rarity: 'common',    ar: 'خلفيّةُ الغابة',      en: 'Forest Background' },
  { id: 'bg_royal',      type: 'background',  rarity: 'epic',      ar: 'خلفيّةٌ ملكيّة',      en: 'Royal Background' },
  // شارات بجانب الاسم
  { id: 'badge_star',    type: 'badge',       rarity: 'common',    ar: 'شارةُ النجمة',        en: 'Star Badge' },
  { id: 'badge_crown',   type: 'badge',       rarity: 'legendary', ar: 'شارةُ التاج',         en: 'Crown Badge' },
  { id: 'badge_bolt',    type: 'badge',       rarity: 'rare',      ar: 'شارةُ الصاعقة',       en: 'Bolt Badge' },
  { id: 'badge_shield',  type: 'badge',       rarity: 'epic',      ar: 'شارةُ الدرع',         en: 'Shield Badge' },
  { id: 'badge_flame',   type: 'badge',       rarity: 'rare',      ar: 'شارةُ اللهب',         en: 'Flame Badge' },
  // احتفالات الفوز (تظهر عند الانتصار)
  { id: 'cel_confetti',  type: 'celebration', rarity: 'common',    ar: 'احتفالُ القصاصات',    en: 'Confetti Celebration' },
  { id: 'cel_fireworks', type: 'celebration', rarity: 'epic',      ar: 'احتفالُ الألعاب النارية', en: 'Fireworks Celebration' },
  { id: 'cel_petals',    type: 'celebration', rarity: 'rare',      ar: 'احتفالُ البتلات',     en: 'Petals Celebration' },
  { id: 'cel_stars',     type: 'celebration', rarity: 'legendary', ar: 'احتفالُ النجوم',      en: 'Starfall Celebration' },
  // مؤثّرات الكش-مات (تظهر لحظة إنهاء المباراة)
  { id: 'fx_shatter',    type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ التحطيم',      en: 'Shatter Effect' },
  { id: 'fx_lightning',  type: 'mate_fx',     rarity: 'legendary', ar: 'مؤثّرُ البرق',        en: 'Lightning Effect' },
  { id: 'fx_goldrain',   type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ المطرِ الذهبيّ', en: 'Gold Rain Effect' },
  { id: 'fx_seasonal_snow', type: 'mate_fx',  rarity: 'seasonal',  ar: 'مؤثّرُ الثلجِ الموسميّ', en: 'Seasonal Snow Effect' },

  /* ══ توسعةُ الكتالوج (المرحلة ٣): عناصرٌ أكثر بجودةٍ متحرّكة ══ */
  // إطارات إضافية
  { id: 'frame_shadow',  type: 'frame',       rarity: 'epic',      ar: 'إطارُ الظلّ',         en: 'Shadow Frame' },
  { id: 'frame_emerald', type: 'frame',       rarity: 'rare',      ar: 'إطارٌ زمرّديّ',       en: 'Emerald Frame' },
  { id: 'frame_galaxy',  type: 'frame',       rarity: 'legendary', ar: 'إطارُ المجرّة',       en: 'Galaxy Frame' },
  { id: 'frame_phoenix', type: 'frame',       rarity: 'legendary', ar: 'إطارُ العنقاء',       en: 'Phoenix Frame' },
  { id: 'frame_sakura',  type: 'frame',       rarity: 'seasonal',  ar: 'إطارُ الكرز',         en: 'Sakura Frame' },
  // خلفيات إضافية
  { id: 'bg_ocean_deep', type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ الأعماق',     en: 'Deep Ocean Background' },
  { id: 'bg_volcano',    type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ البركان',     en: 'Volcano Background' },
  { id: 'bg_galaxy',     type: 'background',  rarity: 'legendary', ar: 'خلفيّةُ المجرّة',     en: 'Galaxy Background' },
  { id: 'bg_matrix',     type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ الشيفرة',     en: 'Matrix Background' },
  { id: 'bg_cherry',     type: 'background',  rarity: 'seasonal',  ar: 'خلفيّةُ الكرز',       en: 'Cherry Blossom Background' },
  // شارات إضافية
  { id: 'badge_diamond', type: 'badge',       rarity: 'epic',      ar: 'شارةُ الألماس',       en: 'Diamond Badge' },
  { id: 'badge_skull',   type: 'badge',       rarity: 'rare',      ar: 'شارةُ الجُمجمة',      en: 'Skull Badge' },
  { id: 'badge_moon',    type: 'badge',       rarity: 'rare',      ar: 'شارةُ الهلال',        en: 'Crescent Badge' },
  { id: 'badge_gem',     type: 'badge',       rarity: 'legendary', ar: 'شارةُ الجوهرة',       en: 'Gem Badge' },
  { id: 'badge_heart',   type: 'badge',       rarity: 'common',    ar: 'شارةُ القلب',         en: 'Heart Badge' },
  // احتفالات إضافية
  { id: 'cel_coins',     type: 'celebration', rarity: 'rare',      ar: 'احتفالُ العملات',     en: 'Coin Shower Celebration' },
  { id: 'cel_balloons',  type: 'celebration', rarity: 'common',    ar: 'احتفالُ البالونات',   en: 'Balloons Celebration' },
  { id: 'cel_lasers',    type: 'celebration', rarity: 'epic',      ar: 'احتفالُ الليزر',      en: 'Laser Celebration' },
  { id: 'cel_meteor',    type: 'celebration', rarity: 'legendary', ar: 'احتفالُ الشُّهُب',     en: 'Meteor Celebration' },
  // مؤثّرات كش-مات إضافية
  { id: 'fx_flames',     type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ اللهب',        en: 'Flames Effect' },
  { id: 'fx_supernova',  type: 'mate_fx',     rarity: 'legendary', ar: 'مؤثّرُ المستعر',      en: 'Supernova Effect' },
  { id: 'fx_ink',        type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ الحبر',        en: 'Ink Effect' },
  { id: 'fx_glitch',     type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ التشويش',      en: 'Glitch Effect' },
  { id: 'fx_frostbreak', type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ الصقيع',       en: 'Frost Shatter Effect' },

  /* ══ دفعةُ Mythic (المرحلة الأخيرة — البناء ٦٠): أعلى ندرة (حمراء)، أغلى
     سعرًا، وأضخم بصريًّا. ٨ إطارات + ٦ خلفيّات + ٦ شارات + ٤ احتفال + ٤ مؤثّر
     كش-مات. كلٌّ مرسومٌ خصّيصًا في العميل (لا يسقط للمولّد العامّ). ══ */
  // إطارات Mythic (8)
  { id: 'frame_dragon',    type: 'frame',       rarity: 'mythic',    ar: 'إطارُ التنّين',       en: 'Dragon Frame' },
  { id: 'frame_celestial', type: 'frame',       rarity: 'mythic',    ar: 'إطارٌ سماويّ',        en: 'Celestial Frame' },
  { id: 'frame_inferno',   type: 'frame',       rarity: 'mythic',    ar: 'إطارُ الجحيم',        en: 'Inferno Frame' },
  { id: 'frame_void',      type: 'frame',       rarity: 'mythic',    ar: 'إطارُ الفراغ',        en: 'Void Frame' },
  { id: 'frame_thunder',   type: 'frame',       rarity: 'mythic',    ar: 'إطارُ الرعد',         en: 'Thunder Frame' },
  { id: 'frame_prism',     type: 'frame',       rarity: 'mythic',    ar: 'إطارُ المنشور',       en: 'Prism Frame' },
  { id: 'frame_seraph',    type: 'frame',       rarity: 'mythic',    ar: 'إطارٌ ملائكيّ',       en: 'Seraph Frame' },
  { id: 'frame_obsidian',  type: 'frame',       rarity: 'mythic',    ar: 'إطارُ السبج',         en: 'Obsidian Frame' },
  // خلفيّات Mythic (6)
  { id: 'bg_dragon_lair',  type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ وكرِ التنّين', en: 'Dragon Lair Background' },
  { id: 'bg_cosmos',       type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ الكون',       en: 'Cosmos Background' },
  { id: 'bg_inferno',      type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ الجحيم',      en: 'Inferno Background' },
  { id: 'bg_void',         type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ الفراغ',      en: 'Void Background' },
  { id: 'bg_thunderstorm', type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ العاصفة',     en: 'Thunderstorm Background' },
  { id: 'bg_prism',        type: 'background',  rarity: 'mythic',    ar: 'خلفيّةُ المنشور',     en: 'Prism Background' },
  // شارات Mythic (6)
  { id: 'badge_dragon',    type: 'badge',       rarity: 'mythic',    ar: 'شارةُ التنّين',       en: 'Dragon Badge' },
  { id: 'badge_phoenix',   type: 'badge',       rarity: 'mythic',    ar: 'شارةُ العنقاء',       en: 'Phoenix Badge' },
  { id: 'badge_infinity',  type: 'badge',       rarity: 'mythic',    ar: 'شارةُ اللانهاية',     en: 'Infinity Badge' },
  { id: 'badge_trophy',    type: 'badge',       rarity: 'mythic',    ar: 'شارةُ الكأس',         en: 'Trophy Badge' },
  { id: 'badge_lotus',     type: 'badge',       rarity: 'mythic',    ar: 'شارةُ اللوتس',        en: 'Lotus Badge' },
  { id: 'badge_eye',       type: 'badge',       rarity: 'mythic',    ar: 'شارةُ العين',         en: 'Eye Badge' },
  // احتفالات Mythic (4)
  { id: 'cel_dragon',      type: 'celebration', rarity: 'mythic',    ar: 'زفيرُ التنّين',       en: 'Dragon Breath Celebration' },
  { id: 'cel_galaxy',      type: 'celebration', rarity: 'mythic',    ar: 'انفجارٌ مجرّيّ',      en: 'Galaxy Burst Celebration' },
  { id: 'cel_phoenix',     type: 'celebration', rarity: 'mythic',    ar: 'نهوضُ العنقاء',       en: 'Phoenix Rise Celebration' },
  { id: 'cel_goldstorm',   type: 'celebration', rarity: 'mythic',    ar: 'عاصفةٌ ذهبيّة',       en: 'Gold Storm Celebration' },
  // مؤثّرات كش-مات Mythic (4)
  { id: 'fx_dragonfire',   type: 'mate_fx',     rarity: 'mythic',    ar: 'نارُ التنّين',        en: 'Dragonfire Effect' },
  { id: 'fx_blackhole',    type: 'mate_fx',     rarity: 'mythic',    ar: 'الثقبُ الأسود',       en: 'Black Hole Effect' },
  { id: 'fx_thunderstrike',type: 'mate_fx',     rarity: 'mythic',    ar: 'صاعقةٌ عظمى',         en: 'Thunderstrike Effect' },
  { id: 'fx_prismburst',   type: 'mate_fx',     rarity: 'mythic',    ar: 'انفجارٌ منشوريّ',     en: 'Prism Burst Effect' },

  /* ══ توسعةُ الندراتِ المتوسّطة (البناء ٦٢) ══
     العلّة: الميثِك كان ٣٦٪ من الكتالوج فكان يطلُّ في كلِّ دورةٍ تقريبًا. العلاج
     شقّان: (أ) ٤٠ عنصرًا جديدًا أغلبُها نادرٌ/ملحميّ — بجودةِ العناصرِ الفاخرةِ
     نفسِها لا حشوًا، (ب) دورانٌ موزونٌ بالندرةِ بسقفٍ صارمٍ أدناه. ══ */
  // إطاراتٌ نادرة (4)
  { id: 'frame_steel',   type: 'frame',       rarity: 'rare',      ar: 'إطارٌ فولاذيّ',       en: 'Steel Frame' },
  { id: 'frame_vine',    type: 'frame',       rarity: 'rare',      ar: 'إطارُ اللبلاب',       en: 'Vine Frame' },
  { id: 'frame_ruby',    type: 'frame',       rarity: 'rare',      ar: 'إطارُ الياقوت',       en: 'Ruby Frame' },
  { id: 'frame_sand',    type: 'frame',       rarity: 'rare',      ar: 'إطارُ الرمال',        en: 'Sand Frame' },
  // إطاراتٌ ملحميّة (4)
  { id: 'frame_tide',    type: 'frame',       rarity: 'epic',      ar: 'إطارُ المدّ',         en: 'Tide Frame' },
  { id: 'frame_storm',   type: 'frame',       rarity: 'epic',      ar: 'إطارُ العاصفة',       en: 'Storm Frame' },
  { id: 'frame_arcane',  type: 'frame',       rarity: 'epic',      ar: 'إطارُ الطلاسم',       en: 'Arcane Frame' },
  { id: 'frame_venom',   type: 'frame',       rarity: 'epic',      ar: 'إطارُ السموم',        en: 'Venom Frame' },
  // إطاراتٌ أسطوريّة (2)
  { id: 'frame_solar',   type: 'frame',       rarity: 'legendary', ar: 'إطارُ الشمس',         en: 'Solar Frame' },
  { id: 'frame_lunar',   type: 'frame',       rarity: 'legendary', ar: 'إطارُ القمر',         en: 'Lunar Frame' },
  // خلفيّاتٌ نادرة (4)
  { id: 'bg_steel',      type: 'background',  rarity: 'rare',      ar: 'خلفيّةٌ فولاذيّة',    en: 'Steel Background' },
  { id: 'bg_meadow',     type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ المرج',       en: 'Meadow Background' },
  { id: 'bg_desert',     type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ الصحراء',     en: 'Desert Background' },
  { id: 'bg_rain',       type: 'background',  rarity: 'rare',      ar: 'خلفيّةُ المطر',       en: 'Rain Background' },
  // خلفيّاتٌ ملحميّة (3)
  { id: 'bg_temple',     type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ المعبد',      en: 'Temple Background' },
  { id: 'bg_arcane',     type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ الطلاسم',     en: 'Arcane Background' },
  { id: 'bg_reef',       type: 'background',  rarity: 'epic',      ar: 'خلفيّةُ الشِّعاب',     en: 'Reef Background' },
  // خلفيّةٌ أسطوريّة (1)
  { id: 'bg_eclipse',    type: 'background',  rarity: 'legendary', ar: 'خلفيّةُ الخسوف',      en: 'Eclipse Background' },
  // شاراتٌ نادرة (4)
  { id: 'badge_anchor',  type: 'badge',       rarity: 'rare',      ar: 'شارةُ المرساة',       en: 'Anchor Badge' },
  { id: 'badge_leaf',    type: 'badge',       rarity: 'rare',      ar: 'شارةُ الورقة',        en: 'Leaf Badge' },
  { id: 'badge_sword',   type: 'badge',       rarity: 'rare',      ar: 'شارةُ السيف',         en: 'Sword Badge' },
  { id: 'badge_rook',    type: 'badge',       rarity: 'rare',      ar: 'شارةُ الحِصن',        en: 'Rook Badge' },
  // شاراتٌ ملحميّة (3)
  { id: 'badge_knight',  type: 'badge',       rarity: 'epic',      ar: 'شارةُ الفارس',        en: 'Knight Badge' },
  { id: 'badge_rune',    type: 'badge',       rarity: 'epic',      ar: 'شارةُ الطلسم',        en: 'Rune Badge' },
  { id: 'badge_wing',    type: 'badge',       rarity: 'epic',      ar: 'شارةُ الجناح',        en: 'Wing Badge' },
  // شارةٌ أسطوريّة (1)
  { id: 'badge_sun',     type: 'badge',       rarity: 'legendary', ar: 'شارةُ الشمس',         en: 'Sun Badge' },
  // احتفالاتٌ نادرة (3)
  { id: 'cel_ribbons',   type: 'celebration', rarity: 'rare',      ar: 'احتفالُ الأشرطة',     en: 'Ribbons Celebration' },
  { id: 'cel_bubbles',   type: 'celebration', rarity: 'rare',      ar: 'احتفالُ الفقاعات',    en: 'Bubbles Celebration' },
  { id: 'cel_leaves',    type: 'celebration', rarity: 'rare',      ar: 'احتفالُ الأوراق',     en: 'Leaves Celebration' },
  // احتفالاتٌ ملحميّة (3)
  { id: 'cel_sparks',    type: 'celebration', rarity: 'epic',      ar: 'احتفالُ الشرر',       en: 'Sparks Celebration' },
  { id: 'cel_aurora',    type: 'celebration', rarity: 'epic',      ar: 'احتفالُ الشفق',       en: 'Aurora Celebration' },
  { id: 'cel_crowns',    type: 'celebration', rarity: 'epic',      ar: 'احتفالُ التيجان',     en: 'Crowns Celebration' },
  // احتفالٌ أسطوريّ (1)
  { id: 'cel_sunburst',  type: 'celebration', rarity: 'legendary', ar: 'انفجارُ الشمس',       en: 'Sunburst Celebration' },
  // مؤثّراتُ كش-ماتٍ نادرة (3)
  { id: 'fx_sandstorm',  type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ العاصفةِ الرمليّة', en: 'Sandstorm Effect' },
  { id: 'fx_ripple',     type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ التموّج',       en: 'Ripple Effect' },
  { id: 'fx_leafstorm',  type: 'mate_fx',     rarity: 'rare',      ar: 'مؤثّرُ عاصفةِ الأوراق', en: 'Leaf Storm Effect' },
  // مؤثّراتٌ ملحميّة (3)
  { id: 'fx_venom',      type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ السمّ',         en: 'Venom Effect' },
  { id: 'fx_quake',      type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ الزلزال',      en: 'Quake Effect' },
  { id: 'fx_eclipse',    type: 'mate_fx',     rarity: 'epic',      ar: 'مؤثّرُ الخسوف',       en: 'Eclipse Effect' },
  // مؤثّرٌ أسطوريّ (1)
  { id: 'fx_solarflare', type: 'mate_fx',     rarity: 'legendary', ar: 'مؤثّرُ التوهّجِ الشمسيّ', en: 'Solar Flare Effect' },
];
const STORE_BY_ID = Object.create(null);
for (const it of STORE_CATALOG) { it.price = RARITY_PRICE[it.rarity] || 300; STORE_BY_ID[it.id] = it; }

/* بذرة حتميّة من الـepoch (FNV-1a) ⇒ mulberry32 ⇒ خلط Fisher-Yates.
   نفس الـepoch يعطي نفس ترتيب العناصر عند الخادم وكل العملاء. */
function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function storeEpoch(now) { return Math.floor((now == null ? Date.now() : now) / STORE_PERIOD_MS); }
/* ══ خطّةُ الدورة (البناء ٦٢) ══
   قبلًا كان الخلطُ منتظمًا على الكتالوجِ كلِّه، والميثِك ٣٦٪ منه، فكان يطلُّ
   مرّتين أو ثلاثًا في كلِّ دورةٍ فيفقدُ هيبتَه تمامًا. الآن: خانتان نادرتان،
   خانتان ملحميّتان، خانةٌ متغيّرة، وخانةُ صدارةٍ واحدةٌ فقط للأعلى ندرة
   (أسطوريّ ٥٠٪ · ميثِك ٣٣٪ · موسميّ ١٧٪) ⇒ الميثِك ≈ دورةٌ من ثلاث. */
const ROTATION_PLAN = [
  ['rare'],
  ['rare'],
  ['epic'],
  ['epic'],
  ['common', 'common', 'rare', 'epic'],
  ['legendary', 'legendary', 'legendary', 'mythic', 'mythic', 'seasonal'],
];
const RARITY_ORDER = ['rare', 'epic', 'common', 'legendary', 'seasonal', 'mythic'];
const MAX_PER_TYPE = 2;   /* تنويعُ الأنواع: لا أكثرَ من عنصرين من نوعٍ واحد */

function storeItemsForEpoch(epoch) {
  const rng = _mulberry32(_fnv1a('amkh-store:' + epoch));
  /* طابورٌ مخلوطٌ لكلِّ ندرةٍ على حِدة، بترتيبِ مفاتيحَ ثابتٍ فتبقى النتيجةُ
     حتميّةً تمامًا عند الخادمِ وكلِّ العملاءِ لنفسِ الـepoch. */
  const queues = Object.create(null);
  for (const rar of RARITY_ORDER) {
    const a = STORE_CATALOG.filter(i => i.rarity === rar);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    queues[rar] = a;
  }
  const out = [];
  const typeCount = Object.create(null);
  const take = (rar) => {
    const a = queues[rar];
    if (!a || !a.length) return false;
    for (let i = 0; i < a.length; i++) {
      const it = a[i];
      if ((typeCount[it.type] || 0) >= MAX_PER_TYPE) continue;
      a.splice(i, 1);
      typeCount[it.type] = (typeCount[it.type] || 0) + 1;
      out.push(it);
      return true;
    }
    return false;
  };
  for (let s = 0; s < STORE_SLOTS; s++) {
    const plan = ROTATION_PLAN[s % ROTATION_PLAN.length];
    if (take(plan[Math.floor(rng() * plan.length)])) continue;
    /* الطابورُ المطلوبُ فرغَ أو حجبَه سقفُ النوع ⇒ نزولٌ بترتيبٍ ثابت. */
    let done = false;
    for (const rar of RARITY_ORDER) { if (take(rar)) { done = true; break; } }
    if (!done) break;
  }
  /* شبكةُ أمان: لو ضاقت الأنواعُ ولم تكتمل الخانات، نُكمِل بترتيبٍ حتميّ. */
  if (out.length < STORE_SLOTS) {
    const have = new Set(out.map(i => i.id));
    for (const it of STORE_CATALOG) {
      if (out.length >= STORE_SLOTS) break;
      if (!have.has(it.id)) { out.push(it); have.add(it.id); }
    }
  }
  return out.slice(0, STORE_SLOTS);
}
/* لقطةُ المتجر: نعرض **كلّ** الكتالوج دائمًا (حتى المقفول) — البناء ٦٠.
   inWindow يحدّد أيّ العناصر ضمن نافذة الدوران الحاليّة (قابلة للشراء الآن)؛
   الباقي يظهر بوسمٍ «يظهر في دورته» ولا يُشترى. windowIds مرفقةٌ للعميل
   عشان يبرز عناصر الدورة ويفرزها أوّلًا. */
function storeCurrent(userId, now) {
  const t = (now == null ? Date.now() : now);
  const epoch = storeEpoch(t);
  const owned = new Set(userId ? qOwned.all(userId).map(r => r.item_id) : []);
  const windowIds = storeItemsForEpoch(epoch).map(i => i.id);
  const winSet = new Set(windowIds);
  const items = STORE_CATALOG.map(it => ({
    id: it.id, type: it.type, rarity: it.rarity, price: it.price,
    ar: it.ar, en: it.en, owned: owned.has(it.id), inWindow: winSet.has(it.id),
  }));
  return { epoch, endsAt: (epoch + 1) * STORE_PERIOD_MS, serverNow: t, periodMs: STORE_PERIOD_MS, windowIds, items };
}

/* الشراء: تحقّق ذرّيّ — العنصر ضمن النافذة الحاليّة + غير مملوك + الرصيد
   كافٍ — ثم خصمٌ في coin_ledger + إضافةُ ملكيّةٍ دائمة في user_cosmetics.
   يرجّع {ok, reason}. reason: ok | not_in_window | owned | insufficient | bad_item. */
const qOwnsItem  = db.prepare('SELECT 1 FROM user_cosmetics WHERE user_id = ? AND item_id = ? LIMIT 1');
const insCosmetic= db.prepare("INSERT OR IGNORE INTO user_cosmetics (user_id, item_id, source) VALUES (?, ?, 'store')");
function purchase(userId, itemId) {
  userId = Number(userId);
  const item = STORE_BY_ID[itemId];
  if (!userId || !item) return { ok: false, reason: 'bad_item' };
  const windowIds = new Set(storeItemsForEpoch(storeEpoch()).map(i => i.id));
  if (!windowIds.has(itemId)) return { ok: false, reason: 'not_in_window' };
  const tx = db.transaction(() => {
    ensureWallet(userId);
    if (qOwnsItem.get(userId, itemId)) return { ok: false, reason: 'owned' };
    const w = qWallet.get(userId) || { coins: 0, xp: 0 };
    if ((Number(w.coins) || 0) < item.price) return { ok: false, reason: 'insufficient' };
    insLedger.run(userId, -item.price, 0, 'buy', 'buy:' + itemId);
    updWallet.run(-item.price, 0, levelForXp(Number(w.xp) || 0), userId);
    insCosmetic.run(userId, itemId);
    return { ok: true, reason: 'ok' };
  });
  try { return tx(); } catch (e) { console.error('[economy] purchase failed:', e.message); return { ok: false, reason: 'error' }; }
}

/* ══ عبارات SQL مُجهَّزة ══ */
const qWallet   = db.prepare('SELECT coins, xp, level, granted FROM wallet WHERE user_id = ?');
const insWallet = db.prepare("INSERT OR IGNORE INTO wallet (user_id, coins, xp, level) VALUES (?, 0, 0, 1)");
const insLedger = db.prepare('INSERT INTO coin_ledger (user_id, delta, xp, reason, ref) VALUES (?,?,?,?,?)');
const updWallet = db.prepare("UPDATE wallet SET coins = coins + ?, xp = xp + ?, level = ?, updated_at = datetime('now') WHERE user_id = ?");
const qRefExists= db.prepare('SELECT 1 FROM coin_ledger WHERE user_id = ? AND ref = ? LIMIT 1');
const qStats    = db.prepare('SELECT rating, rating_games, wins, losses, draws, puzzle_solved FROM users WHERE id = ?');
const qAch      = db.prepare('SELECT ach_id FROM achievements WHERE user_id = ?');
const insAch    = db.prepare('INSERT OR IGNORE INTO achievements (user_id, ach_id) VALUES (?, ?)');
const qOwned    = db.prepare('SELECT item_id FROM user_cosmetics WHERE user_id = ?');
const qEquipped = db.prepare('SELECT equipped_frame, equipped_background, equipped_badge, equipped_celebration, equipped_mate_fx FROM users WHERE id = ?');
const qStreak   = db.prepare('SELECT win_streak FROM users WHERE id = ?');
const updStreak = db.prepare('UPDATE users SET win_streak = ? WHERE id = ?');

function ensureWallet(userId) {
  insWallet.run(userId);
}

/* المنح الجوهري: سطر في الدفتر + تحديث المحفظة المشتقّة، ذرّيًّا.
   ref اختياري لمنع التكرار (نفس الحدث لا يُمنَح مرّتين). يرجّع false لو
   الـref موجود سلفًا (تكرار مرفوض)، وإلا true. */
function grant(userId, coins, xp, reason, ref) {
  userId = Number(userId);
  if (!userId) return false;
  coins = Math.round(Number(coins) || 0);
  xp = Math.round(Number(xp) || 0);
  const tx = db.transaction(() => {
    ensureWallet(userId);
    if (ref && qRefExists.get(userId, ref)) return false;
    insLedger.run(userId, coins, xp, String(reason || 'grant'), ref || null);
    const w = qWallet.get(userId) || { xp: 0 };
    const newLevel = levelForXp((Number(w.xp) || 0) + xp);
    updWallet.run(coins, xp, newLevel, userId);
    return true;
  });
  try { return tx(); } catch (e) { console.error('[economy] grant failed:', e.message); return false; }
}

/* كسب نتيجة مباراة (يُستدعى من finalizeGame). outcome: win|draw|loss.
   reason: سبب الإنهاء من العميل ('checkmate'|'timeout'|'resign'|...) — يُستعمل
   لتقدّم مهمّة الكش-مات فقط. كلُّ زياداتِ المهام مموّنةٌ بشرط عدم التكرار
   (fresh !== false) فلا تُحسَب نفسُ المباراة مرّتين. سلسلةُ الفوز تُتبَّع على
   users.win_streak (تُزاد بالفوز، تُصفَّر بالتعادل/الخسارة). */
function awardGame(userId, outcome, roomRef, reason) {
  const key = outcome === 'win' ? 'game_win' : outcome === 'draw' ? 'game_draw' : 'game_loss';
  const a = AWARD[key];
  if (!a) return;
  // ref فريد لكل (مستخدم، غرفة، نتيجة) يمنع منح نفس المباراة مرّتين
  const fresh = grant(userId, a.coins, a.xp, key, roomRef ? `game:${roomRef}` : null);
  // تقدّم المهام: مرّةً واحدةً لكلِّ مباراة (مموّنٌ بنفس شرط عدم التكرار)
  if (fresh !== false) {
    bumpMissions(userId, 'games', 1);
    let streak = 0;
    try { const r = qStreak.get(userId); streak = r ? (Number(r.win_streak) || 0) : 0; } catch (e) {}
    if (outcome === 'win') {
      bumpMissions(userId, 'wins', 1);
      if (String(reason || '').toLowerCase().indexOf('checkmate') !== -1) bumpMissions(userId, 'checkmate', 1);
      streak = streak + 1;
      setMissionsMetric(userId, 'streak', streak);
    } else if (outcome === 'draw') {
      bumpMissions(userId, 'draws', 1);
      streak = 0;
    } else {
      streak = 0;
    }
    try { updStreak.run(streak, Number(userId)); } catch (e) {}
  }
  try { evaluateAchievements(userId); } catch (e) {}
}

/* تقييم الإنجازات: يمنح أي إنجاز استوفى شرطه ولم يُمنَح بعد.
   retroOnly=true يقتصر على الإنجازات القابلة للحساب الرجعي (عند الإطلاق). */
function evaluateAchievements(userId, retroOnly) {
  const s = statsSnapshot(userId);
  const have = new Set(qAch.all(userId).map(r => r.ach_id));
  for (const ach of ACHIEVEMENTS) {
    if (retroOnly && !ach.retro) continue;
    if (have.has(ach.id)) continue;
    let ok = false;
    try { ok = !!ach.test(s); } catch (e) { ok = false; }
    if (!ok) continue;
    insAch.run(userId, ach.id);
    grant(userId, ach.coins, ach.xp, 'ach:' + ach.id, 'ach:' + ach.id);
  }
}

function statsSnapshot(userId) {
  const u = qStats.get(userId) || {};
  /* حقولٌ إضافيّةٌ للإنجازاتِ الموسّعةِ (البناء ٦٢): السلسلةُ والمستوى وعددُ
     المقتنياتِ بندراتِها — كلُّها من سجلِّ الخادمِ فلا يمكنُ تلفيقُها. */
  let streak = 0;
  try { const st = qStreak.get(userId); streak = Number(st && st.win_streak) || 0; } catch (e) {}
  let xp = 0;
  try { const w = qWallet.get(userId); xp = Number(w && w.xp) || 0; } catch (e) {}
  let owned = 0, mythic = 0, legendary = 0;
  try {
    for (const r of qOwned.all(userId)) {
      owned++;
      const it = STORE_BY_ID[r.item_id];
      if (!it) continue;
      if (it.rarity === 'mythic') mythic++;
      else if (it.rarity === 'legendary') legendary++;
    }
  } catch (e) {}
  return {
    rating: Math.round(Number(u.rating) || 1500),
    games: Number(u.rating_games) || ((Number(u.wins) || 0) + (Number(u.losses) || 0) + (Number(u.draws) || 0)),
    wins: Number(u.wins) || 0,
    losses: Number(u.losses) || 0,
    draws: Number(u.draws) || 0,
    puzzles: Number(u.puzzle_solved) || 0,
    streak, owned, mythic, legendary,
    level: levelForXp(xp),
  };
}

/* منحة الإطلاق + الحساب الرجعي: مرّة واحدة لكل حساب (wallet.granted). */
function ensureLaunchGrant(userId) {
  ensureWallet(userId);
  const w = qWallet.get(userId);
  if (w && w.granted) return;
  grant(userId, WELCOME_COINS, 0, 'grant', 'welcome');
  try { evaluateAchievements(userId, true); } catch (e) {}
  db.prepare('UPDATE wallet SET granted = 1 WHERE user_id = ?').run(userId);
}

/* لقطة كاملة للعميل (مرآة قراءة فقط — العميل لا يكتبها للخادم). */
function snapshot(userId) {
  ensureLaunchGrant(userId);
  const w = qWallet.get(userId) || { coins: 0, xp: 0, level: 1 };
  const eq = qEquipped.get(userId) || {};
  return {
    coins: Number(w.coins) || 0,
    xp: Number(w.xp) || 0,
    level: Number(w.level) || 1,
    nextLevelXp: xpToReach((Number(w.level) || 1) + 1),
    thisLevelXp: xpToReach(Number(w.level) || 1),
    maxLevel: MAX_LEVEL,
    owned: qOwned.all(userId).map(r => r.item_id),
    achievements: qAch.all(userId).map(r => r.ach_id),
    missions: missionsSnapshot(userId),
    equipped: {
      frame: eq.equipped_frame || null,
      background: eq.equipped_background || null,
      badge: eq.equipped_badge || null,
      celebration: eq.equipped_celebration || null,
      mate_fx: eq.equipped_mate_fx || null,
    },
  };
}

/* ══ التجهيز (المرحلة ٣): وضعُ عنصرٍ مملوك في خانته، أو إلغاؤه ══
   الخانات على جدول users (لا في blob العميل) عشان تظهر عند الآخرين. */
const EQUIP_COL = {
  frame: 'equipped_frame',
  background: 'equipped_background',
  badge: 'equipped_badge',
  celebration: 'equipped_celebration',
  mate_fx: 'equipped_mate_fx',
};
const _updEquip = {};
for (const t in EQUIP_COL) { _updEquip[t] = db.prepare('UPDATE users SET ' + EQUIP_COL[t] + ' = ? WHERE id = ?'); }

/* تجهيز عنصرٍ مملوك (itemId) أو إلغاء تجهيز نوعٍ (itemId فارغ + type). */
function equip(userId, itemId, type) {
  userId = Number(userId);
  if (!userId) return { ok: false, reason: 'bad_user' };
  if (!itemId) {
    if (!EQUIP_COL[type]) return { ok: false, reason: 'bad_type' };
    _updEquip[type].run(null, userId);
    return { ok: true, reason: 'unequipped' };
  }
  const item = STORE_BY_ID[itemId];
  if (!item || !EQUIP_COL[item.type]) return { ok: false, reason: 'bad_item' };
  if (!qOwnsItem.get(userId, itemId)) return { ok: false, reason: 'not_owned' };
  _updEquip[item.type].run(itemId, userId);
  return { ok: true, reason: 'ok' };
}

/* الحقول التجميليّة المُجهَّزة لمستخدم — للمُسلسِلات كي تظهر عند الآخرين.
   يرجّع null لو لا شيء مُجهَّز (حمولة أصغر؛ العميل يفحص الوجود). */
const qCos = db.prepare('SELECT equipped_frame f, equipped_background bg, equipped_badge b, equipped_celebration c, equipped_mate_fx m FROM users WHERE id = ?');
function cosmeticsFor(userId) {
  const r = qCos.get(Number(userId)) || {};
  if (!r.f && !r.bg && !r.b && !r.c && !r.m) return null;
  const o = {};
  if (r.f) o.frame = r.f;
  if (r.bg) o.background = r.bg;
  if (r.b) o.badge = r.b;
  if (r.c) o.celebration = r.c;
  if (r.m) o.mate_fx = r.m;
  return o;
}

/* عدد الألغاز المكسِبة اليوم (سقف يومي مضادّ للتفريخ). */
const qPuzzleToday = db.prepare(
  "SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = ? AND reason = 'puzzle' AND date(created_at) = date('now')"
);

/* ══ المهام: مفاتيح الدورة + التقدّم + المطالبة (المرحلة ٤) ══
   period_key يعزل كلَّ يومٍ/أسبوعٍ عن غيره فلا تُطالَب مكافأةٌ مرّتين. */
function _dayKey(d) {
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}
function _weekKey(d) {
  // مفتاح أسبوع ISO-8601 (الأسبوع يبدأ الاثنين، الأسبوع ١ يحوي أوّل خميس).
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;            // الاثنين=0 … الأحد=6
  t.setUTCDate(t.getUTCDate() - day + 3);          // خميس هذا الأسبوع
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
function periodKey(period, now) {
  const d = (now == null) ? new Date() : new Date(now);
  return period === 'weekly' ? _weekKey(d) : _dayKey(d);
}

const qMissionRow = db.prepare('SELECT progress, target, claimed FROM missions WHERE user_id = ? AND mission_id = ? AND period_key = ?');
const insMissionRow = db.prepare('INSERT OR IGNORE INTO missions (user_id, mission_id, period, period_key, progress, target, claimed) VALUES (?,?,?,?,?,?,0)');
const updMissionProg = db.prepare("UPDATE missions SET progress = MIN(target, progress + ?), updated_at = datetime('now') WHERE user_id = ? AND mission_id = ? AND period_key = ?");
const setMissionMax  = db.prepare("UPDATE missions SET progress = MAX(progress, MIN(target, ?)), updated_at = datetime('now') WHERE user_id = ? AND mission_id = ? AND period_key = ?");
const setMissionClaimed = db.prepare("UPDATE missions SET claimed = 1, updated_at = datetime('now') WHERE user_id = ? AND mission_id = ? AND period_key = ?");
const qMissionCount = db.prepare('SELECT COUNT(*) AS n FROM missions WHERE user_id = ? AND period = ? AND period_key = ?');
const qMissionsForPeriod = db.prepare('SELECT mission_id, progress, target, claimed FROM missions WHERE user_id = ? AND period = ? AND period_key = ?');
/* حذفُ صفِّ مهمّةٍ مهجورةٍ (قالبُها لم يعد موجودًا بعد تحديث) — لازمٌ لأنّ
   بقاءَها كان يخنقُ بذرَ الدورة. البناء ٦٢. */
const delMissionRow = db.prepare('DELETE FROM missions WHERE user_id = ? AND mission_id = ? AND period_key = ?');

/* ══ التوليد الذكيّ للمهام (البناء ٦٠) ══ */
function _levelOf(userId) { const w = qWallet.get(userId); return w ? (Number(w.level) || 1) : 1; }
function _targetFor(tpl, level) { return Math.max(1, tpl.base + tpl.per * Math.floor((Number(level) || 1) / 5)); }

/* أوزانُ الترجيح مشتقّةٌ من سلوك اللاعب الفعليّ (التكيّف). كلّما لعب/فاز/حلّ
   أكثر في محورٍ ما رجّحنا مهامّه — مع إبقاء «العَبْ» حاضرًا دائمًا للجميع. */
function _weights(stats) {
  const g = Number(stats.games) || 0, w = Number(stats.wins) || 0, d = Number(stats.draws) || 0, p = Number(stats.puzzles) || 0;
  const winRate = g ? w / g : 0.4;
  const drawRate = g ? d / g : 0.1;
  const puzRate = (p + g) ? p / (p + g) : 0.3;
  return {
    games:     1.0,
    wins:      0.8 + winRate * 1.2,
    puzzles:   0.5 + puzRate * 2.0,
    checkmate: 0.6 + winRate * 1.0,
    streak:    0.4 + winRate * 1.6,
    nour:      0.45,
    draws:     0.3 + drawRate * 2.5,
  };
}
/* اختيارُ ٣ قوالبَ متمايزةٍ بترجيحٍ بلا إبدال، باستخدام rng حتميّ. */
function _pick3(templates, weights, rng) {
  const pool = templates.map(t => ({ t, w: Math.max(0.05, weights[t.metric] || 0.3) }));
  const out = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = rng() * total, idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx].t);
    pool.splice(idx, 1);
  }
  return out;
}
/* بذرُ مهامِّ الدورة مرّةً واحدة (حتميّة + تُثبَّت في الجدول فلا تتغيّر لو
   تبدّلت الإحصاءات لاحقًا). يُستدعى من كلِّ مسار يلمس المهام. */
function ensureSeeded(userId, period) {
  const pk = periodKey(period);
  /* العدُّ الأعمى (COUNT) كان يخنقُ الدورةَ: لو تبدّلت أسماءُ القوالبِ في
     تحديثٍ (w_play20 ⇒ weekly_games) تبقى صفوفُ الدورةِ القديمةِ في الجدول،
     فالعدُّ > 0 فيرجع فورًا بلا بذرٍ، ثمّ يسقطُها العرضُ لأنّ قالبَها اختفى
     ⇒ صفرُ مهامٍّ أسبوعيّةٍ حتى الاثنين القادم. الصحيحُ: نعدُّ الصفوفَ الحيّةَ
     فقط، ونحذفُ المهجورةَ، ونُكمِلُ الناقصَ (INSERT OR IGNORE ذرّيٌّ على
     المفتاحِ الأساسيِّ فلا يلمسُ تقدّمًا قائمًا). البناء ٦٢. */
  let live = 0;
  const stale = [];
  try {
    for (const row of qMissionsForPeriod.all(userId, period, pk)) {
      if (MISSION_TPL_BY_ID[row.mission_id]) live++; else stale.push(row.mission_id);
    }
  } catch (e) {}
  if (stale.length) {
    try { db.transaction(() => { for (const id of stale) delMissionRow.run(userId, id, pk); })(); }
    catch (e) { console.error('[economy] purge stale missions', e.message); }
  }
  if (live >= 3) return pk;
  const level = _levelOf(userId);
  const stats = statsSnapshot(userId);
  const rng = _mulberry32(_fnv1a('missions:' + period + ':' + pk + ':' + userId));
  const chosen = _pick3(MISSION_TEMPLATES[period], _weights(stats), rng);
  try {
    db.transaction(() => {
      for (const tpl of chosen) insMissionRow.run(userId, period + '_' + tpl.key, period, pk, 0, _targetFor(tpl, level));
    })();
  } catch (e) { console.error('[economy] seed missions', e.message); }
  return pk;
}
/* بناءُ كائن المهمّة الكامل من صفٍّ + قالبه (النصّ/المكافأة تُشتقّ من target). */
function _missionView(tpl, row) {
  const target = Number(row.target) || _targetFor(tpl, 1);
  const raw = Number(row.progress) || 0;
  return {
    id: tpl.period + '_' + tpl.key, period: tpl.period, metric: tpl.metric, target,
    progress: Math.min(target, raw), claimed: !!row.claimed, done: raw >= target,
    coins: tpl.cpt * target, xp: tpl.xpt * target,
    ar: tpl.ar(target), en: tpl.en(target), descAr: tpl.descAr(target), descEn: tpl.descEn(target),
  };
}
/* تطبيقُ دالّةٍ على كلِّ مهمّةٍ مبذورةٍ تتبع هذا الـmetric في كلا الدورتين. */
function _applyMetric(userId, metric, fn) {
  for (const period of ['daily', 'weekly']) {
    const pk = ensureSeeded(userId, period);
    for (const row of qMissionsForPeriod.all(userId, period, pk)) {
      const tpl = MISSION_TPL_BY_ID[row.mission_id];
      if (tpl && tpl.metric === metric) fn(row.mission_id, pk);
    }
  }
}

/* رفعُ تقدّم كلِّ مهمّةٍ تتبع هذا الـmetric بمقدار amount (مقصوصٌ عند
   الهدف، تراكميّ). يُستدعى من أحداثٍ موثّقة فقط (نهاية مباراة/حلّ لغز/نور). */
function bumpMissions(userId, metric, amount) {
  userId = Number(userId);
  amount = Math.max(1, Math.round(Number(amount) || 1));
  if (!userId) return;
  try {
    db.transaction(() => {
      _applyMetric(userId, metric, (missionId, pk) => updMissionProg.run(amount, userId, missionId, pk));
    })();
  } catch (e) { console.error('[economy] bumpMissions', e.message); }
}

/* تعيينُ تقدّمِ مهامِّ metric بقيمةٍ مطلقةٍ بحدٍّ أقصى (لا تراكم) — لمهمّة
   «سلسلة الفوز»: التقدّم = أطولُ سلسلةٍ بلغها اللاعب في الدورة، لا مجموعها. */
function setMissionsMetric(userId, metric, value) {
  userId = Number(userId);
  value = Math.max(0, Math.round(Number(value) || 0));
  if (!userId) return;
  try {
    db.transaction(() => {
      _applyMetric(userId, metric, (missionId, pk) => setMissionMax.run(value, userId, missionId, pk));
    })();
  } catch (e) { console.error('[economy] setMissionsMetric', e.message); }
}

/* لقطةُ مهام الدورة الحاليّة (٣ يوميّة + ٣ أسبوعيّة مولّدة) مع التقدّم والمطالبة.
   تحمل الآن ar/en/descAr/descEn/target/coins/xp كاملةً (لا كتالوج ثابت). */
function missionsSnapshot(userId) {
  userId = Number(userId);
  const out = [];
  for (const period of ['daily', 'weekly']) {
    const pk = ensureSeeded(userId, period);
    for (const row of qMissionsForPeriod.all(userId, period, pk)) {
      const tpl = MISSION_TPL_BY_ID[row.mission_id];
      if (tpl) out.push(_missionView(tpl, row));
    }
  }
  return out;
}

/* مطالبةُ مكافأة مهمّةٍ مكتملة (مرّة واحدة لكلِّ دورة). لا يمكن المطالبة إلا
   بمهمّةٍ مبذورةٍ فعلًا هذه الدورة (ضمن الـ٣ المختارة) وبلغت هدفها. */
function claimMission(userId, missionId) {
  userId = Number(userId);
  const tpl = MISSION_TPL_BY_ID[missionId];
  if (!userId || !tpl) return { ok: false, reason: 'bad_mission' };
  const pk = ensureSeeded(userId, tpl.period);
  const tx = db.transaction(() => {
    const row = qMissionRow.get(userId, missionId, pk);
    if (!row) return { ok: false, reason: 'incomplete' };  // غير مختارةٍ هذه الدورة
    const target = Number(row.target) || _targetFor(tpl, 1);
    if ((Number(row.progress) || 0) < target) return { ok: false, reason: 'incomplete' };
    if (row.claimed) return { ok: false, reason: 'claimed' };
    setMissionClaimed.run(userId, missionId, pk);
    grant(userId, tpl.cpt * target, tpl.xpt * target, 'mission:' + missionId, 'mission:' + missionId + ':' + pk);
    return { ok: true, reason: 'ok' };
  });
  try { return tx(); } catch (e) { console.error('[economy] claimMission', e.message); return { ok: false, reason: 'error' }; }
}

/* كتالوج ثابت ثنائيّ اللغة للعميل (إنجازات + عناصر) — يُجلَب مرّةً.
   المهامّ لم تعد ثابتةً (مولّدة لكلّ لاعب) فمصدرُ عرضِها صار snapshot.missions؛
   نُبقي missions:[] للتوافق مع العملاء القدامى فقط. */
function catalog() {
  return {
    achievements: ACHIEVEMENTS.map(a => ({
      id: a.id, coins: a.coins, xp: a.xp, icon: a.icon || 'medal',
      tier: a.tier || 'bronze', cat: a.cat || 'battle',
      ar: a.ar, en: a.en, descAr: a.descAr, descEn: a.descEn,
    })),
    missions: [],
    items: STORE_CATALOG.map(it => ({
      id: it.id, type: it.type, rarity: it.rarity, price: it.price, ar: it.ar, en: it.en,
    })),
  };
}

/* ══ المسارات ══ */
router.get('/me', authenticateToken, (req, res) => {
  /* تقييمُ الإنجازاتِ عند كلِّ فتحٍ للشاشة: الإنجازاتُ الجديدةُ (البناء ٦٢)
     تُفتَحُ فورًا من سجلِّ الخادمِ بلا انتظارِ مباراةٍ جديدة. المنحُ ذرّيٌّ
     ولا يتكرّرُ (achievements + مرجعٌ فريدٌ في coin_ledger). */
  try { ensureWallet(req.user.id); evaluateAchievements(req.user.id); } catch (e) {}
  try { res.json(snapshot(req.user.id)); }
  catch (e) { console.error('[economy] /me', e.message); res.status(500).json({ error: 'economy_error' }); }
});

/* كتالوج ثابت (إنجازات + مهامّ) ثنائيّ اللغة — يُجلَب مرّةً ويُخزَّن عميليًّا. */
router.get('/catalog', authenticateToken, (req, res) => {
  try { res.json(catalog()); }
  catch (e) { console.error('[economy] /catalog', e.message); res.status(500).json({ error: 'economy_error' }); }
});

/* مطالبةُ مكافأة مهمّةٍ مكتملة. */
router.post('/claim-mission', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const missionId = (req.body && req.body.missionId != null) ? String(req.body.missionId).slice(0, 40) : '';
  try {
    ensureWallet(userId);
    const r = claimMission(userId, missionId);
    res.json({ ...r, ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /claim-mission', e.message);
    res.status(500).json({ error: 'economy_error' });
  }
});

/* حلّ لغز: كسب موثّق مع سقف يومي ومنع تكرار نفس اللغز في نفس اليوم.
   التحقّق أساسيّ (السقف + التكرار)؛ الحلّ الفعلي يُتحقّق على الجهاز، لكن
   الخادم يمنع التفريخ. */
router.post('/puzzle-solved', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const pid = (req.body && (req.body.puzzleId != null)) ? String(req.body.puzzleId).slice(0, 40) : '';
  try {
    ensureWallet(userId);
    const today = qPuzzleToday.get(userId).n;
    if (today >= PUZZLE_DAILY_CAP) return res.json({ awarded: false, reason: 'daily_cap', ...snapshot(userId) });
    const day = new Date().toISOString().slice(0, 10);
    const ref = pid ? `pz:${pid}:${day}` : `pz:anon:${day}:${today}`;
    const ok = grant(userId, AWARD.puzzle.coins, AWARD.puzzle.xp, 'puzzle', ref);
    if (ok) bumpMissions(userId, 'puzzles', 1);
    try { evaluateAchievements(userId); } catch (e) {}
    return res.json({ awarded: ok, reason: ok ? 'ok' : 'dup', ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /puzzle-solved', e.message);
    res.status(500).json({ error: 'economy_error' });
  }
});

/* حدث «هزيمة نور» من العميل (وضع اللعب ضدّ نور) — يُمنح مرّة واحدة. */
router.post('/beat-nour', authenticateToken, (req, res) => {
  const userId = req.user.id;
  try {
    ensureWallet(userId);
    const have = new Set(qAch.all(userId).map(r => r.ach_id));
    let awarded = false;
    if (!have.has('beat_nour')) {
      insAch.run(userId, 'beat_nour');
      grant(userId, AWARD.beat_nour.coins, AWARD.beat_nour.xp, 'ach:beat_nour', 'ach:beat_nour');
      awarded = true;
    }
    // مهمّة «هزيمة نور» متكرّرة كلَّ دورة (مقصوصةٌ عند الهدف) بخلاف الإنجاز
    // الذي يُمنح مرّةً واحدةً مدى الحياة.
    bumpMissions(userId, 'nour', 1);
    res.json({ awarded, ...snapshot(userId) });
  } catch (e) { res.status(500).json({ error: 'economy_error' }); }
});

/* ══ متجر: النافذة الحاليّة + الشراء ══ */
router.get('/store/current', authenticateToken, (req, res) => {
  try { res.json(storeCurrent(req.user.id)); }
  catch (e) { console.error('[economy] /store/current', e.message); res.status(500).json({ error: 'store_error' }); }
});
router.post('/store/buy', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const itemId = (req.body && req.body.itemId != null) ? String(req.body.itemId).slice(0, 40) : '';
  try {
    ensureWallet(userId);
    const r = purchase(userId, itemId);
    /* إنجازاتُ المقتنياتِ تُقاسُ من المخزونِ فتُقيَّمُ بعدَ كلِّ شراءٍ ناجح. */
    if (r && r.ok) { try { evaluateAchievements(userId); } catch (e) {} }
    res.json({ ...r, store: storeCurrent(userId), ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /store/buy', e.message);
    res.status(500).json({ error: 'store_error' });
  }
});

/* تجهيز/إلغاء عنصر تجميلي (يظهر فورًا عند الآخرين بعد المزامنة). */
router.post('/equip', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const itemId = (req.body && req.body.itemId != null) ? String(req.body.itemId).slice(0, 40) : '';
  const type   = (req.body && req.body.type   != null) ? String(req.body.type).slice(0, 20)   : '';
  try {
    const r = equip(userId, itemId, type);
    res.json({ ...r, ...snapshot(userId) });
  } catch (e) {
    console.error('[economy] /equip', e.message);
    res.status(500).json({ error: 'economy_error' });
  }
});

module.exports = {
  router,
  grant,
  awardGame,
  evaluateAchievements,
  ensureLaunchGrant,
  snapshot,
  equip,
  cosmeticsFor,
  levelForXp,
  xpToReach,
  purchase,
  storeCurrent,
  storeItemsForEpoch,
  storeEpoch,
  bumpMissions,
  setMissionsMetric,
  missionsSnapshot,
  claimMission,
  ensureSeeded,
  periodKey,
  catalog,
  AWARD,
  ACHIEVEMENTS,
  MISSION_TEMPLATES,
  STORE_CATALOG,
  STORE_PERIOD_MS,
};

