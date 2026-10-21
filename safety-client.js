(function(){
 'use strict';
 const L=(ar,en)=>window.I18N?.lang==='en'?en:ar;
 const shield='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z"/><path d="m8 12 3 3 5-6"/></svg>';
 const reasons={harassment:['إساءة أو تنمّر','Harassment'],hate:['كراهية أو تمييز','Hate or discrimination'],sexual:['محتوى جنسي أو غير مناسب','Sexual or inappropriate content'],threat:['تهديد أو خطر','Threat or danger'],spam:['إزعاج أو احتيال','Spam or scam'],cheating:['غش أو تلاعب','Cheating or tampering'],other:['مخالفة أخرى','Other violation']};
 const status={open:['قيد المراجعة','Under review'],dismissed:['أُغلِق البلاغ','Report closed'],actioned:['اتُّخذ إجراء','Action taken'],accepted:['قُبِل الاعتراض','Appeal accepted'],rejected:['رُفِض الاعتراض','Appeal rejected'],resolved:['تم الحل','Resolved']};
 const scopeNames={account:['حظر الحساب','Account ban'],social:['تقييد الشات والمكالمات','Chat & calls restriction'],economy:['تقييد المكافآت والمتجر','Rewards & store restriction']};
 const durationNames={hour:['ساعة','One hour'],day:['يوم','One day'],threeDays:['٣ أيام','3 days'],week:['أسبوع','One week'],month:['٣٠ يومًا','30 days'],permanent:['دائم','Permanent']};
 const reasonText=s=>s.reason_key==='foreign_session'?L('رُصدت محاولات متكررة لاستخدام جلسات مكافآت تخص حسابات أخرى. تم تقييد المتجر والمكافآت مؤقتًا لحماية الحسابات.','Repeated attempts to use reward sessions belonging to other accounts were detected. Store and rewards access is temporarily restricted to protect accounts.'):s.reason;
 const esc=v=>window.amkhUI.esc(v);
 async function api(path,body){
  const tok=window.amkhAuth?.token,uid=window.amkhAuth?.user?.id;if(!tok)throw new Error(L('سجل الدخول أولًا.','Sign in first.'));
  const r=await fetch((window.getApiBase?getApiBase():'/api')+'/safety'+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},...(body?{body:JSON.stringify(body)}:{})});
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
   const d=await api('/status');applyStatus(d);if(d.active.account){ov._dismiss();return;}const r=await api('/reports');if(!ov.isConnected)return;
   const host=ov.querySelector('[data-content]');host.textContent='';
   if(d.moderator){host.insertAdjacentHTML('beforeend',button(L('مراجعة البلاغات','Review inbox'),'inbox',true));host.querySelector('[data-action=inbox]').onclick=()=>inbox();}
   for(const s of d.sanctions){
    const active=!s.revoked_at&&(!s.expires_at||s.expires_at>Date.now());
    const card=document.createElement('section');card.className='safety-card';
    card.innerHTML=`<h3>${esc(L(...scopeNames[s.scope]))} ${active?'':'· '+L('انتهى','Ended')}</h3><p class="safety-copy">${esc(reasonText(s))}</p><small>${s.expires_at?new Date(s.expires_at).toLocaleString(window.I18N?.lang==='en'?'en':'ar'):L('دائم','Permanent')}</small>`;
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
  ov.classList.add('safety-appeal-overlay');
  requestAnimationFrame(()=>ov.querySelector('textarea')?.focus());
  ov.querySelector('[data-action=send]').onclick=async function(){this.disabled=true;try{await api('/appeals',{sanctionId:id,note:ov.querySelector('textarea').value});ov._dismiss();if(accountSanction){await refresh();document.querySelector('#amkh-account-gate [data-error]').textContent=L('تم حفظ اعتراضك وسيُراجع.','Your appeal was saved and will be reviewed.');}else open();}catch(e){error(ov,e);this.disabled=false;}};
 }
 async function inbox(){
  const ov=sheet('amkh-safety-inbox',L('مراجعة البلاغات','Review inbox'),`<div data-content>${L('جارٍ التحميل…','Loading…')}</div><p data-error class="safety-error" role="status"></p>`);
  try{const snapshot=await api('/status');const d=await api('/admin/inbox');if(!ov.isConnected)return;const host=ov.querySelector('[data-content]');host.textContent='';
   const notification=document.createElement('p');notification.className='safety-copy';notification.textContent=L('إشعارات البريد المعلقة: ','Pending email notifications: ')+d.notifications.pending;host.append(notification);
   const heading=text=>{const h=document.createElement('h3');h.textContent=text;host.append(h);};
   heading(L('البلاغات','Reports'));
   if(!d.reports.length){const p=document.createElement('p');p.textContent=L('صندوق البلاغات فارغ.','The report inbox is empty.');host.append(p);}
   for(const r of d.reports){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>#${r.id} · ${esc(r.target_name)} ← ${esc(r.reporter_name)}</b><p>${esc(L(...reasons[r.reason]))} · ${esc(L(...status[r.status]))}</p><p class="safety-copy">${esc(r.note)}</p><pre class="safety-evidence">${esc(JSON.stringify(JSON.parse(r.evidence),null,2))}</pre>`;if(['image','video','voice'].includes(JSON.parse(r.evidence).kind)){const media=document.createElement('button');media.className='ds-btn ds-btn--ghost ds-btn--block';media.textContent=L('عرض المرفق','View attachment');media.onclick=()=>showMedia(r.id);card.append(media);}if(r.status==='open'){const b=document.createElement('button');b.className='ds-btn ds-btn--primary';b.textContent=L('مراجعة واتخاذ قرار','Review & decide');b.onclick=()=>decision(r);card.append(b);}host.append(card);}
   heading(L('الاعتراضات','Appeals'));
   for(const a of d.appeals){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>#${a.id} · ${esc(a.username)}</b><p>${esc(a.note)}</p>`;for(const key of ['accepted','rejected']){const b=document.createElement('button');b.className='ds-btn ds-btn--ghost';b.textContent=key==='accepted'?L('قبول ورفع العقوبة','Accept & lift penalty'):L('رفض الاعتراض','Reject appeal');b.onclick=()=>reviewAppeal(a,key);card.append(b);}host.append(card);}
   heading(L('العقوبات','Penalties'));
   for(const s of d.sanctions){const card=document.createElement('section');card.className='safety-card';card.innerHTML=`<b>${esc(s.username)} · ${esc(L(...scopeNames[s.scope]))}</b><p>${esc(reasonText(s))}</p><small>${s.expires_at?new Date(s.expires_at).toLocaleString():L('دائم','Permanent')}</small>`;const b=document.createElement('button');b.className='ds-btn ds-btn--ghost ds-btn--block';b.textContent=L('رفع العقوبة','Lift penalty');b.onclick=()=>revoke(s);card.append(b);host.append(card);}
   heading(L('محاولات رفضها الخادم','Attempts rejected by the server'));
   for(const e of d.events){const card=document.createElement('section');card.className='safety-card';const p=document.createElement('p');p.className='safety-copy';p.textContent=(e.username||'#'+e.user_id)+' · '+e.kind+' · '+new Date(e.created_at).toLocaleString();card.append(p);if(e.user_id){const b=document.createElement('button');b.className='ds-btn ds-btn--ghost';b.textContent=L('مراجعة المحاولة','Review attempt');b.onclick=async()=>{try{const r=await api('/admin/event-review',{eventId:e.id});decision(r);}catch(err){error(ov,err);}};card.append(b);}host.append(card);}
   updateNotice(await api('/admin/seen',{cursor:snapshot.notifications.cursor}));
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
 let accountSanction=null,lastStatus=null,pending=null,noticeCount=0,renderKey='',shownScopes=new Set(),expiryRequestAt=0;
 function valid(s){return !!s&&!s.revoked_at&&(!s.expires_at||s.expires_at>Date.now());}
 function remaining(s){if(!s?.expires_at)return L('لا يوجد موعد لانتهاء الحظر.','This ban has no expiry.');const seconds=Math.max(0,Math.ceil((s.expires_at-Date.now())/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return L('الوقت المتبقي: ','Time remaining: ')+(days?days+L(' يوم · ',' days · '):'')+hours+L(' ساعة · ',' hours · ')+minutes+L(' دقيقة',' minutes');}
 function releaseGate(){document.getElementById('amkh-account-gate')?.remove();document.documentElement.classList.remove('safety-account-locked');accountSanction=null;renderKey='';}
 function gate(s,checking=false){
  accountSanction=s;const key=(s?.id||'checking')+':'+window.I18N?.lang;if(renderKey===key&&document.getElementById('amkh-account-gate'))return;renderKey=key;
  document.documentElement.classList.add('safety-account-locked');
  document.getElementById('amkh-account-gate')?.remove();
  const ov=document.createElement('div');ov.id='amkh-account-gate';ov.className='safety-account-gate';ov.dataset.noI18n='true';ov.dir=window.I18N?.lang==='en'?'ltr':'rtl';
  const permanent=s&&!s.expires_at,title=checking?L('التحقق من حالة الحساب','Checking account status'):permanent?L('الحساب محظور للأبد','Account permanently banned'):L('الحساب محظور مؤقتًا','Account temporarily banned');
  ov.innerHTML=`<section class="ds-dialog safety-gate-card" role="dialog" aria-modal="true" aria-labelledby="safety-gate-title"><div class="safety-gate-emblem">${shield}</div><p class="safety-gate-kicker">AM-KH · ${L('سلامة اللاعبين','PLAYER SAFETY')}</p><h1 id="safety-gate-title" class="ds-dialog__title">${esc(title)}</h1><p class="safety-copy">${checking?L('جارٍ الاتصال بالخادم للتحقق من صلاحية الدخول.','Connecting to the server to verify access.'):L('الدخول إلى اللعبة غير متاح لهذا الحساب أثناء الحظر.','Game access is unavailable to this account while banned.')}</p>${s?`<section class="safety-card"><h2>${L('سبب العقوبة','Reason for the penalty')}</h2><p class="safety-copy">${esc(reasonText(s))}</p>${s.expires_at?`<p class="safety-copy">${L('ينتهي الحظر في: ','Ban expires: ')}<b>${esc(new Date(s.expires_at).toLocaleString(window.I18N?.lang==='en'?'en-GB':'ar-EG'))}</b></p>`:''}<p class="safety-countdown" data-remaining>${esc(remaining(s))}</p></section><p class="safety-copy">${L('يمكنك تقديم اعتراض للمراجعة أو التواصل مع دعم اللعبة.','You can submit an appeal for review or contact game support.')}</p>${button(L('تقديم اعتراض','Submit appeal'),'appeal',true)}<a class="ds-btn ds-btn--ghost ds-btn--block" href="mailto:amkhchess@gmail.com?subject=${encodeURIComponent('Am-Kh ban appeal #'+s.id)}">${L('مراسلة الدعم بالبريد','Email support')}</a>`:''}<p data-error class="safety-error" role="status"></p>${button(L('إعادة التحقق','Check again'),'retry')}${button(L('تسجيل الخروج','Sign out'),'logout')}${s?`<small class="safety-gate-reference">${L('رقم العقوبة','Penalty reference')} #${s.id}${s.automatic?' · '+L('حماية تلقائية','Automatic protection'):''}</small>`:''}</section>`;
  document.body.append(ov);ov.querySelector('[data-action=appeal]')?.addEventListener('click',()=>appeal(s.id));ov.querySelector('[data-action=logout]').onclick=()=>window.amkhAuth.logout();ov.querySelector('[data-action=retry]').onclick=async function(){this.disabled=true;try{await refresh(true);}catch(e){error(ov,e);}finally{this.disabled=false;}};
  ov.querySelector('button')?.focus();try{window.amkhCall?._end('restricted');window.MIC?.stop?.();if(s)window.amkhAuth?.disconnectPresence();}catch(_){}
 }
 function restricted(s){if(!s)return refresh();if(s.scope==='account'){gate(s);const user=window.amkhAuth?.user;if(user){user.safety={...user.safety,account:s};localStorage.setItem('amkh_user',JSON.stringify(user));}}else if(valid(s)&&!shownScopes.has(s.id)){shownScopes.add(s.id);const ov=sheet('amkh-scope-restriction',L(...scopeNames[s.scope]),`<p class="safety-copy">${esc(reasonText(s))}</p><p class="safety-copy">${s.expires_at?L('ينتهي في: ','Expires: ')+esc(new Date(s.expires_at).toLocaleString(window.I18N?.lang==='en'?'en-GB':'ar-EG')):L('التقييد دائم حتى رفعه بالمراجعة.','The restriction is permanent until lifted after review.')}</p><p class="safety-countdown">${esc(remaining(s))}</p><p class="safety-copy">${L('يمكنك الاستمرار في اللعب. الميزة المحددة فقط غير متاحة.','You can continue playing. Only the restricted features are unavailable.')}</p>${button(L('تقديم اعتراض','Submit appeal'),'appeal')}${button(L('فهمت','Understood'),'done',true)}`);ov.querySelector('[data-action=appeal]').onclick=()=>appeal(s.id);ov.querySelector('[data-action=done]').onclick=()=>ov._dismiss();if(s.scope==='social'){try{window.amkhCall?._end('restricted');window.MIC?.stop?.();}catch(_){}}}}
 function updateNotice(n){noticeCount=n?.unread||0;const btn=document.getElementById('amkh-moderation-btn');if(btn){btn.hidden=!lastStatus?.moderator;btn.querySelector('[data-badge]').textContent=noticeCount>99?'99+':noticeCount;btn.querySelector('[data-badge]').hidden=!noticeCount;btn.setAttribute('aria-label',L('مراجعة البلاغات؛ جديد: ','Review inbox; unread: ')+noticeCount);}}
 function applyStatus(d){const wasBanned=!!accountSanction;lastStatus=d;const user=window.amkhAuth?.user;if(user){user.safety=d.active;localStorage.setItem('amkh_user',JSON.stringify(user));}if(valid(d.active?.account))gate(d.active.account);else{releaseGate();if(wasBanned){window.amkhAuth?.connectPresence();window.amkhAuth?.startAutoSync();}for(const scope of ['social','economy'])if(valid(d.active?.[scope]))restricted(d.active[scope]);}updateNotice(d.notifications);ensureReviewButton();}
 async function refresh(throwError=false){if(!window.amkhAuth?.token)return releaseGate();if(pending)return pending;pending=(async()=>{try{if(window.amkhEnsureServer)await window.amkhEnsureServer();const d=await api('/status');applyStatus(d);return d;}catch(e){const ov=document.getElementById('amkh-account-gate');if(ov)error(ov,new Error(L('تعذر الاتصال للتحقق. أعد المحاولة أو سجل الخروج.','Could not connect to verify access. Retry or sign out.')));if(throwError)throw e;}finally{pending=null;}})();return pending;}
 function session(user,checking=false){shownScopes.clear();lastStatus=null;updateNotice(null);if(!user){releaseGate();document.querySelectorAll('.safety-overlay').forEach(x=>x._dismiss?.());return;}if(user.safety?.account&&!user.safety.account.revoked_at)gate(user.safety.account);else if(checking&&!user.safety)gate(null,true);else releaseGate();const old=pending;Promise.resolve(old).catch(()=>{}).then(()=>refresh());}
 function ensureReviewButton(){let b=document.getElementById('amkh-moderation-btn');if(!b&&lastStatus?.moderator){const bar=document.getElementById('amkh-auth-btn')?.parentElement;if(!bar)return;b=document.createElement('button');b.id='amkh-moderation-btn';b.type='button';b.className='appbar__icon-btn safety-review-btn';b.innerHTML=shield+'<span class="safety-unread" data-badge hidden></span>';b.onclick=()=>inbox();bar.append(b);updateNotice(lastStatus.notifications);}}
 function publicAvatar(user){return user?.banned||/banned-avatar-(ar|en)\.svg/.test(user?.avatar_url||'')?'./banned-avatar-'+(window.I18N?.lang==='en'?'en':'ar')+'.svg':user?.avatar_url;}
 function allow(scope){const s=window.amkhAuth?.user?.safety?.account||window.amkhAuth?.user?.safety?.[scope];if(!valid(s))return true;if(s.scope!=='account')shownScopes.delete(s.id);restricted(s);return false;}
 document.addEventListener('keydown',e=>{if(!document.documentElement.classList.contains('safety-account-locked'))return;const host=document.getElementById('amkh-appeal')||document.getElementById('amkh-account-gate');if(e.key==='Escape'){if(host?.id==='amkh-account-gate'){e.preventDefault();e.stopImmediatePropagation();}return;}if(e.key==='Tab'&&host){const items=[...host.querySelectorAll('button:not(:disabled),a[href],textarea')];const i=items.indexOf(document.activeElement),next=(i+(e.shiftKey?-1:1)+items.length)%items.length;e.preventDefault();items[next]?.focus();}},true);
 window.AMKHSafety={open,report,inbox,shield,restricted,refresh,session,updateNotice,publicAvatar,allow};
 async function nativeReviewIntent(){const plugin=window.Capacitor?.Plugins?.CallIntent;if(!plugin)return;let wantsInbox=false;const consume=async()=>{try{const d=await plugin.consumeModeration();if(d.open)wantsInbox=true;const status=await refresh();if(wantsInbox&&status?.moderator){wantsInbox=false;inbox();}}catch(_){}};try{await plugin.addListener('moderationOpen',consume);consume();setInterval(()=>{if(wantsInbox&&!document.hidden)consume();},3000);}catch(_){}}
 document.addEventListener('DOMContentLoaded',nativeReviewIntent);
 document.addEventListener('DOMContentLoaded',()=>{session(window.amkhAuth?.user,true);setInterval(()=>{if(!window.amkhAuth?.token)return;ensureReviewButton();const s=accountSanction;if(s?.expires_at){const el=document.querySelector('[data-remaining]');if(el)el.textContent=remaining(s);if(s.expires_at<=Date.now()&&Date.now()-expiryRequestAt>10000){expiryRequestAt=Date.now();refresh();}}},1000);setInterval(()=>{if(window.amkhAuth?.token&&!document.hidden)refresh();},20000);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
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
