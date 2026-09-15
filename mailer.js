/* ══════════════════════════════════════════════════════════════════════
   إرسال البريد — رسائل الحساب (#6 استعادة كلمة المرور، #13 تأكيد البريد)
   ──────────────────────────────────────────────────────────────────────
   الإعداد كله من متغيّرات البيئة، فمفيش أي سرّ مكتوب في الكود ولا في
   المستودع:

     SMTP_USER=name@gmail.com          ← الحساب اللي البريد بيطلع منه
     SMTP_PASS=xxxxxxxxxxxxxxxx        ← «كلمة مرور التطبيقات» من جوجل
                                         (١٦ حرفًا، مش باسورد الحساب)
     SMTP_FROM="Am-Kh Chess <name@gmail.com>"   ← اختياري
     SMTP_HOST / SMTP_PORT             ← اختياري لخدمة غير جيميل

   جيميل بيتظبط تلقائيًا لو الإيميل بينتهي بـgmail.com، فالسطرين الأولين
   يكفوا. كلمة مرور التطبيقات محتاجة تفعيل التحقّق بخطوتين على الحساب،
   وبتتولّد من: myaccount.google.com/apppasswords

   لو المتغيّرات ناقصة، الوحدة بتقول «غير مهيّأة» بدل ما ترمي استثناء —
   والمسار في auth.js بيرجّع رسالة مفهومة للمستخدم بدل خطأ سيرفر.

   اسم المُرسِل = Am-Kh Chess باللاتيني. الاسم المنقول حرفيًا («شطرنج
   أم-خ») كان بيبان في صندوق الوارد كأنه كلمة مقطوعة بلا معنى، وAm-Kh
   أصلًا اختصار Ahmed Mohamed Khalifa فمالوش ترجمة — يُكتب كما هو.
══════════════════════════════════════════════════════════════════════ */
'use strict';

/* حلّ ثابت لعلّة بطء الاتصال: الشبكة هنا بترجّع IPv6 مع الـA record، وأي
   محاولة اتصال عليه بتفضل معلّقة لحد ما تنتهي المهلة قبل ما نود يجرّب
   IPv4 — فالرسالة بتتأخّر ثوانيَ زيادة بلا داعي (نفس علّة Groq). القياس
   على شبكة أحمد: IPv6 = ENOENT فورًا، IPv4 = ٦٧ms. السطر ده بيثبّت
   الترتيب لو mailer.js اتحمّل لوحده بلا server.js. */
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (e) {}

let _tx = null;
let _txKey = '';

function cfg() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');  // جوجل بيعرض الكود بمسافات
  const gmail = /@gmail\.com$/i.test(user);
  const host = (process.env.SMTP_HOST || (gmail ? 'smtp.gmail.com' : '')).trim();
  const port = Number(process.env.SMTP_PORT || (gmail ? 465 : 587));
  const from = (process.env.SMTP_FROM || (user ? `Am-Kh Chess <${user}>` : '')).trim();
  return { user, pass, host, port, from, secure: port === 465 };
}

function ready() {
  const c = cfg();
  return !!(c.user && c.pass && c.host);
}

/* حالة مختصرة للتشخيص — بلا أي سرّ. */
function status() {
  const c = cfg();
  return {
    ready: ready(),
    host: c.host || null,
    port: c.port || null,
    user: c.user ? c.user.replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    missing: ['SMTP_USER', 'SMTP_PASS'].filter(k => !(process.env[k] || '').trim()),
  };
}
function transport() {
  const c = cfg();
  if (!ready()) return null;
  const key = `${c.host}:${c.port}:${c.user}`;
  /* بنعيد استخدام نفس الـtransport (pool) عشان مانفتحش جلسة SMTP جديدة
     لكل رسالة، وبنعيد بناءه لو الإعداد اتغيّر وقت التشغيل. */
  if (_tx && _txKey === key) return _tx;
  const nodemailer = require('nodemailer');
  _tx = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    pool: true, maxConnections: 2, maxMessages: 50,
    connectionTimeout: 12000, greetingTimeout: 8000, socketTimeout: 20000,
  });
  _txKey = key;
  return _tx;
}

/* فحص الاتصال والاعتماد — بيستخدمه مسار التشخيص فقط. */
async function verify() {
  const tx = transport();
  if (!tx) return { ok: false, error: 'SMTP غير مهيّأ' };
  try { await tx.verify(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── إرسال واحد لكل الرسائل: بيقيس الزمن وبيسجّله ─────────────────────
   بلاغ «الرمز بيوصل بعد وقت» كان سببه الحقيقي رسالة مرتجعة (عنوان غير
   موجود) — الارتجاع بياخد دقايق. لكن عشان أي بطء حقيقي في المستقبل يبان
   بدل ما يتحوّل لتخمين، كل إرسال بيتسجّل بزمنه وبالمستلم مموّهًا. الزمن
   الطبيعي المقيس: أول رسالة ~١.٤ث (فيها بناء TLS+AUTH)، واللي بعدها
   ~١.٢ث على نفس الـpool. */
const mask = a => String(a || '').replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');

/* ترويسات تخلّي الرسالة تُقرأ كرسالة معاملات لا كدعاية ─────────────────
   بلاغ «الرمز موصلش» الأخير: السجل بيقول إن جيميل قَبِل الرسالة (accepted:1)
   ومافيش ارتجاع خلال أكتر من عشرين دقيقة — والارتجاع الحقيقي بييجي في
   ثوانٍ (العنوان الغلط الأسبق ارتجع بعد ٨ ثوانٍ). يعني الرسالة اتسلّمت
   للصندوق فعلًا وقعدت في «البريد المزعج».

   الترويسات دي بتقلّل الاحتمال ده بقدر ما يقدر مُرسِل من حساب جيميل عادي:
   • Auto-Submitted: علامة RFC 3834 إن الرسالة آلية بردّ على طلب المستخدم،
     وبتمنع كمان الردود الآلية (out-of-office) إنها ترتدّ علينا.
   • Message-ID بنطاق حقيقي محلول (صفحة المشروع) بدل اسم جهاز محلي —
     nodemailer بيبني المعرّف من os.hostname()، و«DESKTOP-…» مش FQDN وده
     من علامات البريد المزعج المعروفة.
   • Reply-To صريح: صندوق قابل للردّ بيرفع الثقة.
   ومع كل ده يفضل ممكن تقع في المزعج أول مرة، فشاشة التأكيد في التطبيق
   بتقول للمستخدم يبصّ هناك ويعلّمها «ليست مزعجة» مرة واحدة.

   ⟨قياس ٢٠٢٦-٠٩-٠٥⟩ بعتنا رسالة حقيقية وقرأناها من نفس الصندوق على IMAP:
   جيميل **ماغيّرش** الـMessage-ID بتاعنا (فضل بنطاق المشروع)، والترويسات
   كلها وصلت زي ما بعتناها. لكن الرسالة لنفس الحساب مابتمرّش على فحص
   المصادقة الداخلي فمافيش Authentication-Results نقرأه — يعني القياس ده
   يثبت إن الترويسات بتوصل، ومايقدرش يثبت مكان التصنيف عند طرف تالت.
   المصادقة نفسها مش هي المشكلة: الإرسال عبر smtp.gmail.com بعنوان
   ‎@gmail.com بيدّي SPF ناجح وDKIM بـd=gmail.com وDMARC متوافق. الباقي
   حكم مُصنِّف على **شكل** الرسالة وسمعة المُرسِل، وأقوى إشارة سلبية فيها
   إن الاسم المعروض (Am-Kh Chess) مالوش علاقة بالعنوان (disc67701@…) —
   وده بالضبط نمط انتحال الاسم المعروض. الحلّ الجذري نطاق خاص بـSPF/DKIM
   /DMARC، والحلّ المجاني عنوان جيميل اسمه من اسم التطبيق. */
const MSGID_DOMAIN = '12362aa.github.io';
let _seq = 0;
function stdHeaders(from) {
  const rnd = Math.random().toString(36).slice(2, 10);
  return {
    replyTo: from,
    messageId: `<amkh-${Date.now().toString(36)}-${++_seq}-${rnd}@${MSGID_DOMAIN}>`,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': `amkh-${Date.now()}-${_seq}`,
    },
  };
}

async function deliver(kind, msg) {
  const tx = transport();
  if (!tx) throw new Error('SMTP غير مهيّأ على الخادم');
  const t0 = Date.now();
  try {
    const from = cfg().from;
    const info = await tx.sendMail(Object.assign({ from }, stdHeaders(from), msg));
    const ms = Date.now() - t0;
    /* المستلم اللي جيميل قَبِله فعلًا: لو طلع فاضي يبقى العنوان مرفوض */
    const acc = (info && info.accepted && info.accepted.length) ? info.accepted.length : 0;
    /* ردّ جيميل فيه معرّف الطابور — لو المستخدم قال «موصلش» بنعرف من السجل
       إذا كان الخادم قَبِلها فعلًا (فالمشكلة في صندوقه/المزعج) ولا لأ. */
    const rsp = String((info && info.response) || '').replace(/\s+/g, ' ').slice(0, 80);
    console.log(`[mail] ${kind} → ${mask(msg.to)} في ${ms}ms (مقبول: ${acc}) ${rsp}`);
    if (ms > 6000) console.warn(`[mail] بطء غير معتاد في الإرسال: ${ms}ms`);
    if (info && info.rejected && info.rejected.length) {
      console.error('[mail] عنوان مرفوض من الخادم:', info.rejected.map(mask).join(', '));
      throw new Error('العنوان مرفوض من خادم البريد');
    }
    return info;
  } catch (e) {
    console.error(`[mail] ${kind} → ${mask(msg.to)} فشل بعد ${Date.now() - t0}ms:`, e && e.message);
    throw e;
  }
}
/* ══ قالب موحّد لكل الرسائل ══════════════════════════════════════════
   جداول وأنماط سطرية فقط: عملاء البريد (وجيميل تحديدًا) بيشيلوا <style>
   والـflex والمتغيّرات، وبيتجاهلوا overflow — فأي عنصر أوسع من خليّته
   بيطلع **برّا** إطار الكرت المدوّر بدل ما يُقصّ. ده بالضبط اللي أحمد
   شافه في الجيميل: صندوق الرمز خارج من الإطار.

   القواعد اللي بتمنع الحالة:
   • جدول خارجي بعرض ١٠٠٪ بيتولّى التمركز، والكرت جوّاه بـmax-width —
     فلو العميل شال max-width تفضل الرسالة متمركزة لا مزنوقة.
   • صندوق الرمز جدول لا inline-block: الجدول بياخد عرض محتواه جوّه
     الخليّة ومابيتمدّدش خارجها.
   • الرمز بمسافة أحرف بدل ‎&nbsp;‎ مزدوجة بين كل رقمين: القديم عرضه
     كان يقرب من ٢٩٠px، والعرض الصافي للكرت على هاتف ٣٦٠px هو ~٢٨٨px —
     يعني فايض بالضبط بمقدار شعرة، وده سبب الطلوع من الإطار. الحالي
     ~١٦٠px، فيه هامش واسع على أضيق شاشة.
   • حشو أفقي ١٦px في صفوف المحتوى (كان ٢٤) عشان الشاشات الضيّقة.
══════════════════════════════════════════════════════════════════════ */
const BRAND = 'Am-Kh Chess';
const C = {
  bg: '#0a0a14', card: '#14141f', line: '#2a2a3d', gold: '#e8c56a',
  txt: '#e9e9f2', dim: '#a8a8bd', faint: '#8a8aa0', foot: '#5c5c72',
  codeBg: '#0f0f1a', codeLine: '#3a3a52',
};
const FONT = "'Segoe UI',Tahoma,Arial,sans-serif";

/* ── لغة الرسالة ──────────────────────────────────────────────────────
   المستخدم اللي التطبيق عنده بالإنجليزية لازم توصله الرسالة بالإنجليزية:
   هو اختار لغة، والبريد جزء من التطبيق لا شيء منفصل عنه. العميل بيبعت
   lang مع الطلب، والخادم بيمرّرها هنا. الافتراضي عربي — أي عميل قديم
   مابيبعتش lang بياخد نفس الرسالة اللي كان بياخدها بالضبط.
   الفرق مش ترجمة نصوص وبس: الاتجاه (rtl/ltr) ومحاذاة السطور بتنقلب
   كذلك، وإلا طلعت جملة إنجليزية مرصوصة على اليمين في إطار مقلوب. */
const isEn = lang => /^en/i.test(String(lang || ''));

const txtRow = (html, o) => {
  const s = o || {};
  return `
  <tr><td style="padding:${s.pad || '16px 16px 4px'};color:${s.color || C.txt};font-size:${s.size || 15}px;`
    + `line-height:1.9;text-align:${s.align || 'right'}${s.top ? ';border-top:1px solid ' + C.line : ''}">
    ${html}
  </td></tr>`;
};

/* الحشو غير المتساوي (٢٠ يمين / ٢٦ شمال) بيعادل الفراغ اللي letter-spacing
   بيسيبه بعد آخر رقم، فالأرقام تبان متمركزة فعلًا مش مزوّغة. */
const codeRow = code => `
  <tr><td style="padding:18px 16px" align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;background:${C.codeBg};border:1px solid ${C.codeLine};border-radius:12px">
      <tr><td style="padding:14px 20px 14px 26px;font-family:Consolas,'Courier New',monospace;font-size:28px;font-weight:700;color:${C.gold};letter-spacing:6px;direction:ltr;text-align:center;white-space:nowrap">${esc(code)}</td></tr>
    </table>
  </td></tr>`;
const shell = (body, en) => `<!doctype html>
<html dir="${en ? 'ltr' : 'rtl'}" lang="${en ? 'en' : 'ar'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
 <tr><td align="center" style="padding:24px 10px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:${C.card};border:1px solid ${C.line};border-radius:16px">
   <tr><td style="padding:22px 16px 6px;text-align:center">
     <div style="font-size:19px;font-weight:700;color:${C.gold};letter-spacing:.5px;direction:ltr">${BRAND}</div>
     <div style="height:2px;width:54px;margin:12px auto 0;background:${C.gold};border-radius:2px"></div>
   </td></tr>${body}
  </table>
  <div style="width:100%;max-width:520px;margin:14px auto 0;color:${C.foot};font-size:11px;text-align:center;line-height:1.8">${en
    ? 'A message from the Am-Kh Chess server. You may reply to it if you need help.'
    : 'رسالة من خادم شطرنج Am-Kh. لك أن تردّ عليها إن احتجت مساعدة.'}</div>
 </td></tr>
</table>
</body></html>`;

const WHO = (name, en) => (name ? esc(name) : (en ? 'Am-Kh Chess player' : 'لاعب شطرنج Am-Kh'));
/* محاذاة السطر ولون الذيل: نفس القيم في اللغتين ما عدا الجهة. */
const ALIGN = en => (en ? 'left' : 'right');
const FOOT = en => ({ pad: '14px 16px 22px', color: C.faint, size: 12, top: 1, align: ALIGN(en) });

/* ── #6 رمز إعادة تعيين كلمة المرور ─────────────────────────────────── */
function resetHtml(code, name, minutes, en) {
  if (en) {
    return shell(
      txtRow(`Hello ${WHO(name, true)},<br>
      We received a request to reset the password for your account. Use the code below to complete it:`,
        { pad: '18px 16px 4px', align: 'left' })
      + codeRow(code)
      + txtRow(`The code is valid for ${esc(minutes)} minutes, and for one use only.`,
        { pad: '0 16px 6px', color: C.dim, size: 13, align: 'left' })
      + txtRow('If you did not request a reset, ignore this message — your current password stays as it is, and nothing in your account will change.',
        FOOT(true)), true);
  }
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. استخدم الرمز التالي لإكمال العملية:`, { pad: '18px 16px 4px' })
    + codeRow(code)
    + txtRow(`الرمز صالح لمدة ${esc(minutes)} دقيقة، ولمرة واحدة فقط.`,
      { pad: '0 16px 6px', color: C.dim, size: 13 })
    + txtRow('إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — كلمة مرورك الحالية باقية كما هي، ولن يتغيّر شيء في حسابك.', FOOT(false)));
}

function resetText(code, name, minutes, en) {
  if (en) {
    return `Hello ${name || ''}\n\n`
      + `Your password reset code for Am-Kh Chess:\n\n    ${code}\n\n`
      + `The code is valid for ${minutes} minutes and for one use only.\n`
      + `If you did not request a reset, ignore this message — nothing in your account will change.`;
  }
  return `مرحبًا ${name || ''}\n\n`
    + `رمز إعادة تعيين كلمة المرور لحسابك في شطرنج Am-Kh:\n\n    ${code}\n\n`
    + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
    + `إذا لم تطلب إعادة التعيين فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`;
}

async function sendResetCode({ to, code, name, minutes = 15, lang }) {
  const en = isEn(lang);
  await deliver('استعادة كلمة المرور', {
    to,
    subject: en ? `Password reset code: ${code}` : `رمز إعادة تعيين كلمة المرور: ${code}`,
    text: resetText(code, name, minutes, en),
    html: resetHtml(code, name, minutes, en),
  });
}
/* ── بريد حساب جوجل ──────────────────────────────────────────────────
   المستخدم طلب استعادة كلمة مرور لحساب مالوش كلمة مرور أصلًا (داخل
   بجوجل). الردّ من الـAPI موحّد عشان مانكشفش الحسابات، فالبريد ده هو
   المكان الوحيد اللي يعرف صاحب الحساب فيه الحقيقة. */
function googleHtml(name, en) {
  if (en) {
    return shell(
      txtRow(`Hello ${WHO(name, true)},<br>
      We received a request to reset your password, but your account has no password to begin with.`,
        { pad: '18px 16px 4px', align: 'left' })
      + txtRow(`You are signed up through <b style="color:${C.gold}">your Google account</b>. To sign in, open the app
      and tap "Sign in with Google" — you need no password and no code.`, { pad: '12px 16px', align: 'left' })
      + txtRow('If you did not request a reset, ignore this message — nothing in your account has changed.',
        FOOT(true)), true);
  }
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك، لكن حسابك ليس له كلمة مرور من الأصل.`,
      { pad: '18px 16px 4px' })
    + txtRow(`أنت مسجَّل عن طريق <b style="color:${C.gold}">حسابك في جوجل</b>. للدخول، افتح التطبيق
    واضغط زر «الدخول بحساب جوجل» — لا تحتاج كلمة مرور ولا رمزًا.`, { pad: '12px 16px' })
    + txtRow('إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — لم يتغيّر شيء في حسابك.', FOOT(false)));
}

async function sendGoogleNotice({ to, name, lang }) {
  const en = isEn(lang);
  await deliver('تنبيه حساب جوجل', {
    to,
    subject: en ? 'Your account signs in with Google' : 'حسابك يعمل بتسجيل الدخول عبر جوجل',
    text: en
      ? `Hello ${name || ''}\n\n`
        + `We received a request to reset the password of your Am-Kh Chess account, but your account has no password.\n`
        + `You are signed up through Google: open the app and tap "Sign in with Google".\n\n`
        + `If you did not request this, ignore the message — nothing in your account will change.`
      : `مرحبًا ${name || ''}\n\n`
        + `وصلنا طلب لإعادة تعيين كلمة مرور حسابك في شطرنج Am-Kh، لكن حسابك ليس له كلمة مرور.\n`
        + `أنت مسجَّل عن طريق جوجل: افتح التطبيق واضغط «الدخول بحساب جوجل».\n\n`
        + `إذا لم تطلب ذلك فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`,
    html: googleHtml(name, en),
  });
}
/* ── #13 رمز تأكيد البريد عند إنشاء حساب يدوي ─────────────────────────
   نصّ مختلف عن رسالة الاستعادة عن قصد: صاحب الرسالة دي لسه مالوش حساب،
   فالمطلوب منه «إكمال إنشاء الحساب» مش «إعادة تعيين». ولو الرسالة وصلت
   لحد ماطلبهاش يبقى فيه واحد بيكتب بريده بالغلط (أو بيجرّب) — فالسطر
   الأخير بيطمّنه إن مافيش حساب اتعمل ولا هيتعمل بلا الرمز ده. */
function signupHtml(code, name, minutes, en) {
  if (en) {
    return shell(
      txtRow(`Hello ${WHO(name, true)},<br>
      Welcome to Am-Kh Chess. To confirm your email and finish creating your account, enter this code in the app:`,
        { pad: '18px 16px 4px', align: 'left' })
      + codeRow(code)
      + txtRow(`The code is valid for ${esc(minutes)} minutes, and for one use only.`,
        { pad: '0 16px 6px', color: C.dim, size: 13, align: 'left' })
      + txtRow('If you did not ask to create an account, ignore this message — no account has been created with this email, and none will be created without this code.',
        FOOT(true)), true);
  }
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    أهلًا بك في شطرنج Am-Kh. لتأكيد بريدك وإكمال إنشاء حسابك، أدخل الرمز التالي في التطبيق:`,
      { pad: '18px 16px 4px' })
    + codeRow(code)
    + txtRow(`الرمز صالح لمدة ${esc(minutes)} دقيقة، ولمرة واحدة فقط.`,
      { pad: '0 16px 6px', color: C.dim, size: 13 })
    + txtRow('إذا لم تطلب إنشاء حساب فتجاهل هذه الرسالة — لم يُنشأ أي حساب بهذا البريد، ولن يُنشأ بدون هذا الرمز.', FOOT(false)));
}

async function sendSignupCode({ to, code, name, minutes = 15, lang }) {
  const en = isEn(lang);
  await deliver('تأكيد البريد', {
    to,
    subject: en ? `Your email confirmation code: ${code}` : `رمز تأكيد بريدك: ${code}`,
    text: en
      ? `Hello ${name || ''}\n\n`
        + `Your email confirmation code to finish creating your Am-Kh Chess account:\n\n    ${code}\n\n`
        + `The code is valid for ${minutes} minutes and for one use only.\n`
        + `If you did not ask to create an account, ignore this message — no account has been created with this email.`
      : `مرحبًا ${name || ''}\n\n`
        + `رمز تأكيد بريدك لإكمال إنشاء حسابك في شطرنج Am-Kh:\n\n    ${code}\n\n`
        + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
        + `إذا لم تطلب إنشاء حساب فتجاهل الرسالة — لم يُنشأ أي حساب بهذا البريد.`,
    html: signupHtml(code, name, minutes, en),
  });
}

/* عنوان المُرسِل صريحًا (بلا الاسم المعروض) — العميل بيعرضه للمستخدم عشان
   يبحث بيه في بريده لو الرسالة قعدت في المزعج. مش سرًّا: مكتوب على كل
   رسالة بتوصله. */
function senderAddress() {
  const from = cfg().from || '';
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

module.exports = { ready, status, verify, senderAddress, sendResetCode, sendGoogleNotice, sendSignupCode };

