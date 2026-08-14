-- ═══════════════════════════════════════════════════════════════════════════
-- PUBLIC DEMO — EMAIL FRONT DOOR
-- ═══════════════════════════════════════════════════════════════════════════
-- Brent, 14 Aug: the Demo Centre becomes the public demo, and the way in is an
-- email address. The visitor types their email, gets an access code back, and
-- the code opens the demo. The point of the door is the list behind it, so the
-- email is the thing this file exists to keep.
--
-- The table is NOT readable by the anonymous key. Both functions are SECURITY
-- DEFINER and return only what the visitor already knows — their own code, or
-- a yes/no on a code they just typed. Nobody can read the list from the page.

CREATE TABLE IF NOT EXISTS public.knect_demo_lead (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL,
  access_code   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  visits        integer NOT NULL DEFAULT 0,
  source        text
);

CREATE UNIQUE INDEX IF NOT EXISTS knect_demo_lead_email_key ON public.knect_demo_lead (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS knect_demo_lead_code_key  ON public.knect_demo_lead (upper(access_code));

ALTER TABLE public.knect_demo_lead ENABLE ROW LEVEL SECURITY;
-- deliberately no policy: with RLS on and no policy, the anon key reads nothing.

REVOKE ALL ON public.knect_demo_lead FROM public, anon, authenticated;

-- ── issue a code for an email ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.knect_demo_request_code(p_email text, p_source text DEFAULT NULL)
RETURNS TABLE (ok boolean, code text, returning_visitor boolean, why text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_code text; v_existing text;
BEGIN
  v_email := lower(btrim(coalesce(p_email,'')));

  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RETURN QUERY SELECT false, NULL::text, false, 'That does not look like an email address.'; RETURN;
  END IF;

  SELECT l.access_code INTO v_existing FROM knect_demo_lead l WHERE lower(l.email) = v_email;
  IF v_existing IS NOT NULL THEN
    UPDATE knect_demo_lead SET last_seen_at = now() WHERE lower(email) = v_email;
    RETURN QUERY SELECT true, v_existing, true, NULL::text; RETURN;
  END IF;

  -- a short code a person can read off a screen and type: no O/0, no I/1
  LOOP
    v_code := (SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                 1 + floor(random()*32)::int, 1), '') FROM generate_series(1,6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM knect_demo_lead WHERE upper(access_code) = v_code);
  END LOOP;

  INSERT INTO knect_demo_lead (email, access_code, source) VALUES (v_email, v_code, nullif(btrim(coalesce(p_source,'')),''));
  RETURN QUERY SELECT true, v_code, false, NULL::text;
END $$;

-- ── check a code at the door ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.knect_demo_check_code(p_code text)
RETURNS TABLE (ok boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_id bigint;
BEGIN
  v_code := upper(btrim(coalesce(p_code,'')));
  SELECT id INTO v_id FROM knect_demo_lead WHERE upper(access_code) = v_code;
  IF v_id IS NULL THEN RETURN QUERY SELECT false; RETURN; END IF;
  UPDATE knect_demo_lead SET visits = visits + 1, last_seen_at = now() WHERE id = v_id;
  RETURN QUERY SELECT true;
END $$;

-- Only these two doors are open to the anonymous key, and neither returns the list.
REVOKE ALL ON FUNCTION public.knect_demo_request_code(text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.knect_demo_check_code(text)         FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knect_demo_request_code(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.knect_demo_check_code(text)         TO anon;
