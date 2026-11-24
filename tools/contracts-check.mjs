// Usage: node tools/contracts-check.mjs
// Keeps contracts/ honest with itself: every schema compiles, and every cell, session row and
// timer state in the fixtures names a real dataset and field and holds a value its schema takes.
import fs from 'node:fs';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const STAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z-[0-9a-f]{4}-[0-9a-f]{16}$/;
const NAME = /^[A-Za-z0-9_-]{1,64}$/;

const datasets = {};
for (const f of fs.readdirSync('contracts/schemas')) {
  const s = read(`contracts/schemas/${f}`);
  datasets[s.title] = {
    row: ajv.compile(s),
    fields: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, ajv.compile(v)])),
  };
}

const problems = [];
const said = (v) => ajv.errorsText(v.errors);

function walk(node, where, unknown) {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${where}[${i}]`, unknown));
  if (!node || typeof node !== 'object') return;
  if ('stamp' in node && 'dataset' in node) return cell(node, where, unknown);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'order' && where.endsWith('today.json')) {
      // Keys to sort by, not rows: nothing here for a schema to check.
    } else if (k === 'sessions') {
      v.forEach(({ id, ...row }, i) => datasets.session.row(row) || problems.push(`${where}.sessions[${i}] (${id}): ${said(datasets.session.row)}`));
    } else if (k === 'row' && v) {
      datasets.session.row(v) || problems.push(`${where}.row: ${said(datasets.session.row)}`);
    } else if (k === 'state' || k === 'from') {
      datasets.timer.fields.state(v) || problems.push(`${where}.${k}: ${said(datasets.timer.fields.state)}`);
    } else walk(v, `${where}.${k}`, unknown);
  }
}

function cell(c, where, unknown) {
  if (!STAMP.test(c.stamp)) problems.push(`${where}: stamp ${c.stamp}`);
  for (const k of ['dataset', 'row', 'field']) if (!NAME.test(c[k])) problems.push(`${where}: ${k} ${c[k]}`);
  if (unknown.includes(`${c.dataset}.${c.field}`)) return;
  const check = datasets[c.dataset]?.fields[c.field];
  if (!check) return problems.push(`${where}: no field ${c.dataset}.${c.field} in contracts/schemas`);
  if (!check(c.value)) problems.push(`${where}: ${c.dataset}.${c.field} = ${JSON.stringify(c.value)}: ${said(check)}`);
}

const fixtures = fs.readdirSync('contracts/fixtures');
for (const f of fixtures) {
  const fx = read(`contracts/fixtures/${f}`);
  walk(fx, f, fx.unknown ?? []);
}
problems.forEach((p) => console.error(p));
console.log(`contracts-check: ${Object.keys(datasets).length} schemas, ${fixtures.length} fixtures, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
