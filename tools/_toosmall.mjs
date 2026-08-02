import { chromium } from 'playwright-core';
const EXE='/agent/home/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell';
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('https://knect.usehaf.co.uk/',{waitUntil:'networkidle'});
const r=await p.evaluate(async()=>{
  const out=[];
  for(const [w,s] of [['w50','s1'],['w500','s3'],['w1000','s5']]){
    document.querySelector('#wt-pills [data-wt="'+w+'"]').click();
    document.querySelector('#sz-pills [data-sz="'+s+'"]').click();
    out.push({w,s,tooSmall:[...document.querySelectorAll('#van-pills .toosmall')].map(c=>c.querySelector('.vp-n').textContent.trim())});
  }
  return out;
});
console.log(JSON.stringify(r,null,1));
await b.close();
