/* Server reward sessions. Offline play stays playable; authoritative rewards need a session. */
(function(){
 'use strict';
 const api=()=>window.getApiBase?getApiBase():'/api';
 const nativeFetch=window.fetch.bind(window);let integrityPending=null,integrityUser=null,integrityPass=null,integrityOffUntil=0;
 async function attest(token,uid){
  if(integrityUser!==uid){integrityUser=uid;integrityPass=null;integrityPending=null;integrityOffUntil=0;}
  if(integrityOffUntil>Date.now())return null;
  if(integrityPass?.expiresAt>Date.now()+30000)return integrityPass.pass;
  if(integrityPending)return integrityPending;
  integrityPending=(async()=>{
   const headers={Authorization:'Bearer '+token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'};
   const get=await nativeFetch(api()+'/integrity/config',{headers,signal:AbortSignal.timeout(5000)});const c=get.ok?await get.json():null;
   if(!c?.enabled){integrityOffUntil=Date.now()+300000;return null;}
   const plugin=window.Capacitor?.Plugins?.AppIntegrity;if(!plugin)return null;
   const challenge=await nativeFetch(api()+'/integrity/challenge',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(5000)});if(!challenge.ok)return null;
   const n=await challenge.json(),proof=await plugin.attest({nonce:n.nonce,projectNumber:String(c.projectNumber)});
   const verified=await nativeFetch(api()+'/integrity/verify',{method:'POST',headers,body:JSON.stringify({challengeId:n.challengeId,token:proof.token}),signal:AbortSignal.timeout(15000)});
   if(!verified.ok)return null;const result=await verified.json();if(window.amkhAuth?.user?.id!==uid)return null;integrityPass=result;return result.pass;
  })().catch(()=>{integrityOffUntil=Date.now()+60000;return null;}).finally(()=>{if(integrityUser===uid)integrityPending=null;});return integrityPending;
 }
 window.fetch=async function(input,init){
  const url=new URL(typeof input==='string'?input:input.url,location.href),base=new URL(api(),location.href);
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
  const token=window.amkhAuth?.token,uid=window.amkhAuth?.user?.id;
  if(token&&url.origin===base.origin&&url.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/economy/')&&headers.get('Authorization')==='Bearer '+token){
   const pass=await attest(token,uid);if(pass)headers.set('x-amkh-integrity',pass);init={...init,headers};
  }
  const response=await nativeFetch(input,init);
  if(response.status===403&&token&&url.origin===base.origin&&url.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/')&&headers.get('Authorization')==='Bearer '+token){
   response.clone().json().then(d=>{if(d.error==='account_restricted'&&uid===window.amkhAuth?.user?.id&&token===window.amkhAuth?.token)window.AMKHSafety?.restricted(d.sanction);}).catch(()=>{});
  }
  return response;
 };
 async function request(path,body){
  const token=window.amkhAuth?.token,uid=window.amkhAuth?.user?.id;if(!token)return null;
  try{const r=await fetch(api()+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},body:JSON.stringify(body),signal:AbortSignal.timeout(7000)});
   const data=r.ok?await r.json():null;return uid===window.amkhAuth?.user?.id&&token===window.amkhAuth?.token?data:null;
  }catch(_){return null;}
 }
 const rc=s=>'abcdefgh'[s[1]]+(8-s[0]);
 window.AMKHSecurity={
  request,
  async puzzle(p,mode){
   const data=await request('/economy/puzzle-session',{puzzleId:p.id,mode,difficulty:localStorage.getItem('amkh_puzzle_difficulty')||'standard'});
   if(!data)return null;
   const a=data.raw.split('|');const parsed=PZ.build({id:a[0],fen:a[1],moves:a[2],rating:+a[3],rd:+a[4],themes:a[7]});
   return parsed?{puzzle:parsed,id:data.sessionId,chain:Promise.resolve(),rating:null}:null;
  },
  step(session,action,from,to,promo){
   if(!session)return Promise.resolve(null);
   const uci=from&&to?rc(from)+rc(to)+(promo?String(promo).toLowerCase():''):null;
   session.chain=session.chain.then(()=>request('/economy/puzzle-step',{sessionId:session.id,action,uci})).then(data=>{if(data?.rating)session.rating=data.rating;return data;});
   return session.chain;
  },
  game(state){
   const mode=state.mode==='bot'?'nour':state.mode;
   const level=mode==='nour'?state.levelId+1:state.engineLevel||0;
   const eventId=state._gameEventId;
   state._rewardSession=request('/economy/game-session',{mode,level,eventId});
  },
  async engine(state){
   const eventId=state._gameEventId,pending=state._rewardSession,last=state._transcript?.at(-1);
   const session=await pending;if(!session||!last||eventId!==state._gameEventId)return null;
   const reply=await request('/economy/engine-step',{sessionId:session.sessionId,move:last});
   if(eventId!==state._gameEventId)return null;
   if(!reply){state._rewardSession=null;try{CHAT._addMsg(window.I18N?.lang==='en'?'Connection interrupted. You can finish this game offline; account rewards require an online verified game.':'انقطع الاتصال. تقدر تكمل المباراة بدون إنترنت؛ مكافآت الحساب تحتاج مباراة موثقة أثناء الاتصال.','sys');}catch(_){}return null;}
   if(reply.uci){const u=reply.uci;return {from:[8-Number(u[1]),'abcdefgh'.indexOf(u[0])],to:[8-Number(u[3]),'abcdefgh'.indexOf(u[2])],promo:u[4]?.toUpperCase()||null};}
   return null;
  },
  async proof(state){
   const pending=state._rewardSession,transcript=(state._transcript||[]).map(m=>({fr:[...m.fr],to:[...m.to],promo:m.promo||null}));
   const session=await pending;
   return session?{sessionId:session.sessionId,transcript}:{};
  }
 };
})();
