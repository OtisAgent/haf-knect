import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
p.on('pageerror',e=>console.log('PAGEERR',e.message.slice(0,150)));
await p.goto('file://'+fileURLToPath(new URL('./index.html',import.meta.url)));
await p.waitForTimeout(400);
const acc={type:'driver',drives:true,released:true,name:'Test Driver'};
await p.evaluate(a=>{document.getElementById('app').classList.add('open');
 const l=document.getElementById('landing');if(l)l.style.display='none';
 window.ct='pane-d-home';try{window.switchTab('pane-d-home')}catch(e){}
 window.buildNavV1(a);},acc);
await p.waitForTimeout(200);
console.log(await p.evaluate(()=>{
 const panel=document.getElementById('sidebar');
 const navl=document.getElementById('nav-list');
 return {navListHtmlLen:navl?navl.innerHTML.length:-1,
   niCount:panel.querySelectorAll('[id^="ni-"]').length,
   sampleIds:[...panel.querySelectorAll('[id^="ni-"]')].slice(0,5).map(e=>e.id),
   navlParentIsPanel: navl?panel.contains(navl):null,
   tbAcc: typeof window._tbAcc};
}));
console.log('BEFORE navlist len',await p.evaluate(()=>document.getElementById('nav-list').innerHTML.length));
await p.evaluate(()=>window.hafTabMore());
await p.waitForTimeout(400);
console.log(await p.evaluate(()=>{const panel=document.getElementById('sidebar');
 return {open:panel.classList.contains('open'),left:Math.round(panel.getBoundingClientRect().left),
  ni:panel.querySelectorAll('[id^="ni-"]').length,
  navlLen:document.getElementById('nav-list').innerHTML.length,
  allIds:[...panel.querySelectorAll('[id^="ni-"]')].map(e=>e.id)};}));
await b.close();
