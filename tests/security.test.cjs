// Offline service simulation. No live mail, account, LMS or network calls.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'..');
class Sheet{
  constructor(){this.data=[];}
  getLastRow(){return this.data.length;}
  appendRow(r){this.data.push([...r]);}
  deleteRow(r){this.data.splice(r-1,1);}
  setFrozenRows(){}
  getRange(r,c,n=1,w=1){const self=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>self.data[r-1+i]?.[c-1+j]??''));},getValue(){return self.data[r-1]?.[c-1]??'';},setValues(values){values.forEach((v,i)=>{self.data[r-1+i]??=[];v.forEach((x,j)=>self.data[r-1+i][c-1+j]=x);});}};}
}
const sheets={},props={SUBSCRIBERS_SHEET_ID:'private-sheet',WEB_APP_URL:'https://script.google.com/macros/s/TEST/exec',SIGNING_SECRET:'x'.repeat(96),SIGNUPS_ENABLED:'true'};
const sent=[];let quota=100,failMail=false;
const propertyService={getProperty:k=>props[k]??null,setProperty:(k,v)=>{props[k]=v;}};
const book={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet())};
const ctx=vm.createContext({console,Date,JSON,Math,Number,String,Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()],formatDate:()=>new Date().toISOString().slice(0,10),base64Encode:s=>Buffer.from(s).toString('base64')},PropertiesService:{getScriptProperties:()=>propertyService},SpreadsheetApp:{openById:()=>book,flush(){}},LockService:{getScriptLock:()=>({waitLock(){},tryLock(){return true;},releaseLock(){}})},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>{if(failMail)throw Error('private mail failure');assert.equal(typeof m.to,'string');assert(!m.cc && !m.bcc);sent.push(m);quota--; }},ScriptApp:{getProjectTriggers:()=>[{getHandlerFunction:()=> 'cleanupPending_'}]},UrlFetchApp:{fetch:()=>{throw Error('Unexpected network');}}});
vm.runInContext(fs.readFileSync(path.join(base,'signup/Code.gs'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(base,'monitor/SubscriberBridge.gs'),'utf8'),ctx);
ctx.setupSignup_();ctx.setupSubscriberBridge_();
let checks=0;function check(name,f){f();checks++;console.log('PASS',name);}
function challenge(){const payload=(Date.now()-3000)+':'+crypto.randomUUID();return payload+':'+ctx.saHmac_('form:'+payload);}
function signup(email,extra={}){return ctx.requestSignup({email,consent:true,website:'',challenge:challenge(),...extra});}
function link(mail){const u=mail.body.match(/https:\/\/script\.google\.com\/[^\s]+/)[0];return Object.fromEntries(new URL(u).searchParams);}
check('Exact university domain and formula/header injection rejected',()=>{for(const e of ['a@example.com','a@sltc.ac.lk.evil','a@sub.sltc.ac.lk','=x@sltc.ac.lk','a@sltc.ac.lk\r\nBcc:b@sltc.ac.lk'])assert(!ctx.saEmail_(e));assert(ctx.saEmail_('Student+alerts@SLTC.ac.lk'));});
check('Consent, honeypot, invalid and too-fresh form proof stop mail',()=>{signup('a@sltc.ac.lk',{consent:false});signup('a@sltc.ac.lk',{website:'spam'});signup('a@sltc.ac.lk',{challenge:'bad'});signup('a@sltc.ac.lk',{challenge:ctx.saChallenge_()});assert.equal(sent.length,0);});
let a,b;
check('Signup only creates pending state; confirmation mail has no LMS secret',()=>{signup('A@sltc.ac.lk');assert.equal(sent.length,1);a=link(sent[0]);assert.equal(sheets.Subscribers.data[1][2],'pending');assert(!JSON.stringify(sent).includes(props.SIGNING_SECRET));assert.notEqual(sheets.Subscribers.data[1][3],a.token);});
check('Cooldown prevents repeated confirmation mail',()=>{signup('a@sltc.ac.lk');assert.equal(sent.length,1);});
check('Tampered token cannot confirm',()=>assert.equal(ctx.confirmSubscription(a.id,'0'.repeat(64)).ok,false));
check('Pending subscribers receive no alerts',()=>{ctx.enqueueSubscriberAlert_('before-confirm',{subject:'Test',body:'Text',htmlBody:'<b>Styled</b>'});ctx.drainSubscriberQueue_();assert.equal(sent.length,1);});
check('Expired confirmation rejected',()=>{sheets.Subscribers.data[1][4]=Date.now()-1;assert.equal(ctx.confirmSubscription(a.id,a.token).ok,false);sheets.Subscribers.data[1][4]=Date.now()+60000;});
check('Valid confirmation activates exactly once',()=>{assert(ctx.confirmSubscription(a.id,a.token).ok);assert.equal(ctx.confirmSubscription(a.id,a.token).ok,false);});
check('Second student confirms separately',()=>{signup('b@sltc.ac.lk');b=link(sent.at(-1));assert(ctx.confirmSubscription(b.id,b.token).ok);});
check('Queue deduplicates event revision keys',()=>{assert(ctx.enqueueSubscriberAlert_('uid:v2',{subject:'Deadline',body:'Plain',htmlBody:'<html><body><b>Original styling</b></body></html>'}).queued);assert.equal(ctx.enqueueSubscriberAlert_('uid:v2',{subject:'Deadline',body:'Plain',htmlBody:'<b>Original styling</b>'}).queued,false);});
check('Quota exhaustion defers queued delivery',()=>{const n=sent.length;quota=30;ctx.drainSubscriberQueue_();assert.equal(sent.length,n);quota=100;});
check('Each student gets separate original styled mail and signed unsubscribe',()=>{const n=sent.length;assert.equal(ctx.drainSubscriberQueue_().sent,2);assert.equal(sent.length,n+2);assert(sent.at(-1).htmlBody.includes('<b>Original styling</b>'));assert(sent.at(-1).htmlBody.includes('Unsubscribe'));});
let unsubA=link(sent.find(m=>m.to==='a@sltc.ac.lk' && m.subject==='Deadline'));
ctx.enqueueSubscriberAlert_('uid:v3',{subject:'Later',body:'Text',htmlBody:'<b>Later</b>'});
check('Tampered unsubscribe cannot delete; valid unsubscribe deletes row',()=>{assert.equal(ctx.unsubscribe(a.id,'0'.repeat(64)).ok,false);assert(ctx.unsubscribe(a.id,unsubA.token).ok);assert(!sheets.Subscribers.data.some(r=>r[1]==='a@sltc.ac.lk'));});
check('Queued recipients are checked again after unsubscribe',()=>{const n=sent.length;ctx.drainSubscriberQueue_();assert.equal(sent.length,n+1);assert.equal(sent.at(-1).to,'b@sltc.ac.lk');});
check('Private ICS URL and encoded auth tokens rejected',()=>{for(const text of ['https://lms/x?authtoken=secret','https://lms/calendar/export_execute.php?a=1','wstoken%3Dsecret'])assert.throws(()=>ctx.enqueueSubscriberAlert_('leak'+text,{subject:'X',body:text,htmlBody:'X'}));});
check('Send failure retains cursor and retry succeeds',()=>{ctx.enqueueSubscriberAlert_('retry',{subject:'Retry',body:'Text',htmlBody:'<b>Retry</b>'});const row=sheets.AlertQueue.data.at(-1);failMail=true;assert.equal(ctx.drainSubscriberQueue_().failed,1);assert.equal(row[6],0);failMail=false;assert.equal(ctx.drainSubscriberQueue_().sent,1);});
check('Daily verification budget cannot be exceeded',()=>{for(let i=0;i<30;i++)signup('test'+i+'@sltc.ac.lk');assert.equal(JSON.parse(props.BUDGET_verificationMail).count,20);});
check('CAPTCHA configuration fails closed without valid proof',()=>{props.TURNSTILE_SITE_KEY='site';assert.equal(ctx.saCaptcha_(''),false);delete props.TURNSTILE_SITE_KEY;});
check('Only intended signup RPCs are public; monitor helpers are private',()=>{const signupSource=fs.readFileSync(path.join(base,'signup/Code.gs'),'utf8');const publicNames=[...signupSource.matchAll(/^function (\w+)\(/gm)].map(x=>x[1]).filter(x=>!x.endsWith('_'));assert.deepEqual(publicNames,['doGet','requestSignup','confirmSubscription','unsubscribe']);const bridge=fs.readFileSync(path.join(base,'monitor/SubscriberBridge.gs'),'utf8');assert([...bridge.matchAll(/^function (\w+)\(/gm)].every(x=>x[1].endsWith('_')));});
for(const file of ['signup/Code.gs','monitor/SubscriberBridge.gs'])new vm.Script(fs.readFileSync(path.join(base,file),'utf8'),{filename:file});
const html=fs.readFileSync(path.join(base,'signup/Index.html'),'utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= boot ?>',Buffer.from('{}').toString('base64')));
console.log(`${checks} checks passed. Server and client JavaScript parse successfully. Live deployment and mail delivery still require acceptance testing.`);
