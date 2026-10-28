// Build the real GitHub Pages UI from the shared layout (not the demo adapter).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'signup/Index.html'),'utf8').split('<script>')[0];
html=html.replace('<head>','<head><meta name="viewport" content="width=device-width, initial-scale=1"><title>SLTC LMS Alerts — Student Signup</title><meta name="description" content="Voluntary shared SLTC LMS calendar alerts for university email accounts. Confirm your email, receive updates, and unsubscribe anytime.">');
html=html.replace('<details>','<div id="connectionHelp" class="muted" hidden><button id="retryConnection" type="button">Retry connection</button><p><a id="directSignup" target="_blank" rel="noopener noreferrer">Open signup in a new tab</a></p></div><details>');
html=html.replace('<button id="submit" type="submit">','<button id="submit" type="submit" disabled>');
html=html.replace('<button id="action" type="button" hidden>','<button id="action" type="button" hidden disabled>');
html+='\n<noscript><p style="padding:20px;text-align:center">Please enable JavaScript to verify your university email.</p></noscript>\n<script src="./assets/app.js" defer></script></body></html>\n';
if(html.includes('<?') || html.includes('Preview only'))throw Error('Demo/template content leaked into production site');
new vm.Script(fs.readFileSync(path.join(root,'assets/app.js'),'utf8'));
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'.nojekyll'),'');
console.log('Built production GitHub Pages signup UI.');
