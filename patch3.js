const fs = require('fs');

// 1. Update build-web.js to include ble-bundle.js
let buildJs = fs.readFileSync('scripts/build-web.js', 'utf-8');
buildJs = buildJs.replace("'stockfish-18-lite-single.wasm'", "'stockfish-18-lite-single.wasm',\n  'ble-bundle.js'");
fs.writeFileSync('scripts/build-web.js', buildJs, 'utf-8');

// 2. Update index.html to include script and fix BLEManager calls
let html = fs.readFileSync('index.html', 'utf-8');

// Inject script
html = html.replace('<script src="auth-client.js"></script>', '<script src="ble-bundle.js"></script>\n  <script src="auth-client.js"></script>');

// Fix window.Capacitor.Plugins.BleClient -> window.BleClient
html = html.replace(/window\.Capacitor\.Plugins\.BleClient/g, 'window.BleClient');
html = html.replace(/!window\.Capacitor \|\| !window\.Capacitor\.Plugins\.BleClient/g, '!window.BleClient');

fs.writeFileSync('index.html', html, 'utf-8');
console.log('Successfully patched files for esbuild bundling');
