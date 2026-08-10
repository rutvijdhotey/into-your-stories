import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Verifies the caller's access token and returns their user id.
 *
 * Checking only that an Authorization header *exists* is not authentication:
 * `Bearer hello` passes that test. The platform's gateway-level `verify_jwt` has
 * been covering these functions, but that is a dashboard setting no function
 * asserts — one deploy with `--no-verify-jwt` and an unauthenticated proxy to
 * the Anthropic key is live. Verify the token here so the guarantee belongs to
 * the code.
 *
 * Returns a ready-to-return 401 Response on failure, never a partial result.
 */
export async function requireUser(
  req: Request,
): Promise<{ userId: string; error: null } | { userId: null; error: Response }> {
  const unauthorized = () =>
    new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { userId: null, error: unauthorized() };

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token.length === 0) return { userId: null, error: unauthorized() };

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.auth.getUser(token);
    const userId = data?.user?.id;
    if (error || !userId) return { userId: null, error: unauthorized() };
    return { userId, error: null };
  } catch {
    return { userId: null, error: unauthorized() };
  }
}
