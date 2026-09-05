const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = process.argv[2] || path.join(__dirname, '..', 'chess-amkh-3.13.apk');
const assetName = 'chess-amkh-3.13.apk';
const tag = 'v3.13';
const releaseName = 'شطرنج Am-Kh — استعادة كلمة السر، مكالمة فيديو، وتفاعلات كاملة';
const releaseBody = [
  '♟ **شطرنج Am-Kh** — تحديث جديد (بناء 29)',
  '',
  '- 🔑 **استعادة كلمة السر** — رمز يصل إلى بريدك يعيد إليك حسابك، فلم يعد نسيان كلمة السر يعني فقدانه للأبد. وإنشاء الحساب اليدوي أصبح يمرّ بتوثيق البريد برمز كذلك.',
  '- 📞 **مكبّر الصوت في المكالمة صار حقيقيًا** — توجيه أصلي للصوت بين مكبّر الصوت وسمّاعة الأذن، ولا يعلن الزرّ حالة لم تتحقّق فعلًا، ويختفي على الأجهزة التي لا سمّاعة أذن فيها.',
  '- 🎥 **ترقية المكالمة الصوتية إلى فيديو** — زرّ يطلب الفيديو، والطرف الآخر يقبل أو يرفض بنافذة لها صوتها الخاص، ثم تظهر الصورة عند الطرفين داخل المكالمة نفسها دون قطعها، مع تبديل الكاميرا وإغلاقها.',
  '- 🕒 **سجلّ المكالمة في موضعه الزمني الصحيح** — كان يقفز إلى أسفل المحادثة دائمًا فتظهر الرسائل الجديدة فوقه كأنّ المكالمة وقعت لحظتها، ولم تعد أوقات رسائل الخادم تظهر ناقصة بفرق المنطقة الزمنية.',
  '- 😀 **كلّ الرموز التعبيرية في التفاعلات** — زرّ «+» يفتح لوحة كاملة مصنّفة بدل ستّة رموز ثابتة.',
  '- 🔖 **قائمة الإشارة إلى الأصدقاء ظاهرة وقابلة للاستخدام** — كانت تنقرض إلى شريط رقيق عند فتح لوحة المفاتيح فيستحيل اختيار أحد.',
  '- 👋 **شاشة الترحيب تظهر أوّلًا وفورًا** — لم تعد لمحة من الشاشة الرئيسية تسبقها في أوّل تشغيل، وصارت بحركة شطرنج ومظهر يتبع الثيم المختار.',
  '- 🗓 **التحدّيات اليومية والإحصاءات تُحصي كلّ مباراة** — كانت مباراة واحدة فقط تُسجَّل في كلّ تشغيل، فيتوقّف عدّاد التحدّي دون سببٍ ظاهر.',
  '- 🔒 **«من يمكنه دعوتي لمباراة» صار مُطبَّقًا** — كان الإعداد بلا أثر فتصل الدعوات حتى مع إغلاقه.',
  '- 👁 **المشاهدة بثيم اللاعب المُشاهَد** — رقعته وقطعه كما يراها هو، لا كما ضبطها المتفرّج.',
  '- 🧠 **نور يعرف لونه دائمًا** — لم يعد يخلط بين الأبيض والأسود ولا ينسب قطع خصمه إلى نفسه، وفي مراجعة مباريات لم يلعبها يتحدّث كمحلّل خارجي.',
  '- 💬 **تعليق نور بعد المباراة متنوّع** — بدل عبارات مكرّرة، تعليق مبنيّ على ما جرى في المباراة فعلًا.',
  '- ✨ **تصنيف النقلات في المراجعة أدقّ** — «رائعة» لم تعد توزَّع في مباراة عادية؛ صارت مشروطة بتضحية مادّة حقيقية تبقى النقلة معها الأفضل، على نسق المعايير المعروفة.',
  '- ⌨️ **مربّع كتابة المحادثة يقف فوق لوحة المفاتيح على الأجهزة اللوحية** — دون انقراض ولا اهتزاز في الترويسة.',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v3.13/chess-amkh-3.13.apk',
].join('\n');

if (!token) { console.error('GH_TOKEN مفقود في .env'); process.exit(1); }
if (!fs.existsSync(apkPath)) { console.error('APK غير موجود:', apkPath); process.exit(1); }

function api(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${repo}${endpoint}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: { 'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(data ? { 'Content-Type': 'application/json' } : {}) },
    }, res => { let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, body: b }); } }); });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function upload(uploadBase, name, file) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(file).size;
    const url = new URL(`${uploadBase}?name=${name}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { 'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': size },
    }, res => { let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', reject);
    fs.createReadStream(file).pipe(req);
  });
}

(async () => {
  console.log('الإصدار:', tag);
  let release;
  const got = await api('GET', `/releases/tags/${tag}`);
  if (got.status === 200) {
    release = got.data;
    console.log('إصدار موجود — هنحدّثه:', release.id);
    await api('PATCH', `/releases/${release.id}`, { name: releaseName, body: releaseBody });
  } else {
    const created = await api('POST', '/releases', {
      tag_name: tag, name: releaseName, body: releaseBody, draft: false, prerelease: false,
    });
    if (created.status !== 201) { console.error('فشل إنشاء الإصدار:', created); process.exit(1); }
    release = created.data;
    console.log('الإصدار اتعمل:', release.id);
  }

  for (const a of release.assets || []) {
    if (a.name === assetName) { console.log('حذف أصل قديم:', a.id); await api('DELETE', `/releases/assets/${a.id}`); }
  }

  console.log(`رفع ${assetName} (${(fs.statSync(apkPath).size / 1048576).toFixed(1)} MB)…`);
  const up = await upload(release.upload_url.split('{')[0], assetName, apkPath);
  console.log('حالة الرفع:', up.status);
  if (up.status === 201) {
    console.log('✔ تم الرفع:', JSON.parse(up.body).browser_download_url);
  } else {
    console.error('فشل الرفع:', up.body); process.exit(1);
  }
  console.log('صفحة الإصدار:', release.html_url);
})().catch(e => { console.error(e); process.exit(1); });
