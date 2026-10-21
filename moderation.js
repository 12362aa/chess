'use strict';
const express=require('express'),S=require('./security-core'),{authenticateToken}=require('./auth');
const router=express.Router(),db=S.db;
// Existing open items become visible on the moderator's next sign-in too.
for(const u of db.prepare('SELECT user_id FROM moderation_roles').all())for(const [kind,table] of [['report','moderation_reports'],['appeal','moderation_appeals']])db.prepare(`INSERT OR IGNORE INTO moderation_notifications(user_id,kind,subject_id,created_at) SELECT ?,?,id,created_at FROM ${table} WHERE status='open'`).run(u.user_id,kind);
const REASONS=new Set(['harassment','hate','sexual','threat','spam','cheating','other']);
router.use(authenticateToken);
router.get('/status',(req,res)=>{res.set('Cache-Control','no-store');res.json({moderator:S.moderator(req.user.id),active:{account:S.active(req.user.id,'account'),social:S.active(req.user.id,'social'),economy:S.active(req.user.id,'economy')},notifications:S.moderator(req.user.id)?S.notificationCounts(req.user.id):null,sanctions:db.prepare('SELECT id,scope,reason,reason_key,automatic,expires_at,revoked_at,created_at FROM account_sanctions WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.user.id),appeals:db.prepare('SELECT id,sanction_id,status FROM moderation_appeals WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.user.id)});});
function trustedEvidence(me,target,kind,id) {
 if(kind==='game-message'){const m=db.prepare('SELECT * FROM game_chat_evidence WHERE id=?').get(id);return m&&m.sender_id===target&&m.recipient_id===me?m:null;}
 if(kind==='dm'){
  const m=db.prepare('SELECT id,sender_id,recipient_id,body,kind,created_at,deleted_at FROM messages WHERE id=?').get(Number(id));
  if(!m||m.sender_id!==target||m.recipient_id!==me)return null;
  return m;
 }
 if(kind==='group'){
  const m=db.prepare('SELECT id,group_id,sender_id,body,kind,created_at,deleted_at FROM group_messages WHERE id=?').get(Number(id));
  const member=m&&db.prepare('SELECT joined_at FROM group_members WHERE group_id=? AND user_id=?').get(m.group_id,me);
  if(!m||m.sender_id!==target||!member||member.joined_at>m.created_at)return null;
  return m;
 }
 if(['call','game'].includes(kind)){
  const c=db.prepare('SELECT id,kind,detail,created_at FROM safety_context WHERE id=? AND user_id=? AND peer_id=? AND kind=?').get(String(id),me,target,kind);
  return c||null;
 }
 if(kind==='player')return {target_id:target};
 return null;
}
router.post('/reports',(req,res)=>{
 const b=req.body||{},me=Number(req.user.id),target=Number(b.targetId),kind=String(b.context||''),id=String(b.contextId||'').slice(0,100);
 const note=typeof b.note==='string'?b.note.trim():'';
 if(!Number.isInteger(target)||target===me||!db.prepare('SELECT 1 FROM users WHERE id=?').get(target)||!REASONS.has(b.reason)||note.length>1500)return res.status(400).json({error:'invalid_report'});
 const evidence=trustedEvidence(me,target,kind,id);if(!evidence)return res.status(403).json({error:'invalid_context'});
 const duplicate=db.prepare('SELECT id FROM moderation_reports WHERE reporter_id=? AND target_id=? AND context=? AND context_id=? AND reason=? AND created_at>?').get(me,target,kind,id,b.reason,Date.now()-86400000);
 if(duplicate)return res.json({ok:true,id:duplicate.id,duplicate:true});
 if(db.prepare('SELECT COUNT(*) n FROM moderation_reports WHERE reporter_id=? AND created_at>?').get(me,Date.now()-86400000).n>=10)return res.status(429).json({error:'report_limit'});
 const reportId=db.transaction(()=>{
  const r=db.prepare('INSERT INTO moderation_reports(reporter_id,target_id,context,context_id,reason,note,evidence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(me,target,kind,id,b.reason,note,JSON.stringify(evidence),Date.now(),Date.now());
  if(['dm','group'].includes(kind)&&['image','video','voice'].includes(evidence.kind)){
   const m=db.prepare('SELECT audio_data,mime FROM '+(kind==='dm'?'messages':'group_messages')+' WHERE id=?').get(Number(id));
   if(m?.audio_data)db.prepare('INSERT INTO moderation_media VALUES(?,?,?)').run(r.lastInsertRowid,m.audio_data,String(m.mime||'').slice(0,100));
  }
  S.audit(me,'report',target,{reportId:Number(r.lastInsertRowid)});
  for(const to of recipients())db.prepare('INSERT OR IGNORE INTO moderation_outbox(report_id,recipient,next_at) VALUES(?,?,?)').run(r.lastInsertRowid,to,Date.now());
  return Number(r.lastInsertRowid);
 })();
 S.notifyModerators('report',reportId);res.status(201).json({ok:true,id:reportId});
});
router.get('/reports',(req,res)=>res.json({reports:db.prepare('SELECT id,target_id,context,reason,status,decision,created_at FROM moderation_reports WHERE reporter_id=? ORDER BY id DESC LIMIT 50').all(req.user.id)}));
router.post('/appeals',(req,res)=>{
 const id=Number(req.body.sanctionId),note=String(req.body.note||'').trim();
 if(!note||note.length>1500||!db.prepare('SELECT 1 FROM account_sanctions WHERE id=? AND user_id=?').get(id,req.user.id))return res.status(400).json({error:'invalid_appeal'});
 const existing=db.prepare("SELECT id FROM moderation_appeals WHERE user_id=? AND sanction_id=? AND status='open'").get(req.user.id,id);
 if(existing)return res.json({ok:true,id:existing.id});
 const n=db.prepare('SELECT COUNT(*) n FROM moderation_appeals WHERE user_id=? AND created_at>?').get(req.user.id,Date.now()-86400000).n;
 if(n>=3)return res.status(429).json({error:'appeal_limit'});
 const r=db.prepare('INSERT INTO moderation_appeals(user_id,sanction_id,note,created_at) VALUES(?,?,?,?)').run(req.user.id,id,note,Date.now());S.notifyModerators('appeal',Number(r.lastInsertRowid));res.status(201).json({ok:true,id:Number(r.lastInsertRowid)});
});
router.use('/admin',(req,res,next)=>S.moderator(req.user.id)?next():res.status(403).json({error:'moderator_only'}));
router.post('/admin/seen',(req,res)=>{const cursor=Number(req.body.cursor);if(!Number.isSafeInteger(cursor)||cursor<0)return res.status(400).json({error:'invalid_cursor'});db.prepare('UPDATE moderation_notifications SET seen_at=? WHERE user_id=? AND id<=? AND seen_at IS NULL').run(Date.now(),req.user.id,cursor);res.json(S.notificationCounts(req.user.id));});
router.post('/admin/event-review',(req,res)=>{
 const e=db.prepare('SELECT * FROM security_events WHERE id=?').get(Number(req.body.eventId));if(!e?.user_id||S.moderator(e.user_id))return res.status(400).json({error:'invalid_event'});
 const old=db.prepare("SELECT * FROM moderation_reports WHERE context='security' AND context_id=? AND status='open'").get(String(e.id));if(old)return res.json(old);
 const id=Number(db.prepare('INSERT INTO moderation_reports(reporter_id,target_id,context,context_id,reason,note,evidence,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user.id,e.user_id,'security',String(e.id),'cheating','',JSON.stringify(e),Date.now(),Date.now()).lastInsertRowid);
 S.audit(req.user.id,'event-review',e.user_id,{eventId:e.id,reportId:id});res.json(db.prepare('SELECT * FROM moderation_reports WHERE id=?').get(id));
});
router.get('/admin/media/:id',(req,res)=>{
 const m=db.prepare('SELECT data,mime FROM moderation_media WHERE report_id=?').get(Number(req.params.id));
 if(!m)return res.status(404).json({error:'not_found'});
 res.set('Cache-Control','no-store');res.json(m);
});
router.get('/admin/inbox',(req,res)=>res.json({reports:db.prepare(`SELECT r.*,u.username target_name,p.username reporter_name FROM moderation_reports r JOIN users u ON u.id=r.target_id JOIN users p ON p.id=r.reporter_id ORDER BY r.status='open' DESC,r.id DESC LIMIT 100`).all(),appeals:db.prepare("SELECT a.*,u.username FROM moderation_appeals a JOIN users u ON u.id=a.user_id WHERE a.status='open' ORDER BY a.id LIMIT 100").all(),events:db.prepare('SELECT e.*,u.username FROM security_events e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 100').all(),sanctions:db.prepare('SELECT s.*,u.username FROM account_sanctions s JOIN users u ON u.id=s.user_id WHERE s.revoked_at IS NULL ORDER BY s.id DESC LIMIT 100').all(),notifications:{pending:db.prepare('SELECT COUNT(*) n FROM moderation_outbox WHERE delivered_at IS NULL').get().n,configured:recipients().length>0&&require('./mailer').ready()}}));
router.post('/admin/decision',(req,res)=>{
 const b=req.body||{},id=Number(b.reportId),r=db.prepare('SELECT * FROM moderation_reports WHERE id=?').get(id);
 if(!r||!['dismissed','actioned'].includes(b.status)||r.status!=='open')return res.status(400).json({error:'invalid_decision'});
 const note=String(b.note||'').trim();if(!note||note.length>1500)return res.status(400).json({error:'reason_required'});
 let sanctionId=null;
 const durations={hour:3600000,day:86400000,threeDays:259200000,week:604800000,month:2592000000,permanent:null};
 if(b.status==='actioned'&&(!S.scopes.has(b.scope)||!Object.hasOwn(durations,b.duration)))return res.status(400).json({error:'invalid_sanction'});
 if(S.moderator(r.target_id)&&b.status==='actioned')return res.status(403).json({error:'protected_moderator'});
 db.transaction(()=>{
  db.prepare('UPDATE moderation_reports SET status=?,decision=?,updated_at=? WHERE id=?').run(b.status,note,Date.now(),id);
  if(b.status==='actioned')sanctionId=Number(db.prepare('INSERT INTO account_sanctions(user_id,scope,reason,expires_at,moderator_id,report_id,created_at) VALUES(?,?,?,?,?,?,?)').run(r.target_id,b.scope,note,durations[b.duration]===null?null:Date.now()+durations[b.duration],req.user.id,id,Date.now()).lastInsertRowid);
  S.audit(req.user.id,'decision',r.target_id,{reportId:id,status:b.status,sanctionId,note});
 })();
 router.onNotice?.();
 if(sanctionId)router.onSanction?.(r.target_id);
 res.json({ok:true,sanctionId});
});
router.post('/admin/revoke',(req,res)=>{
 const id=Number(req.body.sanctionId),note=String(req.body.note||'').trim();if(!note||note.length>1500)return res.status(400).json({error:'reason_required'});
 const s=db.prepare('SELECT user_id FROM account_sanctions WHERE id=? AND revoked_at IS NULL').get(id);if(!s)return res.status(404).json({error:'not_found'});
 db.transaction(()=>{db.prepare('UPDATE account_sanctions SET revoked_at=? WHERE id=?').run(Date.now(),id);db.prepare("UPDATE moderation_appeals SET status='resolved' WHERE sanction_id=?").run(id);S.audit(req.user.id,'revoke',s.user_id,{sanctionId:id,note});})();router.onSanction?.(s.user_id);router.onNotice?.();res.json({ok:true});
});
router.post('/admin/appeal-decision',(req,res)=>{
 const id=Number(req.body.appealId),note=String(req.body.note||'').trim(),status=req.body.status;
 if(!note||note.length>1500||!['accepted','rejected'].includes(status))return res.status(400).json({error:'invalid_decision'});
 const a=db.prepare("SELECT * FROM moderation_appeals WHERE id=? AND status='open'").get(id);if(!a)return res.status(404).json({error:'not_found'});
 db.transaction(()=>{db.prepare('UPDATE moderation_appeals SET status=? WHERE id=?').run(status,id);if(status==='accepted')db.prepare('UPDATE account_sanctions SET revoked_at=? WHERE id=?').run(Date.now(),a.sanction_id);S.audit(req.user.id,'appeal-'+status,a.user_id,{appealId:id,note});})();router.onSanction?.(a.user_id);router.onNotice?.();res.json({ok:true});
});
function recipients(){return [...new Set(String(process.env.MODERATION_EMAILS||'').split(',').map(s=>s.trim()).filter(s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))].slice(0,3);}
let sending=false;
let pushing=false;
async function deliverPush(){
 if(pushing||!router.pushTokens||!router.sendPush)return;pushing=true;
 try{for(const u of db.prepare('SELECT user_id FROM moderation_roles').all()){
  for(const token of [...new Set(router.pushTokens(u.user_id))]){
   const hash=require('node:crypto').createHash('sha256').update(token).digest('hex');
   // Completed unread deliveries must not starve newer notifications behind them.
   const pending=db.prepare('SELECT n.* FROM moderation_notifications n LEFT JOIN moderation_push_receipts p ON p.notification_id=n.id AND p.token_hash=? WHERE n.user_id=? AND n.seen_at IS NULL AND n.created_at>? AND p.delivered_at IS NULL AND COALESCE(p.next_at,0)<=? ORDER BY n.id LIMIT 20').all(hash,u.user_id,Date.now()-7*86400000,Date.now());
   for(const n of pending){
   db.prepare('INSERT OR IGNORE INTO moderation_push_receipts(notification_id,token_hash) VALUES(?,?)').run(n.id,hash);
   const row=db.prepare('SELECT * FROM moderation_push_receipts WHERE notification_id=? AND token_hash=?').get(n.id,hash);if(row.delivered_at||row.next_at>Date.now())continue;
   const title={ar:'مراجعة السلامة • Am-Kh',en:'Safety review • Am-Kh'};
   const body=n.kind==='report'?{ar:'بلاغ جديد #'+n.subject_id+' ينتظر مراجعتك.',en:'New report #'+n.subject_id+' awaits your review.'}:n.kind==='appeal'?{ar:'اعتراض جديد #'+n.subject_id+' ينتظر مراجعتك.',en:'New appeal #'+n.subject_id+' awaits your review.'}:{ar:'تم تطبيق تقييد تلقائي موثق. راجع سجل السلامة.',en:'An evidenced automatic restriction was applied. Review the safety log.'};
   let result;try{result=await router.sendPush([token],{title,body,dataOnly:true,tag:'safety-'+n.id,data:{kind:'moderation',notification_id:String(n.id),tag:'safety-'+n.id}});}catch(_){}
   if(result?.successCount>0)db.prepare('UPDATE moderation_push_receipts SET delivered_at=? WHERE notification_id=? AND token_hash=?').run(Date.now(),n.id,hash);
   else db.prepare('UPDATE moderation_push_receipts SET attempts=attempts+1,next_at=? WHERE notification_id=? AND token_hash=?').run(Date.now()+Math.min(3600000,30000*2**Math.min(row.attempts,7)),n.id,hash);
   }
  }
 }}finally{pushing=false;}
}
async function deliverPending(){
 if(sending||!require('./mailer').ready())return;
 sending=true;
 try{for(const row of db.prepare('SELECT o.*,r.context,r.reason,r.target_id FROM moderation_outbox o JOIN moderation_reports r ON r.id=o.report_id WHERE o.delivered_at IS NULL AND o.next_at<=? LIMIT 5').all(Date.now())){
  try{await require('./mailer').sendModerationNotice({to:row.recipient,reportId:row.report_id,context:row.context,reason:row.reason,targetId:row.target_id});db.prepare('UPDATE moderation_outbox SET delivered_at=? WHERE id=?').run(Date.now(),row.id);}
  catch(_){db.prepare('UPDATE moderation_outbox SET attempts=attempts+1,next_at=? WHERE id=?').run(Date.now()+Math.min(86400000,60000*Math.pow(2,Math.min(row.attempts,10))),row.id);}
 }}finally{sending=false;}
}
router.startDelivery=()=>{const t=setInterval(()=>{deliverPending().catch(()=>{});deliverPush().catch(()=>{});S.cleanup();},30000);t.unref();};
router.deliverPending=deliverPending;
router.deliverPush=deliverPush;
module.exports=router;
