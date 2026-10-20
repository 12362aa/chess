/* Home quests are a separate daily reward track from Rewards missions. */
(function(){
  'use strict';
  const L=(ar,en)=>window.I18N&&I18N.lang==='en'?en:ar;
  const labels={play:[ 'العب مباراة اليوم','Play a game today' ],win:[ 'حقق فوزًا اليوم','Win a game today' ],puzzles:[ 'حل ثلاثة ألغاز','Solve three puzzles' ]};
  let state=null,owner='',inflight=null,renderId=0,generation=0;
  const uid=()=>String(window.amkhAuth?.user?.id||'');
  const base=()=>window.getApiBase?getApiBase():'/api';
  async function request(path,body){
    const token=window.amkhAuth?.token,current=uid();if(!token)return null;
    const r=await fetch(base()+'/economy/home-challenges'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)return null;
    const data=await r.json();return current===uid()&&token===window.amkhAuth?.token?data:null;
  }
  async function refresh(){
    if(owner!==uid()){state=null;owner=uid();inflight=null;}
    if(!owner)return null;
    if(inflight)return inflight;
    const current=owner,version=generation;
    const job=request('').then(data=>{if(current===uid()&&version===generation&&data){state=data;owner=current;}return data;}).catch(()=>null).finally(()=>{if(inflight===job)inflight=null;});
    inflight=job;return job;
  }
  function draw(){
    if(owner!==uid()){state=null;owner=uid();inflight=null;}
    const list=document.getElementById('home-daily-list'),sec=document.getElementById('home-daily');if(!list||!sec)return;
    list.textContent='';
    const quests=state?.quests||[{id:'play',target:1,progress:0,coins:5,xp:8},{id:'win',target:1,progress:0,coins:8,xp:12},{id:'puzzles',target:3,progress:0,coins:6,xp:10}];
    const done=quests.filter(q=>q.progress>=q.target).length;
    const title=document.getElementById('home-daily-title');if(title)title.textContent=L('تحديات بسيطة · '+done+'/3','Daily quests · '+done+'/3');
    sec.dataset.done=done===3?'1':'0';
    for(const q of quests){
      const row=document.createElement('div');row.className='home-quest';
      const body=document.createElement('div');
      const name=document.createElement('div');name.className='home-quest__name';name.textContent=labels[q.id]?L(...labels[q.id]):q.id;
      const reward=document.createElement('div');reward.className='home-quest__reward';reward.textContent='+'+q.coins+' '+L('عملة','coins')+' · +'+q.xp+' XP';
      const track=document.createElement('div');track.className='home-quest__track';
      const fill=document.createElement('div');fill.className='home-quest__fill';fill.style.width=Math.min(100,q.progress/q.target*100)+'%';track.appendChild(fill);
      body.append(name,reward,track);
      const button=document.createElement('button');button.className='home-quest__action';
      const ready=q.progress>=q.target&&!q.claimed;
      button.textContent=q.claimed?L('تم الاستلام','Collected'):ready?L('استلم','Collect'):q.progress+'/'+q.target;
      button.classList.toggle('is-ready',ready);button.disabled=!ready||!uid();
      button.onclick=async()=>{
        button.disabled=true;const result=await request('/claim',{questId:q.id}).catch(()=>null);
        if(result){generation++;inflight=null;state={day:result.day,quests:result.quests};if(result.ok)window.amkhEconomy?.apply(result);draw();}
        else{button.disabled=false;button.textContent=L('حاول تاني','Try again');}
      };
      row.append(body,button);list.appendChild(row);
    }
    const note=document.createElement('p');note.className='home-quest__note';
    note.textContent=uid()?L('تتجدد يوميًا الساعة 00:00 UTC. استلم مكافأتك عند اكتمال التحدي.','Resets daily at 00:00 UTC. Collect your reward when a quest is complete.'):L('سجل الدخول لحفظ التحديات واستلام مكافآتها.','Sign in to save quests and collect their rewards.');
    list.appendChild(note);
  }
  window.HOME_CHALLENGES={
    async render(){const id=++renderId;if(owner!==uid()){state=null;owner=uid();}draw();await refresh();if(id===renderId)draw();},
    async local(mode,outcome,eventId){if(!['local','bluetooth'].includes(mode))return;await request('/local',{mode,outcome,eventId});await refresh();draw();},
    refresh,
  };
  window.addEventListener('amkh:cosmetics',()=>{if(document.getElementById('s-menu')?.classList.contains('active'))window.HOME_CHALLENGES.render();});
  window.addEventListener('amkh:lang',draw);
})();
