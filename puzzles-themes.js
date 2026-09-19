/* ══════════════════════════════════════════════════════════════════
   PUZZLES — معجم مواضيع الألغاز (عربي/إنجليزي)
   ══════════════════════════════════════════════════════════════════
   أرشيف lichess بيوسم كل لغز بمواضيع بالإنجليزية (fork, backRankMate…).
   الملف ده هو الترجمة الرسمية بتاعتنا للمواضيع دي: الاسم بالعربية
   والإنجليزية، ووصف الفكرة اللي نور بيقولها بعد الحلّ.

   لماذا الاسمان مكتوبان هنا صراحةً لا في i18n-en.js: المفتاح هنا
   إنجليزي قادم من قاعدة بيانات (fork) مش نصّ عربي على الشاشة، فمسح
   الـDOM مالوش شغل بيه. فبنخزّن الزوج (ar,en) ونختار باللغة الحالية
   عبر LP — نفس سلوك باقي التطبيق، ولغة واحدة نظيفة في كل وضع.

   ★ النصوص كلها من كتابتنا. ترجمات lichess تحت AGPL فممنوع نسخها؛
     تعريفات الأنماط نفسها حقائق شطرنجية معروفة، والصياغة صياغتنا.

   ★ الحرق (spoiler): تسمية موضوع اللغز قبل الحلّ بتحرقه. «شوكة» تعني
     «ابحث عن نقلة تهدّد هدفين» — وده نصّ الحلّ تقريبًا. فكل موضوع له
     علم s؛ الواجهة ماتعرضش الأسماء المحروقة إلّا بعد الحلّ (أو لو
     اللاعب هو اللي اختار الموضوع بنفسه، فهو عارفه أصلًا).

   ★ سطر الهدف قبل اللغز بييجي من «نتيجة» اللغز لا من نمطه: «المات في
     نقلتين» مش محروق، «الاجتذاب» محروق.

   المصطلحات ملتزمة بمعجم التطبيق: وزير، رخّ، فيل، حصان، بيدق، كش،
   كش مات — زي ما هي في i18n-en.js بالظبط.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const PZT = (() => {

  function L(ar, en) {
    return (typeof LP === 'function') ? LP(ar, en) : ar;
  }

  /* g = المجموعة، s = محروق (1) أو آمن للعرض قبل الحلّ (0)
     iAr/iEn = الفكرة التي يسمّيها نور بعد الحلّ */
  const T = {

    /* ───────── الأطوار والنهايات ───────── */
    opening:          { g: 'phase', s: 0, ar: 'الافتتاح', en: 'Opening' },
    middlegame:       { g: 'phase', s: 0, ar: 'وسط المباراة', en: 'Middlegame' },
    endgame:          { g: 'phase', s: 0, ar: 'النهاية', en: 'Endgame' },
    rookEndgame:      { g: 'phase', s: 0, ar: 'نهاية الرخّ', en: 'Rook endgame' },
    bishopEndgame:    { g: 'phase', s: 0, ar: 'نهاية الفيل', en: 'Bishop endgame' },
    knightEndgame:    { g: 'phase', s: 0, ar: 'نهاية الحصان', en: 'Knight endgame' },
    pawnEndgame:      { g: 'phase', s: 0, ar: 'نهاية البيدق', en: 'Pawn endgame' },
    queenEndgame:     { g: 'phase', s: 0, ar: 'نهاية الوزير', en: 'Queen endgame' },
    queenRookEndgame: { g: 'phase', s: 0, ar: 'نهاية الوزير والرخّ', en: 'Queen and rook endgame' },

    /* ───────── النتيجة المطلوبة ───────── */
    mate:          { g: 'goal', s: 0, ar: 'كش مات', en: 'Checkmate' },
    mateIn1:       { g: 'goal', s: 0, ar: 'مات في نقلة', en: 'Mate in 1' },
    mateIn2:       { g: 'goal', s: 0, ar: 'مات في نقلتين', en: 'Mate in 2' },
    mateIn3:       { g: 'goal', s: 0, ar: 'مات في ثلاث نقلات', en: 'Mate in 3' },
    mateIn4:       { g: 'goal', s: 0, ar: 'مات في أربع نقلات', en: 'Mate in 4' },
    mateIn5:       { g: 'goal', s: 0, ar: 'مات في خمس نقلات', en: 'Mate in 5' },
    crushing:      { g: 'goal', s: 0, ar: 'ميزة حاسمة', en: 'Crushing' },
    advantage:     { g: 'goal', s: 0, ar: 'ميزة', en: 'Advantage' },
    equality:      { g: 'goal', s: 0, ar: 'التعادل', en: 'Equality' },
    defensiveMove: { g: 'goal', s: 0, ar: 'نقلة دفاعية', en: 'Defensive move' },

    /* ───────── الطول ───────── */
    oneMove:  { g: 'length', s: 0, ar: 'نقلة واحدة', en: 'One move' },
    short:    { g: 'length', s: 0, ar: 'قصير', en: 'Short' },
    long:     { g: 'length', s: 0, ar: 'طويل', en: 'Long' },
    veryLong: { g: 'length', s: 0, ar: 'طويل جدًّا', en: 'Very long' },

    /* ───────── المصدر ───────── */
    master:         { g: 'origin', s: 0, ar: 'من مباراة أستاذ', en: 'Master game' },
    masterVsMaster: { g: 'origin', s: 0, ar: 'أستاذ ضدّ أستاذ', en: 'Master vs master' },
    superGM:        { g: 'origin', s: 0, ar: 'من مباريات النخبة', en: 'Super GM' },
    playerGames:    { g: 'origin', s: 0, ar: 'من مباريات اللاعبين', en: 'Player games' },
    mix:            { g: 'origin', s: 0, ar: 'تشكيلة متنوّعة', en: 'Healthy mix' },
    healthyMix:     { g: 'origin', s: 0, ar: 'تشكيلة متنوّعة', en: 'Healthy mix' },

    /* ───────── الأنماط التكتيكية ───────── */
    fork: {
      g: 'motif', s: 1, ar: 'الشوكة', en: 'Fork',
      iAr: 'قطعة واحدة هدّدت هدفين في نقلة واحدة، فلا يمكن إنقاذهما معًا.',
      iEn: 'One piece attacked two targets at once, and both could not be saved.',
    },
    pin: {
      g: 'motif', s: 1, ar: 'التثبيت', en: 'Pin',
      iAr: 'قطعة لا تستطيع التحرّك لأنّ خلفها ما هو أغلى منها.',
      iEn: 'A piece could not move because something more valuable stood behind it.',
    },
    skewer: {
      g: 'motif', s: 1, ar: 'السَّفُّود', en: 'Skewer',
      iAr: 'الأغلى في المقدّمة هذه المرّة، فلمّا فرّ سقط ما كان خلفه — عكس التثبيت.',
      iEn: 'The valuable piece stood in front; when it fled, the one behind it fell.',
    },
    discoveredAttack: {
      g: 'motif', s: 1, ar: 'الهجوم المكشوف', en: 'Discovered attack',
      iAr: 'تحرّكت القطعة الأمامية فانكشف هجوم القطعة التي كانت تحجبها.',
      iEn: 'The front piece moved away and unveiled the attack of the piece behind it.',
    },
    discoveredCheck: {
      g: 'motif', s: 1, ar: 'الكش المكشوف', en: 'Discovered check',
      iAr: 'النقلة نفسها لم تهدّد الملك، بل كشفت عنه خطًّا كان مسدودًا.',
      iEn: 'The move itself did not give check; it opened a line that was blocked.',
    },
    doubleCheck: {
      g: 'motif', s: 1, ar: 'الكش المزدوج', en: 'Double check',
      iAr: 'كشّان في نقلة واحدة، ولا يُدفع كشّان بحجب ولا بأخذ — على الملك أن يفرّ.',
      iEn: 'Two checks in one move; neither blocking nor capturing helps, the king must run.',
    },
    deflection: {
      g: 'motif', s: 1, ar: 'الإبعاد', en: 'Deflection',
      iAr: 'أُلزِمت القطعة المدافعة بأمر آخر، فتركت ما كانت تحميه.',
      iEn: 'The defending piece was given a bigger duty, so it abandoned what it guarded.',
    },
    attraction: {
      g: 'motif', s: 1, ar: 'الاجتذاب', en: 'Attraction',
      iAr: 'جُذِبت قطعة الخصم إلى مربّع بدا مكسبًا وكان فخًّا.',
      iEn: 'An enemy piece was lured to a square that looked like a gift and was a trap.',
    },
    interference: {
      g: 'motif', s: 1, ar: 'الاعتراض', en: 'Interference',
      iAr: 'حُشِرت قطعة بين المدافع ومن يدافع عنه، فانقطع الخطّ وبقي الهدف وحده.',
      iEn: 'A piece was wedged between defender and defended, cutting the line.',
    },
    clearance: {
      g: 'motif', s: 1, ar: 'التخلية', en: 'Clearance',
      iAr: 'أُفرِغ المربّع أو الخطّ أوّلًا لتمرّ منه الفكرة الحقيقية بعده.',
      iEn: 'A square or line was vacated first so the real idea could pass through it.',
    },
    intermezzo: {
      g: 'motif', s: 1, ar: 'النقلة الوسيطة', en: 'Intermezzo',
      iAr: 'قبل النقلة المتوقّعة جاء تهديد لا يُهمَل، فوجب الردّ عليه أوّلًا.',
      iEn: 'Before the expected move came a threat that had to be answered first.',
    },
    sacrifice: {
      g: 'motif', s: 1, ar: 'التضحية', en: 'Sacrifice',
      iAr: 'بُذِلت مادّة لفتح طريق لا يُغلق بعده.',
      iEn: 'Material was given up to open a road that could not be closed again.',
    },
    quietMove: {
      g: 'motif', s: 1, ar: 'النقلة الهادئة', en: 'Quiet move',
      iAr: 'لا كش ولا أخذ ولا تهديد ظاهر، ومع ذلك لا جواب لها.',
      iEn: 'No check, no capture, no visible threat, and yet there was no answer to it.',
    },
    xRayAttack: {
      g: 'motif', s: 1, ar: 'الهجوم النافذ', en: 'X-ray attack',
      iAr: 'خطّ نفَذ عبر قطعة الخصم إلى المربّع الذي خلفها.',
      iEn: 'A line worked straight through an enemy piece to the square beyond it.',
    },
    zugzwang: {
      g: 'motif', s: 1, ar: 'ضيق النقلة', en: 'Zugzwang',
      iAr: 'كل نقلة متاحة للخصم تُسيء موقفه — أن يكون الدور له هو العقوبة نفسها.',
      iEn: 'Every legal move made the opponent worse off; having to move was the punishment.',
    },
    hangingPiece: {
      g: 'motif', s: 1, ar: 'القطعة المعلّقة', en: 'Hanging piece',
      iAr: 'قطعة بلا حامٍ، ومن يراها قبل خصمه يربح.',
      iEn: 'A piece left undefended, and whoever spots it first wins it.',
    },
    trappedPiece: {
      g: 'motif', s: 1, ar: 'القطعة المحصورة', en: 'Trapped piece',
      iAr: 'قطعة لا مهرب لها، فسقوطها مسألة وقت لا مسألة قوّة.',
      iEn: 'A piece with nowhere to go; winning it was a matter of time, not force.',
    },
    capturingDefender: {
      g: 'motif', s: 1, ar: 'إزالة المدافع', en: 'Capture the defender',
      iAr: 'أُخِذ المدافع أوّلًا، فسقط ما كان يحميه بعده.',
      iEn: 'The defender was captured first, and what it protected fell next.',
    },
    advancedPawn: {
      g: 'motif', s: 1, ar: 'البيدق المتقدّم', en: 'Advanced pawn',
      iAr: 'بيدق بلغ عمق أرض الخصم، فصار أخطر من قطعة كاملة.',
      iEn: 'A pawn deep in enemy territory became more dangerous than a whole piece.',
    },
    promotion: {
      g: 'motif', s: 1, ar: 'الترقية', en: 'Promotion',
      iAr: 'وصل البيدق إلى آخر الرقعة فتغيّرت قيمة الموقف كلّه.',
      iEn: 'The pawn reached the last rank and the whole balance changed.',
    },
    underPromotion: {
      g: 'motif', s: 1, ar: 'الترقية الناقصة', en: 'Underpromotion',
      iAr: 'الوزير كان خطأً هنا؛ الحصان أو الفيل أو الرخّ هو الذي يكسب.',
      iEn: 'A queen would have been wrong here; a knight, bishop or rook was the winner.',
    },
    enPassant: {
      g: 'motif', s: 1, ar: 'الأخذ بالمرور', en: 'En passant',
      iAr: 'بيدق أخذ بيدقًا مرّ بجانبه — القاعدة التي يُنسى وجودها.',
      iEn: 'A pawn captured one that slipped past it, the rule everyone forgets.',
    },
    castling: {
      g: 'motif', s: 1, ar: 'التبييت', en: 'Castling',
      iAr: 'التبييت نفسه كان النقلة: الملك إلى الأمان والرخّ إلى العمل في آن.',
      iEn: 'Castling itself was the move: the king to safety and the rook to work at once.',
    },
    exposedKing: {
      g: 'motif', s: 1, ar: 'الملك المكشوف', en: 'Exposed king',
      iAr: 'ملك بلا ستار من البيادق، وكل خطّ مفتوح إليه طريق.',
      iEn: 'A king with no pawn cover, and every open line was a road to it.',
    },
    kingsideAttack: {
      g: 'motif', s: 1, ar: 'الهجوم على جناح الملك', en: 'Kingside attack',
      iAr: 'الهجوم تجمّع على الجناح الذي يقف فيه الملك.',
      iEn: 'The attack gathered on the wing where the king had settled.',
    },
    queensideAttack: {
      g: 'motif', s: 1, ar: 'الهجوم على جناح الوزير', en: 'Queenside attack',
      iAr: 'الضغط جاء من جناح الوزير حيث لم يكن الخصم ينظر.',
      iEn: 'The pressure came from the queenside, where the opponent was not looking.',
    },
    attackingF2F7: {
      g: 'motif', s: 1, ar: 'استهداف f2 أو f7', en: 'Attacking f2 or f7',
      iAr: 'أضعف مربّع عند الملك في الافتتاح: f7 للأسود وf2 للأبيض.',
      iEn: 'The weakest square near the king in the opening: f7 for Black, f2 for White.',
    },
    collinearMove: {
      g: 'motif', s: 1, ar: 'النقلة على الخطّ', en: 'Collinear move',
      iAr: 'قطعتان متقابلتان على خطّ واحد، فزحفت إحداهما على الخطّ نفسه ولم تأخذ.',
      iEn: 'Two pieces faced each other on one line, and one slid along it without capturing.',
    },

    /* ───────── أنماط المات المسمّاة ───────── */
    backRankMate: {
      g: 'mate', s: 1, ar: 'مات الصفّ الأخير', en: 'Back-rank mate',
      iAr: 'ملك حبسته بيادقه على صفّه، فكفاه رخّ أو وزير على الصفّ نفسه.',
      iEn: 'A king locked in by its own pawns; a rook or queen on that rank was enough.',
    },
    smotheredMate: {
      g: 'mate', s: 1, ar: 'مات الخنق', en: 'Smothered mate',
      iAr: 'حصان أعطى المات وقد أحاطت بالملك قطعُه هو، فلا مربّع يتنفّس فيه.',
      iEn: 'A knight mated a king boxed in by its own pieces, with no square to breathe.',
    },
    anastasiaMate: {
      g: 'mate', s: 1, ar: 'مات أناستازيا', en: "Anastasia's mate",
      iAr: 'حصان ورخّ حصرا الملك بين حاشية الرقعة وقطعةٍ من جيشه.',
      iEn: 'A knight and a rook trapped the king between the board edge and its own piece.',
    },
    arabianMate: {
      g: 'mate', s: 1, ar: 'المات العربي', en: 'Arabian mate',
      iAr: 'رخّ لصق الملك في الزاوية، يحرسه حصان على بُعد قفزة قُطريّة.',
      iEn: 'A rook beside the cornered king, guarded by a knight a diagonal leap away.',
    },
    bodenMate: {
      g: 'mate', s: 1, ar: 'مات بودن', en: "Boden's mate",
      iAr: 'فيلان على قُطرين متقاطعين، والملك محشور بين قطعه.',
      iEn: 'Two bishops on criss-crossing diagonals, the king hemmed in by its own men.',
    },
    doubleBishopMate: {
      g: 'mate', s: 1, ar: 'مات الفيلين', en: 'Double bishop mate',
      iAr: 'فيلان على قُطرين متوازيين يسدّان كل منفذ عند حاشية الرقعة.',
      iEn: 'Two bishops on parallel diagonals sealed every exit at the board edge.',
    },
    dovetailMate: {
      g: 'mate', s: 1, ar: 'مات ذيل الحمامة', en: 'Dovetail mate',
      iAr: 'وزير مسنود ملاصق للملك، ومربّعا فراره القُطريّان مشغولان بقطعه.',
      iEn: 'A supported queen beside the king, its two diagonal escapes filled by its own men.',
    },
    hookMate: {
      g: 'mate', s: 1, ar: 'مات الخُطّاف', en: 'Hook mate',
      iAr: 'رخّ يحرسه حصان، والحصان يحرسه بيدق — سلسلة لا تُفكّ.',
      iEn: 'A rook guarded by a knight, the knight guarded by a pawn: a chain with no weak link.',
    },
    killBoxMate: {
      g: 'mate', s: 1, ar: 'مات الصندوق', en: 'Kill box mate',
      iAr: 'رخّ إلى جانب الملك ووزير خلفه قُطريًّا، فصار الملك في صندوق ثلاثة في ثلاثة.',
      iEn: 'A rook beside the king with the queen a diagonal step back, closing a three-by-three box.',
    },
    vukovicMate: {
      g: 'mate', s: 1, ar: 'مات فوكوفيتش', en: "Vuković's mate",
      iAr: 'رخّ مسنود يعطي المات وحصان يسدّ مربّعات الفرار.',
      iEn: 'A supported rook delivered mate while a knight covered the flight squares.',
    },
    operaMate: {
      g: 'mate', s: 1, ar: 'مات الأوبرا', en: 'Opera mate',
      iAr: 'رخّ على الصفّ الأخير يحرسه فيل، وقطعة الخصم نفسها تسدّ على ملكها.',
      iEn: 'A rook on the back rank guarded by a bishop, with the enemy piece blocking its own king.',
    },
    pillsburysMate: {
      g: 'mate', s: 1, ar: 'مات بيلسبري', en: "Pillsbury's mate",
      iAr: 'رخّ ينزل على الملفّ وفيل يقطع على الملك طريق الهرب.',
      iEn: 'A rook came down the file while a bishop cut off the king’s escape.',
    },
    epauletteMate: {
      g: 'mate', s: 1, ar: 'مات الكتفَين', en: 'Epaulette mate',
      iAr: 'وزير يعطي المات وقد سدّت قطعتان من جيش الملك مربّعَي جواره.',
      iEn: 'A queen mated while two of the king’s own pieces blocked the squares at its sides.',
    },
    cornerMate: {
      g: 'mate', s: 1, ar: 'مات الزاوية', en: 'Corner mate',
      iAr: 'الملك في الزاوية، بيدقه يسدّ منفذه الأخير، وقطعة صغيرة تُنهي الأمر.',
      iEn: 'The king in the corner, its own pawn blocking the last exit, a minor piece finishing it.',
    },
    swallowstailMate: {
      g: 'mate', s: 1, ar: 'مات ذيل السنونو', en: "Swallow's tail mate",
      iAr: 'وزير أمام الملك ومربّعا فراره الخلفيّان مشغولان بقطعه.',
      iEn: 'A queen in front of the king, its two rear escape squares taken by its own pieces.',
    },
    triangleMate: {
      g: 'mate', s: 1, ar: 'مات المثلّث', en: 'Triangle mate',
      iAr: 'وزير ورخّ على خطّ واحد بينهما مربّع، فأُقفلت الزاوية كالمثلّث.',
      iEn: 'A queen and a rook on one line a square apart, closing the corner like a triangle.',
    },
    morphysMate: {
      g: 'mate', s: 1, ar: 'مات مورفي', en: "Morphy's mate",
      iAr: 'فيل يعطي المات للملك في الزاوية، ورخّه وبيدقه يسدّان مهربه.',
      iEn: 'A bishop mated the cornered king while its own rook and pawn sealed the escape.',
    },
    balestraMate: {
      g: 'mate', s: 1, ar: 'مات البالِسترا', en: 'Balestra mate',
      iAr: 'وزير يسدّ القُطر والملفّ، وفيل ينزل المات.',
      iEn: 'A queen took away the diagonal and the file, and a bishop delivered mate.',
    },
    blindSwineMate: {
      g: 'mate', s: 1, ar: 'مات الرخَّين على الصفّ السابع', en: 'Blind swine mate',
      iAr: 'رخّان مزدوجان على الصفّ السابع أكلا ستار البيادق ثمّ أطبقا على الملك.',
      iEn: 'Doubled rooks on the seventh ate the pawn shield, then closed in on the king.',
    },
  };

  /* المجموعات — عناوين لوحة المواضيع */
  const GROUPS = [
    { key: 'goal',   ar: 'الهدف',        en: 'Goal' },
    { key: 'motif',  ar: 'الأنماط',      en: 'Motifs' },
    { key: 'mate',   ar: 'أنماط المات',  en: 'Mating patterns' },
    { key: 'phase',  ar: 'الطور',        en: 'Phase' },
    { key: 'length', ar: 'الطول',        en: 'Length' },
    { key: 'origin', ar: 'المصدر',       en: 'Origin' },
  ];

  /* سطر الهدف قبل اللغز: من النتيجة لا من النمط، عشان مايحرقش.
     الترتيب مقصود — الأخصّ أوّلًا. */
  const GOALS = [
    ['mateIn1',   'المات في نقلة واحدة. جدها.',            'Mate in one. Find it.'],
    ['mateIn2',   'المات في نقلتين.',                       'Mate in two.'],
    ['mateIn3',   'المات في ثلاث نقلات.',                   'Mate in three.'],
    ['mateIn4',   'المات في أربع نقلات.',                   'Mate in four.'],
    ['mateIn5',   'المات في خمس نقلات.',                    'Mate in five.'],
    ['mate',      'في الموقف كش مات. ابحث عنه.',            'There is a checkmate here. Find it.'],
    ['equality',  'الموقف أصعب مما يبدو. انجُ بالتعادل.',   'This is worse than it looks. Save the draw.'],
    ['defensiveMove', 'التهديد قائم. دافع بدقّة.',          'There is a threat. Defend precisely.'],
    ['crushing',  'ميزة حاسمة تنتظر نقلة واحدة صحيحة.',     'A winning advantage is one move away.'],
    ['advantage', 'هنا ميزة واضحة تُقتنص.',                 'There is a clear advantage to take.'],
  ];

  /* الفكرة التي يسمّيها نور بعد الحلّ: الأخصّ والأندر أوّلًا، فأنماط
     المات المسمّاة تسبق «شوكة» و«قطعة معلّقة». */
  const IDEA_ORDER = [
    'vukovicMate', 'killBoxMate', 'hookMate', 'doubleBishopMate', 'bodenMate',
    'anastasiaMate', 'dovetailMate', 'arabianMate', 'smotheredMate',
    'operaMate', 'pillsburysMate', 'morphysMate', 'balestraMate',
    'epauletteMate', 'swallowstailMate', 'triangleMate', 'cornerMate',
    'blindSwineMate', 'backRankMate',
    'underPromotion', 'enPassant', 'castling', 'zugzwang', 'interference',
    'xRayAttack', 'clearance', 'intermezzo', 'attraction', 'deflection',
    'quietMove', 'sacrifice', 'doubleCheck', 'discoveredCheck',
    'discoveredAttack', 'skewer', 'pin', 'fork', 'capturingDefender',
    'trappedPiece', 'promotion', 'advancedPawn', 'collinearMove',
    'hangingPiece', 'attackingF2F7', 'exposedKing',
    'kingsideAttack', 'queensideAttack',
  ];

  return {
    /* الاسم باللغة الحالية — ولو الموضوع جديد على المعجم نرجّع المفتاح
       كما هو بدل ما نعرض «undefined» على الشاشة. */
    name(key) {
      const t = T[key];
      return t ? L(t.ar, t.en) : String(key || '');
    },
    /* هل تسمية الموضوع تحرق اللغز؟ */
    spoils(key) { return !!(T[key] && T[key].s); },
    group(key) { return T[key] ? T[key].g : 'motif'; },
    has(key) { return !!T[key]; },
    groups() { return GROUPS.map(g => ({ key: g.key, title: L(g.ar, g.en) })); },
    /* كل مواضيع مجموعة — لقائمة اختيار الموضوع */
    inGroup(g) { return Object.keys(T).filter(k => T[k].g === g); },

    /* سطر الهدف قبل اللغز — غير محروق */
    goalLine(themes) {
      const has = _set(themes);
      for (const [key, ar, en] of GOALS) if (has[key]) return L(ar, en);
      return L('ما أفضل نقلة في هذا الموقف؟', 'What is the best move here?');
    },

    /* الفكرة التي تُسمّى بعد الحلّ: {key, name, idea} أو null */
    idea(themes) {
      const has = _set(themes);
      for (const key of IDEA_ORDER) {
        if (has[key] && T[key] && T[key].iAr) {
          return { key, name: L(T[key].ar, T[key].en), idea: L(T[key].iAr, T[key].iEn) };
        }
      }
      return null;
    },

    /* أسماء المواضيع المعروضة مع اللغز. before=true قبل الحلّ فنحجب
       المحروق، وexcept تُستثنى (الموضوع الذي اختاره اللاعب بنفسه). */
    labels(themes, before, except) {
      const skip = _set(except ? [].concat(except) : []);
      return (themes || [])
        .filter(k => T[k] && (!before || !T[k].s || skip[k]))
        .map(k => ({ key: k, name: L(T[k].ar, T[k].en), group: T[k].g }));
    },
  };

  function _set(arr) {
    const o = {};
    for (const x of (arr || [])) o[x] = 1;
    return o;
  }
})();

if (typeof window !== 'undefined') window.PZT = PZT;
if (typeof module !== 'undefined' && module.exports) module.exports = PZT;
