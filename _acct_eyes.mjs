import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const b=await chromium.launch();
for(const [tag,vp] of [['desktop',{width:1280,height:1100}],['phone',{width:390,height:844}]]){
  const p=await b.newPage({viewport:vp,deviceScaleFactor:2});
  await p.goto('file:///agent/workspace/knect-orderfix/index.html',{waitUntil:'load'});
  await p.waitForTimeout(800);
  const g=await p.$('#ag-code'); if(g){await p.fill('#ag-code','HAFLAUNCH');await p.keyboard.press('Enter');await p.waitForTimeout(600);}
  if(tag==='desktop'){
    const el=await p.$('.land-side');
    if(el) await el.screenshot({path:`_shots/acct_${tag}.png`});
    await p.screenshot({path:`_shots/full_${tag}.png`});
  } else {
    // on a phone the login card is hidden: capture the overlay door too
    await p.screenshot({path:`_shots/full_${tag}.png`,fullPage:false});
    const l=await p.$('.sec-link'); if(l){await l.click();await p.waitForTimeout(600);
      await p.screenshot({path:`_shots/acct_${tag}.png`});}
  }
  await p.close();
}
await b.close();
console.log('shots written');
