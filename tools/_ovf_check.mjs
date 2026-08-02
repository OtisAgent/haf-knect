import { chromium } from 'playwright';
const b=await chromium.launch();
for(const [url,label] of [['https://knect.usehaf.co.uk/','PRODUCTION (main, no founders code)'],['https://founders-badge.knect-demo.pages.dev/','PREVIEW (founders-badge)']]){
  for(const acct of ['DEMO-DRV','DEMO-FND']){
    const pg=await b.newPage({viewport:{width:390,height:844}});
    await pg.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    await pg.waitForFunction(()=>typeof window.demoLogin==='function',null,{timeout:30000});
    const has=await pg.evaluate(a=>!!(window.DEMO_ACCOUNTS&&window.DEMO_ACCOUNTS[a]),acct);
    await pg.evaluate(a=>window.demoLogin(a),acct);
    await pg.waitForTimeout(900);
    const r=await pg.evaluate(()=>{
      const d=document.documentElement;
      const over=d.scrollWidth-d.clientWidth;
      const out=[];
      document.querySelectorAll('#app *').forEach(function(e){
        const bx=e.getBoundingClientRect();
        if(bx.right>d.clientWidth+1&&bx.width>0&&bx.height>0&&out.length<6){
          let cls=e.className; if(cls&&cls.baseVal!==undefined)cls=cls.baseVal;
          out.push((e.id?'#'+e.id:'')+'.'+String(cls||'').split(' ').filter(Boolean).slice(0,2).join('.')+' right='+Math.round(bx.right));
        }
      });
      return {over:over,wide:out};
    });
    console.log(label+' | '+acct+' (exists:'+has+') -> overflow '+r.over+'px');
    r.wide.forEach(function(w){console.log('    culprit: '+w)});
    await pg.close();
  }
}
await b.close();
