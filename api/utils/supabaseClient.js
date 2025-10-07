import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient(req) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
      global: {
        headers: {
          Authorization: req.headers.authorization,
        },
      },
    }
  );
}