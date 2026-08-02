-- Founder → PLNA discount codes
--
-- Everyone who paid the £100 HAF KNECT founders membership gets one PLNA code of
-- their own. They paste it into PLNA → Settings and it turns on their free Pro
-- months. The code lives on the founders register, so only a real payer has one:
-- that register IS the confirmation step.
--
-- Safe to run more than once: it never re-issues a code that already exists.

begin;

alter table public.knect_founding_members
  add column if not exists plna_code            text,
  add column if not exists plna_code_months     int  not null default 6,
  add column if not exists plna_code_issued_at  timestamptz,
  add column if not exists plna_code_redeemed_at timestamptz,
  add column if not exists plna_code_redeemed_by text;

create unique index if not exists knect_founding_members_plna_code_uq
  on public.knect_founding_members (plna_code)
  where plna_code is not null;

-- A code a human can read down the phone: no O/0 or I/1 to mistype.
create or replace function public.knect_mint_code(p_months int)
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := 'H' || p_months::text || 'PRO-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.knect_founding_members where plna_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- Issue to every founder who does not have one yet.
update public.knect_founding_members
   set plna_code = public.knect_mint_code(plna_code_months),
       plna_code_issued_at = now()
 where plna_code is null;

commit;
