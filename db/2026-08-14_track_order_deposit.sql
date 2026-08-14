-- The job page needs to offer the deposit, so it has to know which payment is
-- the deposit.
--
-- Before this, pay.track_order returned everything a customer may see EXCEPT
-- the reference of their own holding deposit — so the page could tell somebody
-- their deposit was outstanding and give them no way to pay it. A dead end on
-- the one screen whose whole job is "what happens next".
--
-- WHAT IS BEING ADDED TO THE RETURN SHAPE, AND WHY IT IS SAFE
-- This function is SECURITY DEFINER: it reads a table nobody else can reach, so
-- its RETURN SHAPE is the entire access control. deposit_reference is the
-- reference of THIS order's own deposit, handed to the person holding the
-- unguessable token for that order — the same person the payment belongs to. It
-- names no other party, opens no other job, and is already printed in their own
-- confirmation email.
--
-- Everything that was withheld stays withheld: no customer email, no phone, no
-- address, no driver's phone number, no account, and no figure that is not
-- theirs.
--
-- Runs on haf-core (rsvsalswppksrkrcqdfd), schema `pay`.

-- Adding a column to a returns-table means the old signature has to go first;
-- CREATE OR REPLACE cannot change a function's return type, and dropping only
-- after would leave two overloads and hand every REST caller an HTTP 300.
drop function if exists pay.track_order(text);

create function pay.track_order(p_token text)
returns table (
  job_ref text, status text, collect_postcode text, deliver_postcode text,
  collect_on date, collect_window text, goods text, vehicle_code text,
  miles numeric, total_pence bigint, deposit_pence bigint, balance_pence bigint,
  driver_name text, driver_vehicle text,
  deposit_reference text,
  posted_at timestamptz, claimed_at timestamptz, completed_at timestamptz
)
language sql
security definer
set search_path = pay, public
as $$
  select o.job_ref, o.status, o.collect_postcode, o.deliver_postcode,
         o.collect_on, o.collect_window, o.goods, o.vehicle_code,
         o.miles, o.total_pence, o.deposit_pence, o.balance_pence,
         o.driver_name, o.driver_vehicle,
         o.deposit_reference,
         o.posted_at, o.claimed_at, o.completed_at
    from pay.job_order o
   where o.track_token = p_token
   limit 1;
$$;

-- PUBLIC holds EXECUTE on a new function by default and anon inherits it. The
-- page reaches this through the server, never with its own key, so every one of
-- those three is taken away again.
revoke all on function pay.track_order(text) from public, anon, authenticated;

-- And then the server is let back in BY NAME.
--
-- This line is the reason the tracking page would never have worked. The
-- previous version of this function revoked from public, anon and authenticated
-- and stopped there, on the assumption that the service key is exempt. It is
-- not: service_role bypasses row level security, it does not bypass a function
-- grant. So the door was shut on the one caller that is supposed to walk
-- through it, and every customer opening their own link would have been told we
-- could not find their job.
--
-- Nothing about that would have shown up in a test of the words on the page, or
-- of the table's permissions, or of anything a customer's key can reach. It only
-- shows up if you ask this exact question: who, by name, may call this?
grant execute on function pay.track_order(text) to service_role;
