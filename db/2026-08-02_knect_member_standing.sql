-- Paid tier activation — one answer for "what has this account actually paid for?"
--
-- Brent, 2026-08-02: "allow the HAF KNECT Paid tiers to be active for anyone who
-- buys the paid tier." Until now a paid membership showed a badge and nothing
-- else: a real sign-in was always priced and treated as a free account.
--
-- knect_member_standing is the single place that answers it, so the dashboard,
-- the quote and the badge can never tell three different stories. Rungs come
-- straight from PRICING FRAMEWORK V7, not from this file's opinion:
--   · account ladder  — a paid HAF KNECT member sits on the PLUS rung (-2.5 pts)
--   · driver ladder   — a paid membership is the MEMBER rung (paused today,
--                       and HAF-funded when it comes back, so no customer price
--                       moves either way)
--   · direct booking  — unlimited for members
-- Highest wins and never stacks: a member who is also PLNA Pro is Pro, not both.
--
-- knect_claim_membership links a payer to their account using the email they
-- paid with. That is what makes activation automatic: the register knows the
-- email, the sign-up knows the email, and nobody has to be matched up by hand.
--
-- Safe to run more than once.

begin;

create or replace function public.knect_member_standing(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := upper(btrim(coalesce(p_username, '')));
  f public.knect_founding_members;
  d public.plna_drivers;
  paid boolean := false;
  plna_pro boolean := false;
  plna_plus boolean := false;
  acct text;
  drv text;
begin
  if u = '' then
    return jsonb_build_object('active', false);
  end if;

  select * into f
    from public.knect_founding_members
   where haf_username is not null and upper(haf_username) = u
   limit 1;

  -- A membership counts only when the money actually landed.
  paid := found and coalesce(f.amount_gbp, 0) > 0 and f.paid_at is not null;

  select * into d from public.plna_drivers where upper(haf_username) = u limit 1;
  if found then
    plna_pro  := lower(coalesce(d.plan, '')) = 'pro'
                 or (d.pro_until is not null and d.pro_until > now());
    plna_plus := lower(coalesce(d.plan, '')) = 'plus';
  end if;

  if not paid and not plna_pro and not plna_plus then
    return jsonb_build_object('active', false);
  end if;

  -- Highest wins, never stacks.
  acct := case when plna_pro then 'pro'
               when plna_plus or paid then 'plus'
               else 'lite' end;
  drv  := case when plna_pro then 'pro'
               when plna_plus or paid then 'member'
               else 'free' end;

  return jsonb_build_object(
    'active', true,
    'paid_membership', paid,
    'member_no', f.member_no,
    'since', f.paid_at::date,
    'plna_plan', coalesce(d.plan, null),
    'pro_until', d.pro_until,
    'account_level', acct,
    'driver_level', drv,
    'direct_booking', case when paid or plna_plus or plna_pro then 'unlimited' else 'limited' end,
    'priority_matching', true,
    'exchange_listing', true,
    'plna_code', f.plna_code,
    'plna_code_months', f.plna_code_months,
    'plna_code_redeemed_at', f.plna_code_redeemed_at
  );
end;
$$;

-- Link a payer to the account they created, using the email they paid with.
-- Never moves a membership off an account it already belongs to, and never
-- claims one for an account that does not exist.
create or replace function public.knect_claim_membership(p_username text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := upper(btrim(coalesce(p_username, '')));
  e text := lower(btrim(coalesce(p_email, '')));
  f public.knect_founding_members;
begin
  if u = '' or e = '' then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;

  select * into f
    from public.knect_founding_members
   where lower(btrim(coalesce(email, ''))) = e
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_payment');
  end if;

  if f.haf_username is not null then
    -- Already linked: to itself is a no-op, to anyone else is refused.
    if upper(f.haf_username) = u then
      return jsonb_build_object('ok', true, 'already', true, 'member_no', f.member_no);
    end if;
    return jsonb_build_object('ok', false, 'error', 'other_account');
  end if;

  update public.knect_founding_members
     set haf_username = u,
         linked_at    = coalesce(linked_at, now())
   where id = f.id
     and haf_username is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'other_account');
  end if;

  return jsonb_build_object('ok', true, 'linked', true, 'member_no', f.member_no);
end;
$$;

revoke all on function public.knect_member_standing(text) from public;
revoke all on function public.knect_claim_membership(text, text) from public;
grant execute on function public.knect_member_standing(text) to anon, authenticated;
grant execute on function public.knect_claim_membership(text, text) to anon, authenticated;

commit;
