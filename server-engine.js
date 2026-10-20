'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
// One serialized UCI process. Hard deadlines release every queued request.
let child=null,buffer='',ready=null,listener=null,chain=Promise.resolve(),queued=0;
function stop(){if(child)child.kill();child=null;ready=null;buffer='';listener?.(null);listener=null;}
function start(){
 if(ready)return ready;
 ready=new Promise(resolve=>{
  child=spawn(process.execPath,[path.join(__dirname,'stockfish-18-single.js')],{cwd:__dirname,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const instance=child;
  const timeout=setTimeout(()=>{if(child===instance)stop();resolve(false);},4500);
  child.stdout.on('data',raw=>{if(child!==instance)return;buffer+=String(raw);let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);if(line==='readyok'){clearTimeout(timeout);resolve(true);}const m=/^bestmove\s+(\S+)/.exec(line);if(m&&listener){const done=listener;listener=null;done(m[1]);}}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timeout);if(child===instance)stop();resolve(false);});
  child.on('exit',()=>{clearTimeout(timeout);if(child===instance){child=null;ready=null;listener?.(null);listener=null;}resolve(false);});
  child.stdin.write('uci\nsetoption name Threads value 1\nsetoption name Hash value 16\nisready\n');
 });return ready;
}
async function move(fen,opts){
 if(queued>=4)return null;queued++;const expires=Date.now()+6000;
 const job=chain.then(async()=>{
  if(Date.now()>=expires||!await start()||Date.now()>=expires)return null;
  return new Promise(resolve=>{
   const timer=setTimeout(()=>{stop();resolve(null);},Math.min(opts.moveMs+1800,expires-Date.now()));
   listener=uci=>{clearTimeout(timer);resolve(/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci||'')?uci:null);};
   try{child.stdin.write('ucinewgame\nsetoption name Skill Level value '+opts.skill+'\nsetoption name UCI_LimitStrength value '+(opts.limitStrength?'true':'false')+'\n'+(opts.elo?'setoption name UCI_Elo value '+opts.elo+'\n':'')+'position fen '+fen+'\ngo depth '+opts.depth+' movetime '+opts.moveMs+'\n');}catch(_){stop();resolve(null);}
  });
 }).finally(()=>queued--);
 chain=job.catch(()=>null);return job;
}
process.on('exit',()=>child?.kill());
module.exports={move,stop};
