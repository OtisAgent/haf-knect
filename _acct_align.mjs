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

  // Brent, 14 Aug: the arrows must finish on one line too, not just start on one.
  const actTops=await p.$$eval('.wtb .wtb-c',els=>els.map(e=>Math.round(
    e.querySelector('.wtb-a').getBoundingClientRect().top-e.getBoundingClientRect().top)));
  ok(new Set(actTops).size===1,`[${tag}] every action line finishes on the same line (${actTops.join('/')})`);

  // The whole point of the stretch: the two columns end level with each other.
  if(tag==='desktop'){
    const ends=await p.evaluate(()=>{
      const l=document.querySelector('.land-main')||document.querySelector('.calc-box');
      const s=document.querySelector('.land-side');
      return l&&s?{left:Math.round(l.getBoundingClientRect().bottom),right:Math.round(s.getBoundingClientRect().bottom)}:null;
    });
    ok(!!ends,'[desktop] both columns found');
    if(ends)ok(Math.abs(ends.left-ends.right)<=24,
      `[desktop] the account column ends level with the tile on the left (${ends.left} vs ${ends.right})`);
  }

  // The two doors Brent named this evening: the sign-up link and the demo button.
  const signup=await p.$$eval('#side-login a, #login-ov a',els=>els
    .filter(a=>/create an account/i.test(a.textContent))
    .map(a=>a.getAttribute('href')));
  ok(signup.length>0&&signup.every(h=>/^https:\/\/join\.usehaf\.co\.uk\/?$/.test(h)),
    `[${tag}] every "Create an account" link goes to join.usehaf.co.uk (${JSON.stringify(signup)})`);
  const cleverSignup=await p.$$eval('#side-login a, #login-ov a',els=>els
    .filter(a=>/create one via cleverpay|create an account with cleverpay/i.test(a.textContent)).length);
  ok(cleverSignup===0,`[${tag}] nothing still sends a new customer to CleverPay to sign up`);
  const demos=await p.$$eval('#side-login a, #login-ov a',els=>els
    .filter(a=>/live demo/i.test(a.textContent)).map(a=>a.getAttribute('href')));
  ok(demos.length>0&&demos.every(h=>/^https:\/\/demo\.usehaf\.co\.uk\/?$/.test(h)),
    `[${tag}] every "Try a live demo" button still goes to demo.usehaf.co.uk (${JSON.stringify(demos)})`);

  await p.close();
}
await b.close();
console.log(notes.join('\n'));
if(fails.length)console.log('\n'+fails.join('\n'));
console.log(`\n${notes.length} passed, ${fails.length} failed`);
process.exit(fails.length?1:0);
