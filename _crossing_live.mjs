/* The round trip, on the two live sites, in one tab.
   KNECT's fourth position must land on plna.usehaf.co.uk WITH a bar, and
   PLNA's fourth must come back to knect.usehaf.co.uk. Nothing seeded. */
import { chromium } from 'playwright';
/* The sign-in this walk uses is passed IN, never written down here. Pages
   publishes root files whose name begins with an underscore, so a PIN typed
   into this file is a PIN on the open web. Run it as:
     NAV_USER=<account> NAV_PIN=<pin> node <this file> */
const USER = process.env.NAV_USER, PIN = process.env.NAV_PIN;
if (!USER || !PIN) { console.error('Set NAV_USER and NAV_PIN — this harness carries no credentials.'); process.exit(2); }
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const p=await ctx.newPage();
const opened=[]; ctx.on('page',x=>opened.push(x.url()));
await p.goto('https://knect.usehaf.co.uk/',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
/* The landing paints its own login pane. One click can land before the pane
   is wired, so ask again until the field is really there. */
for(let i=0;i<10;i++){
  await p.evaluate(()=>{const h=[...document.querySelectorAll('button,a')].filter(x=>/log ?in/i.test(x.innerText)).find(x=>x.offsetParent!==null);if(h)h.click();});
  await p.waitForTimeout(1200);
  if(await p.evaluate(()=>{const e=document.getElementById('l-user');return !!e&&e.offsetParent!==null})) break;
}
await p.waitForSelector('#l-user',{state:'visible',timeout:20000});
await p.fill('#l-user',USER); await p.fill('#l-pass',PIN);
await p.evaluate(()=>doLogin()); await p.waitForTimeout(7000);
const labels=await p.evaluate(()=>[...document.querySelectorAll('#haf-tabbar .tbi')].map(x=>x.innerText.trim()));
console.log('KNECT bar:',labels.join(' | '));
await p.evaluate(()=>{const els=[...document.querySelectorAll('#haf-tabbar .tbi')];els[3].click()});
await p.waitForTimeout(9000);
console.log('after tapping the 4th position → ',p.url());
console.log('new tabs opened:',opened.length?opened:'none (same tab, as intended)');
const there=await p.evaluate(()=>{const el=document.getElementById('haf-tabbar');
  return {host:location.host,bar:!!el,words:el?[...el.querySelectorAll('.tbi')].map(x=>x.innerText.trim()):[]}});
console.log('landed:',JSON.stringify(there));
await p.screenshot({path:'_shot-crossing-live.png'});
await b.close();
