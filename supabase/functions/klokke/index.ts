// Innpakning for Supabase Edge Functions. All logikk ligger i handler.js (docs/specs/turer-fra-klokka.md).
// Publiseres med JWT-sjekken på: npx supabase functions deploy klokke --project-ref <ref> (aldri --no-verify-jwt).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { handle } from './handler.js';

// Supabase setter SUPABASE_URL og SUPABASE_PUBLISHABLE_KEYS selv. Secret- og service_role-nøkler brukes ikke.
const sb = createClient(Deno.env.get('SUPABASE_URL')!, JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = { INTERVALS_API_KEY: Deno.env.get('INTERVALS_API_KEY'), INTERVALS_OWNER_EMAIL: Deno.env.get('INTERVALS_OWNER_EMAIL') };

Deno.serve(req => handle(req, globalThis.fetch, (token: string) => sb.auth.getUser(token), env));
