/* Private order — the rules, checked without a network.

   Everything here is a rule that decides whether money is right or whether a
   job stays private. The live test drives the real endpoint; this one makes
   sure the arithmetic and the refusals are correct before anything is posted
   anywhere. */

import {
  hafInvoiceNumber, isHafInvoiceNumber, isPrivateOwner, windowMinutes,
  isPrivateMode, priceFromPounds, toPence, driverUsername, readPrivateOrder,
  dueDate, PRIVATE_FOREVER_MINS, MIN_WINDOW_MINS, MAX_WINDOW_MINS
} from './private-core.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name); } };

console.log('\n1. THE INVOICE NUMBER — dated series, no running order');
{
  const n = hafInvoiceNumber(new Date(Date.UTC(2026, 8, 9)));
  ok('shape is HAF-YYMMDD-XXXXXXX', /^HAF-260909-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{7}$/.test(n));
  ok('passes its own checker', isHafInvoiceNumber(n));
  ok('rejects a sequential number', !isHafInvoiceNumber('INV-0004'));
  ok('rejects a number with a confusable character', !isHafInvoiceNumber('HAF-260909-O0I1LU2'));

  /* The whole point of the random half is that volume cannot be read off it.
     Two invoices a moment apart must not be adjacent, and 5,000 in a day must
     not collide. */
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(hafInvoiceNumber(new Date(Date.UTC(2026, 8, 9))));
  ok('5,000 same-day numbers are all distinct', seen.size === 5000);
}

console.log('\n2. WHO MAY RAISE ONE');
{
  ok('Brent may', isPrivateOwner({}, 'BF638793'));
  ok('lower case is the same person', isPrivateOwner({}, 'bf638793'));
  ok('an ordinary member may not', !isPrivateOwner({}, 'JW012390'));
  ok('nobody at all may not', !isPrivateOwner({}, ''));
  ok('the list is configurable', isPrivateOwner({ PRIVATE_OWNERS: 'AB111111, CD222222' }, 'CD222222'));
  ok('and configuring it replaces the default', !isPrivateOwner({ PRIVATE_OWNERS: 'AB111111' }, 'BF638793'));
}

console.log('\n3. PRIVATE MEANS PRIVATE');
{
  ok('private mode never lapses', windowMinutes('private') === PRIVATE_FOREVER_MINS);
  ok('a hundred years is longer than any job', PRIVATE_FOREVER_MINS > 50 * 365 * 24 * 60);
  ok('anything unrecognised falls back to private, not open', windowMinutes('nonsense') === PRIVATE_FOREVER_MINS);
  ok('undefined mode is private', windowMinutes(undefined) === PRIVATE_FOREVER_MINS);
  ok('isPrivateMode agrees', isPrivateMode('private') && isPrivateMode(undefined) && !isPrivateMode('network_after'));

  ok('a chosen window is kept', windowMinutes('network_after', 120) === 120);
  ok('a silly short window is floored', windowMinutes('network_after', 1) === MIN_WINDOW_MINS);
  ok('a silly long window is capped', windowMinutes('network_after', 999999) === MAX_WINDOW_MINS);
  ok('a missing window gets a sensible default', windowMinutes('network_after', '') === 120);
  ok('a window that is not a number gets the default', windowMinutes('network_after', 'soon') === 120);

  /* The trap this guards: a "fallback" window so short it is effectively open,
     smuggled in as a private job. */
  ok('zero minutes is not open-to-everyone', windowMinutes('network_after', 0) >= MIN_WINDOW_MINS);
  ok('negative minutes is not open-to-everyone', windowMinutes('network_after', -50) >= MIN_WINDOW_MINS);
}

console.log('\n4. POUNDS OFF A SCREEN');
{
  ok('450 is 45000p', toPence('450') === 45000);
  ok('450.50 is 45050p', toPence('450.50') === 45050);
  ok('a pound sign is fine', toPence('£450.00') === 45000);
  ok('a thousands comma is fine', toPence('1,250.00') === 125000);
  ok('blank is nothing, not zero', toPence('') === null);
  ok('words are nothing', toPence('four hundred') === null);
  ok('three decimals are refused, not rounded', toPence('12.345') === null);
  ok('a negative is refused', toPence('-50') === null);
}

console.log('\n5. THE MONEY');
{
  const m = priceFromPounds('450', '320');
  ok('ex VAT is what was typed', m.quote_ex_vat_pence === 45000);
  ok('VAT is 20%', m.vat_pence === 9000);
  ok('the customer pays ex plus VAT', m.total_pence === 54000);
  ok('the driver gets what was typed', m.driver_pay_pence === 32000);
  ok('HAF keeps the difference EX VAT', m.haf_margin_pence === 13000);

  /* The mistake this exists to stop: counting the VAT as margin, which would
     flatter every private job by twenty per cent. */
  ok('margin is not computed off the VAT-inclusive total', m.haf_margin_pence !== m.total_pence - m.driver_pay_pence);

  ok('rounding is to the penny', priceFromPounds('99.99', '0').vat_pence === 2000);
  ok('a free job is refused', priceFromPounds('0', '0').error);
  ok('no price is refused', priceFromPounds('', '100').error);
  ok('no driver pay is refused', priceFromPounds('450', '').error);
  ok('paying the driver more than the customer pays is refused',
     Boolean(priceFromPounds('300', '400').error));
  ok('paying the driver exactly the price is allowed', !priceFromPounds('300', '300').error);
}

console.log('\n6. THE DRIVER');
{
  ok('a real username is read', driverUsername('jw012390') === 'JW012390');
  ok('spaces are trimmed', driverUsername('  BF638793 ') === 'BF638793');
  ok('too short is refused', driverUsername('JW01') === null);
  ok('no letters is refused', driverUsername('12345678') === null);
  ok('an email is refused', driverUsername('driver@example.com') === null);
  ok('blank is refused', driverUsername('') === null);
}

console.log('\n7. THE WHOLE FORM');
{
  const good = {
    collect_postcode: 's9 1xh', deliver_postcode: 'm1 2ab',
    driver_username: 'jw012390', customer_name: 'Acme Ltd',
    customer_email: 'buyer@acme.co.uk', goods: '12 pallets',
    customer_price: '450', driver_pay: '320', mode: 'private'
  };
  const r = readPrivateOrder(good);
  ok('a complete form is accepted', r.ok);
  ok('postcodes come back in Royal Mail spacing', r.order.collect === 'S9 1XH' && r.order.deliver === 'M1 2AB');
  ok('the driver is upper cased', r.order.driver === 'JW012390');
  ok('private is the mode', r.order.mode === 'private' && r.order.window_minutes === PRIVATE_FOREVER_MINS);
  ok('the money rode along', r.order.total_pence === 54000);
  ok('it is not a test job unless said', r.order.is_test === false);

  const miss = (k, v) => readPrivateOrder({ ...good, [k]: v });
  ok('a town instead of a postcode is refused', !miss('collect_postcode', 'Sheffield').ok);
  ok('and the refusal names the end that is wrong',
     /collection/i.test(miss('collect_postcode', 'Sheffield').error));
  ok('a bad delivery postcode is refused', !miss('deliver_postcode', 'ZZZZZ').ok);
  ok('no customer name is refused', !miss('customer_name', '  ').ok);
  ok('a bad email is refused', !miss('customer_email', 'buyer@acme').ok);
  ok('no goods is refused', !miss('goods', '').ok);
  ok('a bad driver is refused', !miss('driver_username', 'nope').ok);
  ok('no price is refused', !miss('customer_price', '').ok);

  /* Every refusal has to be sayable to a person. A blank or a code on screen
     is a dead end for the one man who has to fix it. */
  const errs = ['collect_postcode', 'customer_name', 'customer_email', 'goods', 'driver_username', 'customer_price']
    .map((k) => miss(k, '').error);
  ok('every refusal is a sentence', errs.every((e) => typeof e === 'string' && e.length > 15));

  const nw = readPrivateOrder({ ...good, mode: 'network_after', window_minutes: '90' });
  ok('the fallback mode keeps its window', nw.order.window_minutes === 90);
  const test = readPrivateOrder({ ...good, is_test: true });
  ok('a test job is flagged at birth', test.order.is_test === true);
}

console.log('\n8. WHEN IT IS DUE');
{
  const issued = new Date(Date.UTC(2026, 8, 9));
  ok('14 days is the default', dueDate(issued) === '2026-09-23');
  ok('due on receipt is the same day', dueDate(issued, 0) === '2026-09-09');
  ok('30 days crosses the month end', dueDate(issued, 30) === '2026-10-09');
  ok('nonsense falls back to the default', dueDate(issued, 'soon') === '2026-09-23');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
