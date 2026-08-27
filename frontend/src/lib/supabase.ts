import { createClient } from "@supabase/supabase-js";
import { api } from "@/lib/api";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key
  ? createClient(url, key, {
      accessToken: async () => {
        try {
          const result = await api.post<{ token: string }>("/auth/realtime-token");
          return result.token;
        } catch {
          // Realtime is an enhancement over database-backed message polling.
          // Before login, or when the optional JWT secret is absent, do not
          // turn an expected capability fallback into a console-level error.
          return null;
        }
      },
    })
  : null;
