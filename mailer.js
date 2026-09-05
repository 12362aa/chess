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

async function deliver(kind, msg) {
  const tx = transport();
  if (!tx) throw new Error('SMTP غير مهيّأ على الخادم');
  const t0 = Date.now();
  try {
    const info = await tx.sendMail(Object.assign({ from: cfg().from }, msg));
    const ms = Date.now() - t0;
    /* المستلم اللي جيميل قَبِله فعلًا: لو طلع فاضي يبقى العنوان مرفوض */
    const acc = (info && info.accepted && info.accepted.length) ? info.accepted.length : 0;
    console.log(`[mail] ${kind} → ${mask(msg.to)} في ${ms}ms (مقبول: ${acc})`);
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

const txtRow = (html, o) => {
  const s = o || {};
  return `
  <tr><td style="padding:${s.pad || '16px 16px 4px'};color:${s.color || C.txt};font-size:${s.size || 15}px;`
    + `line-height:1.9;text-align:right${s.top ? ';border-top:1px solid ' + C.line : ''}">
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
const shell = body => `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
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
  <div style="width:100%;max-width:520px;margin:14px auto 0;color:${C.foot};font-size:11px;text-align:center;line-height:1.8">رسالة آلية من خادم شطرنج Am-Kh. لا ترد عليها.</div>
 </td></tr>
</table>
</body></html>`;

const WHO = name => (name ? esc(name) : 'لاعب شطرنج Am-Kh');
const FOOT = { pad: '14px 16px 22px', color: C.faint, size: 12, top: 1 };

/* ── #6 رمز إعادة تعيين كلمة المرور ─────────────────────────────────── */
function resetHtml(code, name, minutes) {
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. استخدم الرمز التالي لإكمال العملية:`, { pad: '18px 16px 4px' })
    + codeRow(code)
    + txtRow(`الرمز صالح لمدة ${esc(minutes)} دقيقة، ولمرة واحدة فقط.`,
      { pad: '0 16px 6px', color: C.dim, size: 13 })
    + txtRow('إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — كلمة مرورك الحالية باقية كما هي، ولن يتغيّر شيء في حسابك.', FOOT));
}

function resetText(code, name, minutes) {
  return `مرحبًا ${name || ''}\n\n`
    + `رمز إعادة تعيين كلمة المرور لحسابك في شطرنج Am-Kh:\n\n    ${code}\n\n`
    + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
    + `إذا لم تطلب إعادة التعيين فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`;
}

async function sendResetCode({ to, code, name, minutes = 15 }) {
  await deliver('استعادة كلمة المرور', {
    to,
    subject: `رمز إعادة تعيين كلمة المرور: ${code}`,
    text: resetText(code, name, minutes),
    html: resetHtml(code, name, minutes),
  });
}
/* ── بريد حساب جوجل ──────────────────────────────────────────────────
   المستخدم طلب استعادة كلمة مرور لحساب مالوش كلمة مرور أصلًا (داخل
   بجوجل). الردّ من الـAPI موحّد عشان مانكشفش الحسابات، فالبريد ده هو
   المكان الوحيد اللي يعرف صاحب الحساب فيه الحقيقة. */
function googleHtml(name) {
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك، لكن حسابك ليس له كلمة مرور من الأصل.`,
      { pad: '18px 16px 4px' })
    + txtRow(`أنت مسجَّل عن طريق <b style="color:${C.gold}">حسابك في جوجل</b>. للدخول، افتح التطبيق
    واضغط زر «الدخول بحساب جوجل» — لا تحتاج كلمة مرور ولا رمزًا.`, { pad: '12px 16px' })
    + txtRow('إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — لم يتغيّر شيء في حسابك.', FOOT));
}

async function sendGoogleNotice({ to, name }) {
  await deliver('تنبيه حساب جوجل', {
    to,
    subject: 'حسابك يعمل بتسجيل الدخول عبر جوجل',
    text: `مرحبًا ${name || ''}\n\n`
      + `وصلنا طلب لإعادة تعيين كلمة مرور حسابك في شطرنج Am-Kh، لكن حسابك ليس له كلمة مرور.\n`
      + `أنت مسجَّل عن طريق جوجل: افتح التطبيق واضغط «الدخول بحساب جوجل».\n\n`
      + `إذا لم تطلب ذلك فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`,
    html: googleHtml(name),
  });
}
/* ── #13 رمز تأكيد البريد عند إنشاء حساب يدوي ─────────────────────────
   نصّ مختلف عن رسالة الاستعادة عن قصد: صاحب الرسالة دي لسه مالوش حساب،
   فالمطلوب منه «إكمال إنشاء الحساب» مش «إعادة تعيين». ولو الرسالة وصلت
   لحد ماطلبهاش يبقى فيه واحد بيكتب بريده بالغلط (أو بيجرّب) — فالسطر
   الأخير بيطمّنه إن مافيش حساب اتعمل ولا هيتعمل بلا الرمز ده. */
function signupHtml(code, name, minutes) {
  return shell(
    txtRow(`مرحبًا ${WHO(name)}،<br>
    أهلًا بك في شطرنج Am-Kh. لتأكيد بريدك وإكمال إنشاء حسابك، أدخل الرمز التالي في التطبيق:`,
      { pad: '18px 16px 4px' })
    + codeRow(code)
    + txtRow(`الرمز صالح لمدة ${esc(minutes)} دقيقة، ولمرة واحدة فقط.`,
      { pad: '0 16px 6px', color: C.dim, size: 13 })
    + txtRow('إذا لم تطلب إنشاء حساب فتجاهل هذه الرسالة — لم يُنشأ أي حساب بهذا البريد، ولن يُنشأ بدون هذا الرمز.', FOOT));
}

async function sendSignupCode({ to, code, name, minutes = 15 }) {
  await deliver('تأكيد البريد', {
    to,
    subject: `رمز تأكيد بريدك: ${code}`,
    text: `مرحبًا ${name || ''}\n\n`
      + `رمز تأكيد بريدك لإكمال إنشاء حسابك في شطرنج Am-Kh:\n\n    ${code}\n\n`
      + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
      + `إذا لم تطلب إنشاء حساب فتجاهل الرسالة — لم يُنشأ أي حساب بهذا البريد.`,
    html: signupHtml(code, name, minutes),
  });
}

module.exports = { ready, status, verify, sendResetCode, sendGoogleNotice, sendSignupCode };

