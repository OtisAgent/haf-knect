import { chromium } from 'playwright';
const URL='https://founders-badge.knect-demo.pages.dev/';
const b=await chromium.launch();
const errs=[];
let fail=0;
const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};

for(const [w,h,tag] of [[1440,950,'desktop'],[390,844,'phone']]){
  for(const theme of ['day','dark']){
    const pg=await b.newPage({viewport:{width:w,height:h}});
    pg.on('console',m=>{if(m.type()==='error')errs.push(tag+'/'+theme+': '+m.text())});
    pg.on('pageerror',e=>errs.push(tag+'/'+theme+' PAGEERROR: '+e.message));
    await pg.goto(URL,{waitUntil:'domcontentloaded',timeout:90000});
    await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
    if(theme==='dark') await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));

    // 1. NON-founder must show nothing
    await pg.evaluate(()=>window.demoLogin('DEMO-DRV'));
    await pg.waitForTimeout(700);
    ok(`${tag}/${theme} non-founder: no card`, !(await pg.isVisible('#fnd-card')));
    ok(`${tag}/${theme} non-founder: no badge`, !(await pg.isVisible('#tb-founder')));

    // 2. Founder demo shows both
    await pg.evaluate(()=>window.demoLogin('DEMO-FND'));
    await pg.waitForTimeout(700);
    ok(`${tag}/${theme} founder: card visible`, await pg.isVisible('#fnd-card'));
    ok(`${tag}/${theme} founder: badge visible`, await pg.isVisible('#tb-founder'));
    const txt=await pg.textContent('#fnd-card');
    ok(`${tag}/${theme} says "Founding Member"`, /Founding Member/.test(txt));
    ok(`${tag}/${theme} shows founder number`, /Founder No\. 1/.test(txt));
    ok(`${tag}/${theme} shows since date`, /since 3 July 2026/.test(txt));
    ok(`${tag}/${theme} no "rebate" wording`, !/rebate/i.test(txt));
    // symbol is a drawn svg, not an emoji
    ok(`${tag}/${theme} symbol is drawn svg`, (await pg.$$('#fnd-card .fnd-mark svg polygon')).length===1);
    // card sits above the detail switch
    const order=await pg.evaluate(()=>{const c=document.getElementById('fnd-card'),d=document.querySelector('#pane-d-home .dm-row');return c.compareDocumentPosition(d)&Node.DOCUMENT_POSITION_FOLLOWING?1:0});
    ok(`${tag}/${theme} card above detail switch`, order===1);
    // survives Basic mode
    await pg.evaluate(()=>window.setDashMode('basic'));await pg.waitForTimeout(400);
    ok(`${tag}/${theme} still visible in Basic`, await pg.isVisible('#fnd-card'));
    await pg.evaluate(()=>window.setDashMode('advanced'));await pg.waitForTimeout(400);
    ok(`${tag}/${theme} still visible in Advanced`, await pg.isVisible('#fnd-card'));
    // no horizontal overflow
    const ovf=await pg.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    ok(`${tag}/${theme} no sideways scroll (${ovf}px)`, ovf<=1);
    // badge fits the top bar
    const bb=await (await pg.$('#tb-founder')).boundingBox();
    ok(`${tag}/${theme} badge inside viewport`, bb && bb.x>=0 && bb.x+bb.width<=w+1);

    // 3. REAL register check over the live network, for a real paid founder
    const real=await pg.evaluate(async()=>{await window.hafFounderPaint('IW908093');return document.getElementById('fnd-card').classList.contains('on')?document.getElementById('fnd-no').textContent:'NOT SHOWN'});
    ok(`${tag}/${theme} real founder IW908093 via register -> ${real}`, real==='Founder No. 5');
    const notf=await pg.evaluate(async()=>{window._setFounder(null);await window.hafFounderPaint('BF638793');return document.getElementById('fnd-card').classList.contains('on')});
    ok(`${tag}/${theme} non-paying account gets no mark`, notf===false);

    if(theme==='day'){
      await pg.evaluate(()=>{window._setFounder(null);window.demoLogin('DEMO-FND')});await pg.waitForTimeout(700);
      await pg.screenshot({path:`/agent/workspace/haf-knect/_fnd_${tag}.png`});
      const el=await pg.$('#fnd-card');await el.screenshot({path:`/agent/workspace/haf-knect/_fnd_card_${tag}.png`});
    }
    await pg.close();
  }
}
await b.close();
console.log('\nconsole errors: '+(errs.length?errs.join(' | '):'none'));
console.log(fail===0?'\nALL CHECKS PASSED':`\n${fail} CHECK(S) FAILED`);
