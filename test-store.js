'use strict';
/* اختبار وحدة للمتجر (المرحلة ٢): حتميّة الدوران على epoch ثابت، والشراء
   (نجاح، خارج النافذة، مملوك، رصيد غير كافٍ)، ومطابقة الدفتر، والدوام. */
const path = require('path');
const os = require('os');
const fs = require('fs');

const TMP = path.join(os.tmpdir(), 'amkh_store_test_' + Date.now() + '.db');
process.env.AMKH_DB_PATH = TMP;
process.env.AMKH_DB_VERBOSE = '0';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.error('  ✗', msg); } }

const db = require('./db');
db.prepare("INSERT INTO users (email, username, display_name) VALUES ('b1@t.co','b1','B1')").run();
const u1 = db.prepare("SELECT id FROM users WHERE email='b1@t.co'").get().id;

const econ = require('./economy');

console.log('— حتميّة الدوران —');
const EPOCH = 123456;
const a = econ.storeItemsForEpoch(EPOCH).map(i => i.id);
const b = econ.storeItemsForEpoch(EPOCH).map(i => i.id);
ok(a.length === 6, 'النافذة تعرض 6 عناصر');
ok(JSON.stringify(a) === JSON.stringify(b), 'نفس epoch → نفس العناصر (حتميّ)');
const c = econ.storeItemsForEpoch(EPOCH + 1).map(i => i.id);
ok(JSON.stringify(a) !== JSON.stringify(c), 'epoch مختلف → عناصر مختلفة (دوران)');
ok(new Set(a).size === a.length, 'لا تكرار داخل النافذة');

console.log('— لقطة المتجر الحاليّة —');
const cur = econ.storeCurrent(u1);
ok(cur.endsAt > cur.serverNow, 'وقت انتهاء النافذة في المستقبل');
ok(cur.periodMs === econ.STORE_PERIOD_MS, 'مدّة النافذة 4 ساعات');
ok(cur.items.every(i => i.ar && i.en && i.price > 0), 'كل عنصر له اسمان (ar/en) وسعر');

console.log('— الشراء —');
econ.snapshot(u1);                       // منحة الإطلاق (200)
econ.grant(u1, 5000, 0, 'grant', 'test-top-up');   // نشحن رصيدًا كافيًا
const target = econ.storeCurrent(u1).items[0];
const coinsBefore = econ.snapshot(u1).coins;
let r = econ.purchase(u1, target.id);
ok(r.ok === true, 'شراء عنصر ضمن النافذة ينجح: ' + target.id);
let snap = econ.snapshot(u1);
ok(snap.owned.includes(target.id), 'العنصر صار مملوكًا بعد الشراء');
ok(snap.coins === coinsBefore - target.price, `الرصيد نقص بمقدار السعر (${target.price})`);

r = econ.purchase(u1, target.id);
ok(r.ok === false && r.reason === 'owned', 'إعادة شراء نفس العنصر مرفوضة (owned)');

// عنصر خارج النافذة الحاليّة
const inWindow = new Set(econ.storeCurrent(u1).items.map(i => i.id));
const outside = econ.STORE_CATALOG.find(i => !inWindow.has(i.id));
r = econ.purchase(u1, outside.id);
ok(r.ok === false && r.reason === 'not_in_window', 'شراء عنصر خارج النافذة مرفوض (not_in_window)');

// رصيد غير كافٍ
db.prepare("INSERT INTO users (email, username, display_name) VALUES ('b2@t.co','b2','B2')").run();
const u2 = db.prepare("SELECT id FROM users WHERE email='b2@t.co'").get().id;
econ.snapshot(u2);   // 200 عملة فقط
const pricey = econ.storeCurrent(u2).items.find(i => i.price > 200) || econ.storeCurrent(u2).items[0];
r = econ.purchase(u2, pricey.id);
ok(r.ok === false && r.reason === 'insufficient', 'شراء برصيد غير كافٍ مرفوض (insufficient)');

r = econ.purchase(u1, 'not_a_real_item');
ok(r.ok === false && r.reason === 'bad_item', 'عنصر غير موجود مرفوض (bad_item)');

console.log('— مطابقة الرصيد مع الدفتر بعد الشراء —');
const led = db.prepare('SELECT COALESCE(SUM(delta),0) AS c FROM coin_ledger WHERE user_id = ?').get(u1).c;
const wal = db.prepare('SELECT coins FROM wallet WHERE user_id = ?').get(u1).coins;
ok(led === wal, `مجموع الدفتر (${led}) = المحفظة (${wal}) — الخصم مُسجَّل`);

console.log('— الملكيّة دائمة عبر إعادة الفتح —');
const ownedBefore = econ.snapshot(u1).owned.slice().sort();
db.close();
delete require.cache[require.resolve('./db')];
delete require.cache[require.resolve('./economy')];
delete require.cache[require.resolve('./auth')];
const db2 = require('./db');
const econ2 = require('./economy');
const ownedAfter = econ2.snapshot(u1).owned.slice().sort();
ok(JSON.stringify(ownedAfter) === JSON.stringify(ownedBefore), 'العناصر المملوكة باقية بعد إعادة الفتح (لا يفقد المستخدم شيئًا)');

console.log(`\nنتيجة: ${pass} نجح، ${fail} فشل`);
try { db2.close(); } catch (e) {}
try { fs.unlinkSync(TMP); } catch (e) {}
process.exit(fail ? 1 : 0);
