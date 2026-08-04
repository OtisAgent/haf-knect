/* GENERATED FILE — DO NOT EDIT BY HAND.
   Sliced from index.html between the PRICING-CORE markers by
   tools/build_pricing_core.py. Edit the page, then re-run the script.
   This is what re-prices a job server-side before any payment is raised. */

/* The page reaches for `window`; a worker has no such thing. Pointing it at the
   global object means the sliced code runs unaltered, and the lane factors the
   worker imports land exactly where the quote engine looks for them. */
const window = globalThis;

const REF_MPH=40, NET_POOL=.05;
/* drv = £ per loaded mile paid to the driver · min = the vehicle's minimum transport value (£ ex VAT) */
const VAN={
  small  :{n:'Small van'        ,drv:.80,min:50},
  swb    :{n:'SWB'              ,drv:.90,min:55},
  mwb    :{n:'MWB'              ,drv:1.00,min:60},
  lwb    :{n:'LWB'              ,drv:1.10,min:65},
  xlwb   :{n:'XLWB'             ,drv:1.20,min:70},
  luton  :{n:'Luton — box'         ,drv:1.30,min:75},
  lutonc :{n:'Luton — curtain side',drv:1.30,min:75},
  lutontl:{n:'Luton — tail lift'   ,drv:1.40,min:80}
};
/* ── WHAT EACH VAN CAN ACTUALLY CARRY ──
   Brent, 2 Aug, pointing at speedyfreight.com/vehicles: "use this as a
   reference for sizing of the question — fantastic layout, just change the
   sizing and what can fit." So every vehicle now carries the same five facts
   they publish — load length, width, height, pallets, max weight — with our
   own ladder and nothing above a Luton.
     L/W/H = usable load space in metres
     pal   = standard UK pallets it will take
     kg    = payload the vehicle is rated to carry
     vol   = the biggest load-size band it will hold (see SZ_BAND below)
     tl    = it has a tail lift
     fits  = the same thing said in everyday words, for the tile
   Capability, not price. This exists so a customer can never be quoted a
   vehicle that physically cannot take what they have just described.
   Figures follow the reference for the five vehicles it lists. MWB is not on
   it, so it sits between SWB and LWB. The one deliberate departure is XLWB:
   the reference publishes a payload BELOW its own LWB, which would make the
   longer, dearer van the weaker one — ours keeps climbing. */
function vanSpec(k,L,W,H,pal,kg,vol,fits){
  const v=VAN[k]; if(!v)return;
  v.L=L; v.W=W; v.H=H; v.pal=pal; v.kg=kg; v.vol=vol; v.fits=fits;
}
vanSpec('small'  ,1.3,1.2,1.00,1, 400,3,'a boot-load of boxes, or one light pallet');
vanSpec('swb'    ,2.1,1.2,1.40,2, 800,3,'a couple of pallets, or a small move');
vanSpec('mwb'    ,2.4,1.2,1.50,2,1000,3,'a couple of pallets, taller loads');
vanSpec('lwb'    ,3.3,1.2,1.70,3,1200,4,'a few pallets, or a room of furniture');
vanSpec('xlwb'   ,4.2,1.2,1.75,4,1400,4,'long loads, up to four pallets');
vanSpec('luton'  ,4.2,2.0,2.10,6,1000,5,'a full van load, floor to roof');
vanSpec('lutonc' ,4.2,2.0,2.10,6,1000,5,'a full van load, loaded from the side');
vanSpec('lutontl',4.2,2.0,2.10,6,1000,5,'a full van load, with a tail lift');
VAN.lutontl.tl=true;
/* Cheapest first — a recommendation always lands on the least the job needs */
const VAN_ORDER=['small','swb','mwb','lwb','xlwb','luton','lutonc','lutontl'];

/* ── THE LOAD PICKER ──
   Two questions anybody can answer without a tape measure or a set of scales.
   Each band carries an everyday comparison and a drawn gauge, so the choice is
   read at a glance rather than worked out. `kg` is the top of the weight band;
   `lvl` is the size ladder the vehicle table above is measured against. */
const WT_BAND=[
  {k:'w50'  ,n:'Up to 50 kg' ,s:'one person can lift it'  ,kg:50  ,bars:1},
  {k:'w100' ,n:'Up to 100 kg',s:'two people, or a trolley',kg:100 ,bars:2},
  {k:'w250' ,n:'Up to 250 kg',s:'a part-loaded pallet'    ,kg:250 ,bars:3},
  {k:'w500' ,n:'Up to 500 kg',s:'a full pallet'           ,kg:500 ,bars:4},
  {k:'w1000',n:'1 tonne +'   ,s:'two full pallets or more',kg:1000,bars:5}
];
const SZ_BAND=[
  {k:'s1',n:'Small box'    ,s:'fits on a car seat'      ,lvl:1},
  {k:'s2',n:'A few boxes'  ,s:'fills a car boot'        ,lvl:2},
  {k:'s3',n:'One pallet'   ,s:'about a washing machine' ,lvl:3},
  {k:'s4',n:'A few pallets',s:'a room of furniture'     ,lvl:4},
  {k:'s5',n:'Full van load',s:'floor to roof'           ,lvl:5}
];
/* Heaviness gauge — five bars, the chosen band's worth filled in */
function wtIcon(bars){
  let o='';
  for(let i=0;i<5;i++){
    const h=5+i*3;
    o+='<rect'+(i<bars?' class="fill"':'')+' x="'+(4+i*7)+'" y="'+(20-h)+'" width="5" height="'+h+'" rx="1"/>';
  }
  return '<svg viewBox="0 0 40 24" aria-hidden="true">'+o+'</svg>';
}
/* Space gauge — the same van outline every time, filling up as the load grows,
   so the five choices read as one picture rather than five separate ones */
const SZ_FILL=[
  '<rect class="fill" x="5" y="15" width="6" height="5" rx="1"/>',
  '<rect class="fill" x="5" y="15" width="6" height="5" rx="1"/><rect class="fill" x="12" y="15" width="6" height="5" rx="1"/><rect class="fill" x="5" y="9" width="6" height="5" rx="1"/>',
  '<rect class="fill" x="5" y="8" width="11" height="12" rx="1"/>',
  '<rect class="fill" x="5" y="8" width="11" height="12" rx="1"/><rect class="fill" x="17" y="8" width="11" height="12" rx="1"/>',
  '<rect class="fill" x="5" y="5" width="30" height="15" rx="1"/>'
];
function szIcon(i){
  return '<svg viewBox="0 0 40 24" aria-hidden="true"><rect x="1" y="1" width="38" height="22" rx="3"/>'+SZ_FILL[i]+'</svg>';
}
/* ── THE VEHICLE CARD ──
   Every van says the same three things in the same order, drawn the same way:
   the space inside it, the pallets it takes, the weight it is rated to. Drawn
   icons, never emoji. Built from the table above, so a figure is changed in one
   place and every card, every quote path and every test moves with it. */
const SPEC_ICO={
  dim:'<path d="M8 2.2 14 5.4v5.2L8 13.8 2 10.6V5.4z"/><path d="M2 5.4 8 8.6l6-3.2"/><path d="M8 8.6v5.2"/>',
  pal:'<rect x="2" y="5" width="12" height="2.4" rx=".4"/><rect x="2" y="8.4" width="12" height="2.4" rx=".4"/><path d="M3.8 10.8v1.8M12.2 10.8v1.8"/>',
  wt :'<path d="M4.6 6h6.8l1.5 7.2H3.1z"/><path d="M6.4 6a1.6 1.6 0 0 1 3.2 0"/>'
};
function specIco(k){return '<svg viewBox="0 0 16 16" aria-hidden="true">'+SPEC_ICO[k]+'</svg>';}
const m1=n=>n.toFixed(2).replace(/0$/,'');
/* The three spec rows, in the reference's order: how big, how many, how heavy */
function vanSpecRows(k){
  const v=VAN[k];
  if(!v||!v.L)return '';
  return '<span class="vp-spec">'
    +'<span class="vp-row">'+specIco('dim')+m1(v.L)+' &#215; '+m1(v.W)+' &#215; '+m1(v.H)+' m</span>'
    +'<span class="vp-row">'+specIco('pal')+v.pal+(v.pal===1?' pallet':' pallets')+'</span>'
    +'<span class="vp-row">'+specIco('wt')+v.kg.toLocaleString('en-GB')+' kg max</span>'
    +'</span>';
}
/* One vehicle card. `cls` and `fn` differ between the front calculator and Fast
   Quote; everything a customer reads is identical on both. */
function vanCardHTML(k,cls,fn){
  const v=VAN[k];
  return '<button class="'+cls+' vcard" type="button" data-van="'+k+'" onclick="'+fn+'(this,\''+k+'\')">'
    +'<span class="vp-n">'+v.n+'</span>'
    +'<span class="vp-sub">'+(v.fits||'')+'</span>'
    +vanSpecRows(k)+'</button>';
}
/* The smallest — and so the cheapest — van that will genuinely take this load.
   Weight and space are both hard limits; neither is allowed to be fudged. */
function recommendVan(wtKey,szKey){
  const w=WT_BAND.find(b=>b.k===wtKey), z=SZ_BAND.find(b=>b.k===szKey);
  if(!w||!z)return null;
  return VAN_ORDER.find(k=>VAN[k].kg>=w.kg&&VAN[k].vol>=z.lvl)||null;
}
/* A pallet-sized load with real weight on it has to come off the van somehow.
   We say so in plain words rather than quietly charging for a tail lift. */
function needsTailLiftHint(wtKey,szKey){
  const w=WT_BAND.find(b=>b.k===wtKey), z=SZ_BAND.find(b=>b.k===szKey);
  return !!(w&&z&&w.kg>=250&&z.lvl>=3);
}
/* The top weight band is open-ended — "1 tonne +" could be 1.1 or 1.4 tonnes.
   We price the tonne and say out loud that heavier steps up a van, rather than
   quoting a vehicle that would turn up and not be able to take it. */
function openBandNote(wtKey,vanKey){
  const w=WT_BAND[WT_BAND.length-1];
  if(wtKey!==w.k)return '';
  const v=VAN[vanKey];
  if(!v)return '';
  /* only a van that is bigger BOTH ways is a real step up — more payload in a
     smaller body would be worse advice than saying nothing */
  const bigger=VAN_ORDER.map(k=>VAN[k]).find(x=>x.kg>v.kg&&x.vol>=v.vol);
  const t=(v.kg/1000).toFixed(1);
  return ' “'+w.n+'” is open-ended — if it is over '+t+' tonnes '+(bigger
    ?'tell us and we will step up to the '+bigger.n+'.'
    :'tell us: that is this van at its limit and we will check it before confirming.');
}
/* fee = HAF network fee as a % of the carrier transport value · flr = the floor that fee may never drop below · svc = urgency premium paid to the driver */
const URG={flex:{n:'Flexible',fee:.20,flr:.15,svc:1},sday:{n:'Same-day',fee:.20,flr:.15,svc:1},urg:{n:'Urgent',fee:.30,flr:.22,svc:1.10},timed:{n:'Timed delivery',fee:.25,flr:.18,svc:1}};
/* ── DRIVER REWARD RATE ──
   Pence per loaded mile ON TOP of the vehicle rate, set by the driver taking
   the job: PLNA tier, fleet tier, or a paid HAF KNECT membership. Highest wins,
   never stacks.
   FRAMEWORK-V7 (Brent 2026-08-02): held at £0.00/mile for now — "for now
   offering more for a driver isn't right" — and if it is ever switched back on,
   HAF funds it out of its own share rather than the customer's price:
   "i'm happy to take less margin for HAF then make the customers pay more".
   DRV_REWARD.on flips it; DRV_REWARD.floor is the least HAF may retain. */
const DRV_REWARD={on:false,fundedBy:'HAF',floor:.08};
const DRV_LEVEL={free:{n:'Free driver',up:0},member:{n:'Member driver',up:.10},pro:{n:'Pro driver',up:.25}};
/* ── ACCOUNT NETWORK-FEE REDUCTION ──
   Percentage points off the job-type fee for the account posting the job —
   freight forwarder, business, fleet or paid HAF KNECT member. One ladder for
   every account type. Never breaches the job type's floor. */
const ACC_LEVEL={lite:{n:'Free account',cut:0},plus:{n:'Plus account',cut:.025},pro:{n:'Pro account',cut:.05}};
/* The signed-in account's level, set the moment someone signs in. A quote taken
   before anyone signs in is priced at the free rung — never guessed upwards. */
window.HAF_ACCOUNT_LEVEL='lite';
/* Quote options for THIS session. The driver level is deliberately absent: at
   quote time nobody has taken the job yet, so the customer sees the free-rate
   price and the rate is re-run against the real driver's level on allocation. */
/* fromPc lets the lane adjustment see where the job STARTS, not just where it
   ends — Sheffield→Manchester and Sheffield→Birmingham are different lanes. */
function quoteOpts(fromPc){return{account:window.HAF_ACCOUNT_LEVEL||'lite',fromPc:fromPc||null};}
/* ── LANE ADJUSTMENT (FRAMEWORK-V6) ──
   The route's own small adjustment — how the road really drives, how likely a
   paid load back is, how busy the lane is, and what drivers and customers say
   about it. Loaded from /admin/lane-factors-v1.js so the customer quote and the
   back office read the SAME rules from the SAME file and can never drift apart.
   If it is unavailable the quote falls back to the destination-area grade
   below, which is exactly how the site has always priced. */
function laneAdjust(fromPc,toPc,miles,mins){
  const L=window.HAFLaneFactors;
  if(!L||!toPc)return{factor:zoneFactorFor(toPc),basis:'AREA_DEFAULT',reasons:[]};
  try{return L.laneFactor(fromPc,toPc,{miles:miles,minutes:mins});}
  catch(e){return{factor:zoneFactorFor(toPc),basis:'AREA_DEFAULT',reasons:[]};}
}
/* Area-adaptive zone factor — return-load probability by destination postcode area.
   Still here as the bottom rung of the lane ladder and the offline fallback. */
const ZONE_STRONG={M:1,B:1,LS:1,S:1,L:1,NG:1,LE:1,CV:1,BS:1,E:1,EC:1,N:1,NW:1,SE:1,SW:1,W:1,WC:1,G:1,EH:1,NE:1,SR:1,DN:1,WF:1,BD:1,HD:1,OL:1,SK:1,WA:1,WN:1,BL:1,PR:1,ST:1,WS:1,WV:1,DY:1,DE:1,SL:1,RG:1,MK:1,LU:1,WD:1,EN:1,HA:1,UB:1,TW:1,KT:1,SM:1,CR:1,BR:1,RM:1,IG:1};
const ZONE_REMOTE={IV:1,KW:1,PH:1,HS:1,ZE:1,AB:1,DG:1,TD:1,TR:1,LD:1,SA:1};
const ZONE_LIMITED={LL:1,SY:1,EX:1,TQ:1,PL:1,DT:1,TA:1,LN:1,NR:1,IP:1,CT:1,TN:1,BN:1,PO:1,CA:1,LA:1,FY:1,YO:1,HU:1,CO:1,CM:1};
function zoneFactorFor(pc){
  const a=((pc||'').trim().match(/^[A-Z]+/i)||[''])[0].toUpperCase();
  return ZONE_REMOTE[a]?1.12:ZONE_LIMITED[a]?1.07:ZONE_STRONG[a]?1:1.03;
}
/* ── MINIMUM TRANSPORT VALUE ──
   The minimum steps up by VEHICLE, never by distance — one ladder only.
   A genuinely short run in the area is handling work, not road work, so that
   one minimum eases down for very low mileage and climbs back to full by 25
   miles. The curve is smooth end to end — there is no mile at which the price
   jumps, so a customer can never be quoted less for a longer job:
     0 mi    : 30% below the vehicle minimum
     0–15 mi : easing from 30% below to 20% below   (Brent's 20–30% band)
     15–25 mi: easing from 20% below back to full
     25 mi + : the full vehicle minimum
   Above the minimum the mileage calculation takes over on its own. */
let LOCAL_MAX_OFF=.30, LOCAL_BAND_OFF=.20, LOCAL_BAND_AT=15, LOCAL_FULL_AT=25;
/* ── THE DATABASE IS THE SOURCE OF THESE RATES ──
   Everything above is the built-in safety net — the rates the page falls back
   to if the network is unreachable. In normal running the saved framework comes
   down from the database on load and is poured into the constants above, so a
   rate Brent changes on the Pricing Engine page moves every quote on the site
   without anyone rebuilding this file.
   Mapping is by code: the database speaks SMALL_VAN, the quote form speaks
   'small'. Anything the saved config does not carry keeps its built-in value. */
const PX_VAN={SMALL_VAN:'small',SWB_VAN:'swb',MWB_VAN:'mwb',LWB_VAN:'lwb',XLWB_VAN:'xlwb',LUTON:'luton',LUTON_CURTAIN:'lutonc',LUTON_TAIL:'lutontl'};
const PX_JOB={FLEX_SAMEDAY:'flex',STD_SAMEDAY:'sday',URGENT:'urg',TIMED:'timed'};
const PX_DRV={FREE:'free',MEMBER:'member',PRO:'pro'};
const PX_ACC={LITE:'lite',PLUS:'plus',PRO:'pro'};
function hafApplyPricingConfig(cfg){
  if(!cfg||typeof cfg!=='object')return [];
  const done=[];
  if(Array.isArray(cfg.vehicles)){
    cfg.vehicles.forEach(v=>{const k=PX_VAN[v.code];if(!k||!VAN[k])return;
      if(typeof v.baseRate==='number')VAN[k].drv=v.baseRate;
      if(typeof v.minTransportValue==='number')VAN[k].min=v.minTransportValue;});
    done.push('vehicle rates');
  }
  if(Array.isArray(cfg.jobTypes)){
    cfg.jobTypes.forEach(t=>{const k=PX_JOB[t.code];if(!k||!URG[k])return;
      if(typeof t.marginPct==='number')URG[k].fee=t.marginPct/100;
      if(typeof t.floorPct==='number')URG[k].flr=t.floorPct/100;});
    done.push('network fees');
  }
  if(cfg.driverLevels){
    Object.keys(PX_DRV).forEach(c=>{const l=cfg.driverLevels[c];
      if(l&&typeof l.rewardGbpPerMile==='number')DRV_LEVEL[PX_DRV[c]].up=l.rewardGbpPerMile;});
    done.push('driver reward');
  }
  if(cfg.driverReward){
    if(typeof cfg.driverReward.enabled==='boolean')DRV_REWARD.on=cfg.driverReward.enabled;
    if(cfg.driverReward.fundedBy)DRV_REWARD.fundedBy=cfg.driverReward.fundedBy==='CUSTOMER'?'CUSTOMER':'HAF';
    if(typeof cfg.driverReward.minRetainedPctOfCustomer==='number')DRV_REWARD.floor=cfg.driverReward.minRetainedPctOfCustomer/100;
    done.push('reward funding');
  }
  if(cfg.accountLevels){
    Object.keys(PX_ACC).forEach(c=>{const a=cfg.accountLevels[c];
      if(a&&typeof a.feeReductionPts==='number')ACC_LEVEL[PX_ACC[c]].cut=a.feeReductionPts/100;});
    done.push('account reductions');
  }
  const h=cfg.localHandling;
  if(h){
    if(typeof h.maxReductionPct==='number')LOCAL_MAX_OFF=h.maxReductionPct/100;
    if(typeof h.bandReductionPct==='number')LOCAL_BAND_OFF=h.bandReductionPct/100;
    if(typeof h.bandAtMiles==='number')LOCAL_BAND_AT=h.bandAtMiles;
    if(typeof h.fullMinimumFromMiles==='number')LOCAL_FULL_AT=h.fullMinimumFromMiles;
    done.push('short-run taper');
  }
  return done;
}
function minTransportValue(v,miles){
  const m=Math.max(0,miles);
  let f;
  if(m>=LOCAL_FULL_AT) f=1;
  else if(m>=LOCAL_BAND_AT)
    f=(1-LOCAL_BAND_OFF)+LOCAL_BAND_OFF*(m-LOCAL_BAND_AT)/(LOCAL_FULL_AT-LOCAL_BAND_AT);
  else
    f=(1-LOCAL_MAX_OFF)+(LOCAL_MAX_OFF-LOCAL_BAND_OFF)*(m/LOCAL_BAND_AT);
  return Math.round(v.min*f*100)/100;
}
/* Core quote: returns the ex-VAT customer subtotal with the three amounts kept apart.
   opts.driver  = 'free' | 'member' | 'pro'   — the level of the driver taking the job
   opts.account = 'lite' | 'plus'   | 'pro'   — the level of the account posting it
   Both default to the free rung, so a quote with no account and no allocated
   driver prices exactly as it did before these levers existed. */
function v3Price(miles,mins,vanKey,urgKey,toPc,opts){
  const v=VAN[vanKey]||VAN.lwb,u=URG[urgKey]||URG.sday;
  const o=opts||{};
  const dl=DRV_LEVEL[o.driver]||DRV_LEVEL.free;
  const al=ACC_LEVEL[o.account]||ACC_LEVEL.lite;
  /* FRAMEWORK-V7: the reward is what the DRIVER is paid; the customer is priced
     on the plain vehicle rate, so which driver accepts a job never moves the
     quote. Held at zero today (DRV_REWARD.on === false). */
  const reward=DRV_REWARD.on?dl.up:0;
  const rate=v.drv+reward;                          /* what the driver is paid per mile */
  const hours=(mins&&mins>0?mins:miles/32*60)/60;
  const lane=laneAdjust(o.fromPc,toPc,miles,mins);
  const mult=Math.min(u.svc*lane.factor,1.40);
  /* The lane lifts the vehicle minimum too, or a hard lane that happens to be
     short would price the same as an easy one — the minimum would swallow the
     whole adjustment. */
  const floor=minTransportValue(v,miles)*lane.factor;
  const p2=n=>Math.round((n+Number.EPSILON)*100)/100;
  const transportAt=r=>{const rb=Math.max(miles*r,hours*r*REF_MPH);return p2(Math.max(rb*mult,floor));};
  let carrier=transportAt(rate);                    /* 1. Carrier Transport Value, driver's rate */
  const carrierFree=transportAt(v.drv);             /*    the same job at the plain vehicle rate */
  const distCost=miles*rate, timeCost=hours*rate*REF_MPH;
  const feePct=Math.max(u.fee-al.cut,u.flr);        /*    fee after the account reduction, floor held */
  /* ── WHAT THE PERCENTAGE MEANS (FRAMEWORK-V6) ──
     It is the share of the customer price HAF KEEPS, so the customer price is
     the transport value grossed up. That is the only reading under which
     Brent's own bands — 20–30% free accounts, never below 15% paid — are true.
     The driver is still paid the whole transport value and the fee still sits
     on top of it; only the meaning of the number changed. */
  /* V7: priced on the free-driver value when HAF funds the reward, so two
     drivers on two tiers quote one price. */
  const basis=DRV_REWARD.fundedBy==='HAF'?carrierFree:carrier;
  const sub=p2(basis/(1-Math.min(feePct,.95)));     /* 3. Customer price, ex VAT  */
  /* HAF funds the reward down to its floor share and no further — past that it
     is trimmed and flagged, and the customer price still does not move. */
  let rewardGbp=p2(Math.max(0,carrier-carrierFree)),rewardTrimmed=0;
  if(DRV_REWARD.fundedBy==='HAF'&&rewardGbp>0){
    const afford=p2(sub-sub*DRV_REWARD.floor-carrierFree);
    if(afford<rewardGbp){rewardTrimmed=p2(rewardGbp-Math.max(0,afford));rewardGbp=p2(Math.max(0,afford));carrier=p2(carrierFree+rewardGbp);}
  }
  const fee=p2(sub-carrier);                        /* 2. HAF Network Fee         */
  return{sub,carrier,fee,feePct,lane,driverPay:carrier,floor,onMinimum:carrier===p2(floor),
         carrierFree,rewardGbp,rewardTrimmed,rewardFundedBy:DRV_REWARD.fundedBy,
         driverRate:p2(rate),driverLevel:dl.n,driverRewardPerMile:reward,
         accountLevel:al.n,feeCutPts:p2((u.fee-feePct)*100),
         pool:p2(sub*NET_POOL),timeWins:timeCost>distCost,miles,hours};
}

export { VAN, URG, DRV_LEVEL, ACC_LEVEL, DRV_REWARD, REF_MPH, NET_POOL, laneAdjust, minTransportValue, v3Price, hafApplyPricingConfig };
