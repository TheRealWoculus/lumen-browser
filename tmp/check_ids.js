const fs=require('fs');
const h=fs.readFileSync('app/renderer/index.html','utf8');
const ids=[];
const re=/id="([^"]+)"/g;
let m;
while((m=re.exec(h))!==null){ids.push(m[1]);}
const seen={};
const dups=[];
ids.forEach(id=>{if(seen[id]){dups.push(id);}seen[id]=true;});
console.log('Size:', h.length, 'IDs:', ids.length, 'Dups:', dups.length?[...new Set(dups)].join(', '):'none');
