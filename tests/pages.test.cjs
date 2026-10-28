const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),origin='https://cit-24-01-0476-maker.github.io';
const client=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const bridge=fs.readFileSync(path.join(root,'signup/Bridge.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
let checks=0;async function check(name,f){await f();checks++;console.log('PASS',name);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function frontend(hash=''){
  const elements=new Map(),frames=[],timers=new Map(),events={};let sequence=0;
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',value:'',checked:false});return elements.get(id);};
  const context=vm.createContext({console,URL,URLSearchParams,crypto:crypto.webcrypto,location:{origin,hash,search:'',pathname:'/SLTC-LMS-Email-Alert-System/'},history:{replaceState(){context.hashRemoved=true;}},document:{getElementById:get,createElement:type=>({type,setAttribute(name,value){this[name]=value;},remove(){}}),body:{appendChild:frame=>frames.push(frame)},head:{appendChild(){}}},setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  context.window=context;context.addEventListener=(type,fn)=>events[type]=fn;
  vm.runInContext(fs.readFileSync(path.join(root,'assets/transport.js'),'utf8'),context);
  vm.runInContext(client,context);
  const nonce=()=>new URL(frames.at(-1).src).searchParams.get('channel');
  const sent=[],peer={postMessage:(message,target)=>sent.push({message,target})};
  const receive=(data,source=peer,eventOrigin='https://n-test-script.googleusercontent.com')=>events.message({origin:eventOrigin,source,data:{app:'sltc-alerts',channel:nonce(),...data}});
  const ready=enabled=>{receive({type:'ready',config:{challenge:'signed-form-proof',contact:'Reply to a confirmation email.',siteKey:'',enabled}});for(const [id,t]of timers)if(t.ms===1700){timers.delete(id);t.fn();}};
  return {context,get,frames,events,nonce,peer,sent,receive,ready};
}
async function main(){
await check('GitHub production page contains the real app, not a fake-success preview',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(html.includes('./assets/app.js'));assert(!html.includes('Preview only'));assert(!html.includes('<?'));assert(!html.includes('google.script.run'));assert(html.includes('University email'));assert(fs.existsSync(path.join(root,'.nojekyll')));
});
await check('Backend bridge rejects wrong parent origins and malformed channel tokens',()=>{
  const props={SIGNING_SECRET:'k'.repeat(96),SIGNUPS_ENABLED:'true'};let template;
  const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()],base64Encode:s=>Buffer.from(s).toString('base64'),Charset:{UTF_8:'utf8'}},HtmlService:{XFrameOptionsMode:{ALLOWALL:'allow'},createHtmlOutput:body=>({body}),createTemplateFromFile:()=>{template={evaluate:()=>({setTitle(){return this;},setXFrameOptionsMode(mode){this.mode=mode;return this;}})};return template;}}});
  vm.runInContext(fs.readFileSync(path.join(root,'signup/Code.gs'),'utf8'),ctx);
  assert(ctx.saBridge_({parentOrigin:'https://evil.example',channel:'a'.repeat(64)}).body.includes('Invalid'));
  assert(ctx.saBridge_({parentOrigin:origin,channel:'bad'}).body.includes('Invalid'));
  assert.equal(ctx.saBridge_({parentOrigin:origin,channel:'a'.repeat(64)}).mode,'allow');
  const boot=JSON.parse(Buffer.from(template.boot,'base64').toString());assert(boot.enabled);assert(!JSON.stringify(boot).includes(props.SIGNING_SECRET));assert(!('emails'in boot));
});
await check('Bridge accepts only the exact parent window, origin, nonce and student method whitelist',()=>{
  const messages=[],calls=[],handlers={};const top={postMessage:(message,target)=>messages.push({message,target})};
  const boot={parentOrigin:origin,channel:'a'.repeat(64),challenge:'proof',siteKey:'',contact:'Organiser',enabled:true};
  const chain={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},requestSignup(input){calls.push(input);this.success({ok:true,message:'Check your inbox.'});},confirmSubscription(){calls.push('confirm');},unsubscribe(){calls.push('unsubscribe');}};
  const window={top,addEventListener:(name,fn)=>handlers[name]=fn};
  const c=vm.createContext({window,google:{script:{run:chain}},atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder});
  vm.runInContext(bridge.replace('<?!= boot ?>',Buffer.from(JSON.stringify(boot)).toString('base64')),c);
  const data={app:'sltc-alerts',type:'request',channel:boot.channel,requestId:crypto.randomUUID(),method:'requestSignup',args:[{email:'a@sltc.ac.lk'}]};
  handlers.message({origin:'https://evil.example',source:top,data});
  handlers.message({origin,source:{},data});
  handlers.message({origin,source:top,data:{...data,channel:'b'.repeat(64)}});assert.equal(calls.length,0);
  handlers.message({origin,source:top,data:{...data,method:'finishSignupSetup'}});assert.equal(calls.length,0);
  handlers.message({origin,source:top,data});assert.equal(calls.length,1);assert(messages.every(m=>m.target===origin));
});
await check('Frontend requests a cookie-free iframe and rejects forged ready packets',()=>{
  const app=frontend();assert.equal(app.frames[0].credentialless,'');assert(app.get('submit').disabled);
  const config={challenge:'proof',enabled:true,siteKey:'',contact:'Organiser'};
  app.receive({type:'ready',config},app.peer,'https://script.google.com.evil.example');
  app.receive({type:'ready',config,channel:'f'.repeat(64)});assert(app.get('submit').disabled);
  app.ready(true);assert(!app.get('submit').disabled);
});
await check('Signup result is shown only after a matching authenticated bridge response',async()=>{
  const app=frontend();app.ready(true);app.get('email').value='student@sltc.ac.lk';app.get('consent').checked=true;
  app.get('signup').onsubmit({preventDefault(){}});assert.equal(app.sent.length,1);
  const request=app.sent[0].message;assert.equal(request.method,'requestSignup');assert.equal(request.args[0].challenge,'signed-form-proof');assert.equal(request.args[0].email,'student@sltc.ac.lk');
  app.receive({type:'response',requestId:request.requestId,result:{ok:true,message:'Forged success'}},{postMessage(){}});await tick();assert(!app.get('status').textContent.includes('Forged'));
  app.receive({type:'response',requestId:request.requestId,result:{ok:true,message:'Check your inbox.'}});await tick();assert.equal(app.get('status').textContent,'Check your inbox.');
});
await check('Opening an unsubscribe link performs no mutation, even when signups are paused',async()=>{
  const id=crypto.randomUUID(),token='e'.repeat(64);const app=frontend('#action=unsubscribe&id='+id+'&token='+token);
  assert(app.context.hashRemoved);assert.equal(app.sent.length,0);app.ready(false);assert(!app.get('action').disabled);assert(app.get('submit').disabled);
  app.get('action').onclick();assert.equal(app.sent[0].message.method,'unsubscribe');assert.equal(app.sent[0].message.args[0],id);assert.equal(app.sent[0].message.args[1],token);
});
await check('Published browser code does not store emails/tokens or embed private subscriber configuration',()=>{
  assert(!client.includes('localStorage'));assert(!client.includes('sessionStorage'));assert(!client.includes('innerHTML'));assert(!client.includes('SIGNING_SECRET'));assert(!client.includes('SUBSCRIBERS_SHEET_ID'));
});
console.log(`${checks} GitHub Pages transport checks passed. Browser rendering and real mail delivery require a live acceptance test.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
