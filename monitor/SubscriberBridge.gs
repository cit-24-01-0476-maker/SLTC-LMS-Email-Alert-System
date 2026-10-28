/* Add ONLY this file to the EXISTING PRIVATE LMS monitor project.
 * Keep the original renderer, LMS fetch/parser and 15-minute trigger.
 * Never deploy that private monitor as a public web app.
 */
const SB_HEADERS_=['jobId','createdAt','subject','body','htmlBody','subscriberIds','cursor','status','lastAttempt','failures'];

// Run once from the editor after adding the properties described in README.
function setupSubscriberBridge_(){
  sbConfig_();const b=sbBook_();let s=b.getSheetByName('AlertQueue');
  if(!s){s=b.insertSheet('AlertQueue');s.appendRow(SB_HEADERS_);s.setFrozenRows(1);}
  sbQueue_();
}

// Call where the existing monitor would send one rendered alert/digest.
// eventRevisionKey must be stable across retries and change on relevant updates.
function enqueueSubscriberAlert_(eventRevisionKey,message){
  return sbLocked_(function(){
    sbConfig_();
    if(typeof eventRevisionKey!=='string' || !eventRevisionKey || eventRevisionKey.length>2000)throw new Error('Invalid alert identity');
    if(!message || typeof message.subject!=='string' || typeof message.body!=='string' || typeof message.htmlBody!=='string')throw new Error('Rendered subject, body and htmlBody required');
    [message.subject,message.body,message.htmlBody].forEach(value=>{
      if(value.length>45000)throw new Error('Split the digest: content exceeds queue cell limit');
      sbNoSecret_(value);
    });
    if(message.subject.length>200)throw new Error('Subject too long');
    const s=sbQueue_(), rows=sbRows_(s,SB_HEADERS_.length),key=sbHash_(eventRevisionKey);
    if(rows.some(r=>r[0]===key))return {queued:false,reason:'already-recorded'};
    if(rows.filter(r=>r[7]==='pending').length>=200)throw new Error('Alert queue full; inspect failed/pending jobs');
    const ids=sbSubscribers_().filter(r=>r[2]==='confirmed' && sbEmail_(r[1])).map(r=>r[0]);
    const idsJson=JSON.stringify(ids);if(idsJson.length>45000)throw new Error('Subscriber snapshot too large');
    // A leading apostrophe prevents Sheets treating untrusted rendered text as a formula.
    const literal=v=>/^[=+\-@]/.test(v) ? "'"+v : v;
    s.appendRow([key,Date.now(),literal(message.subject),literal(message.body),literal(message.htmlBody),idsJson,0,ids.length?'pending':'done','',0]);
    SpreadsheetApp.flush();return {queued:true,recipients:ids.length};
  });
}

// Call on EVERY scheduled run, including when there are no new LMS events.
function drainSubscriberQueue_(){
  return sbLocked_(function(){
    sbConfig_();const started=Date.now(), s=sbQueue_(), rows=sbRows_(s,SB_HEADERS_.length);
    const result={sent:0,failed:0,expired:0};
    let remaining=Math.max(0,MailApp.getRemainingDailyQuota()-Number(sbProps_().getProperty('MAIL_RESERVE')||30));
    const batch=Number(sbProps_().getProperty('MAX_SEND_PER_RUN')||40);
    for(let j=0;j<rows.length;j++){
      const r=rows[j];if(r[7]!=='pending')continue;
      if(Date.now()-Number(r[1])>7*86400000){r[7]='expired';sbSave_(s,j,r);result.expired++;continue;}
      const ids=JSON.parse(r[5]);
      while(Number(r[6])<ids.length){
        if(remaining<=0 || result.sent>=batch || Date.now()-started>180000)return result;
        const id=ids[Number(r[6])];
        // Re-read before EACH send. A removed record must not receive queued mail.
        const recipient=sbSubscribers_().find(x=>x[0]===id && x[2]==='confirmed' && sbEmail_(x[1]));
        if(!recipient){r[6]=Number(r[6])+1;sbSave_(s,j,r);continue;}
        const token=sbHmac_('unsubscribe:'+recipient[0]+':'+recipient[10]);
        const url=sbProps_().getProperty('WEB_APP_URL')+'?action=unsubscribe&id='+recipient[0]+'&token='+token;
        const footer='<div style="font:12px Arial,sans-serif;color:#667085;padding:20px;text-align:center;border-top:1px solid #e4e7ec">Shared course monitor · not personalised LMS courses.<br><a href="'+sbEscape_(url)+'">Unsubscribe / delete my subscriber record</a></div>';
        const html=/<\/body\s*>/i.test(r[4]) ? r[4].replace(/<\/body\s*>/i,footer+'</body>') : r[4]+footer;
        r[8]=Date.now();
        try{
          MailApp.sendEmail({to:recipient[1],subject:r[2],body:r[3]+'\n\nShared monitor alerts. Unsubscribe: '+url,
            htmlBody:html,name:'SLTC LMS Alerts'});
        }catch(_){
          r[9]=Number(r[9])+1;if(Number(r[9])>=5)r[7]='failed';
          sbSave_(s,j,r);result.failed++;
          // Do not log mail exceptions; they can contain private recipient details.
          return result;
        }
        // At-least-once delivery: a crash between send and this commit can duplicate one mail.
        r[6]=Number(r[6])+1;r[9]=0;result.sent++;remaining--;sbSave_(s,j,r);
      }
      r[7]='done';sbSave_(s,j,r);
    }
    // Retain job IDs for 30 days for deduplication; keep unresolved jobs for inspection.
    for(let i=rows.length-1;i>=0;i--)if(rows[i][7]==='done' && Date.now()-Number(rows[i][1])>30*86400000)s.deleteRow(i+2);
    return result;
  });
}

function sbProps_(){return PropertiesService.getScriptProperties();}
function sbConfig_(){const p=sbProps_();if(!p.getProperty('SUBSCRIBERS_SHEET_ID') || (p.getProperty('SIGNING_SECRET')||'').length<64 || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(p.getProperty('WEB_APP_URL')||''))throw new Error('Configure subscriber bridge properties');}
function sbBook_(){return SpreadsheetApp.openById(sbProps_().getProperty('SUBSCRIBERS_SHEET_ID'));}
function sbQueue_(){const s=sbBook_().getSheetByName('AlertQueue');if(!s || JSON.stringify(s.getRange(1,1,1,SB_HEADERS_.length).getValues()[0])!==JSON.stringify(SB_HEADERS_))throw new Error('Queue schema mismatch');return s;}
function sbRows_(s,width){return s.getLastRow()<2?[]:s.getRange(2,1,s.getLastRow()-1,width).getValues();}
function sbSubscribers_(){const s=sbBook_().getSheetByName('Subscribers');if(!s || s.getRange(1,1).getValue()!=='id' || s.getRange(1,11).getValue()!=='unsubscribeNonce')throw new Error('Subscriber schema mismatch');return sbRows_(s,12);}
function sbSave_(s,i,row){s.getRange(i+2,1,1,SB_HEADERS_.length).setValues([row]);SpreadsheetApp.flush();}
function sbLocked_(f){const l=LockService.getScriptLock();if(!l.tryLock(1000))return {busy:true};try{return f();}finally{l.releaseLock();}}
function sbEmail_(e){return typeof e==='string' && /^[a-z0-9][a-z0-9._+-]{0,63}@sltc\.ac\.lk$/i.test(e);}
function sbHex_(b){return b.map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');}
function sbHash_(s){return sbHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8));}
function sbHmac_(s){return sbHex_(Utilities.computeHmacSha256Signature(s,sbProps_().getProperty('SIGNING_SECRET')));}
function sbEscape_(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sbNoSecret_(text){
  let value=text;for(let i=0;i<2;i++){try{value=decodeURIComponent(value);}catch(_){break;}}
  const secret=sbProps_().getProperty('LMS_AUTHTOKEN');
  if((secret && value.includes(secret)) || /(?:authtoken|wstoken|access_token)\s*(?:=|&#0*61;|&equals;|:)/i.test(value) || /calendar\/export_execute\.php/i.test(value))
    throw new Error('Private calendar URL/token detected. Render safe LMS course links instead.');
}
