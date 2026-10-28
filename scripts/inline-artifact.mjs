// Combines the output of `vite build --mode artifact` into a standalone HTML fragment, used to publish the online preview.
// The preview environment wraps it in <!doctype html><head><body> automatically, so only the title, styles, root node and script are emitted here.
// Usage: node scripts/inline-artifact.mjs [output path]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { outsideRefs } from './style-refs.mjs';

const dist = resolve(import.meta.dirname, '..', 'dist-artifact');
const out = resolve(process.argv[2] ?? join(dist, 'ksana-preview.html'));
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected one JS file, found ${js.length}: ${js.join(', ')}`);

const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
// the fonts (Plex Mono and the heading serif subset) are already inlined into the styles by Vite; the page needs no external requests
const outside = outsideRefs(style);
if (outside.length > 0) throw new Error(`the styles point at files the preview does not carry: ${outside.join(', ')}`);
const html = `<title>Ksana</title>
<style>
${style}
</style>
<div id="root"></div>
<script type="module">
${script}
</script>
`;

writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB)`);
