-- Agent command 01 only. Do not apply until the Preview branch passes review.
-- Keeps existing Defect RBAC, audited edit RPC, and both Excel writeback queues intact.
CREATE TABLE IF NOT EXISTS public.defect_agent_requests (
  request_id uuid PRIMARY KEY,
  requested_by uuid NOT NULL,
  room_ids text[] NOT NULL,
  work_ids text[] NOT NULL DEFAULT '{}',
  changed_rooms text[] NOT NULL DEFAULT '{}',
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending_excel',
  CONSTRAINT defect_agent_request_status CHECK (status IN ('pending_excel','verified','error'))
);
ALTER TABLE public.defect_agent_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_agent_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.defect_agent_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.defect_agent_requests TO authenticated;
DROP POLICY IF EXISTS defect_agent_request_owner_read ON public.defect_agent_requests;
CREATE POLICY defect_agent_request_owner_read ON public.defect_agent_requests
 FOR SELECT TO authenticated USING(requested_by = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.defect_agent_hotel_accepted_apply(
  p_request_id uuid, p_room_ids text[], p_expected jsonb,
  p_user_agent text DEFAULT '3kings-defect-agent'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_actor uuid := (select auth.uid());
 v_room text;
 v_count int;
 v_room_row public.condo_room_status%ROWTYPE;
 v_w public.defect_work_order_snapshot%ROWTYPE;
 v_work_ids text[] := '{}';
 v_changed_rooms text[] := '{}';
 v_previous public.defect_agent_requests%ROWTYPE;
 v_result jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=v_actor
      AND p.active IS TRUE AND p.role='manager'
      AND p.user_id='bc6ee244-3472-422f-bbf9-d551987ee9a3'::uuid)
    OR NOT private.matrix_allowed('defect','manage',true)
 THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_request_id IS NULL OR p_expected IS NULL OR jsonb_typeof(p_expected)<>'object'
    OR coalesce(cardinality(p_room_ids),0) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
 SELECT count(DISTINCT id) INTO v_count FROM unnest(p_room_ids) AS t(id);
 IF v_count<>cardinality(p_room_ids) OR EXISTS(
     SELECT 1 FROM unnest(p_room_ids) t(id) WHERE id !~ '^[AB][0-9]{3}$')
 THEN RAISE EXCEPTION 'INVALID_OR_DUPLICATE_ROOM'; END IF;
 -- Transaction-wide command lock: duplicate agent submissions cannot double-close jobs.
 PERFORM pg_advisory_xact_lock(hashtext('3kings_defect_agent_01'));
 SELECT * INTO v_previous FROM public.defect_agent_requests WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.requested_by<>v_actor OR v_previous.room_ids<>p_room_ids THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
   END IF;
   RETURN jsonb_build_object('ok',true,'replayed',true,'request_id',p_request_id,
     'work_ids',v_previous.work_ids,'changed_rooms',v_previous.changed_rooms,
     'room_ids',v_previous.room_ids,'status',v_previous.status);
 END IF;
 -- Never update a partial Combine group. A group either appears in full or not at all.
 IF EXISTS (
   SELECT 1 FROM public.hotel_room_group_members a
   JOIN public.hotel_room_group_members b ON a.group_key=b.group_key
   WHERE a.room_no=ANY(p_room_ids) AND NOT (b.room_no=ANY(p_room_ids))
 ) THEN RAISE EXCEPTION 'COMBINE_GROUP_INCOMPLETE'; END IF;

 FOR v_room IN SELECT unnest(p_room_ids) ORDER BY 1 LOOP
   SELECT * INTO v_room_row FROM public.condo_room_status
      WHERE room_no=v_room FOR UPDATE;
   IF NOT FOUND OR v_room_row.hotel_participation<>'ร่วมโรงแรม'
   THEN RAISE EXCEPTION 'ROOM_NOT_APPROVED_FOR_HOTEL_CHECK: %',v_room; END IF;
   IF p_expected->>v_room IS NULL OR v_room_row.source_modified_at IS NULL OR
      v_room_row.source_modified_at IS DISTINCT FROM (p_expected->>v_room)::timestamptz
   THEN RAISE EXCEPTION 'ROOM_REVISION_CHANGED: %',v_room; END IF;
 END LOOP;

 -- Close currently active, outstanding Work IDs while affected rooms are still Incomplete.
 FOR v_w IN
   SELECT w.* FROM public.defect_work_order_snapshot w
   WHERE w.source_active AND w.web_completed_at IS NULL
     AND coalesce(w.work_status,'') !~ 'เสร็จแล้ว|งดแจก|ยกเลิก'
     AND EXISTS (
       SELECT 1 FROM regexp_matches(w.room_group,'[AB][0-9]{3}','g') AS m(token)
       WHERE m.token[1]=ANY(p_room_ids)
     )
   ORDER BY w.work_id FOR UPDATE
 LOOP
   -- Existing RPC writes web_completed_at, actor and Excel writeback_state=pending.
   v_result:=public.defect_work_order_complete(v_w.work_id);
   IF coalesce((v_result->>'ok')::boolean,false) IS NOT TRUE THEN
     RAISE EXCEPTION 'WORK_ORDER_CLOSE_BLOCKED: %',v_w.work_id;
   END IF;
   v_work_ids:=array_append(v_work_ids,v_w.work_id);
 END LOOP;

 FOR v_room IN SELECT unnest(p_room_ids) ORDER BY 1 LOOP
   SELECT * INTO v_room_row FROM public.condo_room_status WHERE room_no=v_room;
   IF v_room_row.current_status='Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว'
      AND v_room_row.status_group='Hotel - Checked Complete' THEN CONTINUE; END IF;
   v_changed_rooms:=array_append(v_changed_rooms,v_room);
   -- Reuse audited authenticated update and its existing Excel master/overview queue.
   -- Preserve the existing detail exactly; do not append automation boilerplate.
   PERFORM public.defect_manual_update_apply_checked(
      v_room,v_room_row.defect_detail,
      'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
      'Hotel - Checked Complete','Hotel Engineer ตรวจแล้ว',
      p_request_id,left(coalesce(p_user_agent,'3kings-agent'),200),
      v_room_row.source_modified_at);
 END LOOP;

 INSERT INTO public.defect_agent_requests(request_id,requested_by,room_ids,work_ids,changed_rooms)
 VALUES(p_request_id,v_actor,p_room_ids,v_work_ids,v_changed_rooms);
 RETURN jsonb_build_object('ok',true,'request_id',p_request_id,
    'replayed',false,'status','pending_excel','room_ids',p_room_ids,
    'changed_rooms',v_changed_rooms,'work_ids',v_work_ids);
END; $$;
REVOKE ALL ON FUNCTION public.defect_agent_hotel_accepted_apply(uuid,text[],jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defect_agent_hotel_accepted_apply(uuid,text[],jsonb,text) TO authenticated;
