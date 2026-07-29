import { chromium } from 'playwright';
const URL='https://knect.usehaf.co.uk/';
const b=await chromium.launch();
for (const [w,h,tag] of [[1440,950,'desktop'],[390,844,'phone']]) {
  const pg=await b.newPage({viewport:{width:w,height:h}});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(URL,{waitUntil:'load',timeout:120000});
  const g=await pg.$('#ag-code'); if(g){await pg.fill('#ag-code','HAFLAUNCH');const s=await pg.$('#ag-submit'); if(s)await s.click(); await pg.waitForTimeout(600);}
  await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
  await pg.evaluate(()=>window.demoLogin('DEMO-DRV'));
  await pg.waitForTimeout(1200);
  for (const t of ['PLUS','PRO']) {
    await pg.evaluate(tt=>{const bs=[...document.querySelectorAll('#dash-return .dmsw-b')];const m=bs.find(x=>x.textContent.trim().toUpperCase()===tt);if(m)m.click();},t);
    await pg.waitForTimeout(400);
    const r=await pg.evaluate(()=>{const rr=document.getElementById('dash-return');return{items:rr.querySelectorAll('.rr-item').length,best:rr.querySelectorAll('.rr-best').length,text:rr.innerText.replace(/\n+/g,' | ')};});
    console.log(tag,t,'items='+r.items,'best='+r.best);
    console.log('   ',r.text.slice(0,420));
  }
  // Pro decline → next offer
  const before=await pg.evaluate(()=>document.querySelector('#dash-return .rr-rt')?.innerText||'');
  await pg.evaluate(()=>{const b=[...document.querySelectorAll('#dash-return button')].find(x=>/Not this one/i.test(x.innerText));if(b)b.click();});
  await pg.waitForTimeout(400);
  const after=await pg.evaluate(()=>document.querySelector('#dash-return .rr-rt')?.innerText||'');
  console.log(tag,'decline:',JSON.stringify(before),'->',JSON.stringify(after),'changed='+(before!==after));
  // Pro accept
  await pg.evaluate(()=>{const b=[...document.querySelectorAll('#dash-return button')].find(x=>/Accept the run back/i.test(x.innerText));if(b)b.click();});
  await pg.waitForTimeout(400);
  const acc=await pg.evaluate(()=>{const rr=document.getElementById('dash-return');return{day:rr.querySelectorAll('.rr-leg').length,text:rr.innerText.replace(/\n+/g,' | ').slice(0,300)};});
  console.log(tag,'accept: legs='+acc.day,'|',acc.text);
  console.log(tag,'errors=',JSON.stringify(errs));
  await pg.close();
}
await b.close();
