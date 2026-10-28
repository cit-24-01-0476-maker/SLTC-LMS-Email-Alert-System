/* Separate PUBLIC signup project. Never put your LMS token or old monitor here. */
const SA_HEADERS_ = ['id','email','status','verifyHash','verifyExpires','createdAt','confirmedAt','lastRequest','requestDay','requestCount','unsubscribeNonce','consentVersion'];
const SA_CONSENT_ = 'shared-monitor-2026-10-v1';

function doGet(e) {
  const p = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile('Index');
  const boot = { action: /^(confirm|unsubscribe)$/.test(p.action || '') ? p.action : '',
    id: /^[a-f0-9-]{36}$/.test(p.id || '') ? p.id : '',
    token: /^[a-f0-9]{64}$/.test(p.token || '') ? p.token : '',
    challenge: saChallenge_(), siteKey: saProps_().getProperty('TURNSTILE_SITE_KEY') || '',
    contact: saProps_().getProperty('CONTACT_EMAIL') || 'Contact the student organiser',
    enabled: saProps_().getProperty('SIGNUPS_ENABLED') === 'true' };
  t.boot = Utilities.base64Encode(JSON.stringify(boot), Utilities.Charset.UTF_8);
  return t.evaluate().setTitle('SLTC LMS Alerts').addMetaTag('viewport','width=device-width, initial-scale=1');
}

// These are the only mutation functions exposed to google.script.run.
function requestSignup(input) {
  const generic = {ok:true, message:'If eligible, a confirmation email will arrive. Check Inbox and Spam. A link lasts 30 minutes. Please wait 10 minutes before retrying.'};
  try {
    input = input || {};
    if (saProps_().getProperty('SIGNUPS_ENABLED') !== 'true') return {ok:false,message:'Signups are temporarily paused.'};
    if (input.website || input.consent !== true || !saEmail_(input.email)) return generic;
    if (!saCheckChallenge_(input.challenge)) return generic;
    return saLocked_(function() {
      if (!saBudget_('attempts',300)) return generic;
      if (!saCaptcha_(input.captcha)) return generic;
      const sheet = saSheet_(), rows = saRows_(sheet), now = Date.now();
      const email = input.email.trim().toLowerCase();
      const found = rows.findIndex(r => r[1] === email);
      const old = found < 0 ? null : rows[found];
      if (old && (old[2] === 'confirmed' || now-Number(old[7]) < 600000 || (old[8] === saDay_() && Number(old[9]) >= 3))) return generic;
      if (!old && rows.length >= 1000) return generic;
      const active = rows.filter(r=>r[2]==='confirmed').length;
      if (active >= Number(saProps_().getProperty('MAX_SUBSCRIBERS') || 200)) return generic;
      if (MailApp.getRemainingDailyQuota() <= 40 || !saBudget_('verificationMail',20)) return generic;
      const id = old ? old[0] : Utilities.getUuid();
      const token = saHmac_('verify:'+id+':'+Utilities.getUuid());
      const row = [id,email,'pending',saHash_(token),now+1800000,old ? old[5] : now,'',now,saDay_(),
        old && old[8] === saDay_() ? Number(old[9])+1 : 1,Utilities.getUuid(),SA_CONSENT_];
      // Persist before sending: a failure may require waiting for the cooldown.
      sheet.getRange(found < 0 ? sheet.getLastRow()+1 : found+2,1,1,SA_HEADERS_.length).setValues([row]);
      SpreadsheetApp.flush();
      const url = saUrl_()+'?action=confirm&id='+id+'&token='+token;
      MailApp.sendEmail({to:email,subject:'Confirm your SLTC LMS Alerts signup',name:'SLTC LMS Alerts',
        body:'You requested shared course calendar alerts. Open this link, then press Confirm subscription:\n'+url+'\nExpires in 30 minutes. If you did not request this, ignore it; you are not subscribed.',
        htmlBody:'<div style="font-family:Arial;max-width:560px;padding:28px;background:#f3f6fb;color:#14243b"><h1>One last step.</h1><p>Receive calendar alerts from the shared SLTC LMS monitor. These are not your personalised courses.</p><p><a href="'+saEscape_(url)+'" style="display:inline-block;background:#2158d6;color:white;padding:14px 22px;border-radius:8px">Review &amp; confirm</a></p><p>Expires in 30 minutes. Only press Confirm subscription if you requested this. Otherwise ignore this email; no subscription is active.</p></div>'});
      return generic;
    });
  } catch (_) { return {ok:false,message:'Unable to process this now. Please try again later or contact the organiser.'}; }
}

function confirmSubscription(id, token) {
  try { return saLocked_(function() {
    if (!saLinkInput_(id,token)) return saInvalid_();
    const s=saSheet_(), rows=saRows_(s), i=rows.findIndex(r=>r[0]===id);
    if(i<0) return saInvalid_();
    const r=rows[i];
    if(r[2]!=='pending' || Number(r[4])<Date.now() || !saEqual_(r[3],saHash_(token))) return saInvalid_();
    if(rows.filter(x=>x[2]==='confirmed').length >= Number(saProps_().getProperty('MAX_SUBSCRIBERS') || 200))
      return {ok:false,message:'The shared monitor has reached its subscriber limit. Please contact the organiser.'};
    r[2]='confirmed'; r[3]=''; r[4]=''; r[6]=Date.now();
    s.getRange(i+2,1,1,SA_HEADERS_.length).setValues([r]); SpreadsheetApp.flush();
    return {ok:true,message:'Subscribed! Future shared monitor alerts will arrive here. Every alert includes an unsubscribe link.'};
  }); } catch (_) { return {ok:false,message:'Please try again later.'}; }
}

function unsubscribe(id, token) {
  try { return saLocked_(function() {
    if(!saLinkInput_(id,token)) return saInvalid_();
    const s=saSheet_(), rows=saRows_(s), i=rows.findIndex(r=>r[0]===id);
    if(i<0) return {ok:true,message:'This subscription is already removed or the link is no longer valid.'};
    const r=rows[i];
    if(!saEqual_(saHmac_('unsubscribe:'+r[0]+':'+r[10]),token)) return saInvalid_();
    s.deleteRow(i+2); SpreadsheetApp.flush();
    return {ok:true,message:'Unsubscribed. Your subscriber record has been deleted. A message already being sent may still arrive.'};
  }); } catch (_) { return {ok:false,message:'Please try again later.'}; }
}

// Run from the Apps Script editor only; the trailing underscore blocks web RPC.
function setupSignup_() {
  return saLocked_(function() {
  const p=saProps_();
  if(!p.getProperty('SUBSCRIBERS_SHEET_ID')) {
    const created=SpreadsheetApp.create('SLTC LMS Alert Subscribers');
    p.setProperty('SUBSCRIBERS_SHEET_ID',created.getId());
  }
  if(!p.getProperty('SIGNING_SECRET')) p.setProperty('SIGNING_SECRET',Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid());
  if(!p.getProperty('SIGNUPS_ENABLED')) p.setProperty('SIGNUPS_ENABLED','false');
  const book=SpreadsheetApp.openById(p.getProperty('SUBSCRIBERS_SHEET_ID'));
  let s=book.getSheetByName('Subscribers');
  if(!s) {s=book.insertSheet('Subscribers'); s.appendRow(SA_HEADERS_); s.setFrozenRows(1);}
  saSheet_();
  if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='cleanupPending_'))
    ScriptApp.newTrigger('cleanupPending_').timeBased().everyDays(1).create();
  return {ok:true, spreadsheetId:p.getProperty('SUBSCRIBERS_SHEET_ID'),
    signupsEnabled:p.getProperty('SIGNUPS_ENABLED')==='true'};
  });
}

function cleanupPending_() {
  saLocked_(function(){const s=saSheet_(),rows=saRows_(s);
    for(let i=rows.length-1;i>=0;i--) if(rows[i][2]==='pending' && Date.now()-Number(rows[i][7])>86400000) s.deleteRow(i+2);
  });
}
function saProps_(){return PropertiesService.getScriptProperties();}
function saSheet_(){
  const s=SpreadsheetApp.openById(saProps_().getProperty('SUBSCRIBERS_SHEET_ID')).getSheetByName('Subscribers');
  if(!s || JSON.stringify(s.getRange(1,1,1,SA_HEADERS_.length).getValues()[0])!==JSON.stringify(SA_HEADERS_)) throw new Error('Schema mismatch');
  return s;
}
function saRows_(s){return s.getLastRow()<2 ? [] : s.getRange(2,1,s.getLastRow()-1,SA_HEADERS_.length).getValues();}
function saLocked_(f){const l=LockService.getScriptLock();l.waitLock(15000);try{return f();}finally{l.releaseLock();}}
function saEmail_(email){return typeof email==='string' && email.length<=180 && /^[a-z0-9][a-z0-9._+-]{0,63}@sltc\.ac\.lk$/i.test(email.trim());}
function saUrl_(){const u=saProps_().getProperty('WEB_APP_URL') || ScriptApp.getService().getUrl() || '';if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) throw new Error('Deploy the web app or configure WEB_APP_URL');return u;}
function saDay_(){return Utilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd');}
function saBudget_(kind,limit){
  const p=saProps_(), key='BUDGET_'+kind, raw=p.getProperty(key);
  const b=raw ? JSON.parse(raw) : {}; const n=b.day===saDay_() ? Number(b.count)||0 : 0;
  if(n>=limit) return false; p.setProperty(key,JSON.stringify({day:saDay_(),count:n+1}));return true;
}
function saHash_(s){return saHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8));}
function saHex_(bytes){return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function saHmac_(s){const k=saProps_().getProperty('SIGNING_SECRET');if(!k || k.length<64)throw new Error('Missing key');return saHex_(Utilities.computeHmacSha256Signature(s,k));}
function saEqual_(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function saChallenge_(){const payload=Date.now()+':'+Utilities.getUuid();return payload+':'+saHmac_('form:'+payload);}
function saCheckChallenge_(v){if(typeof v!=='string' || v.length>160)return false;const p=v.split(':');if(p.length!==3)return false;const age=Date.now()-Number(p[0]);return age>=1500 && age<3600000 && saEqual_(p[2],saHmac_('form:'+p[0]+':'+p[1]));}
function saCaptcha_(token){
  const p=saProps_(),site=p.getProperty('TURNSTILE_SITE_KEY'),secret=p.getProperty('TURNSTILE_SECRET_KEY');
  // Optional CAPTCHA; hard mail budgets and cooldowns still apply without it.
  if(!site && !secret)return true;
  if(!site || !secret || typeof token!=='string' || !token || token.length>2048)return false;
  const response=UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {method:'post',payload:{secret:secret,response:token},muteHttpExceptions:true});
  const r=JSON.parse(response.getContentText());
  const host=p.getProperty('TURNSTILE_HOSTNAME');
  return r.success===true && r.action==='signup' && !!host && r.hostname===host;
}
function saLinkInput_(id,t){return typeof id==='string' && /^[a-f0-9-]{36}$/.test(id) && typeof t==='string' && /^[a-f0-9]{64}$/.test(t);}
function saInvalid_(){return {ok:false,message:'This link is invalid, expired, or already used. Request a new signup link if needed.'};}
function saEscape_(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
