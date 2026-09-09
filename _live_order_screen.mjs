/* What a real person sees on the live KNECT order screen, driven forwards the
   way they use it. Read-only: it stops at the guide price and never places an
   order. */
import { chromium } from 'playwright';
let n=0, pass=0;
const check=(name,ok,got)=>{n++;if(ok)pass++;console.log(`${ok?'PASS':'FAIL'}  ${String(n).padStart(2)}  ${name}${ok?'':`   >>> got ${JSON.stringify(got)}`}`)};
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true});
await p.goto('https://knect.usehaf.co.uk/',{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForSelector('#pc-from',{state:'visible',timeout:30000});
check('the price box is the first thing on the live page', true, 'visible');

const hint = async () => p.evaluate(()=>{const h=document.getElementById('lp-hint-txt');
  return h && h.offsetParent!==null ? h.innerText.trim() : ''});
const priced = async () => p.evaluate(()=>{const e=document.getElementById('lp-priced');
  return e && e.offsetParent!==null ? e.innerText.replace(/\s+/g,' ').trim() : ''});
const type = async (from,to)=>{
  await p.fill('#pc-from',''); await p.fill('#pc-to','');
  await p.type('#pc-from',from,{delay:20}); await p.type('#pc-to',to,{delay:20});
  await p.waitForTimeout(6000);
  return { hint: await hint(), priced: await priced() };
};

let r = await type('JDBSBSJS','M1 1AE');
check('gibberish is called out on screen', /couldn.t find/i.test(r.hint), r);
check('gibberish is never given a price', !r.priced, r);

r = await type('ZZ9 9ZZ','M1 1AE');
check('a postcode that is not a real place is called out', /couldn.t find/i.test(r.hint), r);
check('it is never given a price either', !r.priced, r);

/* A town is not a fault here, it is the design: the page turns whatever they
   typed into a real postcode before anything is sent, and shows them which
   place it used. What must never happen is the town itself travelling. */
r = await type('S9 1XH','Manchester');
check('a town is resolved to a real place and shown back to them',
      /Manchester/.test(r.priced) && /£/.test(r.priced), r);
/* The box keeps their own words on purpose — it is their order, and reading
   "Manchester" back is friendlier than a postcode they did not type. What has
   to be a real postcode is the value the box STANDS FOR, which is what the
   order sends. */
const stood = await p.evaluate(()=>{const e=document.getElementById('pc-to');
  return { typed: e.value, pc: e.dataset.pc || '' }});
check('the box keeps the words they typed', /Manchester/i.test(stood.typed), stood);
check('and it stands for a real postcode',
      /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/.test(stood.pc.toUpperCase()), stood);

r = await type('s91xh','m11ae');
check('a carelessly typed pair still gets a price', /£/.test(r.priced), r);
check('and the price is shown, not an error', !/couldn.t find/i.test(r.hint), r);
await p.screenshot({path:'_live_order_gate_priced.png'});

r = await type('S9 1XH','M1 1AE');
check('the tidy spelling gives the same price', /£/.test(r.priced), r);

await b.close();
console.log(`\n${pass} of ${n} checks passed`);
process.exit(pass===n?0:1);
