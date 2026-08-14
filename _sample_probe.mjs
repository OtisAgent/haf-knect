/* What seeded/test content is actually on screen inside the account Brent uses? */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const TARGET = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1400,height:1000} });
await p.goto(TARGET,{waitUntil:'load'}); await p.waitForTimeout(700);
const gate = await p.$('#ag-code');
if (gate){ await p.fill('#ag-code','HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }

await p.evaluate(()=>{ enterKnectApp('BF638793'); });
await p.waitForTimeout(500);
const modes = await p.evaluate(()=> [...document.querySelectorAll('#super-mode button')].map(b=>({t:b.textContent.trim().slice(0,60), on:b.getAttribute('onclick')})));
console.log('MODES:', JSON.stringify(modes,null,1));

await p.evaluate(()=>enterMode('personal'));
await p.waitForTimeout(800);
const navs = await p.evaluate(()=> [...document.querySelectorAll('.nav-i,[onclick^="switchTab"]')].map(n=>({l:n.textContent.trim().slice(0,40), o:n.getAttribute('onclick')})).filter(n=>n.o&&n.o.includes('pane-')));
console.log('PERSONAL NAV:', JSON.stringify(navs.map(n=>n.l+' | '+n.o)));

/* sweep every pane and count sample refs on screen */
const report = await p.evaluate(async ()=>{
  const out=[];
  const panes=[...document.querySelectorAll('[id^="pane-"]')];
  for(const pane of panes){
    const txt=pane.textContent||'';
    const refs=[...new Set((txt.match(/\b(?:HAF|KN)-?\d{4,6}\b|\b[A-Z]{2}\d{6}\b/g)||[]))];
    const samples=refs.filter(r=>window.HAF_VIEW&&window.HAF_VIEW.isSample(r));
    if(samples.length) out.push({pane:pane.id, samples});
  }
  return out;
});
console.log('SAMPLE CONTENT BY PANE:'); for(const r of report) console.log(' ', r.pane, '->', r.samples.join(', '));
await b.close();
