#!/usr/bin/env node
// Security baseline contract tests for auth/admin Edge Functions.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const migration = read('supabase/migrations/20260502020000_security_baseline.sql');
const shared = read('supabase/functions/_shared/security.ts');
const signin = read('supabase/functions/fw-signin/index.ts');
const signup = read('supabase/functions/fw-signup/index.ts');
const adminList = read('supabase/functions/admin-list-users/index.ts');
const checkout = read('supabase/functions/fw-create-checkout/index.ts');
const aiAnalyze = read('supabase/functions/ai-analyze/index.ts');
const getSession = read('supabase/functions/get-session-token/index.ts');
const setPassword = read('supabase/functions/set-password/index.ts');
const resetRequest = read('supabase/functions/fw-request-password-reset/index.ts');
const resetConfirm = read('supabase/functions/fw-confirm-password-reset/index.ts');
const resetPage = read('reset-password.html');

let passed = 0;
let failed = 0;
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('.');
  } catch (err) {
    failed++;
    failures.push(`  FAIL: ${name}\n        ${err.message}`);
    process.stdout.write('F');
  }
}

function group(label) {
  process.stdout.write(`\n  ${label}  `);
}

function ok(value, label) {
  if (!value) throw new Error(label || 'expected truthy value');
}

function hasEvery(source, fragments, label) {
  for (const fragment of fragments) ok(source.includes(fragment), `${label}: missing ${fragment}`);
}

console.log('\nWar Room security contract tests');

group('schema');

test('security baseline creates server-only security tables', () => {
  [
    'create table if not exists public.security_events',
    'create table if not exists public.auth_rate_limits',
    'create table if not exists public.password_reset_tokens',
    'create table if not exists public.app_user_roles',
    'add column if not exists session_version integer not null default 1',
    'create or replace function public.increment_app_user_session_version',
  ].forEach(fragment => ok(migration.includes(fragment), `missing ${fragment}`));
});

test('security tables deny all browser access via RLS', () => {
  [
    'security_events_deny_all',
    'auth_rate_limits_deny_all',
    'password_reset_tokens_deny_all',
    'app_user_roles_deny_all',
  ].forEach(policy => ok(migration.includes(policy), `missing ${policy}`));
});

group('shared helper');

test('shared security helper provides CORS, rate limits, audit, and admin role checks', () => {
  [
    'APP_ALLOWED_ORIGINS',
    'export function corsHeaders',
    'export function handleOptions',
    'export function json',
    'export async function auditEvent',
    'export async function checkRateLimit',
    'export async function hasAdminRole',
    'export async function verifyJwtPayload',
    'export async function requireActiveAppSession',
    'export async function requireSleeperSession',
  ].forEach(fragment => ok(shared.includes(fragment), `missing ${fragment}`));
  ok(!shared.includes("'Access-Control-Allow-Origin':  '*'"), 'shared CORS must not default to wildcard');
  ok(shared.includes('https://jcc100218.github.io'), 'GitHub Pages origin should be allowed by default');
  ok(shared.includes('https://warroom.skjjcruz.com'), 'custom War Room origin should be allowed by default');
  ok(shared.includes("['SUPABASE_JWT_SECRET', 'JWT_SECRET']"), 'Sleeper token verifier should allow the configured JWT_SECRET fallback');
});

group('auth functions');

test('signup and signin enforce rate limits and audit outcomes', () => {
  [signup, signin].forEach((source, idx) => {
    const label = idx === 0 ? 'signup' : 'signin';
    hasEvery(source, [
      'checkRateLimit',
      'auditEvent',
      'handleOptions',
      'session_version',
    ], label);
    ok(!source.includes("'Access-Control-Allow-Origin':  '*'"), `${label} must not use wildcard CORS`);
  });
});

test('legacy session and set-password endpoints enforce rate limits and audit outcomes', () => {
  [getSession, setPassword].forEach((source, idx) => {
    const label = idx === 0 ? 'get-session-token' : 'set-password';
    hasEvery(source, [
      'checkRateLimit',
      'auditEvent',
      'handleOptions',
    ], label);
    ok(!source.includes("'Access-Control-Allow-Origin': '*'"), `${label} must not use wildcard CORS`);
  });
  ok(getSession.includes("Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('JWT_SECRET')"), 'get-session-token must support JWT_SECRET fallback');
  ok(setPassword.includes('requireSleeperSession'), 'set-password must verify signed Sleeper session token');
});

test('checkout endpoint enforces CORS helper, rate limits, and audit outcomes', () => {
  hasEvery(checkout, [
    'handleOptions',
    'requireActiveAppSession',
    'checkRateLimit',
    'auditEvent',
    'checkout_create',
  ], 'fw-create-checkout');
  ok(!checkout.includes("'Access-Control-Allow-Origin':  '*'"), 'checkout must not use wildcard CORS');
});

test('AI endpoint uses shared CORS helper instead of wildcard CORS', () => {
  hasEvery(aiAnalyze, [
    'corsHeaders',
    'handleOptions',
    'const responseHeaders = corsHeaders(req);',
    'requireActiveAppSession',
    'requireSleeperSession',
    'Valid session token required.',
  ], 'ai-analyze CORS');
  ok(!aiAnalyze.includes("'Access-Control-Allow-Origin': '*'"), 'ai-analyze must not use wildcard CORS');
});

test('admin list uses admin role table instead of static bearer secret', () => {
  hasEvery(adminList, [
    'hasAdminRole',
    'requireActiveAppSession',
    'auditEvent',
  ], 'admin-list-users');
  ok(!adminList.includes('ADMIN_SECRET'), 'admin-list-users should not use static ADMIN_SECRET');
});

group('password reset');

test('password reset endpoints store hashed tokens and rotate session version', () => {
  hasEvery(resetRequest, [
    'password_reset_tokens',
    'sha256Hex(resetToken)',
    'RESET_DEBUG_RETURN_TOKEN',
    'sendPasswordResetEmail',
    'RESEND_API_KEY',
    'https://api.resend.com/emails',
    'PASSWORD_RESET_FROM_EMAIL',
    'auditEvent',
    'checkRateLimit',
  ], 'reset request');
  hasEvery(resetConfirm, [
    "req.method === 'GET'",
    'Response.redirect',
    'PASSWORD_RESET_URL',
    'password_reset_tokens',
    'sha256Hex(String(token))',
    'increment_app_user_session_version',
    'password_changed_at',
    'auditEvent',
    'checkRateLimit',
  ], 'reset confirm');
  hasEvery(resetPage, [
    'fw-confirm-password-reset',
    'new URLSearchParams(window.location.search).get',
    'autocomplete="new-password"',
    'Return to Sign In',
  ], 'reset password page');
});

console.log('\n');
if (failures.length) {
  console.log(failures.join('\n'));
  console.log('');
}
const status = failed > 0 ? 'FAIL' : 'PASS';
console.log(`${status} ${passed + failed} tests - ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
