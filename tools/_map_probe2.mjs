import { chromium } from 'playwright';
const URL='http://127.0.0.1:8791/';
const b=await chromium.launch();
for(const acct of ['DEMO-BIZ','DEMO-PRO','DEMO-DRV']){
  const pg=await b.newPage({viewport:{width:1440,height:900}});
  await pg.goto(URL,{waitUntil:'load'});
  await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:20000});
  await pg.evaluate(a=>window.demoLogin(a),acct);
  await pg.waitForTimeout(800);
  const r=await pg.evaluate(()=>{
    const vis=id=>{const e=document.getElementById(id);return e? (e.offsetParent!==null) : 'absent';};
    // open the live job pane
    let lj={};
    try{ if(typeof go==='function') go('livejob'); }catch(e){}
    return {vis:{poolZones:vis('pool-zones'),capMap:vis('cap-map'),cviewMap:vis('cview-map'),cover:vis('pane-f-cover')}};
  });
  await pg.waitForTimeout(700);
  const lj=await pg.evaluate(()=>{
    const p=document.getElementById('pane-livejob');
    if(!p)return{pane:'absent'};
    const t=p.innerText||'';
    return {mapEls:p.querySelectorAll('[id*="map"],[class*="map"]').length, hasProgress:/progress|stage|step|status/i.test(t), snippet:t.slice(0,110).replace(/\n/g,' | ')};
  });
  console.log(JSON.stringify({acct,...r,livejob:lj}));
  await pg.close();
}
await b.close();
