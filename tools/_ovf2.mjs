import { chromium } from 'playwright';
const b=await chromium.launch();
const pg=await b.newPage({viewport:{width:390,height:844}});
await pg.goto('https://founders-badge.knect-demo.pages.dev/',{waitUntil:'domcontentloaded',timeout:90000});
await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
await pg.evaluate(()=>window.demoLogin('DEMO-FND'));
await pg.waitForTimeout(1000);
const r=await pg.evaluate(()=>{
  const d=document.documentElement, out=[];
  document.querySelectorAll('body *').forEach(function(e){
    const bx=e.getBoundingClientRect();
    if(bx.right>d.clientWidth+1&&bx.width>0&&bx.height>0){
      let cls=e.className; if(cls&&cls.baseVal!==undefined)cls=cls.baseVal;
      out.push({t:e.tagName,id:e.id,c:String(cls||'').slice(0,40),r:Math.round(bx.right),w:Math.round(bx.width),vis:getComputedStyle(e).display});
    }
  });
  return {over:d.scrollWidth-d.clientWidth,n:out.length,top:out.slice(0,12)};
});
console.log('overflow',r.over,'elements past edge:',r.n);
r.top.forEach(function(o){console.log('  ',o.t,o.id?'#'+o.id:'','.'+o.c,'right='+o.r,'w='+o.w,o.vis)});
// now with the founder card forcibly hidden — is the card the cause?
const r2=await pg.evaluate(()=>{document.getElementById('fnd-card').classList.remove('on');const d=document.documentElement;return d.scrollWidth-d.clientWidth});
console.log('overflow with founder card hidden:',r2);
await b.close();
