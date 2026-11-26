import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConnected = Boolean(
  SUPABASE_URL && SUPABASE_KEY
);

export const supabase = isConnected
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function ensureGuest() {
  if (!supabase) {
    throw new Error(
      "Words of Chaos is not connected to Supabase. Check its existing project settings."
    );
  }

  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (session) {
    return session.user;
  }

  const {
    data,
    error
  } = await supabase.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data?.user) {
    throw new Error("Could not create a player session.");
  }

  return data.user;
}
