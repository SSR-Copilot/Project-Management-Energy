/**
 * End-to-end scenario over the BUILT app in mock mode, walking the same path as the two
 * screen recordings the UI was rebuilt from: portfolio -> New Project -> open a project ->
 * every rail screen -> the admin area -> the Cost app, opening the panels the guides show.
 *
 * It is a smoke net, not a parity harness. It fails on: page errors, console errors, error
 * boundaries, an empty main, a project-scoped screen that renders the "no project selected"
 * guard while a project IS selected, and the specific create-project regression that this
 * script was written to catch (Add Project hitting the route guard instead of the form).
 *
 * Playwright is deliberately NOT a dependency of this package — adding it would put a browser
 * download in every developer's install for one script. Run it against a preview server:
 *
 *   npm run build
 *   npx vite preview --port 4176 --host 127.0.0.1 &
 *   npm i -D playwright && npx playwright install chromium   # once, outside the lockfile
 *   node scripts/scenario.mjs
 *
 * Exit code is the number of problems, so it drops into CI unchanged.
 */
import { chromium } from 'playwright';

const B = process.env.APP_URL ?? 'http://127.0.0.1:4176';
const problems = [];
const steps = [];

const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });

let errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon|Download the React DevTools|X-Frame|net::ERR_/i.test(t)) return;
  errors.push('CONSOLE: ' + t.slice(0, 200));
});

const bodyText = async () => (await page.locator('main').first().innerText().catch(() => '')) || '';

async function step(name, fn, { expectProject = true } = {}) {
  errors = [];
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: THREW ${String(e).split('\n')[0].slice(0, 160)}`);
    steps.push([name, 'THREW', '']);
    return;
  }
  await page.waitForTimeout(1400);
  const txt = await bodyText();
  const flat = txt.replace(/\s+/g, ' ').trim();

  if (/Something went wrong|error boundary|Unexpected Application Error/i.test(flat))
    problems.push(`${name}: error boundary — ${flat.slice(0, 120)}`);
  if (expectProject && /No project selected/i.test(flat))
    problems.push(`${name}: lost the selected project`);
  if (!flat) problems.push(`${name}: rendered empty main`);
  for (const e of errors) problems.push(`${name}: ${e}`);

  steps.push([name, errors.length ? `${errors.length} err` : 'ok', flat.slice(0, 72)]);
}

const go = (hash) => async () => {
  await page.goto(B + '/#' + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
};

/* ── 1. portfolio ─────────────────────────────────────────────── */
await step('portfolio list', go('/projects'), { expectProject: false });

await step('portfolio · filter by project name', async () => {
  const box = page.getByPlaceholder('Search for Project Name, Short Name and ID');
  if (await box.count()) { await box.fill('Test'); await page.waitForTimeout(1200); }
}, { expectProject: false });

await step('portfolio · clear filter', async () => {
  const box = page.getByPlaceholder('Search for Project Name, Short Name and ID');
  if (await box.count()) { await box.fill(''); await page.waitForTimeout(1200); }
}, { expectProject: false });

await step('portfolio · New Project form', async () => {
  const add = page.getByRole('button', { name: /Add Project/ }).first();
  if (await add.count()) { await add.click({ force: true }); await page.waitForTimeout(2000); }
  const txt = ((await page.locator('main').first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  if (/No project selected/i.test(txt)) problems.push('Add Project: hit the project guard instead of the New Project form');
  if (!/New Project/i.test(txt)) problems.push('Add Project: form did not render the New Project title');
  if (!/Basic Information/i.test(txt)) problems.push('Add Project: Basic Information section missing');
  const save = page.getByRole('button', { name: /^Save$/ }).first();
  if (await save.count()) {
    const enabled = await save.isEnabled().catch(() => true);
    if (enabled) problems.push('Add Project: Save is enabled on an empty required form');
  }
}, { expectProject: false });

await step('portfolio · back to list', go('/projects'), { expectProject: false });

/* ── 2. open a project ────────────────────────────────────────── */
await step('open project', async () => {
  await page.locator('input[type=radio]').first().check({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const open = page.getByRole('button', { name: /View Project|Edit Project/ }).first();
  await open.click({ force: true });
  await page.waitForTimeout(2000);
});

/* ── 3. every project rail screen ─────────────────────────────── */
const rail = [
  ['General', '/project/general'],
  ['Milestones', '/project/milestones'],
  ['Generator', '/project/generators'],
  ['Production', '/project/production'],
  ['Cluster Check List', '/project/checklist'],
  ['Project Team', '/project/team'],
  ['Planning', '/project/planning'],
  ['Grid Operator', '/project/grid-operator'],
  ['Revenue', '/project/revenues'],
  ['Financing', '/project/finance'],
];
for (const [label, route] of rail) await step(`rail · ${label}`, go(route));

/* ── 4. panels the recordings show ────────────────────────────── */
await step('Planning · Repowering tab', async () => {
  await page.goto(B + '/#/project/planning', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const tab = page.getByRole('tab', { name: /Repowering/i }).first();
  if (await tab.count()) await tab.click({ force: true });
});

await step('Generator · Add WTG Type', async () => {
  await page.goto(B + '/#/project/generators', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const btn = page.getByRole('button', { name: /Add WTG Type/i }).first();
  if (await btn.count()) await btn.click({ force: true });
});

await step('Revenue · tabs', async () => {
  await page.goto(B + '/#/project/revenues', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const tabs = page.getByRole('tab');
  const n = await tabs.count();
  if (n > 1) await tabs.nth(1).click({ force: true });
});

/* ── 5. admin area ────────────────────────────────────────────── */
const admin = [
  ['Check List Settings', '/admin/default-checklists'],
  ['Project Gates', '/admin/gates-approvals'],
  ['CAPEX Accounts', '/admin/capex-accounts'],
  ['Std Assumptions · Milestones', '/admin/milestones'],
  ['Std Assumptions · Costs', '/admin/cost'],
  ['Std Assumptions · Contracts', '/admin/contract'],
];
for (const [label, route] of admin) await step(`admin · ${label}`, go(route), { expectProject: false });

await step('admin · Project Gates · pick Germany/Wind', async () => {
  await page.goto(B + '/#/admin/gates-approvals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const leaf = page.getByRole('button', { name: /^Wind$/ }).first();
  if (await leaf.count()) await leaf.click({ force: true });
}, { expectProject: false });

/* ── 6. Cost app ──────────────────────────────────────────────── */
const cost = [
  ['DEVEX/CAPEX', '/costs/capex'],
  ['Operation & Maintenance', '/costs/opex/om'],
  ['Land Lease', '/costs/land-lease'],
  ['Other OPEX Costs', '/costs/opex/other'],
  ['Contracts', '/costs/contracts'],
];
for (const [label, route] of cost) await step(`cost · ${label}`, go(route));

/* ── report ───────────────────────────────────────────────────── */
console.log('\nSTEP RESULTS');
for (const [n, s, t] of steps) console.log(`  ${s.padEnd(7)} ${n.padEnd(34)} ${t}`);
console.log(`\n${steps.length} steps, ${problems.length} problems`);
if (problems.length) { console.log('\nPROBLEMS'); for (const p of problems) console.log('  - ' + p); }
await page.screenshot({ path: 'scenario-last.png' });
await b.close();
process.exit(problems.length ? 1 : 0);
