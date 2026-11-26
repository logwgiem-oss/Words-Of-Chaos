import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Words of Chaos: Supabase environment variables are missing.");
}

export const supabase = url && key
  ? createClient(url, key)
  : null;

export function getPlayerId() {
  const storageKey = "words_of_chaos_player_id_v2";

  let id = localStorage.getItem(storageKey);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(storageKey, id);
  }

  return id;
}
