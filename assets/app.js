/* GitHub Pages UI. Google handles mail, consent records and verification. */
(() => {
  'use strict';
  const BACKEND='https://script.google.com/macros/s/AKfycbyZaJHwT6kUOyJO0_e7n5_UDY5yw85-0HlzoO7duriqKBAbkc3HMRQCOmqhOHnPIN0h/exec';
  const SITE_ORIGIN='https://cit-24-01-0476-maker.github.io';
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.hash ? location.hash.slice(1) : location.search);
  const action=/^(confirm|unsubscribe)$/.test(params.get('action')||'') ? params.get('action') : '';
  const id=params.get('id')||'',token=params.get('token')||'';
  const validLink=/^[a-f0-9-]{36}$/.test(id) && /^[a-f0-9]{64}$/.test(token);
  const pending=new Map();
  let channel='',peer=null,peerOrigin='',frame=null,config=null,connectTimer,readyTimer,widget,captchaToken='';
  function status(text){$('status').hidden=false;$('status').textContent=text;}
  function googleOrigin(origin){
    try{const u=new URL(origin);return u.protocol==='https:' && !u.port &&
      (u.hostname==='script.google.com'||u.hostname.endsWith('.googleusercontent.com'));}catch{return false;}
  }
  function randomHex(){return [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  function requestId(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
  function controls(){
    $('submit').disabled=!config || !config.enabled;
    $('action').disabled=!config || !validLink;
  }
  function failConnection(){
    clearTimeout(readyTimer);peer=null;config=null;controls();$('connectionHelp').hidden=false;
    status('The email service could not connect. Try Retry connection, or open this page in a private browser window.');
  }
  function connect(){
    clearTimeout(connectTimer);clearTimeout(readyTimer);
    for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('Connection restarted'));}pending.clear();
    peer=null;peerOrigin='';config=null;channel=randomHex();controls();$('connectionHelp').hidden=true;
    status('Connecting the email service…');
    if(frame)frame.remove();
    frame=document.createElement('iframe');frame.hidden=true;frame.title='Secure email verification';
    frame.setAttribute('credentialless','');frame.referrerPolicy='no-referrer';
    frame.src=BACKEND+'?mode=bridge&channel='+channel+'&parentOrigin='+encodeURIComponent(location.origin);
    document.body.appendChild(frame);connectTimer=setTimeout(failConnection,25000);
  }
  function call(method,args){
    return new Promise((resolve,reject)=>{
      if(!peer || !config)return reject(new Error('No email connection'));
      const key=requestId(),timer=setTimeout(()=>{pending.delete(key);reject(new Error('Request timed out'));},30000);
      pending.set(key,{resolve,reject,timer});
      peer.postMessage({app:'sltc-alerts',type:'request',channel,requestId:key,method,args},peerOrigin);
    });
  }
  function captcha(){
    if(!config?.siteKey || action)return;
    const render=()=>{if(widget!==undefined){turnstile.reset(widget);return;}
      widget=turnstile.render('#captcha',{sitekey:config.siteKey,action:'signup',size:'flexible',callback:t=>captchaToken=t,
        'expired-callback':()=>captchaToken='','error-callback':()=>{captchaToken='';status('Please retry the security check.');}});};
    if(window.turnstile)return render();
    if(document.getElementById('captchaScript'))return;
    window.onCaptchaLoad=render;
    const script=document.createElement('script');script.id='captchaScript';script.async=true;
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onCaptchaLoad&render=explicit';document.head.appendChild(script);
  }
  window.addEventListener('message',event=>{
    const data=event.data;
    if(!data || data.app!=='sltc-alerts' || data.channel!==channel || !googleOrigin(event.origin) || !event.source)return;
    if(data.type==='ready'){
      if(peer && (peer!==event.source || peerOrigin!==event.origin))return;
      const c=data.config;
      if(!c || typeof c.challenge!=='string' || c.challenge.length>160 || typeof c.enabled!=='boolean')return;
      peer=event.source;peerOrigin=event.origin;config=c;clearTimeout(connectTimer);$('connectionHelp').hidden=true;
      $('contact').textContent='Contact: '+String(c.contact||'Reply to your confirmation email.').slice(0,300);
      if(action){controls();status(validLink?'Your email link is ready. Press the button to continue.':'This link is invalid. Open the original email link again.');}
      else if(!c.enabled){controls();status('Signups are temporarily paused. Please try again later.');}
      else{status('Ready. Enter your university email to get started.');readyTimer=setTimeout(controls,1700);}
      captcha();return;
    }
    if(data.type!=='response' || event.source!==peer || event.origin!==peerOrigin)return;
    const entry=pending.get(data.requestId);if(!entry)return;
    pending.delete(data.requestId);clearTimeout(entry.timer);
    if(!data.result || typeof data.result.ok!=='boolean' || typeof data.result.message!=='string')return entry.reject(new Error('Invalid response'));
    entry.resolve({ok:data.result.ok,message:data.result.message.slice(0,600)});
  });
  async function submit(method,args){
    $('submit').disabled=true;$('action').disabled=true;status('Processing your request…');
    try{
      const result=await call(method,args);status(result.message);controls();
      if(result.ok && action)$('action').hidden=true;
    }catch{status('We could not confirm the result. Please check your inbox, or try again later.');controls();}
    finally{captchaToken='';if(window.turnstile && widget!==undefined)turnstile.reset(widget);}
  }
  if(action){
    $('signup').hidden=true;$('action').hidden=false;
    const confirming=action==='confirm';
    $('formTitle').textContent=confirming?'Confirm your subscription':'Leave LMS Alerts';
    $('description').textContent=confirming?'Only confirm if you requested shared course alerts.':'Press below to remove your subscriber record and stop future alerts.';
    $('action').textContent=confirming?'Confirm subscription':'Unsubscribe';
    $('action').onclick=()=>submit(confirming?'confirmSubscription':'unsubscribe',[id,token]);
    history.replaceState(null,'',location.pathname+location.search);
  }
  $('signup').onsubmit=event=>{
    event.preventDefault();
    const email=$('email').value.trim();
    if(!/^[a-z0-9][a-z0-9._+-]{0,63}@sltc\.ac\.lk$/i.test(email)){status('Please use your @sltc.ac.lk university email.');return;}
    if(!$('consent').checked){status('Please tick the consent checkbox first.');return;}
    if(config?.siteKey && !captchaToken){status('Please complete the security check.');return;}
    submit('requestSignup',[{email,consent:true,website:$('website').value,challenge:config?.challenge||'',captcha:captchaToken}]);
  };
  $('retryConnection').onclick=connect;$('directSignup').href=BACKEND;
  controls();
  if(location.origin!==SITE_ORIGIN){status('Open the published website to use email signup.');$('connectionHelp').hidden=false;$('retryConnection').hidden=true;}
  else connect();
})();
