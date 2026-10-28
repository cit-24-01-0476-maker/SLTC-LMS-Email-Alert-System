(() => {
  'use strict';
  const $=id=>document.getElementById(id),storageKey='sltc-admin-session';
  let session=null,subscribers=[],pollTimer,expiryTimer,connected=false,busy=false;
  const date=value=>Number(value)?new Intl.DateTimeFormat('en-LK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Colombo'}).format(new Date(Number(value))):'Not reported yet';
  const names={UPDATE_CALENDAR:'Update calendar link',TEST_CONNECTION:'Test connection',RUN_CHECK:'Check calendar',RETRY_QUEUE:'Retry alerts',REPAIR:'Repair monitor'};
  function message(text,error=false){$('adminStatus').textContent=text;$('adminStatus').classList.toggle('error',error);}
  function saveSession(value){session=value;try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch(_){};}
  function forget(){saveSession(null);subscribers=[];$('subscriberRows').textContent='';$('commandRows').textContent='';$('calendarUrl').value='';$('adminCode').value='';$('subscriberSearch').value='';for(const id of ['ownerEmail','lastSuccess','lastWorker','calendarState','scheduleState','quotaState','healthMessage','healthBadge','confirmedCount','pendingCount','activeCount','queueCount','failedCount','lastRefresh','sessionInfo'])$(id).textContent='';$('dashboard').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;$('sessionInfo').hidden=true;if(pollTimer)clearInterval(pollTimer);clearTimeout(expiryTimer);pollTimer=null;}
  function buttons(disabled){busy=disabled;document.querySelectorAll('.command,#saveCalendar,#refresh').forEach(b=>b.disabled=disabled);}
  async function api(method,args){const result=await connection.call(method,args);if(!result.ok){if(result.error==='UNAUTHENTICATED'&&method!=='adminLogin'&&session?.token===args[0])forget();throw new Error(result.message||'Please try again later.');}return result.data;}
  function cell(row,text){const td=document.createElement('td');td.textContent=text;row.appendChild(td);return td;}
  function badge(status){const span=document.createElement('span');span.className='badge '+(['confirmed','done'].includes(status)?'success':['pending','queued','running'].includes(status)?'warning':status==='failed'?'danger':'muted-badge');span.textContent=status?status.charAt(0).toUpperCase()+status.slice(1):'Unknown';return span;}
  function renderSubscribers(){
    const query=$('subscriberSearch').value.trim().toLowerCase(),rows=subscribers.filter(r=>r.email.toLowerCase().includes(query));
    $('subscriberRows').textContent='';
    rows.forEach(item=>{const row=document.createElement('tr');cell(row,item.email);cell(row,'').appendChild(badge(item.status));cell(row,date(item.createdAt));cell(row,item.confirmedAt?date(item.confirmedAt):'—');$('subscriberRows').appendChild(row);});
    $('subscriberEmpty').hidden=rows.length>0;
  }
  function render(data){
    subscribers=data.subscribers||[];const counts=data.counts||{},h=data.health||{};
    $('confirmedCount').textContent=counts.confirmed??0;$('pendingCount').textContent=counts.pending??0;$('activeCount').textContent=counts.activeVisits??0;$('queueCount').textContent=counts.queuePending??0;
    $('failedCount').textContent=(counts.queueFailed||0)+' failed · '+(counts.queueExpired||0)+' expired';
    const stale=Number(h.workerSeen)&&Date.now()-Number(h.workerSeen)>1200000;
    let state=!h.workerSeen?'Waiting for first sync':stale?'Worker offline':(h.lastError||(h.calendarStatus&&h.calendarStatus!=='ok'))?'Needs attention':h.lastSuccess?'Healthy':'Waiting for calendar check';
    $('healthBadge').textContent=state;$('healthBadge').className='badge '+(state==='Healthy'?'success':stale?'danger':'warning');
    $('healthMessage').textContent=stale?'The control worker has not checked in recently. Repair can run when a schedule resumes; use recovery setup if both schedules were removed.':h.lastError||(h.calendarStatus&&h.calendarStatus!=='ok'?'Calendar access needs attention. Test or replace the export link.':null)||(!h.workerSeen?'The existing monitor normally starts the new control worker on its next 15-minute run.':'The control worker is connected. Calendar status updates after each check.');
    $('lastSuccess').textContent=date(h.lastSuccess);$('lastWorker').textContent=date(h.workerSeen);
    $('calendarState').textContent=h.calendarStatus==='ok'?'Reachable':h.calendarStatus?'Test or replace link':'Not tested yet';
    $('scheduleState').textContent=(h.mainTriggers??'—')+' / '+(h.controlTriggers??'—');$('quotaState').textContent=h.mailRemaining??'—';$('ownerEmail').textContent=h.ownerEmail||'Not reported yet';
    $('recoveryLink').hidden=!data.recoveryUrl;$('recoveryHint').hidden=!data.recoveryUrl||!stale;
    if(data.recoveryUrl&&/^https:\/\/script\.google\.com\//.test(data.recoveryUrl))$('recoveryLink').href=data.recoveryUrl;
    $('lastRefresh').textContent='Last refreshed '+date(data.serverTime)+' · Sri Lanka Time';
    $('commandRows').textContent='';
    (data.commands||[]).forEach(item=>{const row=document.createElement('tr');cell(row,names[item.kind]||'Admin action');cell(row,'').appendChild(badge(item.status));cell(row,date(item.createdAt));cell(row,item.message||'');$('commandRows').appendChild(row);});
    $('commandEmpty').hidden=(data.commands||[]).length>0;renderSubscribers();
  }
  async function refresh(showMessage=true){
    if(!session||!connected)return;
    if(Number(session.expires)<=Date.now()){forget();message('Session expired. Enter your admin code again.');return;}
    const current=session.token;
    try{const data=await api('adminState',[current]);if(!session||session.token!==current)return;render(data);if(showMessage)message('Dashboard is up to date.');}
    catch(error){message(error.message,true);}
  }
  async function enter(){
    $('loginPanel').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;$('sessionInfo').hidden=false;
    const current=session.token;clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{forget();message('Session expired. Enter your admin code again.');},Math.max(0,Number(session.expires)-Date.now()));
    $('sessionInfo').textContent='Session expires '+date(session.expires);await refresh();if(!session||session.token!==current)return;
    if(!pollTimer)pollTimer=setInterval(()=>{if(document.visibilityState==='visible'&&!busy)refresh(false);},60000);
  }
  const connection=new SLTCConnection({onReady:()=>{connected=true;$('loginButton').disabled=false;$('reconnect').hidden=true;message('Secure connection ready. Enter your admin code.');if(session)enter();},onError:()=>{connected=false;$('loginButton').disabled=true;$('reconnect').hidden=false;message('Connection unavailable. Retry, or open this page in a private window.',true);}});
  try{const stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(stored&&/^[a-f0-9]{64}$/.test(stored.token)&&Number(stored.expires)>Date.now())session=stored;}catch(_){}
  $('loginForm').onsubmit=async event=>{
    event.preventDefault();const code=$('adminCode').value.trim();if(!/^\d{6}$/.test(code)){message('Enter your six-digit admin code.',true);return;}
    $('loginButton').disabled=true;message('Signing in…');
    try{const data=await api('adminLogin',[code]);saveSession({token:data.token,expires:data.expires});await enter();}
    catch(error){message(error.message,true);}finally{$('adminCode').value='';$('loginButton').disabled=!connected;}
  };
  $('logout').onclick=()=>{const token=session?.token;forget();message('Signed out.');if(token)connection.call('adminLogout',[token]).catch(()=>{});};
  $('refresh').onclick=()=>refresh();$('subscriberSearch').oninput=renderSubscribers;$('reconnect').onclick=()=>{message('Reconnecting…');connection.connect();};
  async function queue(kind,payload={}){
    if(!session||busy)return;buttons(true);message('Submitting action…');
    try{await api('adminCommand',[session.token,kind,payload]);if(kind==='UPDATE_CALENDAR')$('calendarUrl').value='';await refresh(false);message('Action queued. It normally applies within 5 minutes. The action history will show the result.');}
    catch(error){message(error.message,true);}finally{buttons(false);}
  }
  document.querySelectorAll('.command').forEach(button=>button.onclick=()=>queue(button.dataset.command));
  $('calendarForm').onsubmit=event=>{event.preventDefault();queue('UPDATE_CALENDAR',{url:$('calendarUrl').value.trim()});};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&Number(session.expires)<=Date.now()){forget();message('Session expired. Enter your admin code again.');}});
  connection.connect();
})();
