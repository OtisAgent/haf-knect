import { chromium } from 'playwright';
const URL='http://127.0.0.1:8791/';
const b=await chromium.launch();
for(const acct of ['DEMO-BIZ','DEMO-PRO','DEMO-DRV']){
  const pg=await b.newPage({viewport:{width:1440,height:900}});
  await pg.goto(URL,{waitUntil:'load'});
  await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:20000});
  await pg.evaluate(a=>window.demoLogin(a),acct);
  await pg.waitForTimeout(900);
  const r=await pg.evaluate(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id).filter(i=>/map|zone|cover|region/i.test(i));
    const svgMaps=document.querySelectorAll('svg.knect-map, .map-wrap, #network-map, #dash-map, .nm-svg').length;
    const navs=[...document.querySelectorAll('.ni')].map(n=>n.id.replace('ni-',''));
    return {role:window.HAF_ROLE, mapIds:ids, svgMaps, navs};
  });
  console.log(JSON.stringify({acct,...r}));
  await pg.close();
}
await b.close();
