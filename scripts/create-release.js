/* ينشئ (أو يجيب) ريليس GitHub لوسم مُعطى ويطبع رابط رفع الأصول (upload_url).
   الرفع نفسه بيتعمل بـ curl بره السكربت لأن رفع ملف كبير (126م) عبر
   https.request بيعمل timeout. الاستخدام:
     node scripts/create-release.js <tag> */
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const tag = process.argv[2];
if (!token) { console.error('NO_TOKEN'); process.exit(1); }
if (!tag) { console.error('NO_TAG'); process.exit(1); }

const name = `شطرنج Am-Kh ${tag}`;
const body = [
  '♟ تحديث Am-Kh ' + tag,
  '',
  '• رابط دعوة الحفلة بيضمّك للحفلة فعليًا بعد تسجيل الدخول (مش بيفتح الموقع وبس).',
  '• لوحة الصدارة اتنقلت لمكان بارز ثابت في الشريط العلوي (زر الكأس) — واتحلّت الخانة الفاضية وتخطيط التابلت.',
  '• توضيح التقييم: بيتغيّر في المباريات المصنّفة فقط بين حسابين مختلفين؛ علامة «؟» = تقييم مبدئي لحد ما يثبت.',
].join('\n');

function api(method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${repo}${endpoint}`);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'User-Agent': 'amkh-release', 'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
    }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, body: b }); } }); });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

(async () => {
  let rel;
  const got = await api('GET', `/releases/tags/${tag}`);
  if (got.status === 200) { rel = got.data; }
  else {
    const cr = await api('POST', '/releases', { tag_name: tag, name, body, draft: false, prerelease: false });
    if (cr.status !== 201) { console.error('CREATE_FAILED', cr.status, JSON.stringify(cr.data || cr.body)); process.exit(1); }
    rel = cr.data;
  }
  // امسح أي أصل بنفس الاسم عشان الرفع مايفشلش بـ 422
  const apkName = `Chess-AmKh-${tag}.apk`;
  for (const a of (rel.assets || [])) {
    if (a.name === apkName) { await api('DELETE', `/releases/assets/${a.id}`); }
  }
  console.log('UPLOAD_URL=' + rel.upload_url.split('{')[0]);
  console.log('APK_NAME=' + apkName);
  console.log('RELEASE_ID=' + rel.id);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
