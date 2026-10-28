/**
 * SLTC LMS ALERT SYSTEM v2.1 — integrated from the supplied v2.0 script.
 * Keep this project PRIVATE. Replace the old monitor Code.gs with this file,
 * and add SubscriberBridge.gs. Do not keep two copies of the old functions.
 * Existing checkLms trigger and EVT_ fingerprints are preserved.
 */
const LMS_URL_KEY = 'LMS_ICAL_URL';
const EMAIL_KEY = 'ALERT_EMAIL';
const LMS_HOME = 'https://lms.sltc.ac.lk/my/';
const TIME_ZONE = 'Asia/Colombo';
const SLTC_LOGO_URL = 'https://lms.sltc.ac.lk/pluginfile.php/1/theme_moove/logo/1726633234/SLTC%20LOGO.png';

function hashText(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text));
}
function getField(block,name) {
  const match=block.match(new RegExp('^'+name+'(?:;[^:\\r\\n]*)?:(.*)$','m'));
  return match ? match[1].trim() : '';
}
function decodeIcs(text) {
  return String(text || '').replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim();
}
function escapeHtml(text) {
  return String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function getStartTimezone(block) {
  const match=block.match(/^DTSTART;[^\r\n:]*TZID=([^;:\r\n]+)/m);
  return match ? match[1] : TIME_ZONE;
}
function formatSriLankaTime(raw,sourceTimezone) {
  if(!raw)return 'Not specified';
  const m=raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!m)return raw;
  try {
    if(m[4]===undefined)return Utilities.formatDate(new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),12)),TIME_ZONE,'EEE, dd MMM yyyy')+' (All-day event)';
    const date=m[7]==='Z'
      ? new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0)))
      : Utilities.parseDate(m[1]+m[2]+m[3]+'T'+m[4]+m[5]+(m[6]||'00'),sourceTimezone||TIME_ZONE,"yyyyMMdd'T'HHmmss");
    return Utilities.formatDate(date,TIME_ZONE,"EEE, dd MMM yyyy 'at' hh:mm a")+' (Sri Lanka Time)';
  } catch(_) {return raw;}
}
function safeEventUrl(url) {
  const value=decodeIcs(url);
  if(!/^https:\/\/lms\.sltc\.ac\.lk(?:\/|$)/i.test(value) || /[\s<>]/.test(value))return LMS_HOME;
  let decoded=value;for(let i=0;i<2;i++){try{decoded=decodeURIComponent(decoded);}catch(_){break;}}
  if(/calendar\/export|(?:authtoken|wstoken|access_token|sesskey|token)\s*[=:]/i.test(decoded))return LMS_HOME;
  return value;
}
function getCampusLogo() {
  try {
    const response=UrlFetchApp.fetch(SLTC_LOGO_URL,{muteHttpExceptions:true,followRedirects:true});
    if(response.getResponseCode()!==200)return null;
    const blob=response.getBlob();
    return /^image\/(png|jpeg|gif)$/i.test(blob.getContentType()) ? blob.setName('SLTC-Campus-Logo.png') : null;
  } catch(_) {return null;}
}

// Original navy/gold template, event cards, dimensions, copy and inline logo.
function buildEmailHtml(events, preview, hasLogo) {

  const logoHtml = hasLogo
    ? `<img src="cid:sltcLogo"
         width="76" height="76"
         alt="SLTC Campus Logo"
         style="display:block;width:76px;height:76px;
         border-radius:50%;border:2px solid #DCC389;">`
    : `<div style="font-size:24px;font-weight:bold;
         color:#DCC389;">SLTC</div>`;

  const eventCards = events.map(event => {

    const updated = event.status === "UPDATED";

    const badgeText = updated
      ? "DEADLINE / EVENT UPDATED"
      : preview ? "SAMPLE EVENT" : "NEW EVENT";

    const badgeBackground = updated
      ? "#FFF1D6"
      : "#E7F6ED";

    const badgeColor = updated
      ? "#976000"
      : "#187344";

    const details = event.description
      ? `<tr><td style="padding-top:15px;">
           <div style="font-size:12px;color:#7A889A;
                       margin-bottom:5px;">
             EVENT DETAILS
           </div>
           <div style="font-size:13px;color:#41536A;
                       line-height:21px;">
             ${escapeHtml(event.description)}
           </div>
         </td></tr>`
      : "";

    return `
      <tr>
        <td style="padding:0 26px 16px;">

          <table role="presentation" width="100%"
            cellspacing="0" cellpadding="0"
            style="background:#FFFFFF;
                   border:1px solid #E2E8F0;
                   border-radius:14px;
                   border-collapse:separate;">

            <tr>
              <td style="padding:24px;">

                <table role="presentation" width="100%"
                  cellspacing="0" cellpadding="0">

                  <tr>
                    <td>
                      <span style="
                        display:inline-block;
                        padding:7px 11px;
                        background:${badgeBackground};
                        color:${badgeColor};
                        font-size:10px;
                        font-weight:bold;
                        letter-spacing:1px;
                        border-radius:20px;">
                        ${badgeText}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding-top:15px;">
                      <div style="
                        font-size:20px;
                        line-height:29px;
                        font-weight:bold;
                        color:#12344B;">
                        ${escapeHtml(event.title)}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding-top:19px;">
                      <div style="
                        background:#F4F7FA;
                        border-left:3px solid #D6B36B;
                        border-radius:6px;
                        padding:14px 16px;">

                        <div style="
                          font-size:11px;
                          color:#78879B;
                          font-weight:bold;
                          letter-spacing:1px;">
                          EVENT DATE / DEADLINE
                        </div>

                        <div style="
                          font-size:15px;
                          font-weight:bold;
                          color:#183E57;
                          line-height:24px;
                          margin-top:5px;">
                          ${escapeHtml(event.when)}
                        </div>

                      </div>
                    </td>
                  </tr>

                  ${details}

                  <tr>
                    <td style="padding-top:23px;">
                      <a href="${escapeHtml(event.url)}"
                         style="
                           display:inline-block;
                           padding:13px 23px;
                           background:#D6B36B;
                           color:#12344B;
                           font-size:13px;
                           font-weight:bold;
                           text-decoration:none;
                           border-radius:8px;">
                        Open SLTC LMS &rarr;
                      </a>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>

          </table>

        </td>
      </tr>
    `;
  }).join("");

  const heading = preview
    ? "Your New Email Design"
    : "New LMS Calendar Update";

  const message = preview
    ? "This is a sample notification to preview your new email design."
    : `We detected ${events.length} new or updated event(s) in your LMS calendar.`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width,initial-scale=1">
</head>

<body style="
  margin:0;
  padding:0;
  background:#F1F4F8;
  font-family:Arial,Helvetica,sans-serif;">

<table role="presentation" width="100%"
  cellspacing="0" cellpadding="0"
  style="background:#F1F4F8;">

  <tr>
    <td align="center"
        style="padding:30px 12px;">

      <table role="presentation" width="600"
        cellspacing="0" cellpadding="0"
        style="
          width:100%;
          max-width:600px;
          background:#FFFFFF;
          border-radius:16px;
          border-collapse:separate;
          overflow:hidden;">

        <!-- NAVY HEADER -->

        <tr>
          <td style="
            background:#073D58;
            padding:30px 28px;">

            <table role="presentation" width="100%"
              cellspacing="0" cellpadding="0">

              <tr>
                <td width="94"
                    style="vertical-align:middle;">
                  ${logoHtml}
                </td>

                <td style="vertical-align:middle;">

                  <div style="
                    color:#E4C17B;
                    font-size:11px;
                    letter-spacing:2px;
                    font-weight:bold;">
                    SRI LANKA TECHNOLOGY CAMPUS
                  </div>

                  <div style="
                    color:#FFFFFF;
                    font-size:25px;
                    font-weight:bold;
                    margin-top:7px;">
                    SLTC LMS
                  </div>

                  <div style="
                    color:#B9CBD8;
                    font-size:12px;
                    margin-top:5px;">
                    Academic Notification Monitor
                  </div>

                </td>
              </tr>

            </table>

          </td>
        </tr>

        <!-- GOLD STRIPE -->

        <tr>
          <td style="
            height:5px;
            background:#D6B36B;
            font-size:1px;
            line-height:5px;">
            &nbsp;
          </td>
        </tr>

        <!-- INTRODUCTION -->

        <tr>
          <td style="padding:32px 28px 25px;">

            <div style="
              color:#D3A44C;
              font-size:11px;
              font-weight:bold;
              letter-spacing:2px;">
              ACADEMIC CALENDAR ALERT
            </div>

            <div style="
              color:#12344B;
              font-size:27px;
              line-height:35px;
              font-weight:bold;
              margin-top:10px;">
              ${heading}
            </div>

            <p style="
              color:#617187;
              font-size:14px;
              line-height:23px;
              margin:13px 0 0;">
              ${message}
            </p>

          </td>
        </tr>

        <!-- EVENT CARDS -->

        ${eventCards}

        <!-- AUTOMATION INFORMATION -->

        <tr>
          <td style="padding:9px 28px 26px;">

            <table role="presentation" width="100%"
              cellspacing="0" cellpadding="0"
              style="
                background:#EEF4F8;
                border-radius:9px;">

              <tr>
                <td style="
                  padding:17px 19px;
                  color:#42617A;
                  font-size:12px;
                  line-height:20px;">

                  <strong>Automatic LMS Monitoring</strong>
                  <br>
                  Calendar checked approximately every
                  15 minutes, including when your
                  computer is switched off.

                </td>
              </tr>

            </table>

          </td>
        </tr>

        <!-- FOOTER -->

        <tr>
          <td align="center"
              style="
                background:#F7F9FC;
                padding:25px 22px;
                border-top:1px solid #E6EDF3;">

            <div style="
              font-size:13px;
              font-weight:bold;
              color:#153F5D;">
              SLTC LMS Alert Monitor
            </div>

            <div style="
              margin-top:8px;
              color:#8491A2;
              font-size:11px;
              line-height:18px;">
              A personal automated calendar notification.
              <br>
              Not an official university announcement.
              <br>
              Always verify details on the SLTC LMS.
            </div>

            <div style="margin-top:15px;">
              <a href="${LMS_HOME}"
                 style="
                   color:#A37B30;
                   font-size:12px;
                   font-weight:bold;
                   text-decoration:none;">
                Visit SLTC LMS
              </a>
            </div>

            <div style="
              margin-top:17px;
              color:#A0AAB7;
              font-size:10px;">
              Designed for personal academic tracking
            </div>

          </td>
        </tr>

      </table>

    </td>
  </tr>

</table>
</body>
</html>`;
}

function renderStyledMessage_(events,preview,hasLogo) {
  const subject=preview ? 'SLTC LMS | Premium Email Design Preview' : 'SLTC LMS | '+events.length+' New/Updated Calendar Event(s)';
  const body=(preview ? 'EMAIL DESIGN PREVIEW\n\n' : 'SLTC LMS Calendar Update\n\n')+
    events.map(event=>'['+event.status+'] '+event.title+'\nDate: '+event.when+'\n'+(event.description||'')+'\nOpen: '+event.url).join('\n\n----------------\n\n')+
    '\n\nPersonal LMS calendar notification.\nAlways confirm details on the SLTC LMS.';
  const htmlBody=buildEmailHtml(events,preview,hasLogo);
  sbNoSecret_(body);sbNoSecret_(htmlBody);
  return {subject:subject,body:body,htmlBody:htmlBody};
}
function sendStyledEmail(events,preview) {
  const email=PropertiesService.getScriptProperties().getProperty(EMAIL_KEY);
  if(!email)throw new Error('ALERT_EMAIL is not configured');
  const logo=getCampusLogo();
  const message=renderStyledMessage_(events,preview,Boolean(logo));
  message.to=email;message.name='SLTC LMS Alert Monitor';
  if(logo)message.inlineImages={sltcLogo:logo};
  try {MailApp.sendEmail(message);}catch(_){throw new Error('Owner notification failed; check sender quota and ALERT_EMAIL privately.');}
}

// Commit subscriber revisions independently of the owner's direct notification.
// Split large digests to respect Sheets' per-cell storage limit.
function enqueueStyledSubscriberChanges_(changes,store) {
  let batch=[];
  function commit(){
    if(!batch.length)return;
    const key='digest:'+hashText(JSON.stringify(batch.map(x=>[x.key,x.fingerprint]).sort((a,b)=>a[0].localeCompare(b[0]))));
    sbEnqueueUnlocked_(key,renderStyledMessage_(batch.map(x=>x.event),false,true));
    for(const item of batch)store.setProperty('SUB_'+item.key,item.fingerprint);
    batch=[];
  }
  for(const item of changes){
    const candidate=renderStyledMessage_(batch.concat([item]).map(x=>x.event),false,true);
    if(candidate.htmlBody.length>45000 || candidate.body.length>45000){
      commit();
      const single=renderStyledMessage_([item.event],false,true);
      if(single.htmlBody.length>45000 || single.body.length>45000)throw new Error('One event exceeds delivery size limit');
    }
    batch.push(item);
  }
  commit();
}

function checkLms() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return;
  const store=PropertiesService.getScriptProperties();
  let subscribersEnabled=store.getProperty('SUBSCRIBER_ALERTS_ENABLED')==='true';
  let controlReady=false;
  try {
    if(store.getProperty('SUBSCRIBERS_SHEET_ID')){
      mcSetup_();const schedules=mcEnsureTriggers_();mcCommands_();controlReady=true;
      subscribersEnabled=store.getProperty('SUBSCRIBER_ALERTS_ENABLED')==='true';
      mcSafeHealth_({lastCheck:Date.now(),workerSeen:Date.now(),...schedules,status:'checking',ownerEmail:store.getProperty(EMAIL_KEY)||'',mailRemaining:MailApp.getRemainingDailyQuota()});
    }
    const url=store.getProperty(LMS_URL_KEY), email=store.getProperty(EMAIL_KEY);
    const ownerEnabled=store.getProperty('OWNER_ALERTS_ENABLED')!=='false';
    if(!url || (ownerEnabled && !email))throw new Error('Configure LMS_ICAL_URL and ALERT_EMAIL privately.');
    const fetched=mcFetch_(url);
    if(!fetched.ok){const error=new Error(fetched.message);error.monitorCode=fetched.code;throw error;}
    const ics=fetched.ics;
    if(controlReady)mcSafeHealth_({calendarStatus:'ok',calendarTestedAt:Date.now(),calendarHost:'lms.sltc.ac.lk'});
    const blocks=ics.replace(/\r?\n[ \t]/g,'').match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)||[];
    const initialized=store.getProperty('LMS_INITIALIZED')==='yes';
    const updates=[],alerts=[],subscriberChanges=[];
    for(const block of blocks){
      const uid=getField(block,'UID'),rawTitle=getField(block,'SUMMARY');if(!uid||!rawTitle)continue;
      const start=getField(block,'DTSTART'),end=getField(block,'DTEND');
      // EXACT legacy hash inputs/keys: upgrading does not replay the calendar.
      const legacyTitle=rawTitle.replace(/\\n/gi,' ').replace(/\\,/g,',');
      const key='EVT_'+hashText(uid),fingerprint=hashText(JSON.stringify([legacyTitle,start,end]));
      const previous=store.getProperty(key);if(previous===fingerprint)continue;
      const event={status:previous?'UPDATED':'NEW',title:decodeIcs(rawTitle).replace(/\s+/g,' '),
        when:formatSriLankaTime(start,getStartTimezone(block)),
        description:decodeIcs(getField(block,'DESCRIPTION')).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,280),
        url:safeEventUrl(getField(block,'URL'))};
      if(initialized){
        alerts.push(event);
        if(subscribersEnabled && store.getProperty('SUB_'+key)!==fingerprint)
          subscriberChanges.push({key:key,fingerprint:fingerprint,event:event});
      }
      updates.push({key:key,fingerprint:fingerprint});
    }
    if(initialized && alerts.length){
      if(subscribersEnabled){
        enqueueStyledSubscriberChanges_(subscriberChanges,store);
      }
      if(ownerEnabled)sendStyledEmail(alerts,false);
    }
    // Store only after durable queue insertion / original owner send succeeds.
    for(const item of updates)store.setProperty(item.key,item.fingerprint);
    store.setProperty('LMS_INITIALIZED','yes');
    store.setProperty('MONITOR_FAILURES','0');
    if(controlReady){mcSafeHealth_({lastSuccess:Date.now(),status:'healthy',lastError:'',lastErrorCode:'',consecutiveFailures:0,eventCount:blocks.length,changedEvents:alerts.length});mcFinishCommands_(true,'Calendar check completed. Eligible alerts were queued.');}
    console.log('LMS check complete. Events: '+blocks.length+' | New/updated: '+alerts.length);
  } catch(error){
    const failures=Number(store.getProperty('MONITOR_FAILURES')||0)+1;store.setProperty('MONITOR_FAILURES',String(failures));
    if(controlReady){const failure=mcFailure_(error);const patch={lastFailure:Date.now(),status:'attention',lastError:failure.message,lastErrorCode:failure.code,consecutiveFailures:failures};if(error.monitorCode)patch.calendarStatus=error.monitorCode;mcSafeHealth_(patch);mcFinishCommands_(false,failure.message);}
    throw error;
  } finally {
    try {
      // Exactly one drain per run, including unchanged/failed calendar fetches.
      // The existing monitor lock is already held; do not acquire it again.
      if(subscribersEnabled){const delivered=sbDrainUnlocked_();if(controlReady)mcSafeHealth_({mailRemaining:MailApp.getRemainingDailyQuota(),lastBatchSent:delivered.sent||0,queueSendFailures:delivered.failed||0});}
    } finally {lock.releaseLock();}
  }
}

function setupAlerts() {
  checkLms();
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='checkLms');
  if(!existing.length)ScriptApp.newTrigger('checkLms').timeBased().everyMinutes(15).create();
  // Existing triggers are left unchanged; no repeated activation email.
}
function sendPreviewEmail() {
  const tomorrow=new Date(Date.now()+86400000);
  sendStyledEmail([{status:'NEW',title:'Sample Assignment - Project Report Submission',
    when:Utilities.formatDate(tomorrow,TIME_ZONE,"EEE, dd MMM yyyy 'at' hh:mm a")+' (Sri Lanka Time)',
    description:'This is a design preview only. No real assignment was detected. Your actual alerts will appear in this format.',url:LMS_HOME}],true);
  // Owner only: previews are never enqueued for subscribers.
}
