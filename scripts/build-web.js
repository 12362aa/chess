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
  'manifest.json',
  'sw.js',
  'url.json',
  'auth-client.js',
  'friends-client.js',
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
  'ble-bundle.js'
]);
const assetExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.mp3', '.wav', '.ogg', '.webm'
]);

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

console.log(`Copied ${copied.length} web files to ${path.relative(projectRoot, webDir)}.`);
