'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Chess}=require('chess.js'),S=require('./security-core'),PZR=require('./puzzles-rating');
const archive=[];
for(const file of fs.readdirSync(path.join(__dirname,'puzzles')).filter(f=>/^pz-\d+\.txt$/.test(f))){
 for(const line of fs.readFileSync(path.join(__dirname,'puzzles',file),'utf8').split(/\r?\n/)){
  const a=line.split('|');if(a.length<8)continue;
  archive.push({id:a[0],fen:a[1],moves:a[2].split(' '),rating:Number(a[3]),rd:Number(a[4]),themes:a[7].split(' '),raw:line});
 }
}
const byId=new Map(archive.map(p=>[p.id,p]));
function puzzleStart(id,pid,mode,difficulty){
 let p=byId.get(String(pid||''));
 if(mode==='rated'){
  // Starting another puzzle settles the abandoned rated attempt once.
  for(const old of S.db.prepare("SELECT id,payload FROM reward_sessions WHERE user_id=? AND kind='puzzle' AND consumed_at IS NULL").all(id)){
   const d=JSON.parse(old.payload);if(d.mode==='rated'&&!d.ratedDone){puzzleStep(id,old.id,'giveup');S.consume(old.id);}
  }
  const u=S.db.prepare('SELECT puzzle_rating FROM users WHERE id=?').get(id);
  const w=PZR.window(u?.puzzle_rating||1200,['standard','rated-hard','extra-hard'].includes(difficulty)?difficulty:'standard');
  const pool=archive.filter(p=>p.rating>=w.lo&&p.rating<=w.hi);
  p=(pool.length?pool:archive)[crypto.randomInt(pool.length||archive.length)];
 }
 if(!p)return null;
 return {sessionId:S.session(id,'puzzle',{pid:p.id,mode:mode==='rated'?'rated':'practice',index:1,failed:false,startedAt:Date.now()},1800000),raw:p.raw};
}
function puzzleStep(id,key,action,uci){
 const s=S.getSession(key,id,'puzzle');if(!s)return null;
 const p=byId.get(s.data.pid);if(!p)return null;
 const d=s.data;
 if(action!=='move'||typeof uci!=='string'||uci!==p.moves[d.index])d.failed=true;
 else d.index+=2;
 const solved=d.index>=p.moves.length&&!d.failed;
 const finished=solved||d.failed;
 S.db.prepare('UPDATE reward_sessions SET payload=? WHERE id=?').run(JSON.stringify(d),key);
 let rating=null;
 if(finished && !d.ratedDone && d.mode==='rated'){
  rating=S.db.transaction(()=>{
   const user=S.db.prepare('SELECT puzzle_rating,puzzle_rd,puzzle_games,puzzle_solved,puzzle_peak FROM users WHERE id=?').get(id);
   const old={...PZR.blank(),r:user.puzzle_rating||1200,rd:user.puzzle_rd||350,games:user.puzzle_games||0,solved:user.puzzle_solved||0,best:user.puzzle_peak||1200};
   const out=PZR.apply(old,p,{solved,mistakes:d.failed?1:0},{rated:true});
   S.db.prepare('UPDATE users SET puzzle_rating=?,puzzle_rd=?,puzzle_games=?,puzzle_solved=?,puzzle_peak=? WHERE id=?').run(out.player.r,out.player.rd,out.player.games,out.player.solved,out.player.best,id);
   d.ratedDone=true;S.db.prepare('UPDATE reward_sessions SET payload=? WHERE id=?').run(JSON.stringify(d),key);
   return out;
  })();
 }
 return {ok:true,solved,failed:d.failed,rating};
}
function puzzleClaim(id,key,pid){
 const s=S.getSession(key,id,'puzzle');if(!s||s.data.pid!==pid||s.data.failed)return null;
 const p=byId.get(pid);if(!p||s.data.index<p.moves.length)return null;
 if(!S.consume(key))return null;
 return p;
}
function rc(v){return Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<8)?'abcdefgh'[v[1]]+(8-v[0]):null;}
function replay(moves){
 if(!Array.isArray(moves)||moves.length<4||moves.length>600)return null;
 const chess=new Chess(),uci=[];
 try{for(const m of moves){
  const from=typeof m==='string'?m.slice(0,2):rc(m.fr||m.from),to=typeof m==='string'?m.slice(2,4):rc(m.to);
  const promotion=String((typeof m==='string'?m[4]:m.promo)||'q').toLowerCase();
  const result=chess.move({from,to,promotion});if(!result)return null;
  uci.push(result.from+result.to+(result.promotion||''));
 }}catch(_){return null;}
 return {chess,uci};
}
function localStart(id,mode,level,eventId){
 if(!['nour','engine','local','bluetooth'].includes(mode)||!/^[-a-zA-Z0-9]{8,80}$/.test(String(eventId)))return null;
 const stage=Number(level);if(mode==='nour'&&(!Number.isInteger(stage)||stage<1||stage>12))return null;
 if(mode==='engine'&&(!Number.isInteger(stage)||stage<1||stage>10))return null;
 if(mode==='nour'){
  const legacy=S.db.prepare('SELECT stage FROM legacy_nour_access WHERE user_id=?').get(id)?.stage||0;
  const verified=S.db.prepare('SELECT MAX(stage) stage FROM verified_nour WHERE user_id=?').get(id)?.stage||0;
  if(stage>Math.max(legacy,verified)+1)return null;
 }
 return S.session(id,'local',{mode,level:stage||0,eventId,fen:new Chess().fen(),transcript:[]},10800000);
}
const engineLocks=new Set();
const nour=[{depth:1,skill:1,random:.70},{depth:1,skill:2,random:.55},{depth:2,skill:3,random:.40},{depth:3,skill:5,random:.25},{depth:4,skill:7,random:.15},{depth:5,skill:10,random:.10},{depth:6,skill:13,random:.05},{depth:9,skill:16,random:.01},{depth:12,skill:18,random:0},{depth:14,skill:19,random:0},{depth:17,skill:20,random:0},{depth:20,skill:20,random:0}];
async function engineStep(id,key,move){
 const s=S.getSession(key,id,'local');if(!s||!['engine','nour'].includes(s.data.mode)||engineLocks.has(key))return null;
 engineLocks.add(key);
 try{
  const d=s.data,chess=new Chess(d.fen),from=rc(move?.fr),to=rc(move?.to);if(chess.turn()!=='w'||chess.isGameOver()||!from||!to)return null;
  let played;try{played=chess.move({from,to,promotion:String(move.promo||'q').toLowerCase()});}catch(_){return null;}
  d.transcript.push(played.from+played.to+(played.promotion||''));
  let uci=null;
  if(!chess.isGameOver()){
   const opts=d.mode==='nour'?nour[Math.max(0,d.level-1)]:enginePreset(d.level);
   if(Math.random()<(opts.random||opts.blunder||0)){const legal=chess.moves({verbose:true});const m=legal[crypto.randomInt(legal.length)];uci=m.from+m.to+(m.promotion||'');}
   else uci=await require('./server-engine').move(chess.fen(),{skill:opts.skill??20,depth:d.mode==='nour'?opts.depth+5:Math.max(opts.depth,6),moveMs:d.mode==='nour'?Math.min(2600,180+opts.depth*180):opts.moveMs,limitStrength:opts.limitStrength,elo:opts.elo});
   if(!uci)return null;
   try{const m=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});d.transcript.push(m.from+m.to+(m.promotion||''));}catch(_){return null;}
  }
  d.fen=chess.fen();S.db.prepare('UPDATE reward_sessions SET payload=? WHERE id=? AND consumed_at IS NULL').run(JSON.stringify(d),key);
  return {uci};
 }finally{engineLocks.delete(key);}
}
function enginePreset(level){
 // Generated from the same source definition used by the client; no stage changes.
 const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
 const a=html.indexOf('const ENGINE_LEVELS='),b=html.indexOf('function getEnginePreset',a);
 const vm=require('node:vm'),ctx=vm.createContext({});vm.runInContext(html.slice(a,b)+'\nthis.levels=ENGINE_LEVELS;',ctx);
 const p=ctx.levels[Math.max(0,Math.min(9,(Number(level)||4)-1))];
 return {...p,depth:p.limitless?16:12,limitStrength:!p.limitless};
}
function localClaim(id,b){
 const s=S.getSession(b.sessionId,id,'local');
 if(!s||s.data.mode!==b.mode||s.data.eventId!==b.eventId||Date.now()-s.created_at<3000)return null;
 const r=replay(b.transcript);if(!r)return null;
 if(['engine','nour'].includes(s.data.mode)&&JSON.stringify(r.uci)!==JSON.stringify(s.data.transcript)){
  // A player's mating move ends the client round before it asks for another engine reply.
  const prefix=r.uci.slice(0,-1),last=r.uci.at(-1);
  if(JSON.stringify(prefix)!==JSON.stringify(s.data.transcript)||!r.chess.isGameOver()||new Chess(s.data.fen).turn()!=='w')return null;
  const check=new Chess(s.data.fen);try{check.move({from:last.slice(0,2),to:last.slice(2,4),promotion:last[4]||'q'});}catch(_){return null;}
  if(check.fen()!==r.chess.fen())return null;
 }
 let result=null,reason='';
 if(r.chess.isCheckmate()){result=r.chess.turn()==='b'?'win':'loss';reason='checkmate';}
 else if(r.chess.isDraw()){result='draw';reason='draw';}
 else if(b.outcome==='loss'&&b.reason==='resign'){result='loss';reason='resign';}
 else if(['local','bluetooth'].includes(b.mode)&&b.reason==='resign'&&['win','loss'].includes(b.outcome)){result=b.outcome;reason='resign';}
 if(!result||result!==b.outcome)return null;
 const fingerprint=crypto.createHash('sha256').update(s.data.mode+':'+r.uci.join(' ')).digest('hex');
 if(S.db.prepare('SELECT 1 FROM verified_results WHERE user_id=? AND fingerprint=?').get(id,fingerprint))return null;
 const n=S.db.prepare('SELECT COUNT(*) n FROM verified_results WHERE user_id=? AND created_at>?').get(id,Date.now()-86400000).n;
 if(n>=40)return null;
 if(!S.consume(s.id))return null;
 S.db.prepare('INSERT INTO verified_results VALUES(?,?,?)').run(id,fingerprint,Date.now());
 if(result==='win'&&s.data.mode==='nour'&&s.data.level>0){
  const thresholds=[[8,6,4],[12,9,7],[16,12,9],[20,15,11],[25,18,13],[30,22,16],[35,26,19],[40,30,22],[99,18,12],[99,16,11],[99,15,10],[99,14,9]][s.data.level-1];
  const n=Math.ceil(r.uci.length/2),stars=n<=thresholds[2]?3:n<=thresholds[1]?2:1;
  S.db.prepare('INSERT INTO verified_nour(user_id,stage,stars) VALUES(?,?,?) ON CONFLICT(user_id,stage) DO UPDATE SET stars=MAX(stars,excluded.stars)').run(id,s.data.level,stars);
 }
 return {outcome:result,reason,mode:s.data.mode,level:s.data.level,moves:Math.ceil(r.uci.length/2)};
}
function battleRows(rating,count=40){const used=new Set(),out=[];for(let i=0;i<count;i++){const w=PZR.window(rating,'rush',i/count),pool=archive.filter(p=>!used.has(p.id)&&p.rating>=w.lo&&p.rating<=w.hi),p=(pool.length?pool:archive)[crypto.randomInt(pool.length||archive.length)];used.add(p.id);out.push({id:p.id,fen:p.fen,moves:p.moves.join(' '),rating:p.rating,rd:p.rd,themes:p.themes});}return out;}
function battleStep(b,me,action,uci){
 if(b.status!=='live'||b.ended[me]||Date.now()<b.startAt||Date.now()>b.startAt+b.duration*1000)return false;
 const state=b.progress[me],p=b.puzzles[state.idx];if(!p)return false;
 const solution=p.moves.split(' ');
 if(action!=='move'||uci!==solution[state.move]){b.misses[me]=(b.misses[me]||0)+1;state.idx++;state.move=1;}
 else {state.move+=2;if(state.move>=solution.length){b.scores[me]=(b.scores[me]||0)+1;state.idx++;state.move=1;}}
 if(b.misses[me]>=3)b.ended[me]=true;return true;
}
module.exports={puzzleStart,puzzleStep,puzzleClaim,localStart,localClaim,engineStep,replay,rc,byId,battleRows,battleStep};
