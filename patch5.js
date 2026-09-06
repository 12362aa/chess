const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf-8');

// ============================================================
// 1. Replace emoji icons in modal with pure CSS/SVG icons
// ============================================================
// Remove old icon styles
const oldIconStyles = `.app-modal-icon { font-size: 40px; margin-bottom: 15px; }`;
const newIconStyles = `.app-modal-icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.app-modal-icon.error { background: rgba(247,118,142,0.12); box-shadow: 0 0 0 8px rgba(247,118,142,0.06); }
.app-modal-icon.info  { background: rgba(122,162,247,0.12); box-shadow: 0 0 0 8px rgba(122,162,247,0.06); }
/* CSS-drawn warning triangle */
.cam-warn-tri { width:0; height:0; border-left:13px solid transparent; border-right:13px solid transparent; border-bottom:22px solid #f7768e; position:relative; }
.cam-warn-tri::after { content:'!'; position:absolute; top:4px; left:-4px; color:#1e2030; font-size:13px; font-weight:900; }
/* CSS-drawn info circle */
.cam-info-circ { width:22px; height:22px; border-radius:50%; border:3px solid #7aa2f7; position:relative; }
.cam-info-circ::after { content:'i'; position:absolute; top:50%; left:50%; transform:translate(-50%,-52%); color:#7aa2f7; font-size:14px; font-weight:900; font-style:italic; }`;

html = html.replace(oldIconStyles, newIconStyles);

// Replace emoji-based icon in HTML
html = html.replace(
  '<div id="cam-icon" class="app-modal-icon error">⚠️</div>',
  '<div id="cam-icon" class="app-modal-icon error"><div class="cam-warn-tri"></div></div>'
);

// Update showCustomModal JS to set proper icons (no emoji)
const oldShowModal = `window.showCustomModal = function(title, msg, type = 'error') {
  document.getElementById('cam-title').textContent = title;
  document.getElementById('cam-msg').textContent = msg;
  const icon = document.getElementById('cam-icon');
  if(type === 'error') {
    icon.textContent = '⚠️'; icon.className = 'app-modal-icon error';
  } else {
    icon.textContent = 'ℹ️'; icon.className = 'app-modal-icon info';
  }
  document.getElementById('custom-app-modal').classList.add('active');
};`;
const newShowModal = `window.showCustomModal = function(title, msg, type = 'error') {
  document.getElementById('cam-title').textContent = title;
  document.getElementById('cam-msg').textContent = msg;
  const icon = document.getElementById('cam-icon');
  if(type === 'error') {
    icon.className = 'app-modal-icon error';
    icon.innerHTML = '<div class="cam-warn-tri"></div>';
  } else {
    icon.className = 'app-modal-icon info';
    icon.innerHTML = '<div class="cam-info-circ"></div>';
  }
  document.getElementById('custom-app-modal').classList.add('active');
};`;
html = html.replace(oldShowModal, newShowModal);

// ============================================================
// 2. Fix BLEManager.init() to auto-request permissions first
// ============================================================
const oldInit = `  async init() {
    if (!window.Capacitor || !window.BleClient) {
      window.showCustomModal("عذراً", "ميزة البلوتوث تعمل فقط داخل التطبيق المثبت على الموبايل.", "error");
      return false;
    }
    try {
      await window.BleClient.initialize();
      return true;
    } catch(e) {
      window.showCustomModal("تعذر الاتصال بالبلوتوث", "الرجاء التأكد من تشغيل البلوتوث وتفعيل خدمة الموقع (GPS) وإعطاء التطبيق الصلاحيات المطلوبة من الإعدادات.", "error");
      return false;
    }
  },`;

const newInit = `  async init() {
    if (!window.Capacitor || !window.BleClient) {
      window.showCustomModal("عذراً", "ميزة البلوتوث تعمل فقط داخل التطبيق المثبت على الموبايل.", "error");
      return false;
    }
    const BleClient = window.BleClient;
    try {
      // Step 1: Check & request permissions automatically
      const perms = await BleClient.checkPermissions();
      const needRequest = Object.values(perms).some(v => v !== 'granted');
      if (needRequest) {
        this.setStatus("جارٍ طلب صلاحيات البلوتوث...");
        const result = await BleClient.requestPermissions();
        const denied = Object.values(result).some(v => v === 'denied');
        if (denied) {
          window.showCustomModal("صلاحيات مرفوضة", "لم تُمنح صلاحيات البلوتوث. يرجى السماح بها عند الطلب.", "error");
          return false;
        }
      }

      // Step 2: Check if BT is enabled & try to enable it
      try {
        const enabled = await BleClient.isEnabled();
        if (!enabled) {
          this.setStatus("جارٍ تشغيل البلوتوث...");
          await BleClient.enable();
        }
      } catch(enableErr) {
        // Android 12+ doesn't allow enabling BT programmatically — show a friendly prompt
        window.showCustomModal("البلوتوث مُعطَّل", "يرجى تشغيل البلوتوث من شريط الإشعارات ثم المحاولة مجدداً.", "error");
        return false;
      }

      // Step 3: Initialize
      await BleClient.initialize();
      return true;
    } catch(e) {
      window.showCustomModal("فشل التهيئة", "حدث خطأ أثناء تهيئة البلوتوث: " + (e.message || e), "error");
      return false;
    }
  },`;

html = html.replace(oldInit, newInit);

// ============================================================
// 3. Redesign Bluetooth screen — remove emojis from tabs
// ============================================================
// Replace crown emoji in host button with CSS icon
html = html.replace(
  `<span class="bt-tab-icon">👑</span> استضافة`,
  `<svg class="bt-tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L15 9H22L16.5 13.5L18.5 21L12 17L5.5 21L7.5 13.5L2 9H9L12 2Z"/></svg> استضافة`
);
// Replace magnifier emoji with CSS scan icon
html = html.replace(
  `<span class="bt-tab-icon">🔍</span> بحث`,
  `<svg class="bt-tab-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg> بحث`
);

// Add SVG tab icon style
html = html.replace('.bt-tab-btn.active {', `.bt-tab-svg { width:18px; height:18px; flex-shrink:0; }
.bt-tab-btn.active {`);

// Replace BLE icon wrapper — use SVG BLE symbol instead of runic ᛒ
html = html.replace(
  `<div class="bt-icon-wrapper"><span class="ic-blue bt-pulse-icon">ᛒ</span></div>`,
  `<div class="bt-icon-wrapper">
  <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/>
  </svg>
  </div>`
);

// Upgrade radar to a proper BLE ring animation
const oldRadar = `.bt-radar-container {
  width: 80px; height: 80px; border-radius: 50%; border: 2px solid rgba(122, 162, 247, 0.3); position: relative; overflow: hidden; margin: 10px auto;
}
.bt-radar-sweep {
  position: absolute; top: 0; left: 50%; width: 50%; height: 100%; background: linear-gradient(90deg, rgba(122, 162, 247, 0) 0%, rgba(122, 162, 247, 0.6) 100%); transform-origin: 0% 50%; animation: radar-spin 1.5s linear infinite;
}
@keyframes radar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
const newRadar = `.bt-radar-container {
  width: 90px; height: 90px; position: relative; margin: 8px auto; display: flex; align-items: center; justify-content: center;
}
.bt-radar-ring {
  position: absolute; border-radius: 50%; border: 2px solid #7aa2f7; animation: bt-ring-pulse 2s ease-out infinite;
}
.bt-radar-ring:nth-child(1) { width: 100%; height: 100%; animation-delay: 0s; }
.bt-radar-ring:nth-child(2) { width: 66%; height: 66%; animation-delay: 0.6s; }
.bt-radar-ring:nth-child(3) { width: 33%; height: 33%; animation-delay: 1.2s; }
@keyframes bt-ring-pulse { 0% { opacity: 1; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1); } }`;
html = html.replace(oldRadar, newRadar);

// Replace radar div in HTML
html = html.replace(
  '<div class="bt-radar-container" id="bt-radar" style="display:none;">\n      <div class="bt-radar-sweep"></div>',
  '<div class="bt-radar-container" id="bt-radar" style="display:none;">\n      <div class="bt-radar-ring"></div>\n      <div class="bt-radar-ring"></div>\n      <div class="bt-radar-ring"></div>'
);

fs.writeFileSync('index.html', html, 'utf-8');
console.log('Patch5 complete: permissions auto-request + CSS icons');
