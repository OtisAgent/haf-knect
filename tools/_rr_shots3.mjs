import { chromium } from 'playwright';
const URL=process.argv[2]||'https://return-route.knect-demo.pages.dev/';
const b=await chromium.launch();
for(const [w,h,tag] of [[1440,1000,'desktop'],[390,844,'phone']]){
  const pg=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
  await pg.waitForSelector('#ag-code',{timeout:30000});
  await pg.fill('#ag-code','HAFLAUNCH');
  await pg.click('#ag-submit');
  await pg.waitForTimeout(700);
  const gateGone=await pg.evaluate(()=>{const g=document.getElementById('access-gate');return g.style.display==='none';});
  await pg.evaluate(()=>window.demoLogin('DEMO-DRV'));
  await pg.waitForTimeout(1200);
  for(const tier of ['PLUS','PRO']){
    await pg.evaluate(t=>{const btns=[...document.querySelectorAll('#dash-return .rr-demo .dmsw-b')];const m=btns.find(b=>b.textContent.trim().toUpperCase()===t);if(m)m.click();},tier);
    await pg.waitForTimeout(600);
    const el=await pg.$('#dash-return');
    await el.scrollIntoViewIfNeeded();
    await pg.waitForTimeout(250);
    await el.screenshot({path:`_rb_${tier.toLowerCase()}_${tag}.png`});
  }
  console.log(JSON.stringify({tag,gateGone,errors:errs}));
  await pg.close();
}
await b.close();
