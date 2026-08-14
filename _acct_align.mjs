import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const b=await chromium.launch();
const fails=[],notes=[];
const ok=(c,m)=>{(c?notes:fails).push((c?'PASS ':'FAIL ')+m);};
for(const [tag,vp] of [['desktop',{width:1280,height:1100}],['phone',{width:390,height:844}]]){
  const p=await b.newPage({viewport:vp});
  await p.goto('file:///agent/workspace/knect-orderfix/index.html',{waitUntil:'load'});
  await p.waitForTimeout(700);
  const g=await p.$('#ag-code'); if(g){await p.fill('#ag-code','HAFLAUNCH');await p.keyboard.press('Enter');await p.waitForTimeout(500);}
  const cards=await p.$$eval('.wtb .wtb-c',els=>els.map(e=>{
    const r=e.getBoundingClientRect();
    const h=e.querySelector('.wtb-h').getBoundingClientRect();
    const i=e.querySelector('.wtb-ico').getBoundingClientRect();
    const a=e.querySelector('.wtb-a').getBoundingClientRect();
    return {id:e.id,h:Math.round(r.height),left:Math.round(r.left),w:Math.round(r.width),
      headOff:Math.round(h.top-r.top), headLeft:Math.round(h.left-r.left),
      icoOff:Math.round(i.top-r.top), icoLeft:Math.round(i.left-r.left),
      actLeft:Math.round(a.left-r.left)};
  }));
  const uniq=k=>new Set(cards.map(c=>c[k])).size;
  ok(cards.length===3,`[${tag}] three cards in the set (${cards.length})`);
  ok(Math.max(...cards.map(c=>c.h))-Math.min(...cards.map(c=>c.h))<=1,
    `[${tag}] all three the same height (${cards.map(c=>c.h).join('/')})`);
  ok(uniq('headOff')===1,`[${tag}] every heading starts on the same line (${cards.map(c=>c.headOff).join('/')})`);
  ok(uniq('icoOff')===1,`[${tag}] every icon sits at the same height (${cards.map(c=>c.icoOff).join('/')})`);
  ok(uniq('headLeft')===1,`[${tag}] headings share one left edge (${cards.map(c=>c.headLeft).join('/')})`);
  ok(uniq('icoLeft')===1,`[${tag}] icons share one left edge`);
  ok(uniq('actLeft')===1,`[${tag}] the action lines share one left edge`);
  ok(uniq('left')===1&&uniq('w')===1,`[${tag}] all three cards share one column`);
  // the badge must not overlap its own heading
  const clash=await p.$eval('#wtb-whatsapp',e=>{
    const b=e.querySelector('.wtb-soon').getBoundingClientRect();
    const h=e.querySelector('.wtb-h').getBoundingClientRect();
    return !(b.left>=h.right||b.right<=h.left||b.top>=h.bottom||b.bottom<=h.top);
  });
  ok(!clash,`[${tag}] the coming-soon badge never sits on top of its heading`);
  await p.close();
}
await b.close();
console.log(notes.join('\n'));
if(fails.length)console.log('\n'+fails.join('\n'));
console.log(`\n${notes.length} passed, ${fails.length} failed`);
process.exit(fails.length?1:0);
