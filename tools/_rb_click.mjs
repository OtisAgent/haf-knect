import { chromium } from 'playwright';
const b = await chromium.launch();
const pg = await b.newPage({ viewport:{width:390,height:844} });
const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
await pg.goto('https://knect.usehaf.co.uk/',{waitUntil:'load',timeout:120000});
const g=await pg.$('#ag-code'); if(g){await pg.fill('#ag-code','HAFLAUNCH');const s=await pg.$('#ag-submit'); if(s)await s.click(); await pg.waitForTimeout(600);}
await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
await pg.evaluate(()=>window.demoLogin('DEMO-DRV'));
await pg.waitForTimeout(1200);
// switch to PRO
await pg.evaluate(()=>{[...document.querySelectorAll('#dash-return .dmsw-b')].find(x=>/pro/i.test(x.textContent))?.click();});
await pg.waitForTimeout(500);
const first = await pg.evaluate(()=>document.getElementById('dash-return').innerText);
// decline
await pg.evaluate(()=>{[...document.querySelectorAll('#dash-return button')].find(x=>/not this one/i.test(x.textContent))?.click();});
await pg.waitForTimeout(700);
const second = await pg.evaluate(()=>document.getElementById('dash-return').innerText);
// accept
await pg.evaluate(()=>{[...document.querySelectorAll('#dash-return button')].find(x=>/accept/i.test(x.textContent))?.click();});
await pg.waitForTimeout(900);
const third = await pg.evaluate(()=>document.getElementById('dash-return').innerText);
console.log('--- PRO offer 1 ---\n'+first);
console.log('--- after decline ---\n'+second);
console.log('--- after accept ---\n'+third);
console.log('CHANGED_ON_DECLINE='+(first!==second));
console.log('ERRORS='+JSON.stringify(errs));
await pg.screenshot({path:'/tmp/_rb_live_phone.png',fullPage:false});
await b.close();
