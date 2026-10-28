// Build a browser-openable preview from the actual Apps Script UI.
// This preview has no backend and never sends or stores email addresses.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const boot = Buffer.from(JSON.stringify({
  action: '', id: '', token: '', challenge: '', siteKey: '',
  contact: 'Organiser contact will be configured before deployment', enabled: true
})).toString('base64');
const previewAdapter = `<script>
window.google = { script: { run: {
  withSuccessHandler(callback) {
    return { withFailureHandler() {
      return { requestSignup() {
        callback({ok:true,message:'Preview only — no email was sent or saved. Google Apps Script deployment is needed to enable confirmation emails.'});
      }};
    }};
  }
}}};
</script>`;
let html = fs.readFileSync(path.join(root, 'signup', 'Index.html'), 'utf8');
html = html.replace('<?!= boot ?>', boot)
  .replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1">')
  .replace('<body>', '<body><div role="note" style="padding:12px 18px;text-align:center;background:#182943;color:white;font:13px system-ui;line-height:1.6">Local preview · Email sending activates after Google Apps Script deployment.<br>මේ preview එකෙන් email යවන්නේ හෝ save කරන්නේ නැහැ.</div>')
  .replace('<script>', previewAdapter + '\n<script>');
for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
if (html.includes('<?')) throw new Error('Unresolved Apps Script template tag');
fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('Created index.html local preview. No live email service is connected.');
