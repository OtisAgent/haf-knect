import { chromium } from 'playwright';
const USER='BF638793', PIN='0641';
let pass=0, fail=0;
const ok=(n,c,x)=>{ (c?pass++:fail++); console.log((c?'  ok  ':'  FAIL') + '  ' + n + (c?'':'   <<< '+(x===undefined?'':JSON.stringify(x)))); };

const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1000} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://knect.usehaf.co.uk/', { waitUntil:'networkidle', timeout:90000 });

const card = () => p.evaluate(() => {
  const el=document.getElementById('sb-af');
  if(!el) return {exists:false};
  const cs=getComputedStyle(el);
  return {exists:true, visible: cs.display!=='none' && el.offsetHeight>0,
          text: (el.innerText||'').trim(),
          links: [...el.querySelectorAll('.sb-af-l')].map(x=>x.getAttribute('onclick')),
          code: (el.querySelector('.sb-af-code')||{}).textContent||null};
});

console.log('\n1 · Signed out');
ok('card is in the page but hidden', (await card()).exists && !(await card()).visible);

console.log('\n2 · Signed in');
await p.evaluate(async ([u,pin])=>{ await hafAuth(u,pin,document.getElementById('l-err'),document.querySelector('#login-ov .btn-wide')); },[USER,PIN]);
await p.waitForFunction(()=>document.getElementById('super-mode')?.style.display==='flex',{timeout:30000});
ok('signed in', await p.evaluate(()=>localStorage.getItem('knect-user')==='BF638793'));

console.log('\n3 · A FREIGHT FORWARDER sidebar');
await p.evaluate(()=>viewAsMember('freight_forwarder', false));
await p.waitForFunction(()=>{const e=document.getElementById('sb-af');return e&&e.offsetHeight>0&&!/Getting your link/.test(e.innerText);},{timeout:30000}).catch(()=>{});
const ff = await card();
ok('card is on screen', ff.visible);
ok('it shows a code', /^HAF[A-Z0-9]{6}$/.test((ff.code||'').trim()), ff.code);
ok('tracker shows clicks, joined, jobs', /CLICKS/i.test(ff.text)&&/JOINED/i.test(ff.text)&&/JOBS/i.test(ff.text));
ok('three share links', (ff.links||[]).length===3, (ff.links||[]).length);
ok('join link carries the code', (ff.links||[]).some(x=>x.includes('join.usehaf.co.uk')&&x.includes(ff.code.trim())));
ok('knect link carries the code', (ff.links||[]).some(x=>/knect\.usehaf\.co\.uk\/\?a=/.test(x)));
ok('post-one-job link carries the code', (ff.links||[]).some(x=>x.includes('#post')));
ok('says 10% of what HAF makes', /10% of what HAF makes/.test(ff.text), ff.text.slice(-200));
ok('never says 10% of the delivery price', !/of the (delivery|customer|job) price/i.test(ff.text));
ok('says it is a preview', /preview/i.test(ff.text));

console.log('\n4 · A DRIVER sidebar must NOT get this card');
await p.evaluate(()=>viewAsMember('driver', true));
await p.waitForTimeout(2500);
ok('no Share & earn card for a driver', !(await card()).visible);

console.log('\n5 · A BUSINESS sidebar does get it');
await p.evaluate(()=>viewAsMember('business', false));
await p.waitForFunction(()=>{const e=document.getElementById('sb-af');return e&&e.offsetHeight>0&&!/Getting your link/.test(e.innerText);},{timeout:30000}).catch(()=>{});
ok('card is on screen for a business', (await card()).visible);

console.log('\n6 · Signing out takes it away');
await p.evaluate(()=>viewAsMember('freight_forwarder', false));
await p.waitForTimeout(2000);
await p.evaluate(()=>signOut());
await p.waitForTimeout(1500);
ok('card gone after sign out', !(await card()).visible);

console.log('\n7 · Phone width');
await p.setViewportSize({width:390,height:844});
await p.goto('https://knect.usehaf.co.uk/', {waitUntil:'networkidle', timeout:90000});
await p.evaluate(async ([u,pin])=>{ await hafAuth(u,pin,document.getElementById('l-err'),document.querySelector('#login-ov .btn-wide')); },[USER,PIN]);
await p.waitForFunction(()=>document.getElementById('super-mode')?.style.display==='flex',{timeout:30000});
await p.evaluate(()=>viewAsMember('freight_forwarder', false));
await p.waitForFunction(()=>{const e=document.getElementById('sb-af');return e&&e.offsetHeight>0&&!/Getting your link/.test(e.innerText);},{timeout:30000}).catch(()=>{});
const ph=await p.evaluate(()=>{const e=document.getElementById('sb-af');if(!e)return null;const r=e.getBoundingClientRect();return {w:Math.round(r.width),overflow:r.right>document.documentElement.clientWidth+1};});
ok('fits the phone sidebar', ph && !ph.overflow, ph);
await p.locator('#sb-af').screenshot({path:'_aff_card_phone.png'}).catch(()=>{});

ok('no script errors anywhere', errs.length===0, errs.slice(0,3));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await b.close();
process.exit(fail?1:0);
