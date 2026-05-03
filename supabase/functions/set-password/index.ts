// ============================================================
// Owner Dashboard — set-password Edge Function
//
// Creates or updates a gifted user's bcrypt password hash.
// Caller must supply a valid session token (their own JWT)
// in the Authorization header — only authenticated users
// can gift a dashboard to a league mate.
//
// POST body: { username: string, password: string, displayName?: string }
//
// DEPLOY:
//   supabase functions deploy set-password
// ============================================================

import bcrypt from 'npm:bcryptjs';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
    auditEvent,
    checkRateLimit,
    clientIp,
    handleOptions,
    json,
    requireSleeperSession,
} from '../_shared/security.ts';

const BCRYPT_ROUNDS = 12;

Deno.serve(async (req) => {
    const options = handleOptions(req);
    if (options) return options;

    try {
        // ── Require a signed Sleeper session token ─────────────────────────
        const session = await requireSleeperSession(req);
        const callerUsername = session?.username || null;
        if (!callerUsername) return json(req, { error: 'Invalid token' }, 401);

        const { username, password, displayName } = await req.json();

        if (!username || !password) {
            return json(req, { error: 'username and password are required' }, 400);
        }
        if (password.length < 8) {
            return json(req, { error: 'Password must be at least 8 characters' }, 400);
        }

        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        if (!serviceKey || !supabaseUrl) {
            return json(req, { error: 'Supabase service credentials not available' }, 500);
        }
        const admin = createClient(supabaseUrl, serviceKey);
        const ipLimit = await checkRateLimit(admin, 'set-password:ip', clientIp(req), { limit: 20, windowSeconds: 3600, lockoutSeconds: 1800 });
        const callerLimit = await checkRateLimit(admin, 'set-password:caller', callerUsername, { limit: 10, windowSeconds: 3600, lockoutSeconds: 1800 });
        if (!ipLimit.allowed || !callerLimit.allowed) {
            await auditEvent(admin, req, 'set_password_rate_limited', 'blocked', { username: callerUsername }, {});
            return json(req, { error: 'Too many password setup attempts. Try again later.' }, 429);
        }

        // ── Verify target Sleeper username exists ──────────────────────────
        try {
            const resp = await fetch(
                `https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`,
                { signal: AbortSignal.timeout(5000) }
            );
            const sleeperUser = resp.ok ? await resp.json() : null;
            if (!sleeperUser?.user_id) {
                await auditEvent(admin, req, 'set_password', 'failure', { username: callerUsername }, { targetUsername: username, reason: 'target_not_found' });
                return json(req, { error: 'Target Sleeper username not found' }, 404);
            }
        } catch {
            return json(req, { error: 'Could not verify target Sleeper username' }, 503);
        }

        // ── Hash password with bcrypt ──────────────────────────────────────
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // ── Upsert user row using service role (bypasses RLS) ─────────────
        const { error } = await admin.from('users').upsert(
            {
                sleeper_username: username,
                password_hash:    passwordHash,
                display_name:     displayName || null,
                is_gifted:        true,
            },
            { onConflict: 'sleeper_username' }
        );
        if (error) throw error;

        await auditEvent(admin, req, 'set_password', 'success', { username: callerUsername }, { targetUsername: username });
        return json(req, { success: true });

    } catch (err: any) {
        console.error('[set-password] error:', err);
        return json(req, { error: err.message || 'Internal server error' }, 500);
    }
});
