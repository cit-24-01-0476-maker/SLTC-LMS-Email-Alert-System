/* Protected operator API. Email OTP recipient is configured only server-side.
 * Codes are hashed, single-use, expire in ten minutes and allow five guesses.
 * All private data/actions require a short-lived random session token.
 */
const AA_COMMAND_HEADERS_=['id','createdAt','kind','payload','status','message','finishedAt'];
const AA_HEALTH_HEADERS_=['key','value'];

function requestAdminCode() {
  try {return saLocked_(function(){
    aaInitializeOtp_();
    const p=saProps_(),now=Date.now();
    let limit=JSON.parse(p.getProperty('ADMIN_OTP_REQUEST_LIMIT')||'{}');
    if(limit.lastSent&&now-Number(limit.lastSent)<60000)return {ok:false,message:'Please wait one minute before requesting another code.',error:'THROTTLED'};
    if(!limit.windowStart||now-Number(limit.windowStart)>=3600000)limit={windowStart:now,count:0,lastSent:limit.lastSent||0};
    if(Number(limit.count)>=6)return {ok:false,message:'Too many code requests. Please try again later.',error:'THROTTLED'};
    if(MailApp.getRemainingDailyQuota()<=5||!saBudget_('adminOtpMail',20))return {ok:false,message:'The email service cannot send a code right now. Please try again later.',error:'UNAVAILABLE'};
    limit.count=Number(limit.count||0)+1;limit.lastSent=now;p.setProperty('ADMIN_OTP_REQUEST_LIMIT',JSON.stringify(limit));
    let value;do{value=parseInt(saHmac_('otp-random:'+Utilities.getUuid()+':'+Utilities.getUuid()).slice(0,8),16);}while(value>=4200000000);
    const code=String(value%100000000).padStart(8,'0'),id=Utilities.getUuid(),expires=now+600000;
    p.setProperty('ADMIN_OTP',JSON.stringify({id,hash:saHmac_('admin-otp:'+id+':'+code),expires,attempts:0}));
    try{MailApp.sendEmail({to:p.getProperty('ADMIN_EMAIL'),name:'SLTC LMS Alerts',subject:'SLTC LMS Alerts | Admin verification code',
      body:'Your one-time admin verification code is: '+code+'\n\nIt expires in 10 minutes and works once. Enter it only on your SLTC LMS Alerts admin page. If you did not request this, ignore the message. Never share this code.',
      htmlBody:'<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:30px;color:#073d58"><h2>Admin sign-in verification</h2><p>Enter this one-time code on your admin page.</p><p style="font-size:32px;font-weight:bold;letter-spacing:5px;padding:20px;background:#f1f5f5;border-left:4px solid #d6b36b">'+code+'</p><p>Expires in 10 minutes. It can be used once.</p><p style="font-size:12px;color:#687985">If you did not request this code, ignore this message. Do not share the code.</p></div>'});
    }catch(_){p.setProperty('ADMIN_OTP','{}');return {ok:false,message:'Unable to send a code right now. Please try again later.',error:'UNAVAILABLE'};}
    return {ok:true,message:'A verification code was sent to the configured admin inbox. Check Inbox and Spam.',data:{challengeId:id,expires,resendAfter:now+60000}};
  });}catch(_){return {ok:false,message:'Unable to send a code right now.',error:'UNAVAILABLE'};}
}

function adminLogin(code,challengeId) {
  try {return saLocked_(function(){
    aaInitializeOtp_();const p=saProps_(),now=Date.now();
    let bucket=JSON.parse(p.getProperty('ADMIN_OTP_VERIFY_LIMIT')||'{}');
    if(!bucket.start||now-Number(bucket.start)>=900000)bucket={start:now,count:0};
    if(Number(bucket.count)>=10)return {ok:false,message:'Too many verification attempts. Please wait 15 minutes.',error:'THROTTLED'};
    bucket.count=Number(bucket.count||0)+1;p.setProperty('ADMIN_OTP_VERIFY_LIMIT',JSON.stringify(bucket));
    const otp=JSON.parse(p.getProperty('ADMIN_OTP')||'{}');
    if(!otp.id||otp.id!==challengeId||Number(otp.expires)<=now||!otp.hash)
      return {ok:false,message:'Invalid or expired code. Request a new code.',error:'UNAUTHENTICATED'};
    if(Number(otp.attempts)>=5)return {ok:false,message:'This code is locked. Request a new code.',error:'THROTTLED'};
    otp.attempts=Number(otp.attempts||0)+1;p.setProperty('ADMIN_OTP',JSON.stringify(otp));
    if(typeof code!=='string'||!/^\d{8}$/.test(code)||!saEqual_(otp.hash,saHmac_('admin-otp:'+challengeId+':'+code)))
      return {ok:false,message:'Invalid or expired code. Please check the latest email.',error:'UNAUTHENTICATED'};
    // Consume BEFORE issuing a session; parallel/replayed verification cannot win.
    p.setProperty('ADMIN_OTP','{}');p.setProperty('ADMIN_OTP_VERIFY_LIMIT',JSON.stringify({start:now,count:0}));
    const token=saHmac_('admin-session:'+Utilities.getUuid()+':'+Utilities.getUuid()+':'+now);
    const expires=now+900000;
    p.setProperty('ADMIN_SESSIONS',JSON.stringify([{hash:saHash_(token),expires,lastSeen:now}]));
    return {ok:true,message:'Signed in.',data:{token,expires}};
  });}catch(_){return {ok:false,message:'Unable to sign in right now.',error:'UNAVAILABLE'};}
}

function adminLogout(token){
  try{return saLocked_(function(){
    aaRequire_(token);const p=saProps_(),hash=saHash_(token);
    p.setProperty('ADMIN_SESSIONS',JSON.stringify(JSON.parse(p.getProperty('ADMIN_SESSIONS')||'[]').filter(x=>x.hash!==hash&&Number(x.expires)>Date.now())));
    return {ok:true,message:'Signed out.'};
  });}catch(_){return {ok:false,message:'Session expired.',error:'UNAUTHENTICATED'};}
}

function adminState(token){
  try{return saLocked_(function(){
    aaRequire_(token);
    const rows=saRows_(saSheet_()),book=SpreadsheetApp.openById(saProps_().getProperty('SUBSCRIBERS_SHEET_ID'));
    const healthSheet=aaSheet_(book,'MonitorHealth',AA_HEALTH_HEADERS_);
    const commandSheet=aaSheet_(book,'AdminCommands',AA_COMMAND_HEADERS_);
    const health={};aaRows_(healthSheet,2).forEach(r=>{health[String(r[0])]=r[1];});
    const queue=book.getSheetByName('AlertQueue');const jobs=queue?aaRows_(queue,10):[];
    const commands=aaRows_(commandSheet,7).slice(-20).reverse().map(r=>({id:r[0],createdAt:Number(r[1]),kind:r[2],status:r[4],message:r[5],finishedAt:Number(r[6])||null}));
    const visitors=aaVisits_();
    return {ok:true,message:'Dashboard updated.',data:{
      subscribers:rows.map(r=>({id:r[0],email:r[1],status:r[2],createdAt:Number(r[5]),confirmedAt:Number(r[6])||null})),
      counts:{confirmed:rows.filter(r=>r[2]==='confirmed').length,pending:rows.filter(r=>r[2]==='pending').length,
        queuePending:jobs.filter(r=>r[7]==='pending').length,queueFailed:jobs.filter(r=>r[7]==='failed').length,
        queueExpired:jobs.filter(r=>r[7]==='expired').length,activeVisits:Object.keys(visitors).length},
      health,commands,recoveryUrl:saProps_().getProperty('MONITOR_RECOVERY_URL')||'',
      signupsEnabled:saProps_().getProperty('SIGNUPS_ENABLED')==='true',serverTime:Date.now()}};
  });}catch(error){return aaError_(error);}
}

function adminCommand(token,kind,payload){
  try{return saLocked_(function(){
    aaRequire_(token);
    if(!['UPDATE_CALENDAR','TEST_CONNECTION','RUN_CHECK','RETRY_QUEUE','REPAIR'].includes(kind))
      return {ok:false,message:'Unsupported action.',error:'INVALID'};
    const book=SpreadsheetApp.openById(saProps_().getProperty('SUBSCRIBERS_SHEET_ID'));
    const sheet=aaSheet_(book,'AdminCommands',AA_COMMAND_HEADERS_),rows=aaRows_(sheet,7);
    if(rows.filter(r=>r[4]==='queued'||r[4]==='running').length>=8)
      return {ok:false,message:'Some actions are still pending. Please wait for the control worker.',error:'BUSY'};
    const latest=rows.length?rows[rows.length-1]:null;if(latest && Date.now()-Number(latest[1])<10000)
      return {ok:false,message:'Please wait a few seconds before the next action.',error:'BUSY'};
    let data='';
    if(kind==='UPDATE_CALENDAR'){
      const url=typeof payload?.url==='string'?payload.url.trim():'';
      if(!aaCalendarUrl_(url))return {ok:false,message:'Use an HTTPS calendar export link from lms.sltc.ac.lk.',error:'INVALID'};
      const test=aaTestUrl_(url);
      if(!test.ok)return {ok:false,message:test.message,error:'CALENDAR_UNAVAILABLE'};
      data=JSON.stringify({url});
    }
    const id=Utilities.getUuid();sheet.appendRow([id,Date.now(),kind,data,'queued','Waiting for the private control worker.','']);SpreadsheetApp.flush();
    return {ok:true,message:'Action queued. The private worker normally applies it within 5 minutes. Check the action history for the result.',data:{id}};
  });}catch(error){return aaError_(error);}
}

// Anonymous, ephemeral page-activity count. No email, IP or persistent ID.
function recordVisit(visitorId,challenge){
  try{
    if(typeof visitorId!=='string'||!/^[a-f0-9-]{36}$/.test(visitorId)||!saCheckChallenge_(challenge))return {ok:false,message:'Visit not counted.'};
    return saLocked_(function(){const visits=aaVisits_(),key=saHash_(visitorId).slice(0,24);visits[key]=Date.now();
      const entries=Object.entries(visits).sort((a,b)=>b[1]-a[1]).slice(0,100);
      CacheService.getScriptCache().put('RECENT_VISITS',JSON.stringify(Object.fromEntries(entries)),360);
      return {ok:true,message:'Activity updated.'};
    });
  }catch(_){return {ok:false,message:'Visit not counted.'};}
}

// Also supports private operator tooling without browser automation. No CORS
// headers or query-string credentials. The same auth guards always apply.
function doPost(e){
  let result={ok:false,message:'Invalid request.',error:'INVALID'};
  try{
    const raw=e?.postData?.contents||'';
    if(raw.length>6500)throw new Error('Invalid');
    const input=JSON.parse(raw);
    if(input.method==='requestAdminCode')result=requestAdminCode();
    else if(input.method==='adminLogin')result=adminLogin(input.code,input.challengeId);
    else if(input.method==='adminState')result=adminState(input.token);
    else if(input.method==='adminCommand')result=adminCommand(input.token,input.kind,input.payload);
    else if(input.method==='adminLogout')result=adminLogout(input.token);
  }catch(_){}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function aaRequire_(token){
  aaInitializeOtp_();
  const now=Date.now();
  const hash=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?saHash_(token):'';
  const sessions=JSON.parse(saProps_().getProperty('ADMIN_SESSIONS')||'[]');
  const valid=sessions.find(s=>Number(s.expires)>now&&now-Number(s.lastSeen||0)<300000&&saEqual_(s.hash,hash));
  if(!valid){const error=new Error('Session expired. Get a new verification code.');error.auth=true;throw error;}
  valid.lastSeen=now;saProps_().setProperty('ADMIN_SESSIONS',JSON.stringify(sessions));
}
function aaInitializeOtp_(){
  const p=saProps_();
  if(p.getProperty('ADMIN_AUTH_MODE')!=='email_otp_v1'&&typeof privateAdminOtpBootstrap_==='function')privateAdminOtpBootstrap_();
  if(p.getProperty('ADMIN_AUTH_MODE')!=='email_otp_v1'||!/^\S+@\S+\.\S+$/.test(p.getProperty('ADMIN_EMAIL')||''))throw new Error('Admin email verification is not configured.');
}
function aaError_(error){return error?.auth?{ok:false,message:'Session expired. Sign in again.',error:'UNAUTHENTICATED'}:{ok:false,message:'Unable to complete this action. Please try again later.',error:'UNAVAILABLE'};}
function aaSheet_(book,name,headers){let s=book.getSheetByName(name);if(!s){s=book.insertSheet(name);s.appendRow(headers);s.setFrozenRows(1);}if(JSON.stringify(s.getRange(1,1,1,headers.length).getValues()[0])!==JSON.stringify(headers))throw new Error('Schema mismatch');return s;}
function aaRows_(s,width){return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,width).getValues();}
function aaVisits_(){try{const v=JSON.parse(CacheService.getScriptCache().get('RECENT_VISITS')||'{}');return Object.fromEntries(Object.entries(v).filter(x=>Date.now()-Number(x[1])<300000));}catch(_){return {};}}
function aaCalendarUrl_(url){return typeof url==='string'&&url.length<=4000&&!/[\s<>\x00]/.test(url)&&/^https:\/\/lms\.sltc\.ac\.lk\/calendar\/(?:export_execute|export|ical)\.php\?[^#]+$/i.test(url);}
function aaTestUrl_(url){
  try{const r=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
    if(r.getResponseCode()===200 && r.getContentText('UTF-8').includes('BEGIN:VCALENDAR'))return {ok:true};
    return {ok:false,message:'This link did not return a calendar. Generate a fresh export link from the LMS and try again.'};
  }catch(_){return {ok:false,message:'The LMS could not be reached. Try again shortly; a new link may be needed.'};}
}
