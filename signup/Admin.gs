/* Protected operator API. The six-digit code is NEVER kept in public source.
 * ADMIN_CODE_HASH is HMAC-SHA256('admin-code:'+code, SIGNING_SECRET).
 * All private data/actions require a short-lived random session token.
 */
const AA_COMMAND_HEADERS_=['id','createdAt','kind','payload','status','message','finishedAt'];
const AA_HEALTH_HEADERS_=['key','value'];

function adminLogin(code) {
  try {return saLocked_(function(){
    const p=saProps_(),now=Date.now();
    if(!p.getProperty('ADMIN_CODE_HASH') && typeof privateAdminBootstrap_==='function')privateAdminBootstrap_();
    const expected=p.getProperty('ADMIN_CODE_HASH');
    if(!expected)return {ok:false,message:'Admin setup is not ready yet.',error:'UNAVAILABLE'};
    let bucket=JSON.parse(p.getProperty('ADMIN_LOGIN_LIMIT')||'{}');
    if(!bucket.start || now-Number(bucket.start)>=900000)bucket={start:now,count:0};
    if(Number(bucket.count)>=5)return {ok:false,message:'Too many attempts. Please wait 15 minutes.',error:'THROTTLED'};
    bucket.count=Number(bucket.count)+1;p.setProperty('ADMIN_LOGIN_LIMIT',JSON.stringify(bucket));
    if(typeof code!=='string'||!/^\d{6}$/.test(code)||!saEqual_(expected,saHmac_('admin-code:'+code)))
      return {ok:false,message:'Incorrect admin code.',error:'UNAUTHENTICATED'};
    p.setProperty('ADMIN_LOGIN_LIMIT',JSON.stringify({start:now,count:0}));
    const token=saHmac_('admin-session:'+Utilities.getUuid()+':'+Utilities.getUuid()+':'+now);
    const sessions=JSON.parse(p.getProperty('ADMIN_SESSIONS')||'[]').filter(x=>Number(x.expires)>now).slice(-2);
    const expires=now+1800000;sessions.push({hash:saHash_(token),expires});
    p.setProperty('ADMIN_SESSIONS',JSON.stringify(sessions));
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
    if(input.method==='adminLogin')result=adminLogin(input.code);
    else if(input.method==='adminState')result=adminState(input.token);
    else if(input.method==='adminCommand')result=adminCommand(input.token,input.kind,input.payload);
    else if(input.method==='adminLogout')result=adminLogout(input.token);
  }catch(_){}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function aaRequire_(token){
  const hash=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?saHash_(token):'';
  const valid=JSON.parse(saProps_().getProperty('ADMIN_SESSIONS')||'[]').some(s=>Number(s.expires)>Date.now()&&saEqual_(s.hash,hash));
  if(!valid){const error=new Error('Session expired. Sign in again.');error.auth=true;throw error;}
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
