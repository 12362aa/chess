'use strict';
const crypto=require('node:crypto'),S=require('./security-core');
const PACKAGE='com.amkh.chessgame';
function config(){return {enabled:!!(process.env.PLAY_INTEGRITY_PROJECT_NUMBER&&process.env.PLAY_INTEGRITY_CERT_SHA256),projectNumber:process.env.PLAY_INTEGRITY_PROJECT_NUMBER||null};}
function challenge(id){const nonce=crypto.randomBytes(32).toString('base64url');return {challengeId:S.session(id,'integrity-challenge',{nonce},120000),nonce};}
function check(payload,nonce,now=Date.now()){
 const r=payload?.requestDetails,a=payload?.appIntegrity;
 const certs=String(process.env.PLAY_INTEGRITY_CERT_SHA256||'').split(',').map(x=>x.trim());
 return !!(r?.nonce===nonce&&r.requestPackageName===PACKAGE&&Number(r.timestampMillis)<=now+10000&&now-Number(r.timestampMillis)<=120000&&a?.packageName===PACKAGE&&a.appRecognitionVerdict==='PLAY_RECOGNIZED'&&a.certificateSha256Digest?.some(c=>certs.includes(c)));
}
async function decode(token){const {GoogleAuth}=require('google-auth-library');const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/playintegrity']}).getClient();const r=await client.request({url:`https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`,method:'POST',data:{integrity_token:token},timeout:12000});return r.data.tokenPayloadExternal;}
async function verify(id,body,decoder=decode){
 const session=S.getSession(body.challengeId,id,'integrity-challenge');if(!session||typeof body.token!=='string'||body.token.length>20000)return null;
 // Consume before the remote call: a concurrent verification cannot reuse a nonce.
 if(!S.consume(session.id))return null;
 const payload=await decoder(body.token);
 if(!check(payload,session.data.nonce)){S.event(id,'integrity_rejected',{});return null;}
 return {pass:S.session(id,'integrity-pass',{},3600000),expiresAt:Date.now()+3600000};
}
function guard(req,res,next){if(process.env.PLAY_INTEGRITY_ENFORCE!=='1')return next();if(!config().enabled)return res.status(503).json({error:'integrity_unconfigured'});if(S.getSession(req.get('x-amkh-integrity'),req.user.id,'integrity-pass'))return next();return res.status(403).json({error:'integrity_required'});}
const router=require('express').Router(),{authenticateToken}=require('./auth');
router.get('/config',authenticateToken,(_,res)=>res.json(config()));
router.post('/challenge',authenticateToken,(req,res)=>config().enabled?res.json(challenge(req.user.id)):res.status(503).json({error:'integrity_unconfigured'}));
router.post('/verify',authenticateToken,async(req,res)=>{try{const result=await verify(req.user.id,req.body||{});result?res.json(result):res.status(403).json({error:'integrity_rejected'});}catch(_){res.status(503).json({error:'integrity_unavailable'});}});
module.exports={router,guard,config,challenge,check,verify};
