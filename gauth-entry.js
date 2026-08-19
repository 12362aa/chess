/* نقطة دخول حزمة تسجيل الدخول بجوجل.
   نفس نمط ble-bundle.js: الـplugin بيتجمّع بـesbuild في ملف IIFE واحد
   يتحمّل بـ<script>، عشان المشروع مافيهوش bundler للصفحة نفسها.

   البناء:
     npx esbuild gauth-entry.js --bundle --format=iife --outfile=gauth-bundle.js --minify

   الملف الناتج لازم يتضاف في scripts/build-web.js عشان يوصل للـAPK. */
import { SocialLogin } from '@capgo/capacitor-social-login';

/* الـweb client id بيتقري من الصفحة (index.html بيحطّه في meta) عشان
   مايكونش مكتوب في مكانين — نفس القيمة اللي السيرفر بيتحقّق بيها. */
function webClientId() {
  const m = document.querySelector('meta[name="google-web-client-id"]');
  return (m && m.content) || '';
}

let initialised = false;

async function ensureInit() {
  if (initialised) return;
  const clientId = webClientId();
  if (!clientId) throw new Error('google-web-client-id meta tag is missing');
  await SocialLogin.initialize({
    google: {
      /* على أندرويد الـplugin بيطلب توكن بجمهور الـweb client — وده
         بالظبط الجمهور اللي auth.js بيتحقّق منه. */
      webClientId: clientId,
      mode: 'offline',
    },
  });
  initialised = true;
}

/* بيرجّع { idToken } أو بيرمي خطأ. الاستدعاء من auth-client.js */
async function signInWithGoogle() {
  await ensureInit();
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const r = (res && res.result) || {};
  /* الـplugin بيرجّع الشكل ده على أندرويد؛ بناخد أول توكن موجود */
  const idToken = (r.idToken)
    || (r.accessToken && r.accessToken.token && r.idToken)
    || (r.authentication && r.authentication.idToken)
    || null;
  if (!idToken) throw new Error('no idToken returned by Google');
  return { idToken, profile: r.profile || null };
}

async function signOutGoogle() {
  try { await ensureInit(); await SocialLogin.logout({ provider: 'google' }); } catch (e) {}
}

window.amkhGoogleAuth = { signIn: signInWithGoogle, signOut: signOutGoogle, available: true };
