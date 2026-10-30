#!/usr/bin/env python3
"""Build DaCapo into single files.

    python3 build.py

The source in src/ runs as it is (ES modules; see README). This script produces:

    docs/                   the site for GitHub Pages: index.html with every script, style and
                            piece of data inlined, plus the manifest, service worker and icons
    dist/DaCapo.artifact.html
                            the same app as a page body for the Claude artifact viewer

Bundling is deliberately simple. The modules are ordered the way a browser would evaluate them
(depth-first from src/js/app.js), their import and export keywords are removed, and the result is
wrapped in one strict-mode function. Every name is declared exactly once across the modules, which
ESLint and the module loader both check, so nothing can clash.
"""
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
SITE_FILES = ['manifest.webmanifest', 'sw.js', 'icons']

IMPORT_RE = re.compile(r"^import\s[^;]*?from\s*'([^']+)'(?:\s*with\s*\{[^}]*\})?\s*;[ \t]*\n?", re.M)
EXPORT_DECL_RE = re.compile(r'^export (?=(?:async\s+)?(?:const|let|var|function|class)\b)', re.M)
EXPORT_LIST_RE = re.compile(r'^export\s*\{[^}]*\}\s*;?[ \t]*\n?', re.M)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def version():
    return json.loads(read(os.path.join(ROOT, 'package.json')))['version']


def module_order(entry):
    """Module files in browser evaluation order: each module after the modules it imports."""
    order, seen = [], set()

    def visit(path):
        if path in seen:
            return
        seen.add(path)
        for spec in IMPORT_RE.findall(read(path)):
            if spec.endswith('.js'):
                visit(os.path.normpath(os.path.join(os.path.dirname(path), spec)))
        order.append(path)

    visit(entry)
    return order


NAMED_IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+\.js)'", re.M)
EXPORTED_RE = re.compile(r'^export (?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', re.M)


def check_imports(paths):
    """Every imported name must be exported by its module (the bundle would hide a mistake here)."""
    def exports(p):
        text = read(p)
        names = set(EXPORTED_RE.findall(text))
        for group in re.findall(r'^export\s*\{([^}]*)\}', text, re.M):
            names.update(x.strip() for x in group.split(',') if x.strip())
        return names

    exported = {p: exports(p) for p in paths}
    for p in paths:
        for names, spec in NAMED_IMPORT_RE.findall(read(p)):
            target = os.path.normpath(os.path.join(os.path.dirname(p), spec))
            for n in (x.strip() for x in names.split(',') if x.strip()):
                if n not in exported.get(target, ()):
                    raise SystemExit(f'build: {os.path.relpath(p, SRC)} imports {n!r}, which {spec} does not export')


TOP_LEVEL_RE = re.compile(r'^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', re.M)


def check_top_level_names(paths):
    """The bundle puts every module in one scope, so two modules must not declare the same top-level name."""
    seen = {}
    for p in paths:
        for n in TOP_LEVEL_RE.findall(read(p)):
            if n in seen and seen[n] != p:
                raise SystemExit(
                    f'build: {n!r} is declared in both {os.path.relpath(seen[n], SRC)} and {os.path.relpath(p, SRC)}; '
                    'rename one (modules share one scope in the bundle)'
                )
            seen[n] = p


def module_body(path, build):
    """One module as plain script: build-time values filled in, imports and exports removed."""
    name = os.path.relpath(path, os.path.join(SRC, 'js'))
    if name == 'data.js':
        data = lambda f: json.dumps(json.loads(read(os.path.join(SRC, 'data', f))), separators=(',', ':'), ensure_ascii=False)
        return f'const GLYPHS = {data("glyphs.json")};\nconst LIBRARY_DATA = {data("library.json")};\n'
    text = read(path)
    if name == 'env.js':
        text = text.replace("BUILD = 'dev'", f"BUILD = '{build}'").replace("APP_VERSION = 'dev'", f"APP_VERSION = '{version()}'")
    text = IMPORT_RE.sub('', text)
    text = EXPORT_DECL_RE.sub('', text)
    text = EXPORT_LIST_RE.sub('', text)
    leftover = re.search(r'^\s*(import|export)\b.*$', text, re.M)
    if leftover:
        raise SystemExit(f'build: cannot bundle {name}: {leftover.group(0).strip()!r}')
    return f'// ---- {name} ----\n{text.strip()}\n'


def bundle(build):
    paths = module_order(os.path.join(SRC, 'js', 'app.js'))
    check_imports(paths)
    check_top_level_names(paths)
    js = '\n'.join(module_body(p, build) for p in paths)
    js = "(() => {\n'use strict';\n" + js + '})();\n'
    return js.replace('</script', '<\\/script')  # never end the inline script early


def page(build):
    """The full index.html for the site, with styles and scripts inlined."""
    html = read(os.path.join(SRC, 'index.html'))
    css = read(os.path.join(SRC, 'styles.css'))
    html = html.replace('<link rel="stylesheet" href="styles.css" />', f'<style>\n{css}</style>')
    service_worker = ("<script>if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.claude && window.claude.use))"
                      " window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>")
    script = '<script type="module" src="js/app.js"></script>'
    assert script in html, 'index.html must load js/app.js'
    return html.replace(script, f'<script>\n{bundle(build)}</script>\n{service_worker}')


def artifact_page():
    """The page body for the Claude artifact viewer, which supplies its own document shell."""
    html = page('artifact')
    head = html[html.index('<head>') + 6:html.index('</head>')]
    head = re.sub(r'\s*<!-- site-only:start.*?<!-- site-only:end -->', '', head, flags=re.S)
    head = re.sub(r'\s*<meta (charset|name="viewport")[^>]*>', '', head)
    body = html[html.index('<body>') + 6:html.rindex('</body>')]
    body = re.sub(r'<script>if \(\'serviceWorker\'.*?</script>', '', body, flags=re.S)
    return head.strip() + '\n' + body.strip() + '\n'


def main():
    v = version()
    docs = os.path.join(ROOT, 'docs')
    write(os.path.join(docs, 'index.html'), page('site'))
    for name in SITE_FILES:
        src, dst = os.path.join(SRC, name), os.path.join(docs, name)
        if os.path.isdir(src):
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst)
        elif name == 'sw.js':
            write(dst, read(src).replace('__VERSION__', v))
        else:
            shutil.copy(src, dst)
    art = artifact_page()
    write(os.path.join(ROOT, 'dist', 'DaCapo.artifact.html'), art)
    kb = lambda n: f'{n // 1024} KB'
    print(f'built DaCapo {v}: docs/index.html {kb(os.path.getsize(os.path.join(docs, "index.html")))}, '
          f'dist/DaCapo.artifact.html {kb(len(art.encode()))}')


if __name__ == '__main__':
    main()
