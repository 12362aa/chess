'use strict';
// Regression coverage for rated puzzles, bounded engine jobs, and daily rewards.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const html=fs.readFileSync('index.html','utf8');
const storage=new Map();global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
global.PZR=require('../puzzles-rating');global.PZS=require('../puzzles-store');
async function puzzles(){
 const puzzle={id:'fixture',rating:1200,rd:75,themes:[]},clean={solved:true,mistakes:0,hintsUsed:0};
 assert(PZR.apply(PZR.blank(),puzzle,clean).delta>0);
 for(const res of [{...clean,hintsUsed:1},{...clean,mistakes:1},{solved:false}])assert(PZR.apply(PZR.blank(),puzzle,res).delta<0);
 for(const mode of ['rush','daily','easy','hard','theme','battle','racer','streak']){
  const before=(await PZS.rating()).r;const result=await PZS.record(puzzle,clean,{mode});assert.equal(result.delta,0);assert.equal((await PZS.rating()).r,before);
 }
 for(const [difficulty,points] of [['standard',15],['rated-hard',20],['extra-hard',25]]){
  storage.set('amkh_puzzle_difficulty',difficulty);assert.equal((await PZS.record(puzzle,clean,{mode:'rated'})).points,points);
 }
 assert.equal((await PZS.record(puzzle,{solved:false,hintsUsed:1,correctMoves:0},{mode:'rated'})).points,0);
 assert((await PZS.record(puzzle,{solved:false,hintsUsed:1,correctMoves:1},{mode:'rated'})).points>0);
 console.log('PASS puzzle outcomes, mode isolation, difficulty, partial hint progress');
}
async function stockfish(){
 let workers=[];class Worker{constructor(){this.commands=[];workers.push(this);}postMessage(s){this.commands.push(s);if(s==='isready'&&!this.stall)setTimeout(()=>this.onmessage?.({data:'readyok'}),0);}terminate(){this.terminated=true;}}
 const ctx=vm.createContext({Worker,window:{AMKHPerf:{mobile:true}},console,setTimeout,clearTimeout,document:{getElementById:()=>null}});
 vm.runInContext(html.slice(html.indexOf('const SF=(()=>'),html.indexOf('const PV='))+'\nthis.sf=SF;',ctx);
 const b=Array.from({length:8},()=>Array(8).fill(null)),c={w:{K:false,Q:false},b:{K:false,Q:false}};
 const a=ctx.sf.bestMove(b,'w',c,null,6,0,null,{moveMs:200,deadlineMs:900});
 await new Promise(r=>setTimeout(r,25));let w=workers[0];assert(w.commands.includes('go depth 6 movetime 200'));assert(w.commands.includes('setoption name Hash value 16'));
 const queued=ctx.sf.bestMove(b,'w',c,null,6,0,null,{deadlineMs:500});assert.equal(await queued,null);
 w.onmessage({data:'bestmove e2e4'});assert.equal(await a,'e2e4');
 const cancelled=ctx.sf.bestMove(b,'w',c,null,6,0,null,{deadlineMs:500});await new Promise(r=>setTimeout(r,10));ctx.sf.cancelMoves();assert.equal(await cancelled,null);assert(w.terminated);
 const fresh=ctx.sf.bestMove(b,'w',c,null,6,0,null,{deadlineMs:500});await new Promise(r=>setTimeout(r,20));w.onmessage({data:'bestmove a1a8'});workers.at(-1).onmessage({data:'bestmove b1c3'});assert.equal(await fresh,'b1c3');
 // A worker that never initializes must still resolve inside the total deadline.
 const never=vm.createContext({Worker:class{postMessage(){}terminate(){}},window:{},console,setTimeout:(fn,ms)=>setTimeout(fn,ms>1000?5:ms),clearTimeout,document:{getElementById:()=>null}});
 vm.runInContext(html.slice(html.indexOf('const SF=(()=>'),html.indexOf('const PV='))+'\nthis.sf=SF;',never);
 const started=Date.now();assert.equal(await never.sf.bestMove(b,'w',c,null,1,0,null,{deadlineMs:500}),null);assert(Date.now()-started<800);
 console.log('PASS engine queue deadline, cancel, stale worker isolation, UCI budgets');
}
function fallback(){
 const ctx=vm.createContext({console,performance,postMessage:m=>ctx.result=m});vm.runInContext(fs.readFileSync('engine-fallback-worker.js','utf8'),ctx);
 vm.runInContext('this.bd=INIT_BD;this.rules=E;',ctx);const cas={w:{K:true,Q:true},b:{K:true,Q:true}};
 for(const turn of ['w','b']){const start=performance.now();ctx.onmessage({data:{id:1,bd:ctx.bd,turn,cas,ep:null,depth:12,budgetMs:120}});assert(performance.now()-start<600);const m=ctx.result.move;assert(ctx.rules.legal(ctx.bd,...m.from,cas,null).some(([r,c])=>r===m.to[0]&&c===m.to[1]));}
 console.log('PASS fallback worker legal moves and bounded high-depth search');
}
async function accountResponses(){
 const responses=[],values=new Map();const ctx=vm.createContext({window:{amkhAuth:{user:{id:'A'},token:'fixtureA'},dispatchEvent(){}},document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},Event:class{},fetch:()=>new Promise(r=>responses.push(r))});
 const source=fs.readFileSync('economy-client.js','utf8');vm.runInContext(source.slice(0,source.indexOf('})();')+5),ctx);
 const econ=ctx.window.amkhEconomy,old=econ.refresh();econ.clear();ctx.window.amkhAuth={user:{id:'B'},token:'fixtureB'};responses.shift()({ok:true,json:async()=>({coins:777})});await old;assert.equal(econ.state,null);
 const delayed=econ.refresh();econ.apply({coins:10});responses.shift()({ok:true,json:async()=>({coins:5})});await delayed;assert.equal(econ.state.coins,10);
 vm.runInContext("const S={_gameEventId:'fixture-game-123'};",ctx);await econ.notifyLocalResult('engine','win');assert.equal(responses.length,1);responses.shift()({ok:false});
 console.log('PASS account change and newer wallet response protection');
}
async function apiCache(){
 let handler;const ctx=vm.createContext({self:{addEventListener:(type,fn)=>{if(type==='fetch')handler=fn;},skipWaiting(){},clients:{claim(){}}},URL,importScripts(){throw Error('offline fixture');}});vm.runInContext(fs.readFileSync('sw.js','utf8'),ctx);
 for(const method of ['GET','POST']){let intercepted=false;handler({request:{url:'https://local.test/api/economy/home-challenges',method},respondWith(){intercepted=true;}});assert.equal(intercepted,false);}
 console.log('PASS service worker never caches API responses or mutations');
}
function quests(){
 process.env.AMKH_DB_PATH=path.join(require('node:os').tmpdir(),'amkh-mobile-'+Date.now()+'.db');process.env.AMKH_DB_VERBOSE='0';
 const db=require('../db'),econ=require('../economy');
 const user=n=>Number(db.prepare('INSERT INTO users(email,username,display_name) VALUES(?,?,?)').run(n+'@test.invalid',n,n).lastInsertRowid);
 const a=user('questA'),b=user('questB');econ.snapshot(a);assert.equal(econ.claimHomeChallenge(a,'play').ok,false);
 econ.awardGame(a,'win','fixture-room');econ.awardGame(a,'win','fixture-room');
 assert.equal(econ.homeChallengesSnapshot(a).quests.find(q=>q.id==='play').progress,1);
 assert(econ.homeChallengesSnapshot(b).quests.every(q=>q.progress===0));
 const before=econ.snapshot(a);const claim=econ.claimHomeChallenge(a,'play');assert.equal(claim.coins,before.coins+5);assert.equal(claim.xp,before.xp+8);assert.equal(econ.claimHomeChallenge(a,'play').ok,false);assert.equal(econ.snapshot(a).coins,claim.coins);
 for(let i=0;i<10;i++)econ.bumpHomeChallenges(a,'puzzles');assert.equal(econ.homeChallengesSnapshot(a).quests.find(q=>q.id==='puzzles').progress,3);
 const missions=JSON.stringify(econ.snapshot(a).missions);econ.claimHomeChallenge(a,'puzzles');assert.equal(JSON.stringify(econ.snapshot(a).missions),missions);
 const RealDate=global.Date;global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[RealDate.now()+86400000]));}};
 assert(econ.homeChallengesSnapshot(a).quests.every(q=>!q.claimed&&q.progress===0));global.Date=RealDate;
 const owned=econ.homeChallengesSnapshot(a);db.close();for(const name of ['../db','../economy','../auth','../security-core','../reward-proof'])delete require.cache[require.resolve(name)];const db2=require('../db'),econ2=require('../economy');assert.deepEqual(econ2.homeChallengesSnapshot(a),owned);
 db2.close();fs.unlinkSync(process.env.AMKH_DB_PATH);console.log('PASS home rewards: dedupe, caps, account isolation, independent missions, UTC reset, persistence');
}
(async()=>{await puzzles();await stockfish();fallback();await accountResponses();await apiCache();quests();console.log('Mobile update regressions passed');})().catch(e=>{console.error(e);process.exitCode=1;});
