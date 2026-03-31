# Supabase Project Setup Guide

Step-by-step instructions to set up the Supabase backend for Wikipedia Breadcrumbs.

---

## 1. Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" → sign up with GitHub (easiest) or email
3. Verify your email if prompted

## 2. Create a New Project

1. Once logged in, you'll see the Supabase dashboard
2. Click **"New project"**
3. Fill in:
   - **Name:** `wikipedia-breadcrumbs`
   - **Database Password:** Choose a strong password and save it somewhere safe (you'll need it for direct DB access, though we won't use it directly)
   - **Region:** Choose the closest to you
   - **Plan:** Free tier is fine
4. Click **"Create new project"**
5. Wait ~2 minutes for the project to provision

## 3. Get Your API Credentials

1. In your project dashboard, go to **Settings** (gear icon in left sidebar) → **API**
2. You'll see:
   - **Project URL** — looks like `https://abcdefghijkl.supabase.co`
   - **anon/public key** — a long `eyJ...` string under "Project API keys"
3. Copy both values. Create a `.env` file in the project root:

```bash
# /path/to/wikipedia-breadcrumbs/.env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Enable Anonymous Auth

1. In the dashboard, go to **Authentication** (left sidebar) → **Providers**
2. Scroll down to find **Anonymous Sign-ins**
3. Toggle it **ON**
4. Click **Save**

## 5. Create the Database Tables

1. Go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Paste the following SQL and click **"Run"**:

```sql
-- Trails table
CREATE TABLE trails (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  name text,
  created_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  is_starred boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  note text,
  visibility text NOT NULL DEFAULT 'private',
  device_id text NOT NULL,
  forked_from_visit_id uuid,
  start_reason text NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);

-- Visits table
CREATE TABLE visits (
  id uuid PRIMARY KEY,
  trail_id uuid NOT NULL REFERENCES trails(id),
  url text NOT NULL,
  title text NOT NULL,
  timestamp timestamptz NOT NULL,
  last_visited_at timestamptz NOT NULL,
  position integer NOT NULL,
  source_type text NOT NULL,
  source_detail text,
  tab_id integer,
  window_id integer,
  note text,
  summary text,
  thumbnail_url text,
  language text NOT NULL,
  article_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz
);

-- Conflict logs table
CREATE TABLE conflict_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  losing_snapshot jsonb NOT NULL,
  winning_snapshot jsonb NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for sync queries
CREATE INDEX idx_trails_updated_at ON trails(updated_at);
CREATE INDEX idx_trails_user_id ON trails(user_id);
CREATE INDEX idx_visits_updated_at ON visits(updated_at);
CREATE INDEX idx_visits_trail_id ON visits(trail_id);
CREATE INDEX idx_conflict_logs_user_id ON conflict_logs(user_id);
```

## 6. Enable Row-Level Security

1. Still in the SQL Editor, run a new query:

```sql
-- Enable RLS on all tables
ALTER TABLE trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_logs ENABLE ROW LEVEL SECURITY;

-- Trails: users can only access their own
CREATE POLICY "Users manage own trails"
  ON trails FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Visits: users can only access visits in their own trails
CREATE POLICY "Users manage own visits"
  ON visits FOR ALL
  USING (trail_id IN (SELECT id FROM trails WHERE user_id = auth.uid()))
  WITH CHECK (trail_id IN (SELECT id FROM trails WHERE user_id = auth.uid()));

-- Conflict logs: users can only see their own
CREATE POLICY "Users see own conflicts"
  ON conflict_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

## 7. Set Up Soft-Delete Cleanup (Optional)

This requires the pg_cron extension. On the free tier it may not be available — skip this step if so. The app works fine without it (soft-deleted records just accumulate).

1. In the SQL Editor:

```sql
-- Enable pg_cron (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule('cleanup-soft-deletes', '0 3 * * *', $$
  DELETE FROM visits WHERE deleted_at < now() - interval '30 days';
  DELETE FROM trails WHERE deleted_at < now() - interval '30 days';
  DELETE FROM conflict_logs WHERE resolved_at < now() - interval '30 days';
$$);
```

## 8. Verify Setup

1. Go to **Table Editor** (left sidebar)
2. You should see `trails`, `visits`, and `conflict_logs` tables
3. Each should be empty with the correct columns
4. Go to **Authentication** → **Users** — should be empty (anonymous users will appear here once the app starts syncing)

## Done

Your Supabase backend is ready. Make sure your `.env` file has the correct URL and anon key, then proceed with building the sync layer.

## 9. Enable Google OAuth

### Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure the **OAuth consent screen** first:
   - User type: External
   - App name: "Wikipedia Breadcrumbs"
   - Scopes: email, profile
6. Create an **OAuth client ID**:
   - Application type: **Web application**
   - Name: "Wikipedia Breadcrumbs Web"
   - Authorized redirect URIs: `https://[your-project-id].supabase.co/auth/v1/callback`
7. Copy the **Client ID** and **Client Secret**

### Supabase Dashboard

1. Go to **Authentication** → **Providers** → **Google**
2. Toggle **Enable Google provider** ON
3. Paste the **Client ID** and **Client Secret**
4. Click **Save**

### Environment Variables

Add to your `.env` files:

```env
PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

## 10. Disable Email Confirmations

1. Go to **Authentication** → **Settings** → **Email**
2. Toggle OFF "Enable email confirmations"
3. Click **Save**
