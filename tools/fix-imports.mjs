#!/usr/bin/env node
// Regenerate the import lines and `export` keywords of every module in src/js from what the code uses.
//   node tools/fix-imports.mjs          rewrite the files
//   node tools/fix-imports.mjs --check  only report differences (exit 1 if any)
// Each module imports exactly the names it uses from the module that declares them, and exports exactly
// the names other modules (or the tests in tests/) use. Output is formatted with Prettier.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as prettier from 'prettier';

const require = createRequire(import.meta.url);
const acorn = require('acorn');
const escope = require('eslint-scope');

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'js');
// hand-written modules whose exports are fixed: build-time facts and the built-in data
const PROVIDERS = { 'env.js': ['BUILD', 'APP_VERSION', 'IN_CLAUDE'], 'data.js': ['GLYPHS', 'LIBRARY_DATA'] };
// import order: foundations first, screens last
const ORDER = ['env.js', 'data.js', 'core/', 'music/', 'learn/', 'views/'];
const CORE_ORDER = ['log', 'util', 'store', 'audio', 'input', 'ui', 'files'];
const MUSIC_ORDER = ['theory', 'render', 'analysis', 'drills', 'library', 'midifile'];
const LEARN_ORDER = ['curriculum', 'drill', 'player', 'improv'];
// names the tests import straight from a module (unit tests of the pure modules) stay exported
const TESTS = path.join(ROOT, '..', '..', 'tests');
const KEEP_EXPORTS = {};
for (const f of fs.readdirSync(TESTS).filter(x => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  for (const [, names, mod] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/src\/js\/([^']+)'/g))
    (KEEP_EXPORTS[mod] ||= []).push(
      ...names
        .split(',')
        .map(n => n.trim())
        .filter(Boolean),
    );
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(path.relative(ROOT, p));
  }
})(ROOT);
const modules = files.filter(f => !PROVIDERS[f]);

const parse = src => acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
const declNames = st =>
  st.type === 'VariableDeclaration' ? st.declarations.map(d => d.id.name) : st.id ? [st.id.name] : [];

// strip imports and exports, so each file reads as plain declarations
const plain = {};
for (const f of modules) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ast = parse(src);
  let out = src;
  const edits = [];
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') {
      let end = st.end;
      while (out[end] === '\n') end++;
      edits.push([st.start, end, '']);
    } else if (st.type === 'ExportNamedDeclaration' && st.declaration)
      edits.push([st.start, st.declaration.start, '']);
    else if (st.type === 'ExportNamedDeclaration') throw new Error(`${f}: export lists are not supported`);
  }
  edits.sort((a, b) => b[0] - a[0]).forEach(([a, b, t]) => (out = out.slice(0, a) + t + out.slice(b)));
  plain[f] = out;
}

// who declares what, and who uses what
const owner = {};
for (const [f, names] of Object.entries(PROVIDERS)) names.forEach(n => (owner[n] = f));
const uses = {};
for (const f of modules) {
  const scope = escope.analyze(parse(plain[f]), { ecmaVersion: 2022, sourceType: 'module' });
  const top = scope.globalScope.childScopes[0];
  for (const v of top.variables) {
    if (!v.defs.length) continue;
    if (owner[v.name] && owner[v.name] !== f)
      throw new Error(`${v.name} is declared in ${owner[v.name]} and ${f}`);
    owner[v.name] = f;
  }
  uses[f] = new Set(top.through.map(r => r.identifier.name));
}
const imports = {};
const exported = {};
for (const f of modules) {
  imports[f] = {};
  for (const n of uses[f]) {
    const o = owner[n];
    if (!o || o === f) continue;
    (imports[f][o] ||= new Set()).add(n);
    (exported[o] ||= new Set()).add(n);
  }
}
for (const [f, names] of Object.entries(KEEP_EXPORTS)) names.forEach(n => (exported[f] ||= new Set()).add(n));

const rank = f => {
  const group = ORDER.findIndex(g => f === g || f.startsWith(g));
  const base = path.basename(f, '.js');
  const sub = [CORE_ORDER, MUSIC_ORDER, LEARN_ORDER].map(o => o.indexOf(base)).find(i => i >= 0) ?? 50;
  return group * 100 + sub;
};
const rel = (from, to) => {
  const r = path.relative(path.dirname(from), to);
  return r.startsWith('.') ? r : './' + r;
};
let changed = 0;
for (const f of modules) {
  // header comment stays first
  const src = plain[f];
  const header = (src.match(/^\/\*[\s\S]*?\*\/\n/) || [''])[0];
  let body = src.slice(header.length).replace(/^\n+/, '');
  const ast = parse(body);
  const marks = [];
  for (const st of ast.body)
    if (declNames(st).some(n => exported[f] && exported[f].has(n))) marks.push(st.start);
  marks.sort((a, b) => b - a).forEach(i => (body = body.slice(0, i) + 'export ' + body.slice(i)));
  const lines = Object.entries(imports[f])
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([o, ns]) => {
      const sorted = [...ns].sort(
        (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : 1),
      );
      return `import { ${sorted.join(', ')} } from '${rel(f, o)}';`;
    });
  const file = path.join(ROOT, f);
  const options = { ...(await prettier.resolveConfig(file)), filepath: file };
  const out = await prettier.format(
    header + (lines.length ? lines.join('\n') + '\n' : '') + '\n' + body,
    options,
  );
  if (out !== fs.readFileSync(file, 'utf8')) {
    changed++;
    if (process.argv.includes('--check')) console.log('would change', f);
    else fs.writeFileSync(file, out);
  }
}
if (process.argv.includes('--check') && changed) process.exit(1);
console.log(`${changed} file(s) ${process.argv.includes('--check') ? 'differ' : 'updated'}`);
