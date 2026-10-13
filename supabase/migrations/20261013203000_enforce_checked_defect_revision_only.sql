-- Applied in Production on 2026-10-13 after the guarded Defect UI was READY.
-- Block any direct authenticated/anon call that bypasses the room revision check.
-- The SECURITY DEFINER checked wrapper remains executable for authorized users.
REVOKE EXECUTE ON FUNCTION public.defect_manual_update_apply(text,text,text,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
