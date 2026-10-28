/* Shared transport. No credentials are stored here. Backend auth is mandatory. */
(() => {
  'use strict';
  const BACKEND='https://script.google.com/macros/s/AKfycbyZaJHwT6kUOyJO0_e7n5_UDY5yw85-0HlzoO7duriqKBAbkc3HMRQCOmqhOHnPIN0h/exec';
  const ORIGIN='https://cit-24-01-0476-maker.github.io';
  const uuid=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
  const validOrigin=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&(u.hostname==='script.google.com'||u.hostname.endsWith('.googleusercontent.com'));}catch{return false;}};
  class SLTCConnection {
    constructor(options={}){this.options=options;this.pending=new Map();this.peer=null;this.origin='';this.channel='';this.frame=null;this.timer=null;
      window.addEventListener('message',event=>this.receive(event));}
    connect(){
      if(location.origin!==ORIGIN){this.options.onError?.();return;}
      clearTimeout(this.timer);for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('Connection restarted'));}this.pending.clear();
      this.peer=null;this.origin='';this.channel=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(this.frame)this.frame.remove();const frame=document.createElement('iframe');this.frame=frame;frame.hidden=true;
      frame.title='Secure university alerts connection';frame.setAttribute('credentialless','');frame.referrerPolicy='no-referrer';
      frame.src=BACKEND+'?mode=bridge&channel='+this.channel+'&parentOrigin='+encodeURIComponent(ORIGIN);document.body.appendChild(frame);
      this.timer=setTimeout(()=>{this.peer=null;this.options.onError?.();},25000);
    }
    receive(event){
      const data=event.data;if(!data||data.app!=='sltc-alerts'||data.channel!==this.channel||!validOrigin(event.origin)||!event.source)return;
      if(data.type==='ready'){
        if(this.peer&&(this.peer!==event.source||this.origin!==event.origin))return;
        const c=data.config;if(!c||typeof c.challenge!=='string'||c.challenge.length>160||typeof c.enabled!=='boolean')return;
        this.peer=event.source;this.origin=event.origin;clearTimeout(this.timer);this.options.onReady?.(c);return;
      }
      if(data.type!=='response'||event.source!==this.peer||event.origin!==this.origin)return;
      const item=this.pending.get(data.requestId);if(!item)return;this.pending.delete(data.requestId);clearTimeout(item.timer);
      if(!data.result||typeof data.result.ok!=='boolean'||typeof data.result.message!=='string')return item.reject(new Error('Invalid response'));
      item.resolve(data.result);
    }
    call(method,args){return new Promise((resolve,reject)=>{
      if(!this.peer)return reject(new Error('Not connected'));
      const requestId=uuid(),timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('Request timed out'));},35000);
      this.pending.set(requestId,{resolve,reject,timer});
      this.peer.postMessage({app:'sltc-alerts',type:'request',channel:this.channel,requestId,method,args},this.origin);
    });}
  }
  SLTCConnection.backend=BACKEND;SLTCConnection.uuid=uuid;window.SLTCConnection=SLTCConnection;
})();
