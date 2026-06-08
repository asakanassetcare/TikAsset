-- Migration 21: Notify super_admin when a short-term contract (< 1 year) is submitted for approval

CREATE OR REPLACE FUNCTION on_contract_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_number text;
  v_is_short    boolean;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms WHERE id = new.room_id;
  v_is_short := new.contract_end_date < new.contract_start_date + interval '1 year';

  -- New contract inserted as pending_approve
  IF tg_op = 'INSERT' AND new.status = 'pending_approve' THEN
    PERFORM notify_role('executive', 'contract_pending_approve',
      'สัญญารออนุมัติ: ' || new.contract_number,
      'ห้อง ' || v_room_number,
      'contracts', new.id, null);

    IF v_is_short THEN
      PERFORM notify_role('super_admin', 'contract_pending_approve',
        '⚠️ สัญญาระยะสั้น รออนุมัติ: ' || new.contract_number,
        'สัญญาน้อยกว่า 1 ปี · ห้อง ' || v_room_number,
        'contracts', new.id, null);
    END IF;
  END IF;

  -- Status changed
  IF tg_op = 'UPDATE' AND new.status IS DISTINCT FROM old.status THEN

    IF new.status = 'pending_approve' AND old.status != 'pending_approve' THEN
      PERFORM notify_role('executive', 'contract_pending_approve',
        'สัญญารออนุมัติ: ' || new.contract_number,
        'ห้อง ' || v_room_number,
        'contracts', new.id, null);

      IF v_is_short THEN
        PERFORM notify_role('super_admin', 'contract_pending_approve',
          '⚠️ สัญญาระยะสั้น รออนุมัติ: ' || new.contract_number,
          'สัญญาน้อยกว่า 1 ปี · ห้อง ' || v_room_number,
          'contracts', new.id, null);
      END IF;
    END IF;

    IF new.status = 'approved' THEN
      PERFORM notify_user(new.assigned_staff_id, 'contract_approved',
        'สัญญา ' || new.contract_number || ' อนุมัติแล้ว', null,
        'contracts', new.id, null);
    END IF;

    IF new.status = 'rejected' THEN
      PERFORM notify_user(new.assigned_staff_id, 'contract_rejected',
        'สัญญา ' || new.contract_number || ' ถูกปฏิเสธ',
        new.rejection_reason, 'contracts', new.id, null);
    END IF;

  END IF;

  RETURN new;
END $$;
