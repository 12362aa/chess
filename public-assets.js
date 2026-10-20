'use strict';
const fs=require('node:fs'),path=require('node:path');
// Explicit web bundle manifest; source, database, APKs, logs and credentials are never public.
const build=fs.readFileSync(path.join(__dirname,'scripts/build-web.js'),'utf8');
const list=build.slice(build.indexOf('const requiredFiles = new Set(['),build.indexOf('const assetExtensions'));
const names=new Set([...list.matchAll(/^\s*'([^']+)'/gm)].map(m=>m[1]));
const media=/\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|webm)$/i;
for(const name of fs.readdirSync(__dirname)){if(!/^[_\.]/.test(name)&&media.test(name))names.add(name);}
module.exports=function publicAssets(req,res,next){
 if(!['GET','HEAD'].includes(req.method))return next();
 let p;try{p=decodeURIComponent(req.path);}catch(_){return res.sendStatus(400);}
 if(p==='/')p='/index.html';
 const name=p.slice(1);
 const allowed=names.has(name)||/^pieces\/[a-z0-9_-]+\/[a-z0-9_-]+\.(png|webp|svg)$/i.test(name)||/^puzzles\/(index\.json|pz-\d{4}\.txt)$/.test(name);
 if(!allowed)return next();
 res.setHeader('X-Content-Type-Options','nosniff');
 res.sendFile(name,{root:__dirname,dotfiles:'deny'},err=>{if(err&&err.code!=='ECONNABORTED')next(err);});
};
