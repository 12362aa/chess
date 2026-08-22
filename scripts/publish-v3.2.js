/* نشر نسخة APK على GitHub Releases (v3.2).
   نفس نمط scripts/publish-v3.js: التوكن من .env (GH_TOKEN) مش مكتوب في
   الملف، فالسكربت آمن للتتبّع في git.

   node scripts/publish-v3.2.js <path-to-apk>
*/
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
if (!token) { console.error('GH_TOKEN مش موجود في .env'); process.exit(1); }

const apkPath = process.argv[2];
if (!apkPath || !fs.existsSync(apkPath)) {
  console.error('لازم مسار APK موجود. الاستخدام: node scripts/publish-v3.2.js <apk>');
  process.exit(1);
}

const tag = 'v3.2';
const releaseName = 'شطرنج Am-Kh v3.2 — شات جماعي، إشعارات، ورسائل صوتية أثبت';
const releaseBody = [
  '## ♟ تحديث الدردشة والصوت',
  '',
  '### الجديد',
  '- **شات جماعي زي واتساب** — اعمل جروب من أصدقائك، وكل رسالة بتبان باسم صاحبها وصورته.',
  '- **إشعارات للرسايل وانت بره التطبيق** — يوصلك تنبيه بالرسالة الجديدة حتى والتطبيق مقفول.',
  '- **رسائل صوتية في الشات** — سجّل واسمع، مع شريط تقدّم للتشغيل.',
  '',
  '### إصلاحات الصوت',
  '- **تشغيل الرسائل الصوتية بقى أثبت على الأندرويد** — لو مشغّل النظام رفض الملف، بنفكّه بمحرك الصوت المدمج بدل ما تفشل الرسالة.',
  '- **إصلاح قفلة التسجيل** — التسجيلة القصيرة جدًا كانت بتسيب الميكروفون شغّال وتمنع أي تسجيل بعدها؛ اتصلّحت.',
  '- **طلب صلاحية الميكروفون** مظبوط للصوت في المباراة الأونلاين.',
  '',
  '### تحسينات الشات',
  '- **أيقونات مرسومة** بدل الإيموجي في شريط الكتابة.',
  '- **مؤشّر «بيكتب…»** بيظهر ويختفي صح، مش واقف على طول.',
  '- **أصوات مميّزة** لكل نافذة جديدة (الجروب، إنشاء جروب، الأعضاء).',
  '',
  '### التثبيت',
  'نزّل الملف تحت وافتحه. لو ظهرت رسالة عن «مصادر غير معروفة»، اسمح بالتثبيت.',
].join('\n');

function api(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${repo}${endpoint}`);
    const options = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    if (data) options.headers['Content-Type'] = 'application/json';
    const req = https.request(options, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function upload(uploadUrl, name, file) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(file).size;
    const url = new URL(`${uploadUrl}?name=${encodeURIComponent(name)}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: {
        'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': size,
      },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject);
    let sent = 0, lastPct = -1;
    const stream = fs.createReadStream(file);
    stream.on('data', c => {
      sent += c.length;
      const pct = Math.floor((sent / size) * 100);
      if (pct >= lastPct + 10) { lastPct = pct; process.stdout.write(`  رفع ${pct}%\n`); }
    });
    stream.pipe(req);
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

  /* اسم ثابت واضح للمستخدم — مش basename بتاع الجرادل (app-debug.apk).
     ونمسح أي APK قديم على الإصدار (أيًا كان اسمه) عشان مايفضلش الناس
     يحمّلوا نسخة قديمة جنب الجديدة. */
  const assetName = 'Chess-AmKh-v3.2.apk';
  for (const a of release.assets || []) {
    if (/\.apk$/i.test(a.name)) {
      console.log('حذف نسخة قديمة على الإصدار:', a.name);
      await api('DELETE', `/releases/assets/${a.id}`);
    }
  }

  console.log(`رفع ${assetName} (${(fs.statSync(apkPath).size / 1048576).toFixed(1)} MB)…`);
  const up = await upload(release.upload_url.split('{')[0], assetName, apkPath);
  if (up.status !== 201) { console.error('فشل الرفع:', up.status, up.data || up.body); process.exit(1); }

  console.log('\n✔ تم النشر');
  console.log('صفحة الإصدار:', release.html_url);
  console.log('رابط التحميل المباشر:', up.data.browser_download_url);
})().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
