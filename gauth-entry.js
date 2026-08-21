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
      /* 'online' مقصود.
         كان 'offline' وده كان سبب فشل الدخول بجوجل بالكامل: في وضع
         offline الـplugin بيرجّع { serverAuthCode, responseType } وبس —
         مفيش idToken خالص، فالكود كان يرمي «no idToken» ويظهر «تعذّر
         الدخول بجوجل». وضع online بيرجّع idToken وaccessToken وprofile،
         والـidToken هو اللي السيرفر بيتحقّق منه. */
      mode: 'online',
    },
  });
  initialised = true;
}

/* بيرجّع { idToken } أو بيرمي خطأ. الاستدعاء من auth-client.js */
async function signInWithGoogle() {
  await ensureInit();
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const r = (res && res.result) || {};
  /* شكل الرد في وضع online: { accessToken, idToken, profile }.
     بنقبل الشكل المتداخل كمان لو نسخة الـplugin غيّرته. */
  const idToken = r.idToken
    || (r.authentication && r.authentication.idToken)
    || null;
  if (!idToken) {
    /* رسالة تشخيصية فيها المفاتيح الموجودة فعلًا — أسرع بكتير من
       تخمين شكل الرد لو النسخة اتغيّرت */
    throw new Error('no idToken in response; keys: ' + Object.keys(r).join(','));
  }
  return { idToken, profile: r.profile || null };
}

async function signOutGoogle() {
  try { await ensureInit(); await SocialLogin.logout({ provider: 'google' }); } catch (e) {}
}

window.amkhGoogleAuth = { signIn: signInWithGoogle, signOut: signOutGoogle, available: true };
