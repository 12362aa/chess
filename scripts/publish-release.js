const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || '12362aa/chess';
const apkPath = path.join(__dirname, '..', 'Chess-AmKh-Online-Fixed-2026-08-15.apk');

if (!fs.existsSync(apkPath)) {
  console.error('APK file not found:', apkPath);
  process.exit(1);
}

const tag = 'v2.2.0-online';
const releaseName = 'شطرنج Am-Kh - نسخة الأونلاين المحدثة v2.2.0';
const releaseBody = `♟ **نسخة جديدة من تطبيق شطرنج Am-Kh للأندرويد**\n\n` +
  `✅ متصلة بالسيرفر المباشر وتعمل أونلاين من أي مكان في العالم.\n` +
  `✅ تم حل مشكلة CORS واستجابة الـ WebSocket بنجاح 100%.`;

function apiRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com/repos/${repo}${endpoint}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'User-Agent': 'Node-Release-Uploader',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    if (data) {
      options.headers['Content-Type'] = 'application/json';
    }
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('Creating/getting GitHub release for tag:', tag);
  let release;
  const getRes = await apiRequest('GET', `/releases/tags/${tag}`);
  if (getRes.status === 200) {
    release = getRes.data;
    console.log('Existing release found:', release.id);
  } else {
    const createRes = await apiRequest('POST', '/releases', {
      tag_name: tag,
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false
    });
    if (createRes.status !== 201) {
      console.error('Failed to create release:', createRes);
      process.exit(1);
    }
    release = createRes.data;
    console.log('Release created successfully:', release.id);
  }

  const uploadUrlRaw = release.upload_url.split('{')[0];
  const apkFileName = 'Chess-AmKh-Online-v2.2.0.apk';
  console.log(`Uploading ${apkFileName} (${fs.statSync(apkPath).size} bytes)...`);

  // Check if asset already exists and delete if present
  if (release.assets && release.assets.length > 0) {
    for (const asset of release.assets) {
      if (asset.name === apkFileName) {
        console.log('Deleting previous asset:', asset.id);
        await apiRequest('DELETE', `/releases/assets/${asset.id}`);
      }
    }
  }

  const apkStats = fs.statSync(apkPath);
  const uploadUrlObj = new URL(`${uploadUrlRaw}?name=${apkFileName}`);
  
  const uploadReq = https.request({
    hostname: uploadUrlObj.hostname,
    path: uploadUrlObj.pathname + uploadUrlObj.search,
    method: 'POST',
    headers: {
      'User-Agent': 'Node-Release-Uploader',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': apkStats.size
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Upload response status:', res.statusCode);
      if (res.statusCode === 201) {
        console.log('🎉 APK uploaded successfully to GitHub Releases!');
        console.log('Download URL:', JSON.parse(body).browser_download_url);
      } else {
        console.error('Upload failed:', body);
      }
    });
  });

  uploadReq.on('error', err => console.error('Upload error:', err));
  fs.createReadStream(apkPath).pipe(uploadReq);
}

main().catch(console.error);
