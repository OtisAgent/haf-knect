import {chromium} from 'playwright';import http from 'http';import fs from 'fs';import path from 'path';
const ROOT='/agent/workspace/knect-consign';
const srv=http.createServer((q,s)=>{let f=decodeURIComponent(q.url.split('?')[0]);if(f==='/')f='/index.html';
const p=path.join(ROOT,f);if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end('no');}
s.writeHead(200,{'content-type':p.endsWith('.html')?'text/html; charset=utf-8':'text/plain'});s.end(fs.readFileSync(p));});
await new Promise(r=>srv.listen(8792,r));
const b=await chromium.launch();
for(const [name,w,dark] of [['phone-day',390,false],['phone-night',390,true],['desk-day',1280,false]]){
  const pg=await b.newPage({viewport:{width:w,height:900}});
  await pg.goto('http://127.0.0.1:8792/',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(600);
  if(dark)await pg.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  await pg.locator('.calc-box .pj-open').first().click();
  await pg.fill('#pj-txt-a','Collection: Unit 4 Callum Park, Sheffield S9 1AA\nContact: John Wright 07700 900123\nDelivery: 22 Trafford Way, Manchester M1 1AA\nContact: Sarah Ellis 07700 900456\n3 pallets of boxed clothing, 300kg, tail lift needed\nCollect Friday from 9am, on site before 4pm');
  await pg.locator('#pj-body-a button:has-text("Read it")').click();await pg.waitForTimeout(400);
  await pg.locator('.pj').first().screenshot({path:'/agent/workspace/knect-consign/_pj_'+name+'.png'});
  const box=await pg.locator('.pj-body').first().boundingBox();
  console.log(name,'panel width',Math.round(box.width),'height',Math.round(box.height));
  await pg.close();
}
await b.close();srv.close();
