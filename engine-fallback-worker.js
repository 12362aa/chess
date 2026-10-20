/* Generated local engine rules and bounded worker. */
'use strict';
const PV={P:100,N:320,B:330,R:500,Q:900,K:0};
const PST={
  P:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  N:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  B:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  R:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  Q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  K:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]],
};

/* اسم اللاعب من شريطه بدون شارة التقييم: setBarName بيحط الاسم في
   span.pb-nm-text والتقييم في span منفصل، فقراية textContent كامل بتطلع
   «أحمد 1300». بنقرا الـspan لوحده عشان شاشات النتيجة/المراجعة ونافذة
   نور ما تعاملش التقييم كأنه جزء من الاسم. */
function pbName(id){
  const el=document.getElementById(id);
  if(!el)return '';
  return (el.querySelector('.pb-nm-text')?.textContent ?? el.textContent ?? '').trim();
}

const E={
  col:p=>p?p[0]:null, tp:p=>p?p[1]:null, opp:c=>c==='w'?'b':'w',
  inb:(r,c)=>r>=0&&r<8&&c>=0&&c<8, clone:b=>b.map(r=>[...r]),
  raw(bd,r,c,cas,ep){
    const p=bd[r][c];if(!p)return[];
    const cl=this.col(p),tp=this.tp(p),mv=[];
    const sl=(dr,dc)=>{let nr=r+dr,nc=c+dc;while(this.inb(nr,nc)){if(bd[nr][nc]){if(this.col(bd[nr][nc])!==cl)mv.push([nr,nc]);break;}mv.push([nr,nc]);nr+=dr;nc+=dc;}};
    if(tp==='P'){
      const d=cl==='w'?-1:1,sr=cl==='w'?6:1;
      if(this.inb(r+d,c)&&!bd[r+d][c]){mv.push([r+d,c]);if(r===sr&&!bd[r+2*d][c])mv.push([r+2*d,c]);}
      for(const dc of[-1,1]){if(!this.inb(r+d,c+dc))continue;
        if(bd[r+d][c+dc]&&this.col(bd[r+d][c+dc])!==cl)mv.push([r+d,c+dc]);
        if(ep&&ep[0]===r+d&&ep[1]===c+dc)mv.push([r+d,c+dc]);}
    }else if(tp==='N'){
      for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
        const nr=r+dr,nc=c+dc;if(this.inb(nr,nc)&&this.col(bd[nr][nc])!==cl)mv.push([nr,nc]);}
    }else if(tp==='B'){[[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([a,b])=>sl(a,b));}
    else if(tp==='R'){[[-1,0],[1,0],[0,-1],[0,1]].forEach(([a,b])=>sl(a,b));}
    else if(tp==='Q'){[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([a,b])=>sl(a,b));}
    else if(tp==='K'){
      for(const[dr,dc]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
        const nr=r+dr,nc=c+dc;if(this.inb(nr,nc)&&this.col(bd[nr][nc])!==cl)mv.push([nr,nc]);}
      if(cas){const row=cl==='w'?7:0,op=this.opp(cl);
        if(r===row&&c===4){
          if(cas[cl].K&&!bd[row][5]&&!bd[row][6]&&bd[row][7]===cl+'R'&&
            !this.atk(bd,row,4,op)&&!this.atk(bd,row,5,op)&&!this.atk(bd,row,6,op))mv.push([row,6]);
          if(cas[cl].Q&&!bd[row][3]&&!bd[row][2]&&!bd[row][1]&&bd[row][0]===cl+'R'&&
            !this.atk(bd,row,4,op)&&!this.atk(bd,row,3,op)&&!this.atk(bd,row,2,op))mv.push([row,2]);
        }}
    }
    return mv;
  },
  atk(bd,r,c,by){
    for(let tr=0;tr<8;tr++)for(let tc=0;tc<8;tc++)
      if(this.col(bd[tr][tc])===by){
        if(this.tp(bd[tr][tc])==='P'){if(r===tr+(by==='w'?-1:1)&&Math.abs(c-tc)===1)return true;}
        else if(this.raw(bd,tr,tc,null,null).some(([mr,mc])=>mr===r&&mc===c))return true;
      }
    return false;
  },
  king(bd,cl){for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(bd[r][c]===cl+'K')return[r,c];return null;},
  inChk(bd,cl){const k=this.king(bd,cl);return k?this.atk(bd,k[0],k[1],this.opp(cl)):false;},
  legal(bd,r,c,cas,ep){
    const p=bd[r][c];if(!p)return[];const cl=this.col(p);
    return this.raw(bd,r,c,cas,ep).filter(([nr,nc])=>{
      const nb=this.clone(bd);nb[nr][nc]=nb[r][c];nb[r][c]=null;
      if(this.tp(p)==='P'&&ep&&nr===ep[0]&&nc===ep[1])nb[r][nc]=null;
      return!this.inChk(nb,cl);});
  },
  allLegal(bd,cl,cas,ep){
    const all=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)
      if(this.col(bd[r][c])===cl)this.legal(bd,r,c,cas,ep).forEach(m=>all.push({from:[r,c],to:m}));
    return all;
  },
  apply(bd,fr,to,cas,ep,promo){
    const nb=this.clone(bd),nc=JSON.parse(JSON.stringify(cas));
    const p=nb[fr[0]][fr[1]],cl=this.col(p),tp=this.tp(p);
    let cap=nb[to[0]][to[1]],newEP=null;
    const isCas=tp==='K'&&Math.abs(to[1]-fr[1])===2;
    const isEP=tp==='P'&&ep&&to[0]===ep[0]&&to[1]===ep[1];
    if(isEP){cap=nb[fr[0]][to[1]];nb[fr[0]][to[1]]=null;}
    nb[to[0]][to[1]]=p;nb[fr[0]][fr[1]]=null;
    if(tp==='P'&&(to[0]===0||to[0]===7))nb[to[0]][to[1]]=cl+(promo||'Q');
    if(tp==='K'){
      if(to[1]===fr[1]+2){nb[fr[0]][5]=nb[fr[0]][7];nb[fr[0]][7]=null;}
      else if(to[1]===fr[1]-2){nb[fr[0]][3]=nb[fr[0]][0];nb[fr[0]][0]=null;}
      nc[cl].K=false;nc[cl].Q=false;}
    if(tp==='R'){if(fr[1]===7)nc[cl].K=false;if(fr[1]===0)nc[cl].Q=false;}
    if(cap&&this.tp(cap)==='R'){
      const ec=this.col(cap),homeRow=ec==='w'?7:0;
      if(to[0]===homeRow&&to[1]===7)nc[ec].K=false;
      if(to[0]===homeRow&&to[1]===0)nc[ec].Q=false;
    }
    if(tp==='P'&&Math.abs(to[0]-fr[0])===2)newEP=[(fr[0]+to[0])/2,fr[1]];
    return{bd:nb,cas:nc,ep:newEP,cap,isCas,isEP};
  },
  eval(bd){
    let s=0;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=bd[r][c];if(!p)continue;
      const cl=this.col(p),tp=this.tp(p),pr=cl==='w'?r:7-r;
      s+=(cl==='w'?1:-1)*(PV[tp]+(PST[tp]?PST[tp][pr][c]:0));}
    return s;
  },
  material(bd){
    let s=0;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=bd[r][c];if(!p)continue;
      s+=(this.col(p)==='w'?1:-1)*PV[this.tp(p)];}
    return s;
  },
  insufficientMaterial(bd){
    let whitePieces=[],blackPieces=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=bd[r][c];
      if(!p)continue;
      if(this.col(p)==='w') whitePieces.push(this.tp(p));
      else blackPieces.push(this.tp(p));
    }
    const wBishops=whitePieces.filter(p=>p==='B').length;
    const bBishops=blackPieces.filter(p=>p==='B').length;
    const wKnights=whitePieces.filter(p=>p==='N').length;
    const bKnights=blackPieces.filter(p=>p==='N').length;
    if(whitePieces.length===1 && blackPieces.length===1) return true;
    if(whitePieces.length===1 && blackPieces.length===2 && (bBishops===1 || bKnights===1)) return true;
    if(blackPieces.length===1 && whitePieces.length===2 && (wBishops===1 || wKnights===1)) return true;
    if(whitePieces.length===2 && blackPieces.length===2 && wBishops===1 && bBishops===1 && wKnights===0 && bKnights===0){
      let wBishopPos=null,bBishopPos=null;
      for(let r=0;r<8;r++)for(let c=0;c<8;c++){
        const p=bd[r][c];
        if(p==='wB') wBishopPos=[r,c];
        if(p==='bB') bBishopPos=[r,c];
      }
      if(wBishopPos && bBishopPos && ((wBishopPos[0]+wBishopPos[1])%2)===((bBishopPos[0]+bBishopPos[1])%2)) return true;
    }
    if(whitePieces.length===2 && blackPieces.length===0 && (wBishops===1 || wKnights===1)) return true;
    if(blackPieces.length===2 && whitePieces.length===0 && (bBishops===1 || bKnights===1)) return true;
    return false;
  },
  mm(bd,d,a,b,max,cas,ep){
    const cl=max?'w':'b',mvs=this.allLegal(bd,cl,cas,ep);
    if(!d||!mvs.length){
      if(!mvs.length)return this.inChk(bd,cl)?(max?-99999:99999):0;
      return this.eval(bd);}
    mvs.sort((x,y)=>(bd[y.to[0]][y.to[1]]?PV[this.tp(bd[y.to[0]][y.to[1]])]||0:0)-(bd[x.to[0]][x.to[1]]?PV[this.tp(bd[x.to[0]][x.to[1]])]||0:0));
    if(max){let bv=-Infinity;for(const mv of mvs){
      const r2=this.apply(bd,mv.from,mv.to,cas,ep,'Q');
      const v=this.mm(r2.bd,d-1,a,b,false,r2.cas,r2.ep);
      if(v>bv)bv=v;if(v>a)a=v;if(b<=a)break;}return bv;}
    else{let bv=Infinity;for(const mv of mvs){
      const r2=this.apply(bd,mv.from,mv.to,cas,ep,'Q');
      const v=this.mm(r2.bd,d-1,a,b,true,r2.cas,r2.ep);
      if(v<bv)bv=v;if(v<b)b=v;if(b<=a)break;}return bv;}
  },
  botMove(bd,cas,ep,depth){
    const mvs=this.allLegal(bd,'b',cas,ep);if(!mvs.length)return null;
    if(depth<=1&&Math.random()<.5)return mvs[Math.floor(Math.random()*mvs.length)];
    mvs.sort(()=>Math.random()-.5);let best=null,bv=Infinity;
    for(const mv of mvs){
      const r2=this.apply(bd,mv.from,mv.to,cas,ep,'Q');
      const v=this.mm(r2.bd,depth-1,-Infinity,Infinity,true,r2.cas,r2.ep);
      if(v<bv){bv=v;best=mv;}}
    return best;
  },
  bestMove(bd,cas,ep,col){
    const mvs=this.allLegal(bd,col,cas,ep);if(!mvs.length)return null;
    mvs.sort(()=>Math.random()-.5);
    const max=col==='w';let best=null,bv=max?-Infinity:Infinity;
    for(const mv of mvs){
      const r2=this.apply(bd,mv.from,mv.to,cas,ep,'Q');
      const v=this.mm(r2.bd,2,-Infinity,Infinity,!max,r2.cas,r2.ep);
      if(max?v>bv:v<bv){bv=v;best=mv;}}
    return best;
  },
  notation(bd,fr,to,promo){
    const f='abcdefgh';
    const piece=bd[fr[0]][fr[1]];
    const isEpCapture=piece&&this.tp(piece)==='P'&&fr[1]!==to[1]&&!bd[to[0]][to[1]];
    return f[fr[1]]+(8-fr[0])+((bd[to[0]][to[1]]||isEpCapture)?'x':'')+f[to[1]]+(8-to[0])+(promo?'='+promo:'');
  }
};

const INIT_BD=[
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

const S={
  bd:null,turn:'w',sel:null,legal:[],
  mode:null,diff:0,myCol:'both',
  cas:null,ep:null,
  repMap:{},
  halfmove:0,
  capW:[],capB:[],hist:[],lastMove:null,
  over:false,pending:null,busy:false,
  assistOn:false,hintsOn:true,oppUsingAssist:false,
  astMove:null,astBusy:false,_astSnap:null,
  levelId:-1,moveCount:0,
  engineLevel:4,
  assistW:false, assistB:false,
  snapshots:[],
  preMove:null,
  preMoveSelFr:null,
  preMovePreview:null,
  dragFrom:null,
  undoStack:[],
  oppImg:null,
  oppCos:null,      /* إطار/خلفيّة الخصم أونلاين — بيوصل عبر رسالة 'cos' */
  endState:null,
  _engineTimer:null,
  _engineJob:0,
  _goTimer:null,
  _goStageTimer:null,
  _goTypeTimer:null,
  _resultToken:0,
};


onmessage=function(event){
  const j=event.data,legal=E.allLegal(j.bd,j.turn,j.cas,j.ep);
  if(!legal.length){postMessage({id:j.id,move:null});return;}
  const until=performance.now()+Math.max(60,Math.min(900,j.budgetMs||240));
  const original=E.mm;
  E.mm=function(...args){if(performance.now()>until)throw new Error('budget');return original.apply(this,args);};
  let best=legal[0];
  try{
    for(let d=1;d<=Math.min(4,j.depth||2);d++){
      let candidate=best,value=j.turn==='w'?-Infinity:Infinity;
      for(const m of legal){
        const a=E.apply(j.bd,m.from,m.to,j.cas,j.ep,'Q');
        const v=E.mm(a.bd,d-1,-Infinity,Infinity,j.turn!=='w',a.cas,a.ep);
        if(j.turn==='w'?v>value:v<value){candidate=m;value=v;}
      }
      best=candidate;
    }
  }catch(_){}
  E.mm=original;
  postMessage({id:j.id,move:best});
};
