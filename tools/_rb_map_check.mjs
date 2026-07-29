import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [acct,label] of [['DEMO-DRV','driver'],['DEMO-BIZ','business'],['DEMO-PRO','freight']]) {
  const pg = await b.newPage({ viewport:{width:1440,height:950} });
  await pg.goto('https://knect.usehaf.co.uk/',{waitUntil:'load',timeout:120000});
  const g=await pg.$('#ag-code'); if(g){await pg.fill('#ag-code','HAFLAUNCH');const s=await pg.$('#ag-submit'); if(s)await s.click(); await pg.waitForTimeout(600);}
  await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
  await pg.evaluate(a=>window.demoLogin(a),acct);
  await pg.waitForTimeout(1200);
  // try to open the Network Map view
  const opened = await pg.evaluate(()=>{
    const el=[...document.querySelectorAll('a,button,[role=tab],.chip,.pill,.nav-i')].find(x=>/network map/i.test(x.textContent||''));
    if(el){el.click();return true;} return false;
  });
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(()=>({
    svgMaps: document.querySelectorAll('svg.map, #netmap, [data-aud="map"], .leaflet-container, #dash-map').length,
    anyMapWord: /network map/i.test(document.body.innerText),
    netNodes: document.querySelectorAll('[data-aud="network"]').length,
  }));
  console.log(label, 'openedMapTab='+opened, JSON.stringify(r));
  await pg.close();
}
await b.close();
