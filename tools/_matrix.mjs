import { chromium } from 'playwright-core';
const EXE='/agent/home/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:1000}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://knect.usehaf.co.uk/',{waitUntil:'networkidle'});
const rows=await p.evaluate(async()=>{
  const out=[];
  for(const w of ['w50','w100','w250','w500','w1000']){
    for(const s of ['s1','s2','s3','s4','s5']){
      document.querySelector('#wt-pills [data-wt="'+w+'"]').click();
      document.querySelector('#sz-pills [data-sz="'+s+'"]').click();
      const sel=document.querySelector('#van-pills .vp.sel');
      const dis=[...document.querySelectorAll('#van-pills .vcard')].filter(c=>c.classList.contains('off')||c.disabled||c.classList.contains('dim')).length;
      out.push({w,s,van:sel?sel.querySelector('.vp-n').textContent.trim():'NONE',
                note:(document.getElementById('ld-note')||{}).innerText||'',ruledOut:dis});
    }
  }
  return out;
});
for(const r of rows) console.log(r.w.padEnd(6),r.s,'→',(r.van||'').padEnd(22),'ruled out:'+r.ruledOut,'|',r.note.replace(/\s+/g,' ').slice(0,90));
const none=rows.filter(r=>r.van==='NONE');
console.log('\ncombinations with no van at all:',none.length);
console.log('page errors:',errs.length?errs.join(' | '):'none');
await b.close();
