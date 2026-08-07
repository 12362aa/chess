const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf-8');

// 1. New Bluetooth Screen HTML
const oldScreen = `<!-- BLUETOOTH -->
<div id="s-bluetooth" class="screen">
  <div class="oc">
    <h2><span class="ic-blue">ᛒ</span> Bluetooth</h2>
    <p class="oc-sub">العب أوفلاين مع جهاز قريب عبر البلوتوث</p>
    <div class="p2p">يستخدم <strong>Bluetooth LE</strong> — يعمل بدون إنترنت تماماً ◈</div>
    <div class="tabs" style="margin-bottom:20px;">
      <button class="tbb on" id="tb-bt-host" onclick="BLEManager.hostGame()">استضافة لعبة</button>
      <button class="tbb"    id="tb-bt-join" onclick="BLEManager.scanForGames()">البحث والانضمام</button>
    </div>
    
    <div id="bt-status" style="margin-top:20px; font-size:16px; color:var(--text1); text-align:center; font-weight:bold;">اختر "استضافة" أو "بحث" للبدء.</div>
    <div id="bt-devices-list" style="margin-top:15px; display:flex; flex-direction:column; gap:10px;"></div>

    <button class="btnb" onclick="if(typeof SFX !== 'undefined') SFX.btn();BLEManager.disconnect();Nav.menu()" style="margin-top:40px;">← العودة للقائمة وإلغاء</button>
  </div>
</div>`;

const newScreen = `<!-- BLUETOOTH -->
<div id="s-bluetooth" class="screen bt-premium-screen">
  <div class="oc bt-premium-card">
    <div class="bt-header">
      <div class="bt-icon-wrapper"><span class="ic-blue bt-pulse-icon">ᛒ</span></div>
      <h2 class="bt-title">Bluetooth Match</h2>
      <p class="bt-subtitle">اتصال مباشر بدون إنترنت</p>
    </div>
    
    <div class="bt-tabs">
      <button class="bt-tab-btn active" id="tb-bt-host" onclick="BLEManager.hostGame()">
        <span class="bt-tab-icon">👑</span> استضافة
      </button>
      <button class="bt-tab-btn" id="tb-bt-join" onclick="BLEManager.scanForGames()">
        <span class="bt-tab-icon">🔍</span> بحث
      </button>
    </div>
    
    <div class="bt-radar-container" id="bt-radar" style="display:none;">
      <div class="bt-radar-sweep"></div>
    </div>
    
    <div id="bt-status" class="bt-status-text">اختر "استضافة" أو "بحث" للبدء.</div>
    
    <div id="bt-devices-list" class="bt-devices-grid"></div>

    <button class="bt-back-btn" onclick="if(typeof SFX !== 'undefined') SFX.btn();BLEManager.disconnect();Nav.menu()">← العودة للقائمة</button>
  </div>
</div>`;

html = html.replace(oldScreen, newScreen);

// 2. Add Custom Modal HTML and CSS and JS logic
const bodyEnd = "</body>";
const customModalInject = `
<!-- PREMIUM BLUETOOTH STYLES -->
<style>
.bt-premium-screen {
  background: linear-gradient(135deg, #0f111a 0%, #1a1b26 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.bt-premium-card {
  background: rgba(30, 32, 48, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 24px;
  padding: 30px 20px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.bt-header { text-align: center; margin-bottom: 30px; }
.bt-icon-wrapper {
  width: 70px; height: 70px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3d59a1, #7aa2f7);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 15px;
  box-shadow: 0 10px 20px rgba(122, 162, 247, 0.3);
}
.bt-pulse-icon { font-size: 32px; color: #fff; }
.bt-title { margin: 0; font-size: 24px; font-weight: 800; background: -webkit-linear-gradient(#fff, #a9b1d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.bt-subtitle { margin: 5px 0 0; color: #7aa2f7; font-size: 13px; font-weight: 600; letter-spacing: 1px; }

.bt-tabs {
  display: flex; width: 100%; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 4px; margin-bottom: 20px;
}
.bt-tab-btn {
  flex: 1; background: transparent; border: none; color: #a9b1d6; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 10px; cursor: pointer; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); display:flex; align-items:center; justify-content:center; gap:8px;
}
.bt-tab-btn.active {
  background: #3d59a1; color: #fff; box-shadow: 0 4px 12px rgba(61, 89, 161, 0.4);
}

.bt-status-text {
  color: #c0caf5; font-size: 14px; text-align: center; margin: 15px 0; min-height: 40px; display: flex; align-items: center; justify-content: center;
}

.bt-devices-grid {
  width: 100%; display: flex; flex-direction: column; gap: 10px; margin-bottom: 25px;
}
.bt-device-btn {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 16px; color: #fff; font-size: 16px; text-align: left; cursor: pointer; transition: 0.2s; display: flex; justify-content: space-between; align-items: center;
}
.bt-device-btn:active { transform: scale(0.97); background: rgba(122, 162, 247, 0.1); border-color: #7aa2f7; }

.bt-back-btn {
  background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #a9b1d6; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: bold; cursor: pointer; transition: 0.2s; width: 100%;
}
.bt-back-btn:active { background: rgba(255,255,255,0.05); }

/* Radar Animation */
.bt-radar-container {
  width: 80px; height: 80px; border-radius: 50%; border: 2px solid rgba(122, 162, 247, 0.3); position: relative; overflow: hidden; margin: 10px auto;
}
.bt-radar-sweep {
  position: absolute; top: 0; left: 50%; width: 50%; height: 100%; background: linear-gradient(90deg, rgba(122, 162, 247, 0) 0%, rgba(122, 162, 247, 0.6) 100%); transform-origin: 0% 50%; animation: radar-spin 1.5s linear infinite;
}
@keyframes radar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Custom App Modal */
.app-modal-overlay {
  position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 99999; opacity: 0; pointer-events: none; transition: 0.3s;
}
.app-modal-overlay.active { opacity: 1; pointer-events: auto; }
.app-modal-card {
  background: #1e2030; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 25px; width: 90%; max-width: 320px; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.5); transform: translateY(20px) scale(0.95); transition: 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.app-modal-overlay.active .app-modal-card { transform: translateY(0) scale(1); }
.app-modal-icon { font-size: 40px; margin-bottom: 15px; }
.app-modal-title { color: #fff; font-size: 20px; font-weight: 800; margin: 0 0 10px; }
.app-modal-msg { color: #a9b1d6; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }
.app-modal-btn {
  background: #7aa2f7; color: #1a1b26; border: none; padding: 12px 0; width: 100%; border-radius: 12px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s;
}
.app-modal-btn:active { transform: scale(0.95); background: #5678c4; }
.app-modal-icon.error { color: #f7768e; text-shadow: 0 0 15px rgba(247, 118, 142, 0.4); }
.app-modal-icon.info { color: #7aa2f7; text-shadow: 0 0 15px rgba(122, 162, 247, 0.4); }
</style>

<div id="custom-app-modal" class="app-modal-overlay">
  <div class="app-modal-card">
    <div id="cam-icon" class="app-modal-icon error">⚠️</div>
    <h3 id="cam-title" class="app-modal-title">خطأ</h3>
    <p id="cam-msg" class="app-modal-msg">حدث خطأ غير متوقع.</p>
    <button class="app-modal-btn" onclick="document.getElementById('custom-app-modal').classList.remove('active'); if(typeof SFX !== 'undefined') SFX.btn();">حسناً</button>
  </div>
</div>
<script>
window.showCustomModal = function(title, msg, type = 'error') {
  document.getElementById('cam-title').textContent = title;
  document.getElementById('cam-msg').textContent = msg;
  const icon = document.getElementById('cam-icon');
  if(type === 'error') {
    icon.textContent = '⚠️'; icon.className = 'app-modal-icon error';
  } else {
    icon.textContent = 'ℹ️'; icon.className = 'app-modal-icon info';
  }
  document.getElementById('custom-app-modal').classList.add('active');
};
</script>
</body>`;

html = html.replace(bodyEnd, customModalInject);

// 3. Replace alerts in BLEManager
html = html.replace('alert("البلوتوث مدعوم فقط داخل التطبيق الأصلي على الموبايل.");', 'window.showCustomModal("عذراً", "ميزة البلوتوث تعمل فقط داخل التطبيق المثبت على الموبايل.", "error");');
html = html.replace('alert("فشل تهيئة البلوتوث. هل أعطيت الصلاحيات اللازمة؟");', 'window.showCustomModal("تعذر الاتصال بالبلوتوث", "الرجاء التأكد من تشغيل البلوتوث وتفعيل خدمة الموقع (GPS) وإعطاء التطبيق الصلاحيات المطلوبة من الإعدادات.", "error");');
html = html.replace('alert("انقطع الاتصال مع اللاعب التاني");', 'window.showCustomModal("انقطاع", "تم فقدان الاتصال مع اللاعب الآخر.", "error");');
html = html.replace('alert("فشل الاتصال، لم يتم الرد من اللاعب الآخر. حاول تاني.");', 'window.showCustomModal("تأخير في الرد", "لم يتم استلام تأكيد للنقلة من اللاعب الآخر. تأكد من أنكما قريبان من بعضكما.", "error");');

// 4. Update UI toggles in BLEManager
html = html.replace("document.getElementById('tb-bt-host').classList.add('on');", "document.getElementById('tb-bt-host').classList.add('active'); document.getElementById('bt-radar').style.display='block';");
html = html.replace("document.getElementById('tb-bt-join').classList.remove('on');", "document.getElementById('tb-bt-join').classList.remove('active');");
html = html.replace("document.getElementById('tb-bt-host').classList.remove('on');", "document.getElementById('tb-bt-host').classList.remove('active');");
html = html.replace("document.getElementById('tb-bt-join').classList.add('on');", "document.getElementById('tb-bt-join').classList.add('active'); document.getElementById('bt-radar').style.display='block';");

// Make device buttons look premium
html = html.replace("btn.className = \"btnb\";", "btn.className = \"bt-device-btn\";");
html = html.replace("btn.textContent = name;", "btn.innerHTML = `<span>📱 \${name}</span> <span style='color:#7aa2f7;'>اتصال ❯</span>`;");

// Stop radar on connect or stop
html = html.replace("await BleClient.stopLEScan();", "await BleClient.stopLEScan(); document.getElementById('bt-radar').style.display='none';");

fs.writeFileSync('index.html', html, 'utf-8');
console.log('Successfully patched index.html for Premium UI and Modals');
