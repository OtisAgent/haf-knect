/* A counting heading must always tell the truth about what is under it —
   in both directions, and after switching between the two accounts.
   The order matters: clear the account FIRST, then go back to the demo. If
   the words only survive one way round, this catches it. */
import { chromium } from '/agent/workspace/node_modules/playwright/index.mjs';
const T = process.argv[2] || 'file:///agent/workspace/knect-orderfix/index.html';
const b = await chromium.launch(); const fails=[],passes=[];
const ok=(c,m)=>{(c?passes:fails).push((c?'PASS ':'FAIL ')+m)};
const p = await b.newPage({viewport:{width:1400,height:1000}});
await p.goto(T,{waitUntil:'load'}); await p.waitForTimeout(800);
const g = await p.$('#ag-code'); if(g){ await p.fill('#ag-code','HAFLAUNCH'); await p.keyboard.press('Enter'); await p.waitForTimeout(700); }

async function heads(setup){
  await p.evaluate(()=>{try{signOut()}catch(e){}}); await p.waitForTimeout(250);
  await p.evaluate(setup); await p.waitForTimeout(800);
  await p.evaluate(()=>switchTab('pane-d-invites')); await p.waitForTimeout(600);
  return p.evaluate(()=>[...document.querySelectorAll('#pane-d-invites .xfeed-hdr')].map(h=>{
    let n=0,s=h.nextElementSibling;
    while(s&&!s.classList.contains('xfeed-hdr')){ if(s.classList.contains('xc')&&s.offsetParent!==null)n++; s=s.nextElementSibling; }
    const next=h.nextElementSibling;
    return {text:(h.innerText||'').trim(), cards:n, note:!!(next&&next.getAttribute&&next.getAttribute('data-seed-gap'))};
  }));
}
const mine = await heads(()=>{ enterKnectApp('BF638793'); enterMode('admin'); });
const demo = await heads(()=>{ demoLogin('DEMO-DRV'); });

ok(mine.every(h=>h.cards===0), 'his account: no run cards under any heading');
ok(mine.every(h=>!/\d/.test(h.text)), `his account: no heading claims a number (${mine.map(h=>h.text).join(' | ')})`);
ok(mine.every(h=>h.note), 'his account: every empty section says so in words');
ok(demo.some(h=>h.cards>0), 'the demo still has cards under its headings');
ok(demo.every(h=>h.cards===0||!h.note), 'the demo does not claim empty where it is full');
const matching = demo.find(h=>/open jobs/i.test(h.text));
ok(!!matching && /—\s*\d+\s+matching/i.test(matching.text),
   `the demo heading gets its wording back after the account was cleared ("${matching?matching.text:'missing'}")`);
const badge = demo.find(h=>/direct invites/i.test(h.text));
ok(!!badge && new RegExp('\\b'+badge.cards+'\\b').test(badge.text),
   `the demo invite badge matches the cards under it (${badge?badge.text:'missing'})`);
await b.close();
passes.forEach(l=>console.log(l)); fails.forEach(l=>console.log(l));
console.log(`\n${passes.length}/${passes.length+fails.length} checks passed`);
process.exit(fails.length?1:0);
