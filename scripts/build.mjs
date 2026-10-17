import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { collectLicenses } from './licenses.mjs';
await mkdir('dist', { recursive: true });
const editor = await build({
  entryPoints: { extension: 'src/extension.ts', worker: 'src/worker.ts', mcp: 'src/mcp.ts', core: 'src/core.ts', client: 'src/client.ts' },
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  external: ['vscode', 'playwright-core'],
  sourcemap: false, metafile: true,
  logLevel: 'info'
});
const app = await build({
  entryPoints: ['src/app.mts'], bundle: true, platform: 'node', target: 'node20', format: 'esm',
  outfile: 'dist/app.mjs', external: ['playwright-core', 'sidecar_sdk', 'ws'], logLevel: 'info', metafile: true
});
const installer = await build({
  entryPoints: ['scripts/install-app.mjs'], bundle: true, platform: 'node', target: 'node20', format: 'esm',
  outfile: 'dist/install.mjs', logLevel: 'info', metafile: true, mainFields: ['module', 'main']
});
console.log('Bundled dependency license sets:', await collectLicenses([editor, app, installer]));
