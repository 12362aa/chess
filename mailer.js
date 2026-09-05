/* ══════════════════════════════════════════════════════════════════════
   إرسال البريد — أكواد استعادة كلمة المرور (#6)
   ──────────────────────────────────────────────────────────────────────
   الإعداد كله من متغيّرات البيئة، فمفيش أي سرّ مكتوب في الكود ولا في
   المستودع:

     SMTP_USER=name@gmail.com          ← الحساب اللي البريد بيطلع منه
     SMTP_PASS=xxxxxxxxxxxxxxxx        ← «كلمة مرور التطبيقات» من جوجل
                                         (١٦ حرفًا، مش باسورد الحساب)
     SMTP_FROM="شطرنج أم‑خ <name@gmail.com>"    ← اختياري
     SMTP_HOST / SMTP_PORT             ← اختياري لخدمة غير جيميل

   جيميل بيتظبط تلقائيًا لو الإيميل بينتهي بـgmail.com، فالسطرين الأولين
   يكفوا. كلمة مرور التطبيقات محتاجة تفعيل التحقّق بخطوتين على الحساب،
   وبتتولّد من: myaccount.google.com/apppasswords

   لو المتغيّرات ناقصة، الوحدة بتقول «غير مهيّأة» بدل ما ترمي استثناء —
   والمسار في auth.js بيرجّع رسالة مفهومة للمستخدم بدل خطأ سيرفر.
══════════════════════════════════════════════════════════════════════ */
'use strict';

let _tx = null;
let _txKey = '';

function cfg() {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');  // جوجل بيعرض الكود بمسافات
  const gmail = /@gmail\.com$/i.test(user);
  const host = (process.env.SMTP_HOST || (gmail ? 'smtp.gmail.com' : '')).trim();
  const port = Number(process.env.SMTP_PORT || (gmail ? 465 : 587));
  const from = (process.env.SMTP_FROM || (user ? `شطرنج أم-خ <${user}>` : '')).trim();
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

/* قالب الرسالة: جداول وأنماط سطرية فقط — عملاء البريد (وجيميل تحديدًا)
   بيشيلوا <style> والـflex والمتغيّرات. الألوان من هوية التطبيق: خلفية
   داكنة وذهبي. بلا رموز تعبيرية، وبلا صور خارجية عشان مايتحجبش المحتوى. */
function resetHtml(code, name, minutes) {
  const who = name ? esc(name) : 'لاعب شطرنج أم-خ';
  const spaced = String(code).split('').join('&nbsp;&nbsp;');
  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#0a0a14;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:520px;margin:0 auto;background:#14141f;border:1px solid #2a2a3d;border-radius:16px;overflow:hidden">
  <tr><td style="padding:22px 24px 6px;text-align:center">
    <div style="font-size:19px;font-weight:700;color:#e8c56a;letter-spacing:.5px">شطرنج أم-خ</div>
    <div style="height:2px;width:54px;margin:12px auto 0;background:#e8c56a;border-radius:2px"></div>
  </td></tr>
  <tr><td style="padding:18px 24px 4px;color:#e9e9f2;font-size:15px;line-height:1.9;text-align:right">
    مرحبًا ${who}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. استخدم الرمز التالي لإكمال العملية:
  </td></tr>
  <tr><td style="padding:18px 24px" align="center">
    <div style="display:inline-block;background:#0f0f1a;border:1px solid #3a3a52;border-radius:12px;padding:16px 26px">
      <span style="font-size:31px;font-weight:700;color:#e8c56a;letter-spacing:3px;font-family:Consolas,monospace">${spaced}</span>
    </div>
  </td></tr>
  <tr><td style="padding:0 24px 6px;color:#a8a8bd;font-size:13px;line-height:1.9;text-align:right">
    الرمز صالح لمدة ${minutes} دقيقة، ولمرة واحدة فقط.
  </td></tr>
  <tr><td style="padding:14px 24px 22px;color:#8a8aa0;font-size:12px;line-height:1.9;text-align:right;border-top:1px solid #2a2a3d">
    إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — كلمة مرورك الحالية باقية كما هي، ولن يتغيّر شيء في حسابك.
  </td></tr>
</table>
<div style="max-width:520px;margin:14px auto 0;color:#5c5c72;font-size:11px;text-align:center">رسالة آلية من خادم شطرنج أم-خ. لا ترد عليها.</div>
</body></html>`;
}

function resetText(code, name, minutes) {
  return `مرحبًا ${name || ''}\n\n`
    + `رمز إعادة تعيين كلمة المرور لحسابك في شطرنج أم-خ:\n\n    ${code}\n\n`
    + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
    + `إذا لم تطلب إعادة التعيين فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`;
}

async function sendResetCode({ to, code, name, minutes = 15 }) {
  const tx = transport();
  if (!tx) throw new Error('SMTP غير مهيّأ على الخادم');
  const c = cfg();
  await tx.sendMail({
    from: c.from, to,
    subject: `رمز إعادة تعيين كلمة المرور: ${code}`,
    text: resetText(code, name, minutes),
    html: resetHtml(code, name, minutes),
  });
}

/* بريد حساب جوجل: المستخدم طلب استعادة كلمة مرور لحساب مالوش كلمة مرور
   أصلًا (داخل بجوجل). الردّ من الـAPI موحّد عشان مانكشفش الحسابات، فالبريد
   ده هو المكان الوحيد اللي يعرف صاحب الحساب فيه الحقيقة. */
function googleHtml(name) {
  const who = name ? esc(name) : 'لاعب شطرنج أم-خ';
  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#0a0a14;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:520px;margin:0 auto;background:#14141f;border:1px solid #2a2a3d;border-radius:16px;overflow:hidden">
  <tr><td style="padding:22px 24px 6px;text-align:center">
    <div style="font-size:19px;font-weight:700;color:#e8c56a;letter-spacing:.5px">شطرنج أم-خ</div>
    <div style="height:2px;width:54px;margin:12px auto 0;background:#e8c56a;border-radius:2px"></div>
  </td></tr>
  <tr><td style="padding:18px 24px 4px;color:#e9e9f2;font-size:15px;line-height:1.9;text-align:right">
    مرحبًا ${who}،<br>
    وصلنا طلب لإعادة تعيين كلمة المرور لحسابك، لكن حسابك ليس له كلمة مرور من الأصل.
  </td></tr>
  <tr><td style="padding:12px 24px;color:#e9e9f2;font-size:15px;line-height:1.9;text-align:right">
    أنت مسجَّل عن طريق <b style="color:#e8c56a">حسابك في جوجل</b>. للدخول، افتح التطبيق
    واضغط زر «الدخول بحساب جوجل» — لا تحتاج كلمة مرور ولا رمزًا.
  </td></tr>
  <tr><td style="padding:14px 24px 22px;color:#8a8aa0;font-size:12px;line-height:1.9;text-align:right;border-top:1px solid #2a2a3d">
    إذا لم تطلب إعادة التعيين فتجاهل هذه الرسالة — لم يتغيّر شيء في حسابك.
  </td></tr>
</table>
<div style="max-width:520px;margin:14px auto 0;color:#5c5c72;font-size:11px;text-align:center">رسالة آلية من خادم شطرنج أم-خ. لا ترد عليها.</div>
</body></html>`;
}

async function sendGoogleNotice({ to, name }) {
  const tx = transport();
  if (!tx) throw new Error('SMTP غير مهيّأ على الخادم');
  const c = cfg();
  await tx.sendMail({
    from: c.from, to,
    subject: 'حسابك يعمل بتسجيل الدخول عبر جوجل',
    text: `مرحبًا ${name || ''}\n\n`
      + `وصلنا طلب لإعادة تعيين كلمة مرور حسابك في شطرنج أم-خ، لكن حسابك ليس له كلمة مرور.\n`
      + `أنت مسجَّل عن طريق جوجل: افتح التطبيق واضغط «الدخول بحساب جوجل».\n\n`
      + `إذا لم تطلب ذلك فتجاهل الرسالة، ولن يتغيّر شيء في حسابك.`,
    html: googleHtml(name),
  });
}

/* ══════════════════════════════════════════════════════════════════════
   #13 — رمز تأكيد البريد عند إنشاء حساب يدوي
   ──────────────────────────────────────────────────────────────────────
   نصّ مختلف عن رسالة الاستعادة عن قصد: صاحب الرسالة دي لسه مالوش حساب،
   فالمطلوب منه «إكمال إنشاء الحساب» مش «إعادة تعيين». ولو الرسالة وصلت
   لحد ماطلبهاش يبقى فيه واحد بيكتب بريده بالغلط (أو بيجرّب) — فالسطر
   الأخير بيطمّنه إن مافيش حساب اتعمل ولا هيتعمل بلا الرمز ده.
══════════════════════════════════════════════════════════════════════ */
function signupHtml(code, name, minutes) {
  const who = name ? esc(name) : 'لاعب شطرنج أم-خ';
  const spaced = String(code).split('').join('&nbsp;&nbsp;');
  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#0a0a14;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:520px;margin:0 auto;background:#14141f;border:1px solid #2a2a3d;border-radius:16px;overflow:hidden">
  <tr><td style="padding:22px 24px 6px;text-align:center">
    <div style="font-size:19px;font-weight:700;color:#e8c56a;letter-spacing:.5px">شطرنج أم-خ</div>
    <div style="height:2px;width:54px;margin:12px auto 0;background:#e8c56a;border-radius:2px"></div>
  </td></tr>
  <tr><td style="padding:18px 24px 4px;color:#e9e9f2;font-size:15px;line-height:1.9;text-align:right">
    مرحبًا ${who}،<br>
    أهلًا بك في شطرنج أم-خ. لتأكيد بريدك وإكمال إنشاء حسابك، أدخل الرمز التالي في التطبيق:
  </td></tr>
  <tr><td style="padding:18px 24px" align="center">
    <div style="display:inline-block;background:#0f0f1a;border:1px solid #3a3a52;border-radius:12px;padding:16px 26px">
      <span style="font-size:31px;font-weight:700;color:#e8c56a;letter-spacing:3px;font-family:Consolas,monospace">${spaced}</span>
    </div>
  </td></tr>
  <tr><td style="padding:0 24px 6px;color:#a8a8bd;font-size:13px;line-height:1.9;text-align:right">
    الرمز صالح لمدة ${minutes} دقيقة، ولمرة واحدة فقط.
  </td></tr>
  <tr><td style="padding:14px 24px 22px;color:#8a8aa0;font-size:12px;line-height:1.9;text-align:right;border-top:1px solid #2a2a3d">
    إذا لم تطلب إنشاء حساب فتجاهل هذه الرسالة — لم يُنشأ أي حساب بهذا البريد، ولن يُنشأ بدون هذا الرمز.
  </td></tr>
</table>
<div style="max-width:520px;margin:14px auto 0;color:#5c5c72;font-size:11px;text-align:center">رسالة آلية من خادم شطرنج أم-خ. لا ترد عليها.</div>
</body></html>`;
}

async function sendSignupCode({ to, code, name, minutes = 15 }) {
  const tx = transport();
  if (!tx) throw new Error('SMTP غير مهيّأ على الخادم');
  const c = cfg();
  await tx.sendMail({
    from: c.from, to,
    subject: `رمز تأكيد بريدك: ${code}`,
    text: `مرحبًا ${name || ''}\n\n`
      + `رمز تأكيد بريدك لإكمال إنشاء حسابك في شطرنج أم-خ:\n\n    ${code}\n\n`
      + `الرمز صالح لمدة ${minutes} دقيقة ولمرة واحدة.\n`
      + `إذا لم تطلب إنشاء حساب فتجاهل الرسالة — لم يُنشأ أي حساب بهذا البريد.`,
    html: signupHtml(code, name, minutes),
  });
}

module.exports = { ready, status, verify, sendResetCode, sendGoogleNotice, sendSignupCode };
