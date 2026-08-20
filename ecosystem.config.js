/* ══════════════════════════════════════════════════════════════════════
   إعداد PM2 — سيرفر الأونلاين والنفق
   ──────────────────────────────────────────────────────────────────────
   الهدف إن الأونلاين يفضل شغّال حتى لو الجهاز عمل ريستارت، من غير ما
   حد يفتح طرفية ويشغّل حاجة بإيده.

   عمليتين:
     amkh-server  → server.js (Express + WebSocket على 8081)
     amkh-tunnel  → run-cf.js (cloudflared + رفع الرابط على url.json)

   الترتيب مهم: النفق بيعمل فحص صحة على /api/health قبل ما ينشر الرابط،
   فلو اتشغّل قبل السيرفر الفحص بيفضل يفشل. عشان كده النفق فيه تأخير
   بدء، والسيرفر مالوش.

   التشغيل:
     pm2 start ecosystem.config.js
     pm2 save                       ← يحفظ القائمة عشان ترجع بعد الريستارت
   ولمتابعة السجلات:  pm2 logs amkh-tunnel
══════════════════════════════════════════════════════════════════════ */
module.exports = {
  apps: [
    {
      name: 'amkh-server',
      script: 'server.js',
      cwd: __dirname,
      /* نسخة واحدة: قاعدة البيانات SQLite ملف واحد، وأكتر من عملية
         بتكتب فيه بتتخانق على القفل. وكمان خرائط الغرف والسوكتات في
         الذاكرة — نسختين معناها لاعبين في نفس الغرفة مايشوفوش بعض. */
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      /* لو وقع 10 مرات في دقيقة يبقى فيه غلط ثابت، الإعادة مش هتصلّحه */
      max_restarts: 10,
      min_uptime: '60s',
      restart_delay: 3000,
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/server.out.log',
      error_file: 'logs/server.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'amkh-tunnel',
      script: 'run-cf.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '30s',
      /* النفق لازم يستنى السيرفر يسمع الأول، وإلا فحص الصحة يفشل
         ويفضل الرابط القديم منشور */
      restart_delay: 5000,
      max_memory_restart: '250M',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/tunnel.out.log',
      error_file: 'logs/tunnel.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
