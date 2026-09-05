const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = process.argv[2] || path.join(__dirname, '..', 'play-store', 'chess-amkh-3.14.apk');
const assetName = 'chess-amkh-3.14.apk';
const tag = 'v3.14';
const releaseName = 'شطرنج Am-Kh — تقدّم نور وإعداداتك محفوظة في حسابك';
const releaseBody = [
  '♟ **شطرنج Am-Kh** — تحديث جديد (بناء 30)',
  '',
  '- 🧩 **تقدّمك في مراحل نور محفوظ في حسابك فعلًا** — المراحل ونجومها وأفضل عدد نقلات لكلّ مرحلة تعود إلى جهازك في لحظة تسجيل الدخول. كان التقدّم لا يصل إلى الحساب أبدًا، فمن وصل إلى المرحلة الثالثة ثمّ أعاد التثبيت يجد نفسه في الأولى.',
  '- 🎨 **إعداداتك تعود معك كذلك** — ثيم الواجهة ولون الرقعة وشكل القطع والصوت والإحداثيات وبقيّة الإعدادات، وتُطبَّق على الشاشة فورًا دون إعادة تحميل.',
  '- 👁 **المشاهدة بثيم اللاعب المُشاهَد** — رقعته وقطعه كما يراها هو، لا كما ضبطها المتفرّج. كان الحساب لا يحمل ثيمًا صالحًا فتُرسَم المباراة بثيم المتفرّج.',
  '- 🔄 **زرّ «مزامنة بياناتي الآن» يعمل في الاتجاهين** — ينزّل من الحساب ثمّ يرفع، بدل أن يرفع فقط.',
  '- ⌨️ **لوحة المفاتيح في محادثة المباراة عادت إلى موضعها** — لم تعد تحجب الرسائل ولا تُزيح الشاشة عند الكتابة.',
  '- 👋 **شاشة الترحيب في أوّل تشغيل** — لِنقلاتها صوتها، ولوحها لا يختفي في أثناء العرض، ونصوصها بالفصحى.',
  '- ✉️ **رسائل البريد باسم «Am-Kh Chess»** — وبطاقتها لا تخرج عن حدّ الشاشة في جيميل على الهاتف.',
  '- 📮 **البريد غير الموجود يُرفَض قبل الإرسال** — ويُعرَض كما كتبتَه لتراجعه، فلا يذهب رمز إنشاء الحساب إلى عنوان لا تقرأه ثمّ يرتدّ بعد وقت.',
  '- ⚙️ **تبويبات الحساب مرتّبة من جديد** — كلّ إعداد في بابه.',
  '- 🎥 **رفض ترقية المكالمة إلى فيديو يظهر فوق النافذة** — كان يُفتح خلف نافذة المكالمة فلا يراه أحد، وأُعيد تصميم النافذة نفسها.',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v3.14/chess-amkh-3.14.apk',
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
