import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1400,height:1000} });
await p.goto(TARGET,{waitUntil:'load'}); await p.waitForTimeout(700);
const g = await p.$('#ag-code'); if(g){ await p.fill('#ag-code','HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

async function walk(label, setup){
  await p.evaluate(()=>{ try{ signOut&&signOut(); }catch(e){} });
  await p.waitForTimeout(300);
  await p.evaluate(setup);
  await p.waitForTimeout(700);
  const tabs = await p.evaluate(()=>[...new Set([...document.querySelectorAll('[onclick^="switchTab"]')]
     .map(n=>(n.getAttribute('onclick').match(/switchTab\('([^']+)'/)||[])[1]).filter(Boolean))]);
  const found=[];
  for(const t of tabs){
    await p.evaluate(t=>switchTab(t), t);
    await p.waitForTimeout(350);
    const r = await p.evaluate(t=>{
      const pane=document.getElementById(t); if(!pane) return null;
      const txt=pane.innerText||'';
      const refs=[...new Set((txt.match(/\b(?:HAF|KN)-?\d{4,6}\b|\b[A-Z]{2}\d{6}\b/g)||[]))];
      const samples=refs.filter(r=>window.HAF_VIEW&&window.HAF_VIEW.isSample(r));
      const tiles=[...pane.querySelectorAll('.xc,.cap-sec')].filter(e=>e.offsetParent!==null);
      const sTiles=tiles.filter(e=>e.classList.contains('hv-sample')).length;
      return {samples, tiles:tiles.length, sTiles};
    }, t);
    if(r && (r.samples.length||r.sTiles)) found.push(`${t}: refs[${r.samples.join(',')}] tiles ${r.sTiles}/${r.tiles} sample`);
  }
  console.log('\n### '+label);
  found.forEach(f=>console.log('  '+f));
  if(!found.length) console.log('  (nothing seeded found)');
}
await walk('Brent — My Account (personal)', ()=>{ enterKnectApp('BF638793'); enterMode('personal'); });
await walk('Brent — Network Overview (admin)', ()=>{ enterKnectApp('BF638793'); enterMode('admin'); });
await walk('Preview: owner driver released', ()=>{ enterKnectApp('BF638793'); viewAsMember('driver',true); });
await walk('Preview: business sends only', ()=>{ enterKnectApp('BF638793'); viewAsMember('business',false); });
await walk('DEMO account (should KEEP samples)', ()=>{ demoLogin('DEMO-DRV'); });
await b.close();
