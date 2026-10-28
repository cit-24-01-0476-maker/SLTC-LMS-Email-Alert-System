// Build the real GitHub Pages UI from the shared layout (not the demo adapter).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
if(html.includes('<?') || html.includes('Preview only'))throw Error('Demo/template content leaked into production site');
for(const file of ['assets/transport.js','assets/app.js','assets/admin.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));
fs.writeFileSync(path.join(root,'admin.html'),fs.readFileSync(path.join(root,'web/admin.html'),'utf8')); 
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'.nojekyll'),'');
console.log('Built production GitHub Pages signup UI.');
