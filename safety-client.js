(function(){
 'use strict';
 const L=(ar,en)=>window.I18N?.lang==='en'?en:ar;
 const shield='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z"/><path d="m8 12 3 3 5-6"/></svg>';
 const reasons={harassment:['إساءة أو تنمّر','Harassment'],hate:['كراهية أو تمييز','Hate or discrimination'],sexual:['محتوى جنسي أو غير مناسب','Sexual or inappropriate content'],threat:['تهديد أو خطر','Threat or danger'],spam:['إزعاج أو احتيال','Spam or scam'],cheating:['غش أو تلاعب','Cheating or tampering'],other:['مخالفة أخرى','Other violation']};
 const status={open:['قيد المراجعة','Under review'],dismissed:['أُغلِق البلاغ','Report closed'],actioned:['اتُّخذ إجراء','Action taken'],accepted:['قُبِل الاعتراض','Appeal accepted'],rejected:['رُفِض الاعتراض','Appeal rejected'],resolved:['تم الحل','Resolved']};
 const scopeNames={account:['حظر الحساب','Account ban'],social:['تقييد الشات والمكالمات','Chat & calls restriction'],economy:['تقييد المكافآت والمتجر','Rewards & store restriction']};
 const durationNames={hour:['ساعة','One hour'],day:['يوم','One day'],week:['أسبوع','One week'],month:['٣٠ يومًا','30 days'],permanent:['دائم','Permanent']};
 const esc=v=>window.amkhUI.esc(v);
 async function api(path,body){
  const tok=window.amkhAuth?.token,uid=window.amkhAuth?.user?.id;if(!tok)throw new Error(L('سجل الدخول أولًا.','Sign in first.'));
  const r=await fetch((window.getApiBase?getApiBase():'/api')+'/safety'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json();if(!r.ok)throw new Error(r.status===429?L('طلبات كثيرة؛ حاول لاحقًا.','Too many requests; try later.'):L('تعذر إتمام الطلب. أعد المحاولة.','Could not complete the request. Try again.'));
  if(uid!==window.amkhAuth?.user?.id||tok!==window.amkhAuth?.token)throw new Error(L('الحساب اتغيّر.','Account changed.'));return d;
 }
 function sheet(id,title,content){
  const ov=window.amkhUI.mount(id,`<div class="ds-sheet safety-sheet" data-no-i18n="true" dir="${window.I18N?.lang==='en'?'ltr':'rtl'}"><div class="ds-sheet__handle"></div><div class="ds-sheet__header"><span class="safety-shield">${shield}</span><h2 class="ds-sheet__title">${esc(title)}</h2><button class="ds-sheet__close" data-close aria-label="${L('إغلاق','Close')}">✕</button></div><div class="ds-sheet__body safety-body">${content}</div></div>`,{sheet:true,sfx:'privacy'});
  ov.classList.add('safety-overlay');return ov;
 }
 const button=(label,key,primary=false)=>`<button class="ds-btn ${primary?'ds-btn--primary':'ds-btn--ghost'} ds-btn--block" data-action="${key}">${esc(label)}</button>`;
 function error(ov,e){const p=ov.querySelector('[data-error]');if(p){p.textContent=e.message;p.focus();}}
 function noteField(label,key='note'){return `<label class="safety-label">${esc(label)}<textarea class="ds-input safety-note" data-note="${key}" maxlength="1500" rows="3"></textarea></label>`;}
 function pick(ov,container,choices,current,onChange){
  const host=ov.querySelector(container);host.innerHTML=Object.entries(choices).map(([k,v])=>`<button class="safety-choice ${k===current?'is-selected':''}" data-choice="${k}" type="button" aria-pressed="${k===current}"><span class="safety-choice__mark">${k===current?'✓':''}</span><span>${esc(L(...v))}</span></button>`).join('');
  host.querySelectorAll('button').forEach(b=>b.onclick=()=>{current=b.dataset.choice;pick(ov,container,choices,current,onChange);onChange(current);window.amkhUI.sfx();});
 }
 async function report(targetId,context='player',contextId=''){
  if(!window.amkhAuth?.token)return window.amkhAuth?.showLoginModal();
  let selected='harassment';
  const ov=sheet('amkh-report',L('الإبلاغ عن مخالفة','Report a violation'),`<p class="safety-copy">${L('اختَر سبب البلاغ. تفاصيل الرسالة أو المكالمة تُربط بالبلاغ من الخادم، ولا يتم تسجيل المكالمات. البلاغ يُراجَع قبل أي عقوبة.','Choose a reason. The server attaches the message or call context; calls are not recorded. Reports are reviewed before any penalty.')}</p><div data-reasons class="safety-choices"></div>${noteField(L('تفاصيل إضافية (اختياري)','Additional details (optional)'))}<p data-error role="status" tabindex="-1" class="safety-error"></p>${button(L('إرسال البلاغ','Send report'),'send',true)}`);
  pick(ov,'[data-reasons]',reasons,selected,v=>selected=v);
  ov.querySelector('[data-action=send]').onclick=async function(){
   this.disabled=true;try{
    const data=await api('/reports',{targetId,context,contextId,reason:selected,note:ov.querySelector('textarea').value});
    ov._dismiss();const done=sheet('amkh-report-done',L('تم حفظ البلاغ','Report saved'),`<p class="safety-copy">${L('رقم البلاغ','Report number')} <b>#${data.id}</b><br>${L('يمكنك متابعة حالته من إعدادات السلامة.','Track its status in Safety settings.')}</p>${button(L('حظر التواصل مع اللاعب','Block contact with this player'),'block')}${button(L('تم','Done'),'done',true)}<p data-error class="safety-error" role="status"></p>`);
    done.querySelector('[data-action=done]').onclick=()=>done._dismiss();
    done.querySelector('[data-action=block]').onclick=async function(){
     this.disabled=true;try{const r=await fetch((window.getApiBase?getApiBase():'/api')+'/friends/block',{method:'POST',headers:{Authorization:'Bearer '+window.amkhAuth.token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},body:JSON.stringify({user_id:targetId})});if(!r.ok)throw new Error(L('تعذر الحظر.','Could not block.'));this.textContent=L('تم حظر التواصل','Contact blocked');}catch(e){error(done,e);this.disabled=false;}
    };
   }catch(e){error(ov,e);this.disabled=false;}
  };
 }
 async function open(){
  const ov=sheet('amkh-safety',L('السلامة والإبلاغ','Safety & reports'),`<p class="safety-copy">${L('احترم اللاعبين، ولا ترسل إساءة أو تهديدًا أو محتوى جنسيًا أو احتياليًا. الغش والتلاعب بالمكافآت ممنوعان. يمكنك الإبلاغ من الرسالة أو المكالمة أو ملف اللاعب، وحظر التواصل معه.','Respect players. Harassment, threats, sexual content, scams, cheating and reward tampering are prohibited. Report from a message, call or player profile, and block contact.')}</p><div data-content>${L('جارٍ التحميل…','Loading…')}</div><p data-error class="safety-error" role="status"></p>`);
  try{
   const [d,r]=await Promise.all([api('/status'),api('/reports')]);if(!ov.isConnected)return;
   const host=ov.querySelector('[data-content]');host.textContent='';
   if(d.moderator){host.insertAdjacentHTML('beforeend',button(L('مراجعة البلاغات','Review inbox'),'inbox',true));host.querySelector('[data-action=inbox]').onclick=()=>inbox();}
   for(const s of d.sanctions){
    const active=!s.revoked_at&&(!s.expires_at||s.expires_at>Date.now());
    const card=document.createElement('section');card.className='safety-card';
    card.innerHTML=`<h3>${esc(L(...scopeNames[s.scope]))} ${active?'':'· '+L('انتهى','Ended')}</h3><p class="safety-copy">${esc(s.reason)}</p><small>${s.expires_at?new Date(s.expires_at).toLocaleString(window.I18N?.lang==='en'?'en':'ar'):L('دائم','Permanent')}</small>`;
    if(active){const b=document.createElement('button');b.className='ds-btn ds-btn--ghost ds-btn--block';b.textContent=L('تقديم اعتراض','Submit appeal');b.onclick=()=>appeal(s.id);card.append(b);}
    host.append(card);
   }
   for(const a of d.appeals){const p=document.createElement('p');p.className='safety-copy';p.textContent=L('اعتراض','Appeal')+' #'+a.id+' · '+(status[a.status]?L(...status[a.status]):a.status);host.append(p);}
   const title=document.createElement('h3');title.textContent=L('بلاغاتك','Your reports');host.append(title);
   if(!r.reports.length){const p=document.createElement('p');p.textContent=L('لا توجد بلاغات حتى الآن.','No reports yet.');p.className='safety-copy';host.append(p);}
   for(const row of r.reports){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>#${row.id} · ${esc(L(...reasons[row.reason]))}</b><p>${esc(L(...status[row.status]))}</p><p class="safety-copy">${esc(row.decision)}</p>`;host.append(card);}
  }catch(e){error(ov,e);}
 }
 function appeal(id){
  const ov=sheet('amkh-appeal',L('الاعتراض على العقوبة','Appeal a penalty'),`${noteField(L('وضح سبب اعتراضك','Explain your appeal'))}<p data-error class="safety-error" role="status"></p>${button(L('إرسال الاعتراض','Submit appeal'),'send',true)}`);
  ov.querySelector('[data-action=send]').onclick=async function(){this.disabled=true;try{await api('/appeals',{sanctionId:id,note:ov.querySelector('textarea').value});ov._dismiss();open();}catch(e){error(ov,e);this.disabled=false;}};
 }
 async function inbox(){
  const ov=sheet('amkh-safety-inbox',L('مراجعة البلاغات','Review inbox'),`<div data-content>${L('جارٍ التحميل…','Loading…')}</div><p data-error class="safety-error" role="status"></p>`);
  try{const d=await api('/admin/inbox');if(!ov.isConnected)return;const host=ov.querySelector('[data-content]');host.textContent='';
   const notification=document.createElement('p');notification.className='safety-copy';notification.textContent=L('إشعارات البريد المعلقة: ','Pending email notifications: ')+d.notifications.pending;host.append(notification);
   const heading=text=>{const h=document.createElement('h3');h.textContent=text;host.append(h);};
   heading(L('البلاغات','Reports'));
   if(!d.reports.length){const p=document.createElement('p');p.textContent=L('صندوق البلاغات فارغ.','The report inbox is empty.');host.append(p);}
   for(const r of d.reports){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>#${r.id} · ${esc(r.target_name)} ← ${esc(r.reporter_name)}</b><p>${esc(L(...reasons[r.reason]))} · ${esc(L(...status[r.status]))}</p><p class="safety-copy">${esc(r.note)}</p><pre class="safety-evidence">${esc(JSON.stringify(JSON.parse(r.evidence),null,2))}</pre>`;if(['image','video','voice'].includes(JSON.parse(r.evidence).kind)){const media=document.createElement('button');media.className='ds-btn ds-btn--ghost ds-btn--block';media.textContent=L('عرض المرفق','View attachment');media.onclick=()=>showMedia(r.id);card.append(media);}if(r.status==='open'){const b=document.createElement('button');b.className='ds-btn ds-btn--primary';b.textContent=L('مراجعة واتخاذ قرار','Review & decide');b.onclick=()=>decision(r);card.append(b);}host.append(card);}
   heading(L('الاعتراضات','Appeals'));
   for(const a of d.appeals){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>#${a.id} · ${esc(a.username)}</b><p>${esc(a.note)}</p>`;for(const key of ['accepted','rejected']){const b=document.createElement('button');b.className='ds-btn ds-btn--ghost';b.textContent=key==='accepted'?L('قبول ورفع العقوبة','Accept & lift penalty'):L('رفض الاعتراض','Reject appeal');b.onclick=()=>reviewAppeal(a,key);card.append(b);}host.append(card);}
   heading(L('العقوبات','Penalties'));
   for(const s of d.sanctions){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>${esc(s.username)} · ${esc(L(...scopeNames[s.scope]))}</b><p>${esc(s.reason)}</p><small>${s.expires_at?new Date(s.expires_at).toLocaleString():L('دائم','Permanent')}</small>`;const b=document.createElement('button');b.className='ds-btn ds-btn--ghost ds-btn--block';b.textContent=L('رفع العقوبة','Lift penalty');b.onclick=()=>revoke(s);card.append(b);host.append(card);}
   heading(L('محاولات رفضها الخادم','Attempts rejected by the server'));
   for(const e of d.events){const card=document.createElement('section');card.className='safety-card';const p=document.createElement('p');p.className='safety-copy';p.textContent=(e.username||'#'+e.user_id)+' · '+e.kind+' · '+new Date(e.created_at).toLocaleString();card.append(p);if(e.user_id){const b=document.createElement('button');b.className='ds-btn ds-btn--ghost';b.textContent=L('مراجعة المحاولة','Review attempt');b.onclick=async()=>{try{const r=await api('/admin/event-review',{eventId:e.id});decision(r);}catch(err){error(ov,err);}};card.append(b);}host.append(card);}
  }catch(e){error(ov,e);}
 }
 async function showMedia(id){
  const ov=sheet('amkh-safety-media',L('مرفق البلاغ','Report attachment'),'<div data-media></div><p data-error class="safety-error" role="status"></p>');
  try{const m=await api('/admin/media/'+id);if(!ov.isConnected)return;
   const mime=String(m.mime||'').toLowerCase().split(';')[0];
   if(!/^(image\/(jpeg|png|webp|gif)|audio\/(webm|ogg|mp4|mpeg|wav)|video\/(mp4|webm|ogg))$/.test(mime))throw new Error(L('نوع المرفق غير مدعوم.','Unsupported attachment format.'));
   const bytes=Uint8Array.from(atob(m.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:mime}));
   const el=document.createElement(mime.startsWith('image/')?'img':mime.startsWith('video/')?'video':'audio');el.src=url;el.style.cssText='display:block;max-width:100%;width:100%;max-height:65vh;object-fit:contain';if(el.tagName!=='IMG')el.controls=true;else el.alt=L('مرفق الرسالة المبلغ عنها','Reported message attachment');ov.querySelector('[data-media]').append(el);
   const close=ov._dismiss;ov._dismiss=()=>{URL.revokeObjectURL(url);close();};
  }catch(e){error(ov,e);}
 }
 function decision(r){
  let scope='social',duration='day',action='dismissed';
  const ov=sheet('amkh-safety-decision',L('قرار المراجعة','Review decision'),`<p class="safety-copy">${L('راجع الدليل قبل العقوبة. كثرة البلاغات أو الاشتباه وحدهما لا يثبتان الغش.','Review the evidence before a penalty. Report counts or suspicion alone do not prove cheating.')} #${r.id}</p>${r.context==='security'?'<pre class="safety-evidence">'+esc(JSON.stringify(JSON.parse(r.evidence),null,2))+'</pre>':''}<div data-verdict class="safety-choices"></div><div data-sanction hidden><h3>${L('نطاق العقوبة','Penalty scope')}</h3><div data-scope class="safety-choices"></div><h3>${L('المدة','Duration')}</h3><div data-duration class="safety-choices"></div></div>${noteField(L('سبب القرار (يظهر للاعب)','Decision reason (visible to the player)'))}<p data-error class="safety-error" role="status"></p>${button(L('تأكيد القرار','Confirm decision'),'send',true)}`);
  pick(ov,'[data-verdict]',{dismissed:['إغلاق دون عقوبة','Close without penalty'],actioned:['تطبيق عقوبة','Apply penalty']},action,v=>{action=v;ov.querySelector('[data-sanction]').hidden=v!=='actioned';});
  pick(ov,'[data-scope]',scopeNames,scope,v=>scope=v);pick(ov,'[data-duration]',durationNames,duration,v=>duration=v);
  ov.querySelector('[data-action=send]').onclick=async function(){this.disabled=true;try{
   if(action==='actioned'&&duration==='permanent'){const pending=window.amkhUI.confirm(L('حظر دائم','Permanent ban'),L('هذه العقوبة بلا موعد انتهاء. أكد القرار بناءً على الدليل الذي راجعته.','This penalty has no expiry. Confirm based on the evidence you reviewed.'),L('تأكيد','Confirm'),L('إلغاء','Cancel'));document.getElementById('amkh-ui-confirm')?.classList.add('safety-confirm');const confirm=await pending;if(!confirm){this.disabled=false;return;}}
   await api('/admin/decision',{reportId:r.id,status:action,scope,duration,note:ov.querySelector('textarea').value});ov._dismiss();inbox();
  }catch(e){error(ov,e);this.disabled=false;}};
 }
 function reviewAppeal(a,status){reasonAction('amkh-appeal-review',L('قرار الاعتراض','Appeal decision'),'/admin/appeal-decision',{appealId:a.id,status});}
 function revoke(s){reasonAction('amkh-revoke',L('رفع العقوبة','Lift penalty'),'/admin/revoke',{sanctionId:s.id});}
 function reasonAction(id,title,path,body){const ov=sheet(id,title,`${noteField(L('سبب القرار','Decision reason'))}<p data-error class="safety-error" role="status"></p>${button(L('حفظ القرار','Save decision'),'send',true)}`);ov.querySelector('[data-action=send]').onclick=async function(){this.disabled=true;try{await api(path,{...body,note:ov.querySelector('textarea').value});ov._dismiss();inbox();}catch(e){error(ov,e);this.disabled=false;}};}
 window.AMKHSafety={open,report,inbox,shield};
 // Calls use a higher overlay than standard windows; the same DS sheet sits above it.
 const observer=new MutationObserver(()=>{
  const call=document.getElementById('amkhc-overlay');
  if(call&&!call.querySelector('[data-safety-call]')){const b=document.createElement('button');b.type='button';b.dataset.safetyCall='1';b.className='safety-call-btn';b.innerHTML=shield;b.onclick=()=>{
   const c=window.amkhCall?._call||window.AMKHCall?._call;if(!c)return;
   const me=Number(window.amkhAuth?.user?.id);const peers=[...new Set((c.members||[]).map(Number).concat([...c.peers.keys()].map(Number),Number(c.callerId)).filter(n=>n&&n!==me))];
   if(peers.length===1)return report(peers[0],'call',c.id);
   const ov=sheet('amkh-call-report-player',L('اختر اللاعب للإبلاغ','Choose a player to report'),'<div data-peers></div>');
   for(const id of peers){const p=document.createElement('button');p.className='ds-list__item';p.textContent=c.peers.get(id)?.name||'#'+id;p.onclick=()=>{ov._dismiss();report(id,'call',c.id);};ov.querySelector('[data-peers]').append(p);}
  };call.append(b);}
  if(call){const b=call.querySelector('[data-safety-call]');if(b){b.setAttribute('aria-label',L('الإبلاغ عن المكالمة','Report call'));b.title=L('الإبلاغ عن المكالمة','Report call');}}
 });
 document.addEventListener('DOMContentLoaded',()=>observer.observe(document.body,{childList:true,subtree:true}));
})();
