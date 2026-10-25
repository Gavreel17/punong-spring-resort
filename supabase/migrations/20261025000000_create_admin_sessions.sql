-- Migration: Create Admin Sessions table for Active Sessions & Multi-Device Login Management

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Workstation',
  browser_name TEXT NOT NULL DEFAULT 'Web Browser',
  os_name TEXT NOT NULL DEFAULT 'Unknown OS',
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON public.admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_status ON public.admin_sessions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_sessions TO anon, authenticated, service_role;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and anon users to query sessions
DROP POLICY IF EXISTS "admin_sessions_read" ON public.admin_sessions;
CREATE POLICY "admin_sessions_read" ON public.admin_sessions
  FOR SELECT TO authenticated, anon
  USING (true);

-- Allow inserting new sessions
DROP POLICY IF EXISTS "admin_sessions_insert" ON public.admin_sessions;
CREATE POLICY "admin_sessions_insert" ON public.admin_sessions
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Allow updating sessions (revocation/heartbeat)
DROP POLICY IF EXISTS "admin_sessions_update" ON public.admin_sessions;
CREATE POLICY "admin_sessions_update" ON public.admin_sessions
  FOR UPDATE TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Allow deleting sessions
DROP POLICY IF EXISTS "admin_sessions_delete" ON public.admin_sessions;
CREATE POLICY "admin_sessions_delete" ON public.admin_sessions
  FOR DELETE TO authenticated, anon
  USING (true);

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
