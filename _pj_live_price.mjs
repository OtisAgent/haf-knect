import {chromium} from 'playwright';
const b=await chromium.launch();const pg=await b.newPage({viewport:{width:420,height:1000}});
await pg.goto('https://knect.usehaf.co.uk/',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500);
await pg.locator('.calc-box .pj-open').first().click();
await pg.fill('#pj-txt-a',`Collection: Unit 4 Callum Park, Attercliffe, Sheffield S9 1AA
Contact: John Wright 07700 900123
Delivery: 22 Trafford Way, Manchester M1 1AA
Contact: Sarah Ellis 07700 900456
Goods: 3 pallets of boxed clothing
Weight: 300kg
Tail lift required at delivery, non-stackable
Collection Friday from 9am, must be on site before 4pm`);
await pg.locator('#pj-body-a button:has-text("Read it")').click();await pg.waitForTimeout(500);
await pg.locator('#pj-found-a button:has-text("Use these details")').click();await pg.waitForTimeout(5000);
console.log('price on the live page:',(await pg.locator('#fq-pr-range').innerText()).trim());
console.log('basis:',(await pg.locator('#fq-pr-basis').innerText()).trim().replace(/\n+/g,' | '));
await pg.locator('#fq-6').screenshot({path:'_pj_live_price.png'}).catch(()=>{});
await b.close();
