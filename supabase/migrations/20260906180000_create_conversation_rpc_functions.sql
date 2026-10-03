-- RPC functions for robust, atomic, and secure inquiry conversations

-- 1. Admin Reply RPC Function
CREATE OR REPLACE FUNCTION public.reply_to_inquiry(
  p_inquiry_id UUID,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_now TIMESTAMPTZ := now();
  v_message_id UUID;
  v_inq_name TEXT;
  v_inq_email TEXT;
BEGIN
  v_sender_id := auth.uid();
  
  -- Verify caller has admin role
  IF v_sender_id IS NULL OR NOT public.has_role(v_sender_id, 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'Reply message cannot be empty.';
  END IF;

  -- Get inquiry info
  SELECT name, email INTO v_inq_name, v_inq_email
  FROM public.inquiries
  WHERE id = p_inquiry_id;

  IF v_inq_name IS NULL THEN
    RAISE EXCEPTION 'Inquiry not found with ID %', p_inquiry_id;
  END IF;

  -- Insert into inquiry_messages thread
  INSERT INTO public.inquiry_messages (
    inquiry_id,
    sender_id,
    sender_role,
    message,
    created_at,
    read_at
  ) VALUES (
    p_inquiry_id,
    v_sender_id,
    'admin',
    trim(p_message),
    v_now,
    NULL
  )
  RETURNING id INTO v_message_id;

  -- Update inquiry record
  UPDATE public.inquiries
  SET 
    status = 'replied',
    admin_reply = trim(p_message),
    replied_at = v_now,
    updated_at = v_now
  WHERE id = p_inquiry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'inquiry_id', p_inquiry_id,
    'created_at', v_now,
    'recipient_name', v_inq_name,
    'recipient_email', v_inq_email
  );
END;
$$;

-- 2. Customer Follow-up Message RPC Function
CREATE OR REPLACE FUNCTION public.customer_send_message(
  p_inquiry_id UUID,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_now TIMESTAMPTZ := now();
  v_message_id UUID;
  v_inq_exists BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  v_user_email := auth.jwt() ->> 'email';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to send a message.';
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty.';
  END IF;

  -- Check that inquiry belongs to this user
  SELECT EXISTS (
    SELECT 1 FROM public.inquiries 
    WHERE id = p_inquiry_id 
    AND (
      customer_id = v_user_id 
      OR (v_user_email IS NOT NULL AND lower(email) = lower(v_user_email))
      OR public.has_role(v_user_id, 'admin')
    )
  ) INTO v_inq_exists;

  IF NOT v_inq_exists THEN
    RAISE EXCEPTION 'Inquiry not found or access denied.';
  END IF;

  -- Insert customer follow-up message
  INSERT INTO public.inquiry_messages (
    inquiry_id,
    sender_id,
    sender_role,
    message,
    created_at,
    read_at
  ) VALUES (
    p_inquiry_id,
    v_user_id,
    'customer',
    trim(p_message),
    v_now,
    v_now
  )
  RETURNING id INTO v_message_id;

  -- Update inquiry status to waiting_reply
  UPDATE public.inquiries
  SET 
    status = 'waiting_reply',
    updated_at = v_now
  WHERE id = p_inquiry_id;

  RETURN jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'inquiry_id', p_inquiry_id,
    'created_at', v_now
  );
END;
$$;

-- 3. Mark Inquiry Messages Read RPC Function
CREATE OR REPLACE FUNCTION public.mark_inquiry_messages_read(
  p_inquiry_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT := auth.jwt() ->> 'email';
  v_now TIMESTAMPTZ := now();
BEGIN
  -- If admin is viewing:
  IF public.has_role(v_user_id, 'admin') THEN
    UPDATE public.inquiries
    SET status = 'read', updated_at = v_now
    WHERE id = p_inquiry_id AND (status = 'unread' OR status = 'waiting_reply');
    RETURN;
  END IF;

  -- If customer is viewing:
  UPDATE public.inquiry_messages
  SET read_at = v_now
  WHERE inquiry_id = p_inquiry_id
    AND sender_role = 'admin'
    AND read_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = p_inquiry_id
      AND (
        i.customer_id = v_user_id 
        OR (v_user_email IS NOT NULL AND lower(i.email) = lower(v_user_email))
      )
    );

  UPDATE public.inquiries
  SET status = 'read', updated_at = v_now
  WHERE id = p_inquiry_id
    AND (status = 'replied' OR status = 'unread')
    AND (
      customer_id = v_user_id 
      OR (v_user_email IS NOT NULL AND lower(email) = lower(v_user_email))
    );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.reply_to_inquiry(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_send_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_messages_read(UUID) TO authenticated;
