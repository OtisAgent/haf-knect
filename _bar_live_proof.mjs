import { chromium } from 'playwright';
/* Point LIVE_URL at whichever surface is being proved. The default stays the
   preview so a bare run can never be mistaken for a production check. */
/* The sign-in this walk uses is passed IN, never written down here. Pages
   publishes root files whose name begins with an underscore, so a PIN typed
   into this file is a PIN on the open web. Run it as:
     NAV_USER=<account> NAV_PIN=<pin> node <this file> */
const USER = process.env.NAV_USER, PIN = process.env.NAV_PIN;
if (!USER || !PIN) { console.error('Set NAV_USER and NAV_PIN — this harness carries no credentials.'); process.exit(2); }
const URL=process.env.LIVE_URL||'https://mobile-bottom-nav.knect-demo.pages.dev/';
const b=await chromium.launch();
const sizes=[{n:'phone',w:390,h:844},{n:'phone-sideways',w:844,h:390},{n:'desktop',w:1280,h:900}];
for(const s of sizes){
  const p=await b.newPage({viewport:{width:s.w,height:s.h},isMobile:s.w<900,hasTouch:s.w<900});
  const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,90)));
  await p.goto(URL,{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  await p.evaluate(()=>{const h=[...document.querySelectorAll('button,a')].filter(x=>/log ?in/i.test(x.innerText)).find(x=>x.offsetParent!==null);if(h)h.click();});
  /* Wait for the field itself rather than a fixed pause. On the live site the
     landing settles more slowly than on the preview, and a timed wait turned a
     slow page into "the login box does not exist". */
  await p.waitForSelector('#l-user',{state:'visible',timeout:20000});
  await p.fill('#l-user',USER); await p.fill('#l-pass',PIN);
  await p.evaluate(()=>doLogin()); await p.waitForTimeout(7000);
  const bar=await p.evaluate(()=>{const el=document.getElementById('haf-tabbar');const r=el&&el.getBoundingClientRect();
    return {h:r?Math.round(r.height):0,w:r?Math.round(r.width):0,pos:el?getComputedStyle(el).position:null,
      bottomGap:r?Math.round(innerHeight-r.bottom):null,
      labels:el?[...el.querySelectorAll('.tbi')].map(x=>x.innerText.replace(/\s+/g,' ').trim()):[]}});
  await p.screenshot({path:`_shot-live-${s.n}.png`});
  // MORE opens the menu
  await p.evaluate(()=>{const el=[...document.querySelectorAll('#haf-tabbar .tbi')].pop();el.click()});
  await p.waitForTimeout(700);
  const menu=await p.evaluate(()=>{const sb=document.getElementById('sidebar');
    return {open:sb.classList.contains('open'),left:Math.round(sb.getBoundingClientRect().left),
      rows:document.querySelectorAll('#nav-list .ni, #nav-list .ni-sub').length,
      signout:!!sb.querySelector('.so-btn')}});
  await p.screenshot({path:`_shot-live-${s.n}-menu.png`});
  // pick a row and check it navigates AND the menu closes
  const nav=await p.evaluate(()=>{const r=document.querySelector('#nav-list .ni-sub, #nav-list .ni');const id=r.id;r.click();
    return {clicked:id}});
  await p.waitForTimeout(1200);
  const after=await p.evaluate(()=>({pane:window.ct,menuOpen:document.getElementById('sidebar').classList.contains('open'),
    barStill:!!document.getElementById('haf-tabbar')}));
  console.log(s.n,'| bar',JSON.stringify(bar),'\n     menu',JSON.stringify(menu),'\n     nav',JSON.stringify({...nav,...after}),'| errors',errs.length?errs:'none');
  await p.close();
}
await b.close();
