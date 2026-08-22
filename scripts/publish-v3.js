/* نشر نسخة APK على GitHub Releases.
   نفس نمط scripts/publish-release.js: التوكن من .env (GH_TOKEN) مش
   مكتوب في الملف، فالسكربت آمن للتتبّع في git.

   node scripts/publish-v3.js <path-to-apk>
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
  console.error('لازم مسار APK موجود. الاستخدام: node scripts/publish-v3.js <apk>');
  process.exit(1);
}

const tag = 'v3.1';
const releaseName = 'شطرنج Am-Kh v3.1 — نور يشتغل، الأصدقاء، وإصلاحات كبيرة';
const releaseBody = [
  '## ♟ أكبر تحديث في تاريخ التطبيق',
  '',
  '### أهم الإصلاحات في النسخة دي',
  '- **نور (الذكاء الاصطناعي) بيشتغل فعلًا** — بيرد عليك بالعربي في مراحل التعلّم والدردشة.',
  '- **الدخول بحساب جوجل** اتصلّح وبيكمّل لآخره من غير أخطاء.',
  '- **اختفى الوميض** عند فتح التطبيق والتنقّل بين الشاشات — في كل الثيمات مش بس amkh.',
  '- **أزرار الأصدقاء كلها شغّالة**: الدعوة (مع اختيار لونك بنافذة أنيقة)، الحذف، والحظر.',
  '',
  '### نظام الأصدقاء وتسجيل الدخول',
  '- **حساب**: تسجيل دخول بالبريد الإلكتروني أو **بحساب جوجل**.',
  '- **الأصدقاء**: ابحث عن لاعب باسمه، ابعت طلب صداقة، وشوف مين متصل دلوقتي.',
  '- **دعوة لمباراة**: ادعِ صاحبك وهو متصل والمباراة تبدأ فورًا — نفس وضع الأونلاين بالشات والصور.',
  '- **حظر**: تقدر تحظر أي لاعب، فمايقدرش يبعتلك طلب ولا دعوة ولا يلاقيك في البحث.',
  '- **خصوصية**: بريدك الإلكتروني مش ظاهر لأي حد. الأصدقاء بيلاقوك باسم المستخدم بس.',
  '',
  '### محرك اللعب (Stockfish)',
  '- **مستويات الصعوبة اتظبطت من الصفر**: عشر مستويات حقيقية من «مبتدئ» لحد «أسطورة».',
  '- **أقل مستوى بقى فعلًا سهل** — المحرك بيلعب ببساطة وبيغلط، مش قوي زي ما كان.',
  '- **سلّم متدرّج** لكل مستوى قوّته وسرعته، والمستوى العاشر بكامل قوة المحرك بلا كبح.',
  '- **شاشة اختيار المحرك اتعملت من جديد** بتصميم واضح يناسب الموبايل والتابلت، وبتتبع ثيم التطبيق.',
  '',
  '### تحسينات',
  '- **الرقعة رجعت لحجمها الكامل** على الموبايل (كانت اتصغّرت بالغلط) والقطع أكبر.',
  '- **اختفى الفراغ الفاضي** فوق شاشة اللعب.',
  '- **الرقعة مابتتحركش** مع كل نقلة.',
  '- **كل ثيم بقى له شخصيته**: طقم أيقونات خاص وألوان مضبوطة —',
  '  سايبر أخضر فوسفوري، أنمي حِبري وسماوي، جيمنج أحمر إسبورتس.',
  '- **شاشة إعدادات جديدة** فيها تبويب للحساب والأصدقاء.',
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

  const assetName = path.basename(apkPath);
  /* لو فيه ملف بنفس الاسم من محاولة سابقة، بنشيله عشان الرفع مايفشلش */
  for (const a of release.assets || []) {
    if (a.name === assetName) {
      console.log('حذف ملف قديم بنفس الاسم…');
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
