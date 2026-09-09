/* What the order would actually send. Driven forwards through the real screen:
   type into the price box, press the real "start" path, read the payload the
   Confirm button would post. Nothing is ever posted. */
import { chromium } from 'playwright';
let n=0, pass=0;
const check=(name,ok,got)=>{n++;if(ok)pass++;console.log(`${ok?'PASS':'FAIL'}  ${String(n).padStart(2)}  ${name}${ok?'':`   >>> got ${JSON.stringify(got)}`}`)};
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:844},isMobile:true});
await p.goto('http://127.0.0.1:8099/index.html',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForSelector('#pc-from',{state:'visible',timeout:20000});

const run = async (from,to) => {
  await p.fill('#pc-from',''); await p.fill('#pc-to','');
  await p.type('#pc-from',from,{delay:15}); await p.type('#pc-to',to,{delay:15});
  await p.waitForTimeout(6000);                       // let the price box resolve
  await p.evaluate(()=>startConsignment());           // the page's own one door in
  await p.waitForTimeout(2500);
  await p.evaluate(async()=>{ await Promise.all([
    addrEnsure(document.getElementById('fq-from')),
    addrEnsure(document.getElementById('fq-to'))]); });
  const out = await p.evaluate(()=>({
    from: fqOrderPayload().collect_postcode, to: fqOrderPayload().deliver_postcode,
    caddr: fqOrderPayload().collect_address, daddr: fqOrderPayload().deliver_address }));
  await p.evaluate(()=>{ const f=document.getElementById('inline-flow'); if(f)f.style.display='none';
    document.body.classList.remove('tile-focus'); });
  return out;
};
const isPc = v => /^[A-Z]{1,2}[0-9][A-Z0-9]?\s[0-9][A-Z]{2}$/.test(String(v||'').toUpperCase());

let r = await run('S9 1XH','M1 1AE');
check('a postcode pair is sent as typed', r.from==='S9 1XH' && r.to==='M1 1AE', r);

r = await run('s91xh','m11ae');
check('a carelessly typed pair is sent tidy', isPc(r.from) && isPc(r.to), r);

r = await run('Sheffield','Manchester');
check('a town is sent as a real postcode, never as the word',
      isPc(r.from) && isPc(r.to), r);
check('and the words they typed are kept as the address',
      /Sheffield/i.test(r.caddr||'') && /Manchester/i.test(r.daddr||''), r);

r = await run('Europa View, Tinsley, Sheffield','Newton Street, Manchester');
check('a street is sent as a real postcode', isPc(r.from) && isPc(r.to), r);
check('and the street is kept as the address',
      /Europa/i.test(r.caddr||'') && /Newton/i.test(r.daddr||''), r);

await b.close();
console.log(`\n${pass} of ${n} checks passed`);
process.exit(pass===n?0:1);
