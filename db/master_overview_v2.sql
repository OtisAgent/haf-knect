-- ═══════════════════════════════════════════════════════════════════════════
--  HAF KNECT — Master Overview v2
--  Brief: HAF_KNECT_Master_Overview_OTIS_Build_Brief, sections 5-8.
--
--  Three things the old overview could not answer:
--    5. membership + founder + role + job + money totals for the whole network
--    6. one master CRM record per member, opened from the account list
--    8. where every payment and payout has got to
--
--  Rules held throughout:
--    * Founder is a STATUS, never a fourth membership. It is counted from the
--      founding-members table, alongside the membership, never instead of it.
--    * Nothing is invented. Every figure is a count or a sum of real rows; a
--      table with no rows returns 0 and the UI says "nothing yet".
--    * Test rows are excluded from every network figure.
--    * Same signature on haf_network_overview - adding an argument would leave
--      two overloads behind and every caller would get an HTTP 300.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 5. Master Network Overview ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.haf_network_overview(
  p_username text, p_hash text, p_relay text DEFAULT NULL, p_cp text DEFAULT NULL)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if p_username <> 'BF638793'
     or public.plna_cred_kind(p_username, p_hash, p_relay, p_cp) is null then
    return;
  end if;

  return query
  select json_build_object(
    'as_at', now(),
    'total',     (select count(*) from haf_network_account where not is_test),
    'test_rows', (select count(*) from haf_network_account where is_test),

    'by_type', (
      select json_agg(json_build_object('type', t.k, 'label', t.l, 'count', c.n)
                      order by t.ord)
      from (values ('business','Business accounts',1),
                   ('driver','Drivers (PLNA)',2),
                   ('freight','Freight forwarders',3),
                   ('fleet','Fleet accounts',4),
                   ('fleet_driver','Drivers inside fleets',5)) as t(k,l,ord)
      cross join lateral (
        select count(*) as n from haf_network_account a
        where a.account_type = t.k and not a.is_test) c),

    'by_status', (
      select json_agg(json_build_object('status', s.k, 'label', s.l, 'count', c.n)
                      order by s.ord)
      from (values ('active','Active',1),
                   ('on_hold','On hold',2),
                   ('missing_documents','Missing documents',3),
                   ('rejected','Rejected',4),
                   ('blocked','Blocked',5)) as s(k,l,ord)
      cross join lateral (
        select count(*) as n from haf_network_account a
        where a.status = s.k and not a.is_test) c),

    'by_tier', (
      select json_agg(json_build_object('tier', t.k, 'label', t.l, 'count', c.n)
                      order by t.ord)
      from (values ('free','Free',1),('plus','Plus',2),
                   ('pro','Pro',3),('founder','Founder',4)) as t(k,l,ord)
      cross join lateral (
        select count(*) as n from haf_network_account a
        where a.tier = t.k and not a.is_test) c),

    -- ── MEMBERSHIP: one ladder, Free / Plus / Pro, and nothing else ──
    -- Any row still carrying 'founder' in the tier column is counted apart as
    -- mis-filed rather than quietly folded into a membership it may not hold.
    'membership', json_build_object(
      'free', (select count(*) from haf_network_account
               where not is_test and coalesce(tier,'free') = 'free'),
      'plus', (select count(*) from haf_network_account
               where not is_test and tier = 'plus'),
      'pro',  (select count(*) from haf_network_account
               where not is_test and tier = 'pro'),
      'misfiled_as_founder', (select count(*) from haf_network_account
               where not is_test and tier = 'founder')),

    -- ── FOUNDER: a status held beside a membership, counted on its own ──
    'founder', json_build_object(
      'paid',            (select count(*) from knect_founding_members),
      'paid_value',      (select coalesce(sum(amount_gbp),0) from knect_founding_members),
      'linked_to_account',(select count(*) from knect_founding_members
                           where haf_username is not null and haf_username <> ''),
      'code_issued',     (select count(*) from knect_founding_members where plna_code is not null),
      'code_redeemed',   (select count(*) from knect_founding_members where plna_code_redeemed_at is not null)),

    -- ── JOBS: every source the network can post work through ──
    'jobs', json_build_object(
      'posted',    (select (select count(*) from jobs)
                         + (select count(*) from business_jobs)
                         + (select count(*) from plna_knect_handover where not coalesce(is_test,false))),
      'accepted',  (select (select count(*) from jobs where status in ('assigned','accepted','collection','transit'))
                         + (select count(*) from business_jobs where status in ('allocated','assigned','in_progress'))
                         + (select count(*) from plna_knect_handover where not coalesce(is_test,false) and claimed_at is not null)),
      'completed', (select (select count(*) from jobs where status = 'delivered' or actual_delivery is not null)
                         + (select count(*) from business_jobs where status = 'completed')
                         + (select count(*) from plna_knect_handover where not coalesce(is_test,false) and completed_at is not null)),
      'cancelled', (select (select count(*) from jobs where status = 'cancelled')
                         + (select count(*) from business_jobs where status = 'cancelled')),
      'value',     (select (select coalesce(sum(pay_amount),0) from jobs)
                         + (select coalesce(sum(coalesce(price_final,price_estimate)),0) from business_jobs))),

    -- ── MONEY: driver side, HAF side, and what is stuck ──
    'money', json_build_object(
      'driver_payouts',  (select coalesce(sum(pay_amount),0) from jobs
                          where status = 'delivered' or actual_delivery is not null),
      'haf_income',      (select coalesce(sum(haf_fee_amount),0) from plna_knect_handover
                          where not coalesce(is_test,false) and completed_at is not null),
      'referral_accrued',(select coalesce(sum(amount),0) from plna_referral_ledger
                          where status in ('accrued','payable')),
      'referral_paid',   (select coalesce(sum(amount),0) from plna_referral_ledger
                          where status = 'paid'),
      'awaiting_payout', (select count(*) from plna_referral_ledger
                          where status in ('accrued','payable')),
      'held_for_review', (select count(*) from plna_referral_ledger
                          where status in ('review','held','failed'))),

    'funnel', json_build_object(
      'applied',         (select count(*) from haf_network_account where not is_test),
      'email_confirmed', (select count(*) from haf_network_account where not is_test and email_confirmed),
      'documents_in',    (select count(*) from haf_network_account where not is_test and docs_count > 0),
      'approved',        (select count(*) from haf_network_account where not is_test and approved_at is not null),
      'released',        (select count(*) from haf_network_account where not is_test and released_at is not null),
      'can_sign_in',     (select count(*) from haf_network_account where not is_test and has_login),
      'paying',          (select count(*) from haf_network_account where not is_test and paid_at is not null)),

    -- An active network user is someone who has been let in AND has been seen
    -- in the last 30 days. Demo and test rows can never reach this figure.
    'active_users', (select count(*) from haf_network_account
                     where not is_test and released_at is not null
                       and last_seen_at > now() - interval '30 days'),

    'recent', json_build_object(
      'new_7d',      (select count(*) from haf_network_account where not is_test and applied_at  > now() - interval '7 days'),
      'released_7d', (select count(*) from haf_network_account where not is_test and released_at > now() - interval '7 days'),
      'events_24h',  (select count(*) from haf_network_event   where at > now() - interval '24 hours')),

    'needs_you', json_build_object(
      'approved_not_released', (select count(*) from haf_network_account
                                where not is_test and approved_at is not null and released_at is null),
      'released_never_signed_in', (select count(*) from haf_network_account
                                where not is_test and released_at is not null and last_seen_at is null),
      'no_documents',          (select count(*) from haf_network_account
                                where not is_test and status = 'missing_documents'),
      'email_unconfirmed',     (select count(*) from haf_network_account
                                where not is_test and not email_confirmed)),

    -- Named out loud so a zero can never be mistaken for a broken read.
    'sources', json_build_object(
      'accounts',  'haf_network_account, mirrored from CleverPay and the driver network',
      'founder',   'knect_founding_members',
      'jobs',      'jobs + business_jobs + plna_knect_handover',
      'money',     'jobs, plna_knect_handover, plna_referral_ledger'),

    'synced_at', (select max(synced_at) from haf_network_account)
  );
end;
$function$;

-- ── 6. Network CRM — one master record per member ──────────────────────────
CREATE OR REPLACE FUNCTION public.haf_network_record(
  p_username text, p_hash text, p_relay text DEFAULT NULL, p_cp text DEFAULT NULL,
  p_ref text DEFAULT NULL)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare a haf_network_account%rowtype;
begin
  if p_username <> 'BF638793'
     or public.plna_cred_kind(p_username, p_hash, p_relay, p_cp) is null then
    return;
  end if;

  select * into a from haf_network_account
   where ref = p_ref or username = p_ref limit 1;
  if not found then return; end if;

  return query
  select json_build_object(
    'ref', a.ref, 'username', a.username, 'name', a.full_name, 'email', a.email,
    'account_type', a.account_type, 'fleet_ref', a.fleet_ref,
    'stage', a.stage, 'status', a.status, 'status_reason', a.status_reason,
    'membership', case when a.tier = 'founder' then null else coalesce(a.tier,'free') end,
    'membership_note', case when a.tier = 'founder'
      then 'This record still carries Founder in the membership column. Founder is a status, not a membership — the real membership needs setting.'
      else null end,
    'is_test', a.is_test, 'source', a.source, 'has_login', a.has_login,
    'email_confirmed', a.email_confirmed, 'docs_count', a.docs_count,

    -- Founder is read from where founders are actually recorded.
    'founder', (
      select json_build_object('member_no', f.member_no, 'paid', f.amount_gbp,
                               'paid_at', f.paid_at, 'code_issued', f.plna_code is not null,
                               'code_redeemed_at', f.plna_code_redeemed_at)
      from knect_founding_members f
      where (f.haf_username is not null and f.haf_username = a.username)
         or (f.email is not null and lower(f.email) = lower(a.email))
      limit 1),

    'dates', json_build_object(
      'applied', a.applied_at, 'confirmed', a.confirmed_at, 'approved', a.approved_at,
      'released', a.released_at, 'paid', a.paid_at, 'last_seen', a.last_seen_at),

    'timeline', (
      select coalesce(json_agg(json_build_object('at', e.at, 'event', e.event, 'detail', e.detail)
                               order by e.at desc), '[]'::json)
      from haf_network_event e where e.ref = a.ref or e.username = a.username),

    -- Job and money history: real rows only. All three tables are empty today,
    -- so these come back as empty lists and the record says so.
    'jobs', (
      select coalesce(json_agg(x order by x->>'at' desc), '[]'::json) from (
        select json_build_object('ref', j.job_ref, 'at', j.created_at, 'status', j.status,
                                 'from', j.pickup_postcode, 'to', j.delivery_postcode,
                                 'miles', j.distance_miles, 'driver_amount', j.pay_amount,
                                 'source', 'PLNA job') as x
        from jobs j where j.driver_id = a.username
        union all
        select json_build_object('ref', h.booking_ref, 'at', h.pushed_at, 'status', h.status,
                                 'from', h.from_postcode, 'to', h.to_postcode,
                                 'miles', null, 'driver_amount', null,
                                 'source', 'Pushed to KNECT')
        from plna_knect_handover h
        where not coalesce(h.is_test,false)
          and (h.origin_username = a.username or h.claimed_by = a.username)) s(x)),

    'payouts', (
      select coalesce(json_agg(json_build_object('ref', l.booking_ref, 'amount', l.amount,
             'basis', l.basis, 'pct', l.pct, 'status', l.status,
             'payable_from', l.payable_from, 'paid_at', l.paid_at) order by l.accrued_at desc), '[]'::json)
      from plna_referral_ledger l where l.affiliate_username = a.username),

    'entitlement_changes', (
      select coalesce(json_agg(json_build_object('at', g.created_at, 'by', g.changed_by,
             'source', g.change_source, 'reason', g.reason) order by g.created_at desc), '[]'::json)
      from entitlement_audit_log g where g.user_id = a.username)
  );
end;
$function$;

-- ── 8. Payments & payout control centre ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.haf_network_money(
  p_username text, p_hash text, p_relay text DEFAULT NULL, p_cp text DEFAULT NULL,
  p_limit integer DEFAULT 100)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if p_username <> 'BF638793'
     or public.plna_cred_kind(p_username, p_hash, p_relay, p_cp) is null then
    return;
  end if;

  return query
  select json_build_object(
    'ref', t.ref, 'kind', t.kind, 'at', t.at, 'counterparty', t.counterparty,
    'gross', t.gross, 'haf_fee', t.haf_fee, 'driver_amount', t.driver_amount,
    'payment_status', t.payment_status, 'payout_status', t.payout_status,
    'payout_due', t.payout_due, 'paid_at', t.paid_at)
  from (
    -- A job that reached KNECT: the customer side of the money.
    select h.booking_ref as ref, 'Network job' as kind, h.pushed_at as at,
           h.claimed_by as counterparty, null::numeric as gross,
           h.haf_fee_amount as haf_fee, null::numeric as driver_amount,
           case when h.completed_at is not null then 'Payment confirmed'
                when h.claimed_at is not null then 'Awaiting customer payment'
                else 'Not yet claimed' end as payment_status,
           case when h.completed_at is not null then 'Driver payout scheduled'
                else 'Not due yet' end as payout_status,
           null::date as payout_due, null::timestamptz as paid_at
      from plna_knect_handover h where not coalesce(h.is_test,false)
    union all
    -- The referral share: the only ledger that actually pays anyone today.
    select l.booking_ref, 'Referral share', l.accrued_at, l.affiliate_username,
           l.customer_ex_vat, l.haf_fee_amount, l.amount,
           'Payment confirmed',
           case l.status when 'paid' then 'Paid out'
                         when 'payable' then 'Driver payout scheduled'
                         when 'accrued' then 'Funds held'
                         when 'review' then 'Held for review'
                         else initcap(coalesce(l.status,'unknown')) end,
           l.payable_from, l.paid_at
      from plna_referral_ledger l
    union all
    -- A driver's own delivered job.
    select j.job_ref, 'PLNA job', j.created_at, j.driver_id,
           j.pay_amount, null, j.pay_amount,
           case when j.actual_delivery is not null then 'Payment confirmed'
                else 'Awaiting customer payment' end,
           case when j.actual_delivery is not null then 'Driver payout scheduled'
                else 'Not due yet' end,
           null, null
      from jobs j
  ) t
  order by t.at desc nulls last
  limit greatest(1, least(coalesce(p_limit,100), 500));
end;
$function$;

-- Only the owner's own credential opens any of these; the anon key alone
-- returns nothing. PUBLIC is stripped so nothing inherits EXECUTE by default.
REVOKE ALL ON FUNCTION public.haf_network_overview(text,text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.haf_network_record(text,text,text,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.haf_network_money(text,text,text,text,integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haf_network_overview(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haf_network_record(text,text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haf_network_money(text,text,text,text,integer) TO anon, authenticated;
