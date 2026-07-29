const fs=require('fs');
const code=fs.readFileSync('app/renderer/app.js','utf8');
const html=fs.readFileSync('app/renderer/index.html','utf8');
const ids=[];
const re=/id="([^"]+)"/g;
let m;
while((m=re.exec(html))!==null){ids.push(m[1]);}
// Check each ID that looks like a settings input is referenced in app.js save handler
const settingsIds=ids.filter(id=>id.startsWith('set-')||id.startsWith('clear-')||id.startsWith('bm-'));
const missing=[];
settingsIds.forEach(id=>{
  if(id==='set-default-search'||id==='set-theme') return; // duplicate IDs but both in save/load
  if(!code.includes(id)) missing.push(id);
});
console.log('Settings IDs in HTML:', settingsIds.length);
console.log('Missing from app.js:', missing.length?missing.join(', '):'none');
