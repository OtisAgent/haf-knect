-- A member's own discount code belongs behind their credentials.
--
-- Warren's finding today, and the lesson from it: a SECURITY DEFINER function
-- runs as its owner and walks straight past the table grant, so what leaks is
-- its RETURN SHAPE. knect_founder_card and knect_member_standing both answer an
-- anonymous caller, and HAF usernames are guessable — so neither may hand back
-- a live discount code. Standing (are you a paid member, which rung) is fine to
-- answer: it says nothing a member would mind a stranger knowing.
--
-- The code now comes from knect_my_code, which answers only for someone who can
-- prove they are that account, using exactly the credential check plna_auth
-- uses. Safe to run more than once.

begin;

-- Standing keeps the rungs, drops the code.
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
    'has_code', f.plna_code is not null,
    'code_redeemed', f.plna_code_redeemed_at is not null
  );
end;
$$;

-- The founder card is what the live dashboard already calls. It loses the
-- member's NAME as well as the code — the live page never rendered the name,
-- it was simply being handed out. The card keeps working and the code box stays
-- hidden until the page asks for it with credentials. Dropped rather than
-- replaced because the answer's shape changes.
drop function if exists public.knect_founder_card(text);
create function public.knect_founder_card(p_username text)
returns table (
  is_founder  boolean,
  member_no   int,
  since       date,
  plna_code   text,
  redeemed_at timestamptz,
  months      int
)
language sql
security definer
set search_path = public
as $$
  select true, f.member_no, f.paid_at::date,
         null::text, f.plna_code_redeemed_at, f.plna_code_months
    from public.knect_founding_members f
   where f.haf_username is not null
     and upper(f.haf_username) = upper(btrim(p_username))
   limit 1
$$;

-- Your own code, and only yours. p_hash = password hash, p_relay = the
-- username:PIN hash — the same pair plna_auth takes, checked the same way.
create or replace function public.knect_my_code(p_username text, p_hash text, p_relay text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := upper(btrim(coalesce(p_username, '')));
  f public.knect_founding_members;
begin
  if u = '' then return jsonb_build_object('ok', false); end if;
  if public.plna_cred_kind(u, p_hash, p_relay) is null then
    return jsonb_build_object('ok', false);
  end if;

  select * into f
    from public.knect_founding_members
   where haf_username is not null and upper(haf_username) = u
   limit 1;
  if not found or f.plna_code is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'plna_code', f.plna_code,
                            'months', f.plna_code_months,
                            'redeemed_at', f.plna_code_redeemed_at);
end;
$$;

revoke all on function public.knect_my_code(text, text, text) from public;
grant execute on function public.knect_my_code(text, text, text) to anon, authenticated;

commit;
