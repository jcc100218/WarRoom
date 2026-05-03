#!/usr/bin/env node
// AI routing and pricing regression tests for the War Room Edge Function.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'ai-analyze', 'index.ts'), 'utf8');
const usageMigration = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20260503000000_ai_usage_controls.sql'), 'utf8');

const EXPECTED_MODELS = {
  GEMINI_FAST: 'gemini-2.5-flash-lite',
  GEMINI_BALANCED: 'gemini-2.5-flash',
  CLAUDE_REASONING: 'claude-sonnet-4-6',
  CLAUDE_DEEP: 'claude-opus-4-7',
};

const EXPECTED_COSTS = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cachedInput: 0.30 },
  'claude-opus-4-7': { input: 5.00, output: 25.00, cachedInput: 0.50 },
};

const DEPRECATED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
];

let passed = 0;
let failed = 0;
const failures = [];

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberPattern(value) {
  const [whole, decimals = ''] = String(value.toFixed(2)).split('.');
  return `${whole}(?:\\.${decimals.replace(/0+$/, '')}\\d*)?`;
}

function assertModelConstant(name, value) {
  const pattern = new RegExp(`${name}\\s*:\\s*['"]${escapeRegex(value)}['"]`);
  ok(pattern.test(source), `missing ${name}: ${value}`);
}

function assertCost(model, expected) {
  const input = numberPattern(expected.input);
  const output = numberPattern(expected.output);
  let pattern = `['"]${escapeRegex(model)}['"]\\s*:\\s*\\{[^}]*input\\s*:\\s*${input}[^}]*output\\s*:\\s*${output}`;
  if (expected.cachedInput != null) {
    pattern += `[^}]*cachedInput\\s*:\\s*${numberPattern(expected.cachedInput)}`;
  }
  ok(new RegExp(pattern, 's').test(source), `stale/missing cost constants for ${model}`);
}

function assertRoute(callType, provider, modelConstant) {
  const key = `(?:['"]${escapeRegex(callType)}['"]|${escapeRegex(callType)})`;
  const pattern = new RegExp(
    `${key}\\s*:\\s*\\{[^}]*provider\\s*:\\s*['"]${provider}['"][^}]*model\\s*:\\s*AI_MODELS\\.${modelConstant}`,
    's'
  );
  ok(pattern.test(source), `route ${callType} should use ${provider}/${modelConstant}`);
}

console.log('\nWar Room AI routing regression tests');

group('model IDs');

test('Edge Function does not reference deprecated models', () => {
  for (const model of DEPRECATED_MODELS) {
    ok(!source.includes(model), `deprecated model remains: ${model}`);
  }
});

test('Edge Function exposes current routing model IDs', () => {
  for (const [name, value] of Object.entries(EXPECTED_MODELS)) {
    assertModelConstant(name, value);
  }
});

group('pricing');

test('pricing constants match verified provider rates', () => {
  for (const [model, expected] of Object.entries(EXPECTED_COSTS)) {
    assertCost(model, expected);
  }
});

group('routing');

test('frequent Alex surfaces route to Gemini', () => {
  ['fa_chat', 'fa_targets'].forEach(type => assertRoute(type, 'gemini', 'GEMINI_FAST'));
  ['chat', 'league', 'team', 'partners'].forEach(type => assertRoute(type, 'gemini', 'GEMINI_BALANCED'));
});

test('long structured generation routes to Claude Sonnet', () => {
  ['mock_draft', 'rookies'].forEach(type => assertRoute(type, 'anthropic', 'CLAUDE_REASONING'));
  ok(source.includes("allowExpensiveFallback"), 'expensive fallback policy should be explicit');
  ok(source.includes("providerFallback"), 'fallback usage should be recorded in telemetry');
});

test('unknown route defaults to Gemini Flash', () => {
  ok(source.includes("AI_ROUTES[type] || { provider: 'gemini', model: AI_MODELS.GEMINI_BALANCED }"), 'unknown route should default to Gemini balanced');
});

group('launch controls');

test('server AI has a kill switch and global budget caps', () => {
  ok(source.includes("AI_KILL_SWITCH"), 'missing AI_KILL_SWITCH');
  ok(source.includes("AI_ENABLED"), 'missing AI_ENABLED');
  ok(source.includes("AI_GLOBAL_DAILY_COST_LIMIT_USD"), 'missing global daily AI cost cap');
  ok(source.includes("AI_GLOBAL_MONTHLY_COST_LIMIT_USD"), 'missing global monthly AI cost cap');
});

test('server AI reserves and records DB-backed usage', () => {
  ok(source.includes("reserve_ai_usage"), 'missing reserve_ai_usage RPC');
  ok(source.includes("record_ai_usage_result"), 'missing record_ai_usage_result RPC');
  ok(source.includes("dailyRequests"), 'missing daily request limit metadata');
  ok(source.includes("monthlyRequests"), 'missing monthly request limit metadata');
  ok(usageMigration.includes("create table if not exists public.ai_usage_daily"), 'missing daily AI usage table');
  ok(usageMigration.includes("create table if not exists public.ai_usage_monthly"), 'missing monthly AI usage table');
  ok(usageMigration.includes("alter table public.ai_usage_daily enable row level security"), 'daily AI usage table should have RLS');
  ok(usageMigration.includes("alter table public.ai_usage_monthly enable row level security"), 'monthly AI usage table should have RLS');
  ok(usageMigration.includes("revoke execute on function public.reserve_ai_usage"), 'reserve_ai_usage should not be client-callable');
  ok(usageMigration.includes("revoke execute on function public.record_ai_usage_result"), 'record_ai_usage_result should not be client-callable');
  ok(usageMigration.includes("grant execute on function public.reserve_ai_usage"), 'reserve_ai_usage should be service-role callable');
  ok(usageMigration.includes("grant execute on function public.record_ai_usage_result"), 'record_ai_usage_result should be service-role callable');
});

test('server AI enforces plan and prompt/output caps', () => {
  ok(source.includes("const AI_LIMITS"), 'missing plan limit matrix');
  ok(source.includes("monthlyRequests: 20"), 'War Room monthly included AI cap should be explicit');
  ok(source.includes("monthlyRequests: 200"), 'Pro monthly included AI cap should be explicit');
  ok(source.includes("maxInputChars"), 'missing input context cap');
  ok(source.includes("AI_MAX_OUTPUT_TOKENS"), 'missing global output cap');
});

test('Opus routes are gated by entitlement instead of available to every paid user', () => {
  ok(source.includes("maxModelTier"), 'missing max model tier gate');
  ok(source.includes("downgradeRouteForEntitlement"), 'missing model downgrade policy');
  ok(source.includes("routeDowngraded"), 'missing downgraded route telemetry');
});

console.log('\n');
if (failures.length) {
  console.log(failures.join('\n'));
  console.log('');
}
const status = failed > 0 ? 'FAIL' : 'PASS';
console.log(`${status} ${passed + failed} tests - ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
