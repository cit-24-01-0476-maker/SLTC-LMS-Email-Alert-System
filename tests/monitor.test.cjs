// Integration regression tests for the user's supplied v2.0 monitor.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
class Sheet{
  constructor(data=[]){this.data=data;}
  getLastRow(){return this.data.length;}
  appendRow(r){this.data.push([...r]);}
  deleteRow(i){this.data.splice(i-1,1);}
  setFrozenRows(){}
  getRange(r,c,n=1,w=1){const s=this;return {getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>s.data[r-1+i]?.[c-1+j]??'')),getValue:()=>s.data[r-1]?.[c-1]??'',setValues:rows=>rows.forEach((row,i)=>{s.data[r-1+i]??=[];row.forEach((v,j)=>s.data[r-1+i][c-1+j]=v);})};}
}
function fixture(){
  const state={mail:[],held:false,quota:100,failFetch:false,failOwner:false,logo:true,logoFetches:0,triggerCreates:0,ics:''};
  const props={LMS_ICAL_URL:'https://lms.sltc.ac.lk/calendar/export_execute.php?authtoken=PRIVATE_TEST_TOKEN',LMS_AUTHTOKEN:'PRIVATE_TEST_TOKEN',ALERT_EMAIL:'owner@sltc.ac.lk',SUBSCRIBERS_SHEET_ID:'sheet',WEB_APP_URL:'https://script.google.com/macros/s/TEST/exec',SIGNING_SECRET:'s'.repeat(96),SUBSCRIBER_ALERTS_ENABLED:'true',OWNER_ALERTS_ENABLED:'false'};
  const header=['id','email','status','verifyHash','verifyExpires','createdAt','confirmedAt','lastRequest','requestDay','requestCount','unsubscribeNonce','consentVersion'];
  const sheets={Subscribers:new Sheet([header,['id-a','a@sltc.ac.lk','confirmed','','',0,0,0,'',0,'nonce-a','v1'],['id-b','b@sltc.ac.lk','confirmed','','',0,0,0,'',0,'nonce-b','v1'],['id-c','c@sltc.ac.lk','pending','','',0,0,0,'',0,'nonce-c','v1']])};
  const blob={getContentType:()=> 'image/png',setName(){return this;}};
  const ctx=vm.createContext({console:{log(){}},Date,JSON,Math,Number,String,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>props[k]=v})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()],formatDate:d=>d.toISOString(),parseDate:()=>new Date('2026-10-29T04:30:00Z')},LockService:{getScriptLock:()=>({tryLock(){assert.equal(state.held,false,'Nested ScriptLock acquisition');state.held=true;return true;},releaseLock(){assert(state.held);state.held=false;}})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet())}),flush(){}},UrlFetchApp:{fetch:(url,options)=>{
    if(url.includes('pluginfile.php')){state.logoFetches++;return {getResponseCode:()=>state.logo?200:404,getBlob:()=>blob};}
    assert.equal(options.followRedirects,false,'Private feed must not follow redirects');
    if(state.failFetch)throw Error('Request failed: '+url);
    return {getResponseCode:()=>200,getContentText:()=>state.ics};
  }},MailApp:{getRemainingDailyQuota:()=>state.quota,sendEmail:m=>{if(state.failOwner&&m.to===props.ALERT_EMAIL)throw Error('Private recipient failure');state.mail.push(m);state.quota--;}},ScriptApp:{getProjectTriggers:()=>[{getHandlerFunction:()=> 'checkLms'}],newTrigger:()=>{state.triggerCreates++;throw Error('Must preserve existing trigger');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'monitor/SubscriberBridge.gs'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'monitor/LmsMonitor.gs'),'utf8'),ctx);
  ctx.setupSubscriberBridge_();return {ctx,state,props,sheets};
}
function event(uid,title,date='20261029T100000Z',description='Details',url='https://lms.sltc.ac.lk/mod/assign/view.php?id=42'){
  return `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${date}\r\nDTEND:20261029T110000Z\r\nDESCRIPTION:${description}\r\nURL:${url}\r\nEND:VEVENT`;
}
function calendar(...events){return 'BEGIN:VCALENDAR\r\n'+events.join('\r\n')+'\r\nEND:VCALENDAR';}
let checks=0;function check(name,f){f();checks++;console.log('PASS',name);}
const {ctx,state,props,sheets}=fixture();
check('Original v2.0 navy/gold template output is preserved exactly',()=>{
  const html=ctx.buildEmailHtml([{status:'UPDATED',title:'Sample & <assignment>',when:'Thu, 29 Oct 2026 at 03:30 PM (Sri Lanka Time)',description:'Shared course notice',url:'https://lms.sltc.ac.lk/mod/assign/view.php?id=42'}],false,true);
  assert.equal(crypto.createHash('sha256').update(html).digest('hex'),'6ec2141a2c7a835207d170b54c5ef0b9871ad1d82e2b1335acb76485b62b4e1a');
});
check('First poll preserves the original silent baseline',()=>{state.ics=calendar(event('one','Old event'));ctx.checkLms();assert.equal(props.LMS_INITIALIZED,'yes');assert.equal(state.mail.length,0);assert(!state.held);});
check('Legacy EVT keys and fingerprints remain byte-compatible',()=>{const expected=ctx.hashText(JSON.stringify(['Old event','20261029T100000Z','20261029T110000Z']));assert.equal(props['EVT_'+ctx.hashText('one')],expected);});
check('Unchanged poll sends no repeat activation or event email',()=>{ctx.checkLms();assert.equal(state.mail.length,0);});
check('New event reaches confirmed students with original design, logo and unsubscribe',()=>{state.ics=calendar(event('one','Old event'),event('two','New assignment'));ctx.checkLms();assert.equal(state.mail.length,2);for(const m of state.mail){assert(m.htmlBody.includes('#073D58'));assert(m.htmlBody.includes('#D6B36B'));assert(m.htmlBody.includes('cid:sltcLogo'));assert(m.inlineImages.sltcLogo);assert(m.htmlBody.includes('Unsubscribe'));assert(!m.body.includes('PRIVATE_TEST_TOKEN'));assert.notEqual(m.to,'c@sltc.ac.lk');}assert.equal(state.logoFetches,1);});
check('Updating deadline sends UPDATED badge without nested locks',()=>{state.ics=calendar(event('one','Old event'),event('two','New assignment','20261030T100000Z'));ctx.checkLms();assert.equal(state.mail.length,4);assert(state.mail.at(-1).htmlBody.includes('DEADLINE / EVENT UPDATED'));assert(!state.held);});
check('Repeated revision is deduplicated across monitor and queue',()=>{ctx.checkLms();assert.equal(state.mail.length,4);});
check('Queue resumes on an unchanged calendar after quota deferral',()=>{state.quota=30;state.ics=calendar(event('one','Old event'),event('two','New assignment','20261030T100000Z'),event('three','Deferred event'));ctx.checkLms();assert.equal(state.mail.length,4);state.quota=100;ctx.checkLms();assert.equal(state.mail.length,6);});
check('Unsafe LMS export/token URLs become safe dashboard links',()=>{for(const u of ['https://evil.example/','https://lms.sltc.ac.lk/calendar/export_execute.php?authtoken=x','https://lms.sltc.ac.lk/x?token%3Dx','https://lms.sltc.ac.lk/x?sesskey=x'])assert.equal(ctx.safeEventUrl(u),'https://lms.sltc.ac.lk/my/');});
check('Template escapes untrusted event text while preserving style',()=>{const html=ctx.buildEmailHtml([{status:'NEW',title:'<script>alert(1)</script>',when:'Date',description:'<img src=x onerror=alert(1)>',url:ctx.safeEventUrl('https://evil.example/')}],false,false);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('max-width:600px'));});
check('Logo download failure produces SLTC fallback instead of broken CID image',()=>{state.logo=false;state.ics=calendar(event('four','Fallback logo'));ctx.checkLms();assert(!state.mail.at(-1).htmlBody.includes('cid:sltcLogo'));assert(!state.mail.at(-1).inlineImages);});
check('Old checkLms trigger is retained without duplicate creation',()=>{ctx.setupAlerts();assert.equal(state.triggerCreates,0);});
check('Manual email preview stays owner-only',()=>{const n=state.mail.length;ctx.sendPreviewEmail();assert.equal(state.mail.length,n+1);assert.equal(state.mail.at(-1).to,props.ALERT_EMAIL);assert(state.mail.at(-1).subject.includes('Preview'));});
check('Queued mail drains even when private LMS fetch fails, without token in error',()=>{state.quota=30;state.ics=calendar(event('five','Deliver despite fetch outage'));ctx.checkLms();const n=state.mail.length;state.quota=100;state.failFetch=true;assert.throws(()=>ctx.checkLms(),error=>!error.message.includes('PRIVATE_TEST_TOKEN'));assert.equal(state.mail.length,n+2);assert(!state.held);state.failFetch=false;});
check('Owner send failure leaves state retryable and same digest does not resend students',()=>{const f=fixture();f.props.LMS_INITIALIZED='yes';f.props.OWNER_ALERTS_ENABLED='true';f.state.ics=calendar(event('new','Owner retry'));f.state.failOwner=true;assert.throws(()=>f.ctx.checkLms());assert.equal(f.props['EVT_'+f.ctx.hashText('new')],undefined);assert.equal(f.state.mail.length,2);f.state.failOwner=false;f.ctx.checkLms();assert.equal(f.state.mail.length,3);assert.equal(f.state.mail.at(-1).to,f.props.ALERT_EMAIL);assert(f.props['EVT_'+f.ctx.hashText('new')]);});
check('Owner failure plus a later new event does not repeat older subscriber alerts',()=>{
  const f=fixture();f.props.LMS_INITIALIZED='yes';f.props.OWNER_ALERTS_ENABLED='true';f.state.failOwner=true;
  f.state.ics=calendar(event('first','First event'));assert.throws(()=>f.ctx.checkLms());assert.equal(f.state.mail.length,2);
  f.state.failOwner=false;f.state.ics=calendar(event('first','First event'),event('second','Second event'));f.ctx.checkLms();
  assert.equal(f.state.mail.length,5);const nextStudent=f.state.mail.filter(m=>m.to!==f.props.ALERT_EMAIL)[2];
  assert(!nextStudent.body.includes('First event'));assert(nextStudent.body.includes('Second event'));
});
check('Large changes are split into bounded styled digests',()=>{
  const f=fixture();f.props.LMS_INITIALIZED='yes';f.state.ics=calendar(...Array.from({length:20},(_,i)=>event('large'+i,'Assignment '+i)));
  f.ctx.checkLms();assert(f.sheets.AlertQueue.data.length>2);assert(f.state.mail.length>=4);
  for(const row of f.sheets.AlertQueue.data.slice(1))assert(row[4].length<=45000);
});
check('Raw private token embedded in course text cannot escape in email',()=>assert.throws(()=>ctx.sbNoSecret_('Do not send PRIVATE_TEST_TOKEN')));
console.log(`${checks} monitor integration checks passed. No live LMS or mail requests were made.`);
