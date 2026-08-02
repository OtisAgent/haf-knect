import { chromium } from 'playwright';
const b=await chromium.launch();
for(const acct of ['DEMO-DRV','DEMO-FND','DEMO-BIZ']){
  for(const wdt of [390,360,320,768,1440]){
    const pg=await b.newPage({viewport:{width:wdt,height:844}});
    await pg.goto('http://127.0.0.1:8811/index.html',{waitUntil:'domcontentloaded',timeout:60000});
    await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:20000});
    await pg.evaluate(a=>window.demoLogin(a),acct);
    await pg.waitForTimeout(600);
    const r=await pg.evaluate(()=>{const d=document.documentElement;return{o:d.scrollWidth-d.clientWidth,tr:Math.round(document.querySelector('.tb-r').getBoundingClientRect().right),logo:document.querySelector('.tlogo-t').textContent.trim()}});
    console.log(`${acct} @${wdt}px -> overflow ${r.o}px, tb-r right ${r.tr}, logo "${r.logo}"`);
    await pg.close();
  }
}
await b.close();
