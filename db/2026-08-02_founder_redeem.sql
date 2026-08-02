-- Redeeming a founder's PLNA code, and showing it to them.
--
-- Two functions:
--   knect_founder_card    - what the KNECT dashboard shows a founder on the overview,
--                           including their own PLNA code and whether it is used yet.
--   knect_redeem_founder_code - the PLNA settings box calls this. It only accepts a
--                           code that was really issued to a real £100 payer, it works
--                           once, and it is tied to that person's account.
--
-- Redeeming also links the payer to their Network login, so the Founders mark on the
-- KNECT dashboard comes on by itself.

begin;

create or replace function public.knect_founder_card(p_username text)
returns table (
  is_founder  boolean,
  member_no   int,
  since       date,
  full_name   text,
  plna_code   text,
  redeemed_at timestamptz,
  months      int
)
language sql
security definer
set search_path = public
as $$
  select true, f.member_no, f.paid_at::date, f.full_name,
         f.plna_code, f.plna_code_redeemed_at, f.plna_code_months
    from public.knect_founding_members f
   where f.haf_username is not null
     and upper(f.haf_username) = upper(btrim(p_username))
   limit 1
$$;

create or replace function public.knect_redeem_founder_code(p_username text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u text := upper(btrim(coalesce(p_username, '')));
  c text := upper(btrim(coalesce(p_code, '')));
  f public.knect_founding_members;
  until timestamptz;
begin
  if u = '' or c = '' then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;

  select * into f from public.knect_founding_members where plna_code = c limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_recognised');
  end if;

  -- A code that already belongs to somebody cannot be moved to another account.
  if f.haf_username is not null and upper(f.haf_username) <> u then
    return jsonb_build_object('ok', false, 'error', 'other_account');
  end if;

  if not exists (select 1 from public.plna_drivers where upper(haf_username) = u) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  if f.plna_code_redeemed_at is not null then
    if upper(coalesce(f.plna_code_redeemed_by, '')) = u then
      return jsonb_build_object('ok', true, 'already', true,
                                'months', f.plna_code_months,
                                'until', (select pro_until from public.plna_drivers
                                           where upper(haf_username) = u));
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  until := now() + make_interval(months => f.plna_code_months);

  update public.knect_founding_members
     set plna_code_redeemed_at = now(),
         plna_code_redeemed_by = u,
         haf_username = coalesce(haf_username, u),
         linked_at    = coalesce(linked_at, now())
   where id = f.id
     and plna_code_redeemed_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  update public.plna_drivers
     set promo_code = c,
         pro_until  = until
   where upper(haf_username) = u;

  return jsonb_build_object('ok', true, 'months', f.plna_code_months,
                            'until', until, 'member_no', f.member_no);
end;
$$;

revoke all on function public.knect_founder_card(text) from public;
revoke all on function public.knect_redeem_founder_code(text, text) from public;
grant execute on function public.knect_founder_card(text) to anon, authenticated;
grant execute on function public.knect_redeem_founder_code(text, text) to anon, authenticated;

commit;
