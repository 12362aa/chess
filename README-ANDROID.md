# Android build

This project is wrapped with Capacitor. The app bundle is generated from `www/`;
that folder contains only the browser game files and is not committed. Server
code, the SQLite database and `.env` are never included in an APK.

## First-time setup

Install Android Studio with its Android SDK, an Android platform, build-tools
and a JDK 21. Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to the SDK directory.

```powershell
npm install
npm run build:web
npx cap add android
npm run assets:android
npm run cap:sync
```

`assets/logo.png` is the source for the Android launcher and splash assets.

## Build a debug APK

```powershell
npm run build:web
npx cap sync android
.\android\gradlew.bat -p android assembleDebug
```

The output is `android\app\build\outputs\apk\debug\app-debug.apk`.

## Release APK

Create and protect a release keystore, configure signing in `android/app/build.gradle`,
then run `./android/gradlew.bat -p android assembleRelease`. Do not commit a
keystore or its passwords.

## Online mode

The game still fetches `https://raw.githubusercontent.com/12362aa/chess/main/url.json`
and converts its `https` value to `wss` exactly as the web version does. No
ngrok URL, WebSocket server behavior, or game logic was changed.
