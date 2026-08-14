import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const URL = 'https://order-flow-v2.knect-demo.pages.dev/';
const b = await chromium.launch({args:['--no-sandbox']});
const p = await b.newPage();
const netlog=[];
p.on('response', r => { if(!/pages\.dev\/$/.test(r.url())) netlog.push(r.status()+' '+r.request().method()+' '+r.url().slice(0,110)); });
await p.setViewportSize({width:1280,height:1000});
await p.goto(URL,{waitUntil:'load'});
await p.waitForTimeout(1500);
console.log('--- network during load ---'); netlog.forEach(l=>console.log(' ',l));
// walk the flow the same way the e2e does, then read the end state
const st = await p.evaluate(()=>({ hasFq: !!document.getElementById('fq-1'), fns: ['openFlow','fqBookV','openEmailQuote'].filter(f=>typeof window[f]==='function') }));
console.log('--- page state ---', JSON.stringify(st));
await b.close();
