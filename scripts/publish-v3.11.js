const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = process.argv[2] || path.join(__dirname, '..', 'chess-amkh-3.11.apk');
const assetName = 'chess-amkh-3.11.apk';
const tag = 'v3.11';
const releaseName = 'شطرنج Am-Kh — مشاهدة المباريات المحلية ومحادثة بملء الشاشة';
const releaseBody = [
  '♟ **شطرنج Am-Kh** — تحديث جديد (بناء 27)',
  '',
  '- 👁 **مشاهدة مباريات الأصدقاء المحلية** — كان زرّ «مشاهدة» يعمل مع الأونلاين فقط. صار بإمكانك متابعة مباراة صديقك أمام نور أو أمام المحرّك أو بين لاعبين على جهاز واحد أو عبر البلوتوث، بالأسماء الحقيقية وكل النقلات التي سبقت دخولك، والتراجع والنتيجة تظهر لديك كما تظهر لديه.',
  '- 📶 **المشاهدة تصمد عند انقطاع الاتصال** — إن انقطع اتصال اللاعب أثناء المباراة تُسجَّل نقلاته، ثم تُعاد المباراة كاملة إلى المتفرّجين عند عودة الاتصال، ولا يبقى أحد أمام شاشة معلّقة.',
  '- 🔘 **الزرّ يتبع الحالة** — انتهت المباراة فاختفى الزرّ فورًا، وبدأت مباراة جديدة على الجهاز نفسه فعاد وحده. لا مزيد من ضغطة تؤدّي إلى طريق مسدود.',
  '- 👥 **أسماء الأصدقاء تظهر كاملة** في القائمة، دون اقتطاع.',
  '- 🔄 **مزامنة الاسم والصورة بعد التثبيت** — تدخل بحسابك على جهاز جديد فيعود ملفك الشخصي كما هو.',
  '- 💬 **محادثة بملء الشاشة** على الهاتف واللوح الرقمي، ولوحة مفاتيح مستقرّة على الأجهزة اللوحية.',
  '- 📌 **تثبيت المحادثات لمدّة محدّدة** يُلغى تلقائيًا عند انتهاء المدّة.',
  '- ⚡ **رسائل الحفلات فورية** مع إرسال مؤجَّل يعمل دون اتصال ويُكمل نفسه عند عودة الشبكة.',
  '- ✋ **قائمة رسالة بالضغط المطوّل** بتصميم الثيم وصوته الخاص.',
  '- 🔒 **إعدادات الخصوصية مُنفَّذة فعليًا** على الخادم، لا في الواجهة وحدها.',
  '- 🏆 **تأكيد قبل إضافة صديق من لوحة الصدارة.**',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v3.11/chess-amkh-3.11.apk',
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
