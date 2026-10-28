// Build the real GitHub Pages UI from the shared layout (not the demo adapter).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function securedPage(file){
  let html=fs.readFileSync(path.join(root,file),'utf8');
  const policy="default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-src https://script.google.com https://*.googleusercontent.com https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; base-uri 'none'; form-action 'none'; object-src 'none'; upgrade-insecure-requests";
  html=html.replace('<meta charset="UTF-8">','<meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'">');
  const integrity=(match,prefix,asset,quote,suffix)=>{const bytes=fs.readFileSync(path.join(root,asset.slice(2)));return prefix+asset+'?v='+crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12)+quote+' integrity="sha384-'+crypto.createHash('sha384').update(bytes).digest('base64')+'" crossorigin="anonymous"'+suffix;};
  html=html.replace(/(<script\b[^>]*\bsrc=")(\.\/assets\/[^"?]+\.js)(")([^>]*>)/g,integrity);
  html=html.replace(/(<link\b[^>]*\bhref=")(\.\/assets\/[^"?]+\.css)(")([^>]*>)/g,integrity);
  return html;
}
let html=securedPage('web/index.html');
if(html.includes('<?') || html.includes('Preview only'))throw Error('Demo/template content leaked into production site');
for(const file of ['assets/transport.js','assets/app.js','assets/admin.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));
fs.writeFileSync(path.join(root,'admin.html'),securedPage('web/admin.html'));
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'.nojekyll'),'');
console.log('Built production GitHub Pages signup UI.');
