// Assemble une version « une page » du site dans dist/ : CSS et JS intégrés, données à côté.
// Usage : node scripts/build-artifact.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
mkdirSync(join(out, 'data'), { recursive: true });

const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const js = (await build({ entryPoints: [join(root, 'src/ui/app.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' })).outputFiles[0].text;

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link [^>]*fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\s*<script type="module"[^>]*><\/script>/, '');

const page = `${title}
<style>
${css}
</style>
${fonts}
${body.trim()}
<script>
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
writeFileSync(join(out, 'index.html'), page);
copyFileSync(join(root, 'data/simulateur_data.json'), join(out, 'data/simulateur_data.json'));
console.log(`dist/index.html ${(page.length / 1024).toFixed(0)} Ko`);
