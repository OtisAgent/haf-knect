/* The gate, on the live site. Every case here is a REFUSAL, so nothing is
   written and no order or deposit is raised. The one accepting case uses
   /quote, which prices and writes nothing. */
const BASE = 'https://knect.usehaf.co.uk';
const GOOD = { customer_name:'Gate Test', customer_email:'gate@example.com',
  customer_phone:'07000000000', goods:'gate proof', vehicle_code:'lwb', job_type_code:'flex' };
let n=0, pass=0;
const check = (name, ok, got) => { n++; if(ok) pass++;
  console.log(`${ok?'PASS':'FAIL'}  ${String(n).padStart(2)}  ${name}${ok?'':`   >>> got ${JSON.stringify(got)}`}`); };
const place = async (c,d) => {
  const r = await fetch(`${BASE}/api/order/place`, { method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ ...GOOD, collect_postcode:c, deliver_postcode:d }) });
  return { status:r.status, body: await r.json().catch(()=>null) };
};
const refuses = async (name, c, d, needle) => {
  const r = await place(c,d);
  const msg = (r.body && r.body.error) || '';
  check(name, r.body && r.body.ok === false && msg.includes(needle), r);
  return msg;
};

await refuses('a town at the collection is refused',        'Sheffield','M1 1AE','collection');
await refuses('a town at the delivery is refused',          'S9 1XH','Manchester','delivery');
await refuses('gibberish is refused',                       'JDBSBSJS','56165156','postcode');
await refuses('digits are refused',                         '56165156','M1 1AE','postcode');
await refuses('a district alone is refused',                'S9','M1','postcode');
await refuses('a street line is refused',                   '12 High Street','M1 1AE','postcode');
await refuses('a well-shaped postcode that is not a real place is refused',
                                                            'ZZ9 9ZZ','M1 1AE','ZZ9 9ZZ');
await refuses('an empty collection is still refused',       '','M1 1AE','postcode');

const msg = await refuses('the refusal reads like English, not an error code',
                                                            'Sheffield','M1 1AE','like S9 1XH');
check('the refusal names the end that is wrong', /collection/.test(msg), msg);
check('the refusal never mentions a database or a function',
      !/(null|undefined|haf_postcode_norm|error 5)/i.test(msg), msg);

/* Nothing above may have created an order. */
const stray = await fetch(`${BASE}/api/order/place`, { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ ...GOOD, collect_postcode:'Sheffield', deliver_postcode:'Manchester' }) })
  .then(r=>r.json());
check('a refused order carries no reference, no deposit and no pay link',
      !stray.job_ref && !stray.pay_url && !stray.deposit_pence, stray);

/* A good route still prices. /quote writes nothing. */
const q = await fetch(`${BASE}/api/order/quote`, { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ collect_postcode:'S9 1XH', deliver_postcode:'M1 1AE',
                         vehicle_code:'lwb', job_type_code:'flex' }) }).then(r=>r.json());
check('a real route still prices', q && q.ok === true && q.quote && q.quote.total_pence > 0, q);
const q2 = await fetch(`${BASE}/api/order/quote`, { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ collect_postcode:'s91xh', deliver_postcode:'m11ae',
                         vehicle_code:'lwb', job_type_code:'flex' }) }).then(r=>r.json());
check('a carelessly typed postcode prices the same, not as a second warehouse',
      q2 && q2.ok === true && q2.quote && q2.quote.total_pence === q.quote.total_pence, q2);

console.log(`\n${pass} of ${n} checks passed`);
process.exit(pass===n?0:1);
