const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = process.argv[2] || path.join(__dirname, '..', 'play-store', 'chess-amkh-4.1.apk');
const assetName = 'chess-amkh-4.1.apk';
const tag = 'v4.1';
const releaseName = 'شطرنج Am-Kh 4.1 — النقلة المسبقة، التعادلات، حذف الرسائل، تصنيف النقلات، والتطبيق بالإنجليزية';
const releaseBody = [
  '♟ **شطرنج Am-Kh 4.1** — إصدار رئيسي (بناء 34)',
  '',
  'هذا ليس ترقيعًا: سبع إضافات في قلب اللعب لا في أطرافه، ولذلك انتقل الرقم من 4.0 إلى 4.1 وانتقل معه ملفّ التنزيل.',
  '',
  '- ⚡ **النقلة المسبقة في كلّ الأوضاع** — اضغط نقلتك وخصمك لا يزال يفكّر. تُنفَّذ في اللحظة التي تصل فيها نقلته إن بقيت قانونية، وتُلغى بضغطة واحدة إن لم تبقَ. تعمل ضدّ نور وضدّ المحرّك وعلى الإنترنت وعبر البلوتوث.',
  '- 🤝 **التعادل بالتكرار وبقاعدة الخمسين نقلة** — الوضعية التي تتكرّر ثلاث مرّات تُنهي المباراة تعادلًا، وكذلك خمسون نقلة بلا أكل ولا تحريك بيدق. المباراة التي لا تتقدّم تُغلَق بنفسها كما تقول قوانين اللعبة، بدل أن تدور بلا نهاية.',
  '- 🗑 **حذف الرسائل كما اعتدته** — «حذف عندي» يزيل الرسالة من جهازك وحدك، و«حذف عند الجميع» يستبدلها بسطر «حُذفت هذه الرسالة» عند الطرفين. في محادثات الأصدقاء والمجموعات معًا.',
  '- 👥 **رسائل نظام الحفلة صارت تقول ما جرى** — مرّة واحدة لا مرّتين، وبالضبط: من أُضيف، ومن خرج، ومن أُخرِج، ومن انضمّ برابط الدعوة.',
  '- 🎯 **مراجعة نور تناديك باسمك وتعرف خصمك** — مرحلة نور، أو مستوى محرّك Stockfish، أو اسم خصمك على الإنترنت. وتقرأ مباراتك بأرقامها — عدد النقلات، والقطع المتبادلة، وفارق المادة، ومرّات الكش — لا بعبارة عامّة تصلح لأي مباراة.',
  '- 🏅 **علامات تصنيف النقلات بمعايير المواقع الكبرى** — عبقرية، وممتازة، وأفضل نقلة، وكتابية، وعدم دقّة، وخطأ، وفرصة ضائعة، وخطأ فادح. لكلٍّ علامته ولونه على بطاقة النقلة في المراجعة.',
  '- 🌍 **التطبيق كلّه بالإنجليزية إن شئت** — تختار اللغة من شاشة الترحيب في أوّل تشغيل، أو من الإعدادات في أي وقت. تتحوّل كلّ كلمة في التطبيق بما فيها تعليق نور بعد المباراة ومراجعته كمدرّب، وينقلب اتّجاه الواجهة إلى اليسار. والرجوع إلى العربية بضغطة واحدة يُعيد كلّ شيء كما كان.',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v4.1/chess-amkh-4.1.apk',
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
