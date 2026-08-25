#!/usr/bin/env node

/**
 * Creates Capacitor's web bundle from the files used by the browser game.
 * Server code, the local database, logs and .env files are intentionally not
 * copied, so none of them can be packaged into the APK.
 */
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const webDir = path.join(projectRoot, 'www');
const requiredFiles = new Set([
  'index.html',
  'design-system.css',
  'screens.css',
  'manifest.json',
  'sw.js',
  'url.json',
  'auth-client.js',
  'friends-client.js',
  'chat-client.js',
  'call-client.js',
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
  'ble-bundle.js',
  /* حزمة الدخول بجوجل (esbuild IIFE من gauth-entry.js). لازم تكون في
     القائمة دي، وإلا ماتوصلش للـAPK وزر الدخول بجوجل يفضل ميت من غير
     أي رسالة خطأ في البناء. */
  'gauth-bundle.js'
]);
const assetExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp3', '.wav', '.ogg', '.webm'
]);

/**
 * Asset directories copied whole. The loop below only handles files at the
 * project root, so without this list `pieces/` (432 images across 36 sets)
 * never reached the bundle and every piece set broke offline in the APK.
 */
const assetDirectories = [
  { name: 'pieces', minFiles: 432 }
];

function copyAssetDirectory(name) {
  const source = path.join(projectRoot, name);
  if (!fs.existsSync(source)) {
    throw new Error(`Required asset directory is missing: ${name}`);
  }

  const destination = path.join(webDir, name);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  let count = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const setSource = path.join(source, entry.name);
      const setDestination = path.join(destination, entry.name);
      fs.mkdirSync(setDestination, { recursive: true });
      for (const file of fs.readdirSync(setSource)) {
        if (!assetExtensions.has(path.extname(file).toLowerCase())) continue;
        fs.copyFileSync(path.join(setSource, file), path.join(setDestination, file));
        count++;
      }
    } else if (assetExtensions.has(path.extname(entry.name).toLowerCase())) {
      fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
      count++;
    }
  }
  return count;
}

fs.mkdirSync(webDir, { recursive: true });

const copied = [];
for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
  if (!entry.isFile()) continue;

  const extension = path.extname(entry.name).toLowerCase();
  if (!requiredFiles.has(entry.name) && !assetExtensions.has(extension)) continue;

  fs.copyFileSync(
    path.join(projectRoot, entry.name),
    path.join(webDir, entry.name)
  );
  copied.push(entry.name);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(webDir, file))) {
    throw new Error(`Required web file is missing: ${file}`);
  }
}

// Asset directories: copy, then assert the expected count so a partial copy
// fails the build instead of shipping an APK with missing piece sets.
let copiedAssets = 0;
for (const { name, minFiles } of assetDirectories) {
  const count = copyAssetDirectory(name);
  if (count < minFiles) {
    throw new Error(
      `Asset directory "${name}" copied ${count} files, expected at least ${minFiles}.`
    );
  }
  copiedAssets += count;
  console.log(`Copied ${count} files from ${name}/.`);
}

console.log(
  `Copied ${copied.length} web files and ${copiedAssets} bundled assets ` +
  `to ${path.relative(projectRoot, webDir)}.`
);
