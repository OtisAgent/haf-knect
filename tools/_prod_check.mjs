import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/agent/home/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args:['--no-sandbox'] });
const errs=[];
for (const [n,vp] of [['desktop',{width:1440,height:1000}],['phone',{width:390,height:844}]]) {
  const p = await b.newPage({viewport:vp});
  p.on('pageerror',e=>errs.push(n+': '+e.message));
  await p.goto('https://knect.usehaf.co.uk/',{waitUntil:'networkidle'});
  const r = await p.evaluate(async () => {
    document.getElementById('pc-from').value='S9 1AA';
    document.getElementById('pc-to').value='M1 1AA';
    document.querySelector('#wt-pills [data-wt="w250"]').click();
    document.querySelector('#sz-pills [data-sz="s3"]').click();
    await calcLivePrice();
    return {
      wt:document.querySelectorAll('#wt-pills .lp-tile').length,
      sz:document.querySelectorAll('#sz-pills .lp-tile').length,
      van:document.querySelector('#van-pills .vp.sel').textContent.trim().slice(0,40),
      note:document.getElementById('ld-note').innerText,
      price:document.getElementById('lp-range').textContent,
      info:document.getElementById('lp-info').textContent,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    };
  });
  console.log(n, JSON.stringify(r,null,1));
  await p.screenshot({path:'/agent/workspace/haf-knect/_prod_'+n+'.png'});
  await p.close();
}
await b.close();
console.log(errs.length?'ERRORS: '+errs.join(' | '):'no page errors');
