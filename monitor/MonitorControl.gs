/* Private worker: consumes authenticated admin commands via the private Sheet.
 * Never deploy this monitor as a public web app.
 */
const MC_HEADERS_=['id','createdAt','kind','payload','status','message','finishedAt'];
function mcSetup_(){const b=sbBook_();mcSheet_(b,'AdminCommands',MC_HEADERS_);mcSheet_(b,'MonitorHealth',['key','value']);}
function mcSheet_(b,n,h){let s=b.getSheetByName(n);if(!s){s=b.insertSheet(n);s.appendRow(h);s.setFrozenRows(1);}if(JSON.stringify(s.getRange(1,1,1,h.length).getValues()[0])!==JSON.stringify(h))throw new Error('Control schema mismatch');return s;}
function mcHealth_(patch){
  const s=mcSheet_(sbBook_(),'MonitorHealth',['key','value']),rows=sbRows_(s,2),health={};rows.forEach(r=>health[String(r[0])]=r[1]);
  Object.assign(health,patch);const data=Object.entries(health);if(data.length)s.getRange(2,1,data.length,2).setValues(data);SpreadsheetApp.flush();
}
function mcSafeHealth_(patch){try{mcHealth_(patch);}catch(_){}}
function mcEnsureTriggers_(){
  let triggers=ScriptApp.getProjectTriggers();
  if(!triggers.some(t=>t.getHandlerFunction()==='checkLms'))ScriptApp.newTrigger('checkLms').timeBased().everyMinutes(15).create();
  if(!triggers.some(t=>t.getHandlerFunction()==='monitorMaintenance'))ScriptApp.newTrigger('monitorMaintenance').timeBased().everyMinutes(5).create();
  triggers=ScriptApp.getProjectTriggers();return {mainTriggers:triggers.filter(t=>t.getHandlerFunction()==='checkLms').length,controlTriggers:triggers.filter(t=>t.getHandlerFunction()==='monitorMaintenance').length};
}
function mcCalendarUrl_(url){return typeof url==='string'&&url.length<=4000&&!/[\s<>\x00]/.test(url)&&/^https:\/\/lms\.sltc\.ac\.lk\/calendar\/(?:export_execute|export|ical)\.php\?[^#]+$/i.test(url);}
function mcFetch_(url){
  if(!/^https:\/\/lms\.sltc\.ac\.lk\//i.test(url||''))return {ok:false,code:'INVALID_CALENDAR',message:'Configure a valid private SLTC calendar link.'};
  try{const r=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false}),body=r.getContentText('UTF-8');
    if(r.getResponseCode()===200&&body.includes('BEGIN:VCALENDAR'))return {ok:true,ics:body};
    return {ok:false,code:'CALENDAR_UNAVAILABLE',message:'The calendar link is expired, requires login, or the LMS returned an error. Test or replace the link.'};
  }catch(_){return {ok:false,code:'LMS_UNREACHABLE',message:'The LMS could not be reached. The next scheduled run will retry.'};}
}
function mcRetryQueue_(){const s=sbQueue_(),rows=sbRows_(s,SB_HEADERS_.length);let count=0;rows.forEach((r,i)=>{if(r[7]==='failed'&&Date.now()-Number(r[1])<=7*86400000){r[7]='pending';r[9]=0;sbSave_(s,i,r);count++;}});return count;}
function mcCommands_(){
  const s=mcSheet_(sbBook_(),'AdminCommands',MC_HEADERS_),rows=sbRows_(s,7),p=sbProps_();let run=false,retry=false;
  rows.forEach((r,i)=>{
    if(r[4]!=='queued')return;
    if(Date.now()-Number(r[1])>86400000){r[3]='';r[4]='expired';r[5]='Expired before processing. Submit a new request.';r[6]=Date.now();s.getRange(i+2,1,1,7).setValues([r]);return;}
    try{
      if(r[2]==='UPDATE_CALENDAR'){
        const url=JSON.parse(r[3]||'{}').url;
        if(!mcCalendarUrl_(url))throw new Error('Invalid link');
        const test=mcFetch_(url);if(!test.ok)throw new Error('Calendar unavailable');
        p.setProperty('LMS_ICAL_URL',url);mcSafeHealth_({calendarUpdatedAt:Date.now(),calendarHost:'lms.sltc.ac.lk',calendarStatus:'ok'});
        run=true;r[4]='running';r[5]='New link validated and saved. Checking calendar.';
      }else if(r[2]==='TEST_CONNECTION'){
        const test=mcFetch_(p.getProperty('LMS_ICAL_URL'));
        mcSafeHealth_({calendarTestedAt:Date.now(),calendarStatus:test.ok?'ok':test.code});
        r[4]=test.ok?'done':'failed';r[5]=test.ok?'The current calendar link is reachable and valid.':test.message;
      }else if(r[2]==='RUN_CHECK'){run=true;r[4]='running';r[5]='Calendar check requested.';
      }else if(r[2]==='RETRY_QUEUE'){const count=mcRetryQueue_();retry=true;r[4]='done';r[5]=count+' failed jobs made retryable. Sending remains subject to quota.';
      }else if(r[2]==='REPAIR'){mcEnsureTriggers_();mcRetryQueue_();retry=true;run=true;r[4]='running';r[5]='Schedules checked and failed jobs made retryable. Checking calendar.';
      }else throw new Error('Unsupported command');
    }catch(_){r[4]='failed';r[5]='Action failed. Check the calendar link and connection; the old link is kept if the replacement was invalid.';}
    // Never retain a private calendar token in processed command history.
    r[3]='';r[6]=r[4]==='running'?'':Date.now();s.getRange(i+2,1,1,7).setValues([r]);
  });
  // Keep a bounded 30-day history; active commands are never pruned.
  for(let i=rows.length-1;i>=0;i--)if(!['queued','running'].includes(rows[i][4])&&Date.now()-Number(rows[i][1])>30*86400000)s.deleteRow(i+2);
  SpreadsheetApp.flush();return {run,retry};
}
function mcFinishCommands_(ok,message){
  try{const s=mcSheet_(sbBook_(),'AdminCommands',MC_HEADERS_),rows=sbRows_(s,7);rows.forEach((r,i)=>{if(r[4]==='running'){r[3]='';r[4]=ok?'done':'failed';r[5]=message;r[6]=Date.now();s.getRange(i+2,1,1,7).setValues([r]);}});SpreadsheetApp.flush();}catch(_){}
}
function mcFailure_(error){
  const message=String(error?.message||'');
  if(message.startsWith('Owner notification failed'))return {code:'MAIL_DELIVERY',message:'Owner email could not be sent. Check quota and recipient settings.'};
  return {code:error?.monitorCode||'CHECK_FAILED',message:error?.monitorCode?message:'Monitor check failed. Test the connection and check the email quota.'};
}
function monitorMaintenance(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;let commands={run:false,retry:false};
  try{mcSetup_();const schedules=mcEnsureTriggers_();commands=mcCommands_();
    mcSafeHealth_({workerSeen:Date.now(),...schedules,mailRemaining:MailApp.getRemainingDailyQuota(),ownerEmail:sbProps_().getProperty('ALERT_EMAIL')||'',calendarHost:'lms.sltc.ac.lk'});
    if(commands.retry&&!commands.run)sbDrainUnlocked_();
  }finally{lock.releaseLock();}
  if(commands.run)checkLms();
}
