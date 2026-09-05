const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = process.argv[2] || path.join(__dirname, '..', 'play-store', 'chess-amkh-4.0.apk');
const assetName = 'chess-amkh-4.0.apk';
const tag = 'v4.0';
const releaseName = 'شطرنج Am-Kh 4.0 — الأيقونة وتعليق نور والمشاهدة والمراجعة والكيبورد';
const releaseBody = [
  '♟ **شطرنج Am-Kh 4.0** — إصدار رئيسي (بناء 32)',
  '',
  'الرقم انتقل من 3.15 إلى 4.0 لأنّ الإصلاحات هنا في قلب التطبيق لا في أطرافه.',
  '',
  '- 🖼 **أيقونة التطبيق عادت أيقونة** — كانت تظهر مربّعًا أسود على الشاشة الرئيسية وفي الإشعارات عند تثبيت التطبيق من جديد. السبب اثنان: الطبقة الأمامية للأيقونة المتكيّفة كانت بمقاس الأيقونة القديمة (48dp) ومعتمة بالكامل بزوايا سوداء، فكان النظام يكبّرها ويقصّها فلا يبقى إلّا السواد؛ وملف الأيقونة المشترك مع الويب والإشعارات كان تالفًا من أصله. أُعيد توليد الطبقات كلّها بالمقاس الصحيح: حصان شفّاف أمامًا، وتدرّج بلون التطبيق خلفية، وصورة أحاديّة اللون تتبع ثيم أندرويد 13.',
  '- 🗣 **تعليق نور بعد المباراة صار عن المباراة** — كان يهنّئ نفسه على «تحدٍّ جميل»، ويتحدّث عن مشاعره ومستواه، ويذكر لاعبًا لم يلعب، ويكتب الأسماء محرّفة، وقد فعل ذلك في مباراة أونلاين خسرها صاحبها بكشّ ملك. الآن هو معلّق فقط: كلامه عن نقلات المباراة ونتيجتها، في كلّ الأنماط، بلا ذكر لنفسه ولا اسم من عنده.',
  '- ⌨️ **الكيبورد لم يعد ينزل بعد كلّ رسالة** — في محادثة نور وفي محادثات الأصدقاء والمجموعات. السبب أنّ أوّل لمسة على زرّ الإرسال كانت تنقل التركيز بعيدًا عن حقل الكتابة، وأندرويد يُغلق الكيبورد لحظة فقدان الحقل تركيزه ولا يُعيده أي طلب تركيز لاحق. الآن اللمسة لا تنقل التركيز من الأصل، فالكتابة المتّصلة صارت ممكنة.',
  '- 👁 **لكلّ نمط عرضه في المشاهدة** — من شاهد مباراة ضدّ نور كان يقرأ «المرحلة 1 مكتملة» ومعها شريحتا «ودّية» و«بدون وقت»، وهما شريحتان لا معنى لهما إلّا في غرف الأونلاين. الآن يُعلن نوع المباراة مع بثّها: أونلاين، أو نور، أو المحرّك، أو لاعبان على جهاز واحد، أو بلوتوث — ولكلٍّ عنوانه، ونهاية المباراة تُكتب عند المتفرّج بأسماء لاعبيها هو.',
  '- 🔍 **نافذة مراجعة المباراة صُلحت على الهاتف** — كانت تخرج من حدود الشاشة، وكان شريط التطبيق يُرسم فوق عنوانها وزرّ إغلاقها فلا يُرى الرأس ولا يُضغط الزرّ. أُصلح ترتيب الطبقات، ومُنع فيضان شريط النقلات الذي كان يدفع أزرار التنقّل خارج الشاشة، وصارت الرقعة والبطاقات تتّسع لأضيق الشاشات ولمنطقة أشرطة النظام.',
  '- 📞 **لا شريط فوق نوافذ المكالمة** — رُفع الشريط الأفقي كلّه، وحلّ محلّه طابع شطرنجيّ بلون التطبيق لا بلون الرقعة: زوايا مقوّسة على الكارت والمسرح ولوحة السؤال، وصفّ قطع خفيف على الحدّ السفلي.',
  '',
  'رابط التنزيل الدائم: https://github.com/12362aa/chess/releases/download/v4.0/chess-amkh-4.0.apk',
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
