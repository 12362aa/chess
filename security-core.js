'use strict';
// Shared enforcement: never trust a role, balance, sanction or evidence supplied by a client.
const db = require('./db');
const crypto = require('node:crypto');
db.exec(`
 CREATE TABLE IF NOT EXISTS moderation_roles(user_id INTEGER PRIMARY KEY REFERENCES users(id), created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS moderation_reports(id INTEGER PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES users(id), target_id INTEGER NOT NULL REFERENCES users(id), context TEXT NOT NULL, context_id TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, evidence TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', decision TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS moderation_reports_queue ON moderation_reports(status,created_at);
 CREATE TABLE IF NOT EXISTS account_sanctions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), scope TEXT NOT NULL, reason TEXT NOT NULL, expires_at INTEGER, revoked_at INTEGER, moderator_id INTEGER NOT NULL REFERENCES users(id), report_id INTEGER REFERENCES moderation_reports(id), created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS account_sanctions_user ON account_sanctions(user_id,scope);
 CREATE TABLE IF NOT EXISTS moderation_audit(id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, subject_id INTEGER, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS moderation_appeals(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), sanction_id INTEGER NOT NULL REFERENCES account_sanctions(id), note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS moderation_outbox(id INTEGER PRIMARY KEY, report_id INTEGER NOT NULL REFERENCES moderation_reports(id), recipient TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, delivered_at INTEGER, UNIQUE(report_id,recipient));
 CREATE TABLE IF NOT EXISTS security_events(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), kind TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS security_events_user ON security_events(user_id,created_at);
 CREATE TABLE IF NOT EXISTS safety_context(id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), peer_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, PRIMARY KEY(id,user_id,peer_id,kind));
 CREATE TABLE IF NOT EXISTS reward_sessions(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
 CREATE TABLE IF NOT EXISTS verified_results(user_id INTEGER NOT NULL REFERENCES users(id), fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,fingerprint));
 CREATE TABLE IF NOT EXISTS verified_nour(user_id INTEGER NOT NULL REFERENCES users(id), stage INTEGER NOT NULL, stars INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(user_id,stage));
 CREATE TABLE IF NOT EXISTS game_chat_evidence(id TEXT PRIMARY KEY, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL, room TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS moderation_media(report_id INTEGER PRIMARY KEY REFERENCES moderation_reports(id), data TEXT NOT NULL, mime TEXT NOT NULL);
`);
const scopes = new Set(['account','social','economy']);
if(!db.prepare('PRAGMA table_info(verified_nour)').all().some(c=>c.name==='stars'))db.exec('ALTER TABLE verified_nour ADD COLUMN stars INTEGER NOT NULL DEFAULT 1');
if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='token_version'))db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='legacy_nour_access'").get()){
 db.exec('CREATE TABLE legacy_nour_access(user_id INTEGER PRIMARY KEY,stage INTEGER NOT NULL)');
 db.exec('INSERT INTO legacy_nour_access SELECT user_id,MAX(stage_number) FROM nour_progress WHERE completed=1 GROUP BY user_id');
}
function validToken(payload){const u=payload&&!payload.t&&db.prepare('SELECT token_version FROM users WHERE id=?').get(Number(payload.id)||0);return !!u&&(Number(payload.v)||0)===u.token_version;}
function active(userId, scope) {
 return db.prepare(`SELECT id,scope,reason,expires_at,created_at FROM account_sanctions WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND (scope='account' OR scope=?) ORDER BY scope='account' DESC,created_at DESC LIMIT 1`).get(userId,Date.now(),scope||'account') || null;
}
function moderator(id) { return !!db.prepare('SELECT 1 FROM moderation_roles WHERE user_id=?').get(id); }
function audit(actor,action,subject,detail) { db.prepare('INSERT INTO moderation_audit(actor_id,action,subject_id,detail,created_at) VALUES(?,?,?,?,?)').run(actor||null,action,subject||null,JSON.stringify(detail||{}),Date.now()); }
function event(id,kind,detail) {
 // Suspicion is recorded for review; it is never an automatic permanent ban.
 const last=db.prepare('SELECT created_at FROM security_events WHERE user_id IS ? AND kind=? ORDER BY id DESC LIMIT 1').get(id||null,kind);
 if(last && Date.now()-last.created_at<10000)return;
 db.prepare('INSERT INTO security_events(user_id,kind,detail,created_at) VALUES(?,?,?,?)').run(id||null,kind,JSON.stringify(detail||{}).slice(0,1000),Date.now());
}
function context(id,a,b,kind,detail) {
 if(!a||!b||a===b)return;
 const q=db.prepare('INSERT OR IGNORE INTO safety_context(id,user_id,peer_id,kind,detail,created_at) VALUES(?,?,?,?,?,?)');
 db.transaction(()=>{ q.run(String(id),a,b,kind,JSON.stringify(detail||{}),Date.now());q.run(String(id),b,a,kind,JSON.stringify(detail||{}),Date.now()); })();
}
function httpGuard(req,res,next) {
 if(req._securityGuardChecked)return next();req._securityGuardChecked=true;
 if(!req.user || !Number.isInteger(Number(req.user.id)) || !db.prepare('SELECT 1 FROM users WHERE id=?').get(req.user.id))return res.status(401).json({error:'Unauthorized'});
 const scope=/economy/.test(req.originalUrl)?'economy':/chat|friend|group|call|invite/.test(req.originalUrl)?'social':'account';
 const sanction=active(req.user.id,scope);
 const now=Date.now(),bucket=httpBuckets.get(req.user.id)||{at:now,n:0};if(now-bucket.at>60000){bucket.at=now;bucket.n=0;}bucket.n++;httpBuckets.set(req.user.id,bucket);
 if(bucket.n>200)return res.status(429).json({error:'account_request_limit'});
 // A sanctioned user can still read the reason and submit an appeal.
 if(sanction && !(/^\/api\/safety\/(status|appeals)(?:\?|$)/.test(req.originalUrl)||req.method==='GET'&&/^\/api\/me(?:\?|$)/.test(req.originalUrl)))return res.status(403).json({error:'account_restricted',sanction});
 next();
}
const httpBuckets=new Map();
function session(id,kind,payload,ttl=3600000) {
 const outstanding=db.prepare('SELECT id FROM reward_sessions WHERE user_id=? AND kind=? AND consumed_at IS NULL ORDER BY created_at DESC').all(id,kind);
 for(const old of outstanding.slice(2))db.prepare('UPDATE reward_sessions SET consumed_at=? WHERE id=?').run(Date.now(),old.id);
 const key=crypto.randomBytes(24).toString('hex');
 db.prepare('INSERT INTO reward_sessions VALUES(?,?,?,?,?,?,NULL)').run(key,id,kind,JSON.stringify(payload),Date.now(),Date.now()+ttl);
 return key;
}
function getSession(key,id,kind) {
 if(typeof key!=='string'||key.length!==48)return null;
 const row=db.prepare('SELECT * FROM reward_sessions WHERE id=? AND user_id=? AND kind=? AND consumed_at IS NULL AND expires_at>?').get(key,id,kind,Date.now());
 return row?{...row,data:JSON.parse(row.payload)}:null;
}
function consume(key){return db.prepare('UPDATE reward_sessions SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(Date.now(),key).changes===1;}
function cleanup() {
 for(const [id,b] of httpBuckets)if(Date.now()-b.at>60000)httpBuckets.delete(id);
 db.prepare('DELETE FROM reward_sessions WHERE expires_at<?').run(Date.now()-86400000);
 db.prepare('DELETE FROM security_events WHERE created_at<?').run(Date.now()-90*86400000);
 db.prepare('DELETE FROM safety_context WHERE created_at<?').run(Date.now()-90*86400000);
 db.prepare('DELETE FROM game_chat_evidence WHERE created_at<?').run(Date.now()-90*86400000);
 // Evidence retention is bounded; audit and sanctions remain for appeals.
 db.prepare("UPDATE moderation_reports SET evidence='{}',note='' WHERE status<>'open' AND updated_at<?").run(Date.now()-180*86400000);
 db.prepare("DELETE FROM moderation_media WHERE report_id IN (SELECT id FROM moderation_reports WHERE status<>'open' AND updated_at<?)").run(Date.now()-180*86400000);
}
module.exports={db,active,moderator,audit,event,context,httpGuard,session,getSession,consume,cleanup,scopes,validToken};
