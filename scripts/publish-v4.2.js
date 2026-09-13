/* نشر إصدار 4.2 على GitHub: ملاحظات عربية + ثلاثة أصول.
   الأصول: APK للتنزيل المباشر، وAAB لرفعه على Google Play، وحزمة
   مضغوطة فيها لقطات المتجر بلغتين والأيقونة والرسم البارز والوصف —
   كي يكفي رابط واحد لمن يتولّى الرفع على المتجر.
   node scripts/publish-v4.2.js */
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const root = path.join(__dirname, '..');
const store = path.join(root, 'play-store');

const tag = 'v4.2';
const releaseName = 'شطرنج Am-Kh 4.2 — لغتان لا تختلطان: لا عربية في الإنجليزي ولا إنجليزية في العربي';
const assets = [
  { name: 'chess-amkh-4.2.apk', file: path.join(store, 'chess-amkh-4.2.apk'), type: 'application/vnd.android.package-archive' },
  { name: 'chess-amkh-4.2-build35.aab', file: path.join(store, 'chess-amkh-4.2-build35.aab'), type: 'application/octet-stream' },
  { name: 'amkh-chess-4.2-play-store.zip', file: path.join(store, 'amkh-chess-4.2-play-store.zip'), type: 'application/zip' },
];

const releaseBody = [
  '♟ **شطرنج Am-Kh 4.2** — إصدار اللغة (بناء 35)',
  '',
  'الإصدار السابق أضاف الإنجليزية، وهذا الإصدار يُتقنها: لا يظهر حرف عربي واحد في الوضع الإنجليزي، ولا كلمة إنجليزية واحدة في الوضع العربي — في كل شاشة، وفي إشعارات الهاتف نفسها.',
  '',
  '- 🌍 **فصلٌ تامّ بين اللغتين** — الواجهة، والنوافذ، والرسائل، وشاشة النتيجة، والمراجعة، ولوحة الصدارة، والملفّ الشخصي. وإشعارات الهاتف تتبع لغتك: الرسائل، ودعوات الحفلات، والمكالمات، والتذكير اليومي — لكلّ جهاز لغته المحفوظة على الخادم.',
  '- 🚪 **اختيار اللغة من شاشة الترحيب يسري فورًا** — كان اختيار الإنجليزية في أوّل تشغيل يترك تحدّيات اليوم والصفحة الرئيسية بالعربية حتى تعيد الاختيار من الإعدادات. الآن يتبع كلّ شيء اختيارك من اللحظة الأولى.',
  '- 💬 **نور يجيبك بلغة رسالتك لا بلغة إعداداتك** — اكتب إليه بالعربية يجبك بالعربية، واكتب بالإنجليزية يجبك بالإنجليزية، والتطبيق على حاله. أمّا تعليقه بعد المباراة ومراجعته كمدرّب فيتبعان لغة التطبيق.',
  '- 🎨 **أسماء الأطقم والثيمات ودرجات المحرّك بالعربية** — ستّة وثلاثون طقم قطع كانت أسماؤها لاتينية في الوضع العربي، وكذلك أسماء الثيمات ووصف قوّة المحرّك وعمق التحليل، صارت كلّها عربية.',
  '- 🇸🇦🇺🇸 **رمز لكلّ لغة في الإعدادات** — كانت شريحتا اللغة تعرضان ألوان ثيم Amkh ولا علاقة لهما باللغة؛ صار لكلّ لغة علمها المرسوم داخل التطبيق.',
  '- 📐 **بطاقة الإحصاءات السريعة وعلامات التصنيف** — البطاقة استوت في منتصف الشاشة وكبر حجمها، وعلامات تصنيف النقلات ثبتت داخل إطارها بلا خروج ولا تشويه.',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v4.2/chess-amkh-4.2.apk',
  '',
  '---',
  '',
  '**ملفّات المتجر** مرفقة في هذا الإصدار: `chess-amkh-4.2-build35.aab` للرفع على Google Play، و`amkh-chess-4.2-play-store.zip` وفيها لقطات الشاشة بالعربية والإنجليزية، والأيقونة 512، والرسم البارز 1024×500، ونصوص الوصف.',
].join('\n');

if (!token) { console.error('GH_TOKEN مفقود في .env'); process.exit(1); }
for (const a of assets) {
  if (!fs.existsSync(a.file)) { console.error('أصل مفقود:', a.file); process.exit(1); }
}

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

function upload(uploadBase, name, file, type) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(file).size;
    const url = new URL(`${uploadBase}?name=${name}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { 'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Content-Type': type, 'Content-Length': size },
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
    console.log('إصدار موجود — سيُحدَّث:', release.id);
    await api('PATCH', `/releases/${release.id}`, { name: releaseName, body: releaseBody });
  } else {
    const created = await api('POST', '/releases', {
      tag_name: tag, name: releaseName, body: releaseBody, draft: false, prerelease: false,
    });
    if (created.status !== 201) { console.error('فشل إنشاء الإصدار:', created); process.exit(1); }
    release = created.data;
    console.log('أُنشئ الإصدار:', release.id);
  }

  const base = release.upload_url.split('{')[0];
  for (const a of assets) {
    for (const old of release.assets || []) {
      if (old.name === a.name) { console.log('حذف أصل قديم:', old.name); await api('DELETE', `/releases/assets/${old.id}`); }
    }
    const mb = (fs.statSync(a.file).size / 1048576).toFixed(1);
    console.log(`رفع ${a.name} (${mb} MB)…`);
    const up = await upload(base, a.name, a.file, a.type);
    if (up.status === 201) console.log('  ✔', JSON.parse(up.body).browser_download_url);
    else { console.error('  فشل الرفع:', up.status, up.body.slice(0, 300)); process.exit(1); }
  }
  console.log('صفحة الإصدار:', release.html_url);
})().catch(e => { console.error(e); process.exit(1); });
