/* The fourth position on KNECT, account by account.
 *
 * Brent, 10 Sep: "if the HAF KNECT account doesn't have a PLNA change the icon
 * at the bottom". This checks the thing he asked for on the SURFACE he opens —
 * that an account with no driving side gets a different word AND a different
 * drawn symbol there, not a PLNA button that goes nowhere.
 */
import { chromium } from 'playwright';
const URL_ = process.env.NAV_URL || 'https://mobile-bottom-nav.knect-demo.pages.dev/';

const ACCOUNTS = [
  ['driver, released',        { type:'driver',            drives:true,  released:true,  name:'Test Driver' },  true ],
  ['driver, not yet released',{ type:'driver',            drives:true,  released:false, name:'Pending Driver'},true ],
  ['business',                { type:'business',          drives:false, released:false, name:'Test Business'}, false],
  ['fleet, no driving side',  { type:'fleet',             drives:false, released:false, name:'Test Fleet'},    false],
  ['fleet that drives',       { type:'fleet',             drives:true,  released:true,  name:'Fleet Driver'},  true ],
  ['freight forwarder',       { type:'freight_forwarder', drives:false, released:false, name:'Test Freight'},  false],
  ['freight with driving',    { type:'freight_forwarder', drives:true,  released:true,  name:'Master Freight'},true ],
];

let pass=0, fail=0; const fails=[];
const ok=(c,l,d)=>{ if(c)pass++; else {fail++;fails.push(l+(d?' — '+d:''));console.log('  FAIL '+l+(d?' — '+d:''))} };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto(URL_);
await p.waitForTimeout(1200);

const seen = {};
for (const [label, acc, hasPlna] of ACCOUNTS) {
  const r = await p.evaluate(a => {
    document.getElementById('app').classList.add('open');
    const l=document.getElementById('landing'); if(l)l.style.display='none';
    window.ct='pane-d-home';
    try{window.switchTab('pane-d-home')}catch(e){}
    window.buildNavV1(a);
    const items=[...document.querySelectorAll('#haf-tabbar .tbi')];
    const fourth=items[3];
    return {
      count: items.length,
      words: items.map(x=>(x.querySelector('.tbi-l')||{}).textContent),
      fourthWord: (fourth.querySelector('.tbi-l')||{}).textContent,
      fourthShape: (fourth.querySelector('.tbi-ic')||{}).innerHTML,
      fourthGoes: fourth.getAttribute('onclick'),
    };
  }, acc);
  console.log(' ' + label.padEnd(26) + ' → 4th = ' + r.fourthWord);
  ok(r.count===5, label+': five positions', 'got '+r.count);
  ok(r.fourthWord === (hasPlna?'PLNA':'Payments'),
     label+': the fourth position reads '+(hasPlna?'PLNA':'Payments'), r.fourthWord);
  ok(!!r.fourthGoes, label+': the fourth position does something');
  seen[hasPlna?'plna':'noplna'] = r.fourthShape;
}

/* The point of the whole check: the two are not the same drawing. */
ok(!!seen.plna && !!seen.noplna, 'both cases were actually exercised');
ok(seen.plna !== seen.noplna,
   'an account with no PLNA gets a DIFFERENT symbol, not the same one relabelled');
console.log('\n PLNA symbol   : ' + (seen.plna||'').slice(0,60));
console.log(' no-PLNA symbol: ' + (seen.noplna||'').slice(0,60));

await b.close();
console.log('\nPASS '+pass+'   FAIL '+fail);
if(fails.length){console.log('What failed:');fails.forEach(f=>console.log('  · '+f))}
process.exit(fail?1:0);
