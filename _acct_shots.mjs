import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const b=await chromium.launch();
for(const [tag,vp] of [['desktop',{width:1280,height:1100}],['phone',{width:390,height:844}]]){
  const p=await b.newPage({viewport:vp});
  await p.goto('file:///agent/workspace/knect-orderfix/index.html',{waitUntil:'load'});
  await p.waitForTimeout(700);
  const g=await p.$('#ag-code'); if(g){await p.fill('#ag-code','HAFLAUNCH');await p.keyboard.press('Enter');await p.waitForTimeout(500);}
  // the account column: login card + the three ways to book
  const el=await p.$('#tiles-wrap')||await p.$('.wtb');
  const box=await p.$$eval('.calc-box, #wtb-card, .wtb-card',els=>els.map(e=>({c:e.className,t:Math.round(e.getBoundingClientRect().top)})));
  console.log(tag,'panels:',JSON.stringify(box).slice(0,300));
  // measure the three booking cards
  const cards=await p.$$eval('#wtb-repeat, #wtb-email, #wtb-wa',els=>els.map(e=>{
    const r=e.getBoundingClientRect();
    const h=e.querySelector('.wtb-n,.wtb-t,h3,strong');
    const hb=h?h.getBoundingClientRect():null;
    const ic=e.querySelector('svg');
    const ib=ic?ic.getBoundingClientRect():null;
    return {id:e.id,left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height),
      headLeft:hb?Math.round(hb.left):null, headTop:hb?Math.round(hb.top-r.top):null,
      icoTop:ib?Math.round(ib.top-r.top):null};
  }));
  console.log(tag,'cards:',JSON.stringify(cards,null,0));
  await p.close();
}
await b.close();
