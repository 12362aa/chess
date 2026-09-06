const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf-8');

// 1. Add Bluetooth button to menu
const menuTarget = '    <div class="mc" data-mode="settings" onclick="if(typeof SFX !== \'undefined\') SFX.btn(); Nav.settings()">';
const menuReplacement = `    <div class="mc" data-mode="bluetooth" onclick="if(typeof SFX !== 'undefined') SFX.btn(); Nav.bluetooth()">
      <span class="mc-tag">BLUETOOTH</span>
      <span class="mc-ic ic-blue">ᛒ</span>
      <div class="mc-t">لعب عبر Bluetooth</div>
      <div class="mc-d">العب أوفلاين مع جهاز قريب</div>
      <span class="mc-b bb">بدون إنترنت ◈</span>
    </div>
` + menuTarget;
html = html.replace(menuTarget, menuReplacement);

// 2. Add Bluetooth Screen
const screenTarget = '<!-- GAME -->';
const screenReplacement = `<!-- BLUETOOTH -->
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
</div>

` + screenTarget;
html = html.replace(screenTarget, screenReplacement);

// 3. Add Nav.bluetooth
const navTarget = "local(){Nav.show('s-local');},";
const navReplacement = "bluetooth(){Nav.show('s-bluetooth');},\n  " + navTarget;
html = html.replace(navTarget, navReplacement);

// 4. Add Logic at the end
const scriptTarget = "</body>";
const scriptReplacement = `<script>
const BLEManager = {
  SERVICE_UUID: "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d",
  MOVE_CHAR_UUID: "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4e",
  STATUS_CHAR_UUID: "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4f",
  isHost: false,
  deviceId: null,
  connected: false,
  myColor: 'w',
  ackTimeout: null,

  async init() {
    if (!window.Capacitor || !window.Capacitor.Plugins.BleClient) {
      alert("البلوتوث مدعوم فقط داخل التطبيق الأصلي على الموبايل.");
      return false;
    }
    try {
      await window.Capacitor.Plugins.BleClient.initialize();
      return true;
    } catch(e) {
      alert("فشل تهيئة البلوتوث. هل أعطيت الصلاحيات اللازمة؟");
      return false;
    }
  },

  setStatus(msg) {
    const el = document.getElementById('bt-status');
    if(el) el.textContent = msg;
  },

  async hostGame() {
    document.getElementById('tb-bt-host').classList.add('on');
    document.getElementById('tb-bt-join').classList.remove('on');
    
    if(!await this.init()) return;
    this.isHost = true;
    this.connected = false;
    this.myColor = Math.random() < 0.5 ? 'w' : 'b';
    
    try {
      const BleClient = window.Capacitor.Plugins.BleClient;
      if (BleClient.startAdvertising) {
          this.setStatus("جارٍ إعداد الاستضافة...");
          await BleClient.startAdvertising({
            services: [this.SERVICE_UUID],
            name: "Chess-" + Math.floor(Math.random()*1000)
          });
          this.setStatus("في انتظار انضمام لاعب آخر...");
      } else {
          this.setStatus("وضع الاستضافة (Peripheral) قد يتطلب بلجن إضافي أو جهاز مختلف.");
      }
    } catch(e) {
      this.setStatus("خطأ في الاستضافة: " + e.message);
    }
  },

  async scanForGames() {
    document.getElementById('tb-bt-host').classList.remove('on');
    document.getElementById('tb-bt-join').classList.add('on');

    if(!await this.init()) return;
    this.isHost = false;
    this.setStatus("يبحث عن أجهزة قريبة...");
    const list = document.getElementById('bt-devices-list');
    list.innerHTML = '';

    try {
      const BleClient = window.Capacitor.Plugins.BleClient;
      await BleClient.requestLEScan(
        { services: [this.SERVICE_UUID] },
        (result) => {
          const name = result.localName || result.device.name || "جهاز غير معروف";
          if(document.getElementById('dev-' + result.device.deviceId)) return;
          
          const btn = document.createElement('button');
          btn.className = "btnb";
          btn.id = 'dev-' + result.device.deviceId;
          btn.textContent = name;
          btn.onclick = () => this.connectToDevice(result.device.deviceId);
          list.appendChild(btn);
        }
      );
      
      setTimeout(async () => {
        try { await BleClient.stopLEScan(); } catch(e){}
        if(list.children.length === 0) this.setStatus("لم يتم العثور على أجهزة.");
        else this.setStatus("تم العثور على أجهزة (اختر للاتصال):");
      }, 10000);
    } catch(e) {
      this.setStatus("خطأ في البحث: " + e.message);
    }
  },

  async connectToDevice(deviceId) {
    const BleClient = window.Capacitor.Plugins.BleClient;
    this.setStatus("جارٍ الاتصال...");
    try {
      await BleClient.stopLEScan();
      await BleClient.connect(deviceId, (deviceId) => this.onDisconnect(deviceId));
      this.deviceId = deviceId;
      this.connected = true;
      this.setStatus("متصل!");
      
      await BleClient.startNotifications(
        this.deviceId,
        this.SERVICE_UUID,
        this.MOVE_CHAR_UUID,
        (value) => this.handleIncomingMessage(value)
      );

      this.setStatus("في انتظار بدء اللعبة من المضيف...");
    } catch(e) {
      this.setStatus("فشل الاتصال: " + e.message);
    }
  },

  async disconnect() {
    if (this.deviceId && this.connected) {
      try {
        await window.Capacitor.Plugins.BleClient.disconnect(this.deviceId);
      } catch(e) {}
    }
    this.connected = false;
    this.deviceId = null;
  },

  onDisconnect(deviceId) {
    this.connected = false;
    if (S.mode === 'bluetooth') {
      alert("انقطع الاتصال مع اللاعب التاني");
      Nav.menu();
    }
  },

  handleIncomingMessage(dataView) {
    const decoder = new TextDecoder('utf-8');
    const msg = decoder.decode(dataView);
    if(msg.startsWith("START:")) {
      const color = msg.split(":")[1]; 
      this.myColor = color === 'w' ? 'b' : 'w';
      this.startGameUI();
    } else if(msg.startsWith("MOVE:")) {
      const move = msg.split(":")[1];
      if (S.mode === 'bluetooth') {
        this.applyOpponentMove(move);
      }
    } else if(msg === "ACK") {
      clearTimeout(this.ackTimeout);
    }
  },

  startGameUI() {
    S.mode = 'bluetooth';
    S.turn = 'w';
    G.resetState();
    B.init();
    UI.updateBoard();
    UI.updateTurn();
    if(S.turn !== this.myColor) {
      document.getElementById('bwrap').style.pointerEvents = 'none';
    } else {
      document.getElementById('bwrap').style.pointerEvents = 'auto';
    }
    Nav.game();
  },

  applyOpponentMove(moveStr) {
    if (moveStr && moveStr.length >= 4) {
      const from = moveStr.substring(0, 2);
      const to = moveStr.substring(2, 4);
      const promo = moveStr.length > 4 ? moveStr[4] : '';
      
      const res = B.move({from, to, promo}, false);
      if(res) {
        G.onMoveCompleted({from, to, promo}, 'opp');
        if(S.turn === this.myColor) {
           document.getElementById('bwrap').style.pointerEvents = 'auto';
        }
      }
      this.sendRaw("ACK");
    }
  },

  async sendMove(moveStr) {
    if(!this.connected) return;
    document.getElementById('bwrap').style.pointerEvents = 'none';
    
    this.ackTimeout = setTimeout(() => {
      alert("فشل الاتصال، لم يتم الرد من اللاعب الآخر. حاول تاني.");
    }, 3000);

    await this.sendRaw("MOVE:" + moveStr);
  },

  async sendRaw(msg) {
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    try {
       const BleClient = window.Capacitor.Plugins.BleClient;
       if(!this.isHost) {
           await BleClient.write(this.deviceId, this.SERVICE_UUID, this.MOVE_CHAR_UUID, data);
       }
    } catch(e) {
       console.error("Failed to send message", e);
    }
  }
};

const originalOnMoveCompleted = G.onMoveCompleted;
G.onMoveCompleted = function(mv, src) {
  originalOnMoveCompleted.call(G, mv, src);
  if (S.mode === 'bluetooth' && src === 'me') {
    let mStr = mv.from + mv.to;
    if(mv.promo) mStr += mv.promo;
    BLEManager.sendMove(mStr);
  }
  
  if (S.mode === 'bluetooth') {
    if(S.turn !== BLEManager.myColor) {
      document.getElementById('bwrap').style.pointerEvents = 'none';
    } else {
      document.getElementById('bwrap').style.pointerEvents = 'auto';
    }
  }
};
</script>
` + scriptTarget;
html = html.replace(scriptTarget, scriptReplacement);

fs.writeFileSync('index.html', html, 'utf-8');
console.log('Successfully patched index.html with patch2');
