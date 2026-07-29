import { chromium } from 'playwright';
const URL=process.argv[2]||'https://return-route.knect-demo.pages.dev/';
const b=await chromium.launch();
for(const [w,h,tag] of [[1440,1000,'desktop'],[390,844,'phone']]){
  const pg=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  await pg.goto(URL,{waitUntil:'domcontentloaded',timeout:120000});
  await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
  await pg.evaluate(()=>window.demoLogin('DEMO-DRV'));
  await pg.waitForTimeout(1200);
  for(const tier of ['PLUS','PRO']){
    await pg.evaluate(t=>{const btns=[...document.querySelectorAll('#dash-return .rr-demo .dmsw-b')];const m=btns.find(b=>b.textContent.trim().toUpperCase()===t);if(m)m.click();},tier);
    await pg.waitForTimeout(600);
    const el=await pg.$('#dash-return');
    await el.screenshot({path:`_shot_${tier.toLowerCase()}_${tag}.png`});
    const txt=await pg.evaluate(()=>document.getElementById('dash-return').innerText.replace(/\n+/g,' | '));
    console.log(tag,tier,'::',txt.slice(0,260));
  }
  await pg.close();
}
await b.close();
