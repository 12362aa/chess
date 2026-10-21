'use strict';
// Isolated real HTTP + WebSocket server; never uses production accounts or sends mail/push.
require('../_study/test-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),Database=require('better-sqlite3'),jwt=require('jsonwebtoken'),WS=require('ws');
const file=path.join(os.tmpdir(),'amkh-safety-live-'+Date.now()+'.db'),port=43995,base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,AMKH_DB_PATH:file,PORT:String(port),AMKH_DB_VERBOSE:'0'},stdio:['ignore','ignore','pipe']});
let database;const sockets=[];let failures='';child.stderr.on('data',d=>failures+=d.toString());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const token=id=>jwt.sign({id},process.env.JWT_SECRET);
async function request(id,url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token(id),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
async function socket(id){const s=new WS('ws://127.0.0.1:'+port);s.frames=[];s.on('message',d=>s.frames.push(JSON.parse(d)));await new Promise((r,j)=>{s.once('open',r);s.once('error',j);});sockets.push(s);s.send(JSON.stringify({type:'presence:hello',token:token(id)}));return s;}
async function frame(s,type,from=0){for(let i=0;i<80;i++){const f=s.frames.slice(from).find(d=>d.type===type);if(f)return f;await pause(25);}throw Error('Missing frame '+type);}
(async()=>{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if(r.ok)break;}catch(_){}await pause(100);}
 database=new Database(file);
 const user=n=>Number(database.prepare('INSERT INTO users(email,username,display_name,rating,rating_games,wins,puzzle_games,puzzle_rating) VALUES(?,?,?,?,?,?,?,?)').run(n+'@test.invalid',n,n,2100,20,12,10,2200).lastInsertRowid);
 const owner=user('reviewer'),alice=user('reporter'),bob=user('target');database.prepare('INSERT INTO moderation_roles VALUES(?,?)').run(owner,Date.now());
 database.prepare('INSERT INTO friendships(user_id,friend_id) VALUES(?,?)').run(alice,bob);database.prepare('INSERT INTO friendships(user_id,friend_id) VALUES(?,?)').run(bob,alice);
 const so=await socket(owner),sa=await socket(alice),sb=await socket(bob);await frame(so,'presence:ok');await frame(sb,'presence:ok');
 const report=await request(alice,'/api/safety/reports',{targetId:bob,context:'player',reason:'harassment',note:'Evidence fixture'});assert.equal(report.status,201);
 assert.equal((await frame(so,'safety:notice')).notifications.unread,1);
 const status=await request(owner,'/api/safety/status');assert.equal(status.data.notifications.unread,1);
 await request(owner,'/api/safety/admin/seen',{cursor:status.data.notifications.cursor});assert.equal((await request(owner,'/api/safety/status')).data.notifications.unread,0);
 let decision=await request(owner,'/api/safety/admin/decision',{reportId:report.data.id,status:'actioned',scope:'economy',duration:'threeDays',note:'Economy fixture'});assert.equal(decision.status,200);
 const start=sb.frames.length;sb.send(JSON.stringify({type:'presence:ping'}));await frame(sb,'presence:pong',start);assert.equal(sb.readyState,WS.OPEN);
 assert.equal((await request(bob,'/api/economy/me')).status,403);assert.equal((await request(bob,'/api/friends')).status,200);
 await request(owner,'/api/safety/admin/revoke',{sanctionId:decision.data.sanctionId,note:'Restore'});
 const social=Number(database.prepare('INSERT INTO account_sanctions(user_id,scope,reason,expires_at,moderator_id,created_at) VALUES(?,?,?,?,?,?)').run(bob,'social','Social fixture',Date.now()+86400000,owner,Date.now()).lastInsertRowid);
 const before=sb.frames.length;sb.send(JSON.stringify({type:'call:invite',to:alice,callId:'fixture-social',members:[alice,bob]}));const restricted=await frame(sb,'safety:restricted',before);assert.equal(restricted.sanction.scope,'social');assert.equal(sb.readyState,WS.OPEN);
 assert.equal((await request(bob,'/api/friends')).status,403);assert.equal((await request(bob,'/api/economy/me')).status,200);
 await request(owner,'/api/safety/admin/revoke',{sanctionId:social,note:'Restore'});
 const second=await request(alice,'/api/safety/reports',{targetId:bob,context:'player',reason:'cheating',note:'Permanent fixture'});
 decision=await request(owner,'/api/safety/admin/decision',{reportId:second.data.id,status:'actioned',scope:'account',duration:'permanent',note:'Reviewed permanent fixture reason'});assert.equal(decision.status,200);
 for(let i=0;i<30&&sb.readyState===WS.OPEN;i++)await pause(20);assert.notEqual(sb.readyState,WS.OPEN);
 const profile=(await request(alice,'/api/profile/'+bob)).data;assert.equal(profile.player.name,'target');assert(profile.player.banned);assert.equal(profile.rating.rating,0);assert.equal(profile.rating.peak,0);assert.equal(profile.stats.wins,0);assert.deepEqual(profile.games,[]);
 const friends=(await request(alice,'/api/friends')).data;const friend=friends.find(u=>u.id===bob);assert(friend.banned);assert.equal(friend.rating,0);assert.equal(friend.online,false);assert.equal(friend.cosmetics,null);
 for(const sort of ['rating','wins','games','puzzles'])assert(!(await request(alice,'/api/leaderboard?sort='+sort)).data.players.some(u=>u.id===bob));
 assert.equal((await request(bob,'/api/me')).data.safety.account.reason,'Reviewed permanent fixture reason');assert.equal((await request(bob,'/api/settings')).status,403);
 const appeal=await request(bob,'/api/safety/appeals',{sanctionId:decision.data.sanctionId,note:'Appeal fixture'});assert.equal(appeal.status,201);assert.equal((await request(owner,'/api/safety/status')).data.notifications.openAppeals,1);
 await request(owner,'/api/safety/admin/appeal-decision',{appealId:appeal.data.id,status:'accepted',note:'Accepted fixture'});
 assert.equal((await request(alice,'/api/profile/'+bob)).data.rating.rating,2100);assert((await request(alice,'/api/leaderboard')).data.players.some(u=>u.id===bob));
 assert.equal(database.prepare('SELECT rating,wins FROM users WHERE id=?').get(bob).wins,12);
 console.log('PASS real HTTP/WS: live unread reports and appeals, three-day sanctions, economy/social scope isolation, permanent disconnect, friends/profile masking, all leaderboard sorts and data restoration');
})().catch(e=>{console.error(e);if(failures)console.error(failures.slice(-1500));process.exitCode=1;}).finally(async()=>{for(const s of sockets)s.terminate();database?.close();child.kill();await new Promise(r=>child.once('exit',r));for(const suffix of ['','-wal','-shm'])try{fs.unlinkSync(file+suffix);}catch(_){}});
