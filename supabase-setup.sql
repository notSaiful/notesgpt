-- ══════════════════════════════════════════════
-- NotesGPT — Supabase Database Setup
-- Run this in Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════

-- 1. Profiles table (stores user info)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Study history table
CREATE TABLE IF NOT EXISTS study_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  class_num TEXT NOT NULL,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  topic TEXT DEFAULT '',
  steps JSONB DEFAULT '{}',
  latest_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, session_key)
);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_study_history_user_id ON study_history(user_id);
CREATE INDEX IF NOT EXISTS idx_study_history_created_at ON study_history(created_at DESC);

-- 4. Row Level Security (RLS) — users can only access their own data
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_history ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Study history: users can CRUD their own history
CREATE POLICY "Users can view own history"
  ON study_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON study_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own history"
  ON study_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own history"
  ON study_history FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Service role bypass (for server-side operations)
-- The service role key automatically bypasses RLS
