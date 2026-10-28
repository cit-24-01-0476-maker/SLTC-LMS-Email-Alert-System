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
  let config=null,readyTimer,widget,captchaToken='',visitTimer;
  const visitorId=SLTCConnection.uuid();
  function status(text){$('status').hidden=false;$('status').textContent=text;}
  function controls(){$('submit').disabled=!config||!config.enabled;$('action').disabled=!config||!validLink;}
  function failConnection(){clearTimeout(readyTimer);config=null;controls();$('connectionHelp').hidden=false;status('The email service could not connect. Retry, or try a private browser window.');}
  function connect(){clearTimeout(readyTimer);config=null;controls();$('connectionHelp').hidden=true;status('Connecting the email service…');connection.connect();}
  function call(method,args){return connection.call(method,args);}
  function visit(){if(document.visibilityState==='visible'&&config)call('recordVisit',[visitorId,config.challenge]).catch(()=>{});}
  function onReady(c){
    config=c;$('connectionHelp').hidden=true;$('contact').textContent='Contact: '+String(c.contact||'Reply to a confirmation email.').slice(0,300);
    if(action){controls();status(validLink?'Your email link is ready. Press the button to continue.':'This link is invalid. Open the original email link again.');}
    else if(!c.enabled){controls();status('Signups are temporarily paused. Please try again later.');}
    else{status('Ready. Enter your university email to get started.');readyTimer=setTimeout(controls,1700);}
    if(document.visibilityState==='visible'){setTimeout(visit,1900);if(!visitTimer)visitTimer=setInterval(visit,120000);}
    captcha();
  }
  const connection=new SLTCConnection({onReady,onError:failConnection});
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
