import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// the config file runs in Node.js; it only uses environment variables, so @types/node is not pulled in just for this
declare const process: { env: Record<string, string | undefined> };

// `--mode artifact` produces the single-file preview: every asset inlined, no code splitting,
// and scripts/inline-artifact.mjs then merges the JS/CSS into one HTML file.
//
// During development the node and the indexer can be proxied to same-origin paths, so the browser needs no cross-origin access (ksana-indexer has no --rpc-cors):
//   KSANA_RPC=http://127.0.0.1:18545 KSANA_INDEXER=http://127.0.0.1:18548 KSANA_BTC=http://ksana:ksana@127.0.0.1:18443 npm run dev
//   then open http://localhost:5173/?rpc=/rpc&indexer=/indexer&btc=/btc
// KSANA_BTC is bitcoind's JSON-RPC (the wallet lists UTXOs and broadcasts through it for path C and top-ups; the mock bitcoind URL printed by web_devnet.rs also works) and may be omitted.
function proxyTo(target: string | undefined, ws: boolean) {
  if (!target) return undefined;
  // the Bitcoin RPC credentials are written in the URL (http://user:pass@host:port); the proxy turns them into an Authorization header, so the browser never touches them
  const url = new URL(target);
  const auth = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : undefined;
  url.username = '';
  url.password = '';
  return { target: url.toString(), changeOrigin: true, ws, ...(auth ? { auth } : {}), rewrite: (path: string) => path.replace(/^\/(rpc|indexer|btc)/, '') };
}

// Build fingerprint: the footer and "Settings → About" show the git commit hash the page was built from, so users can rebuild at the same commit and compare the output as described in README "Verify this page".
// KSANA_COMMIT (given explicitly when reproducing a build) takes priority, then CI's GITHUB_SHA, then the local git; when none is available it is the empty string. No timestamp is written; the output depends only on the sources.
function buildCommit(): string {
  const given = process.env.KSANA_COMMIT ?? process.env.GITHUB_SHA;
  if (given) return given.trim().slice(0, 9);
  try {
    return execSync('git rev-parse --short=9 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// The single-file preview carries every font inside its stylesheet. index.html's preload of the heading font would have Vite emit that font as a
// file of its own, which the stylesheet would then point at instead of carrying it, and the preview publishes no such file: its build reads
// index.html without the preload (scripts/inline-artifact.mjs refuses a stylesheet pointing at a file)
const noFontPreload: Plugin = {
  name: 'ksana-artifact-no-font-preload',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replace(/[ \t]*<link rel="preload"[^>]*as="font"[^>]*>\n/g, '') },
};

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  const rpc = proxyTo(process.env.KSANA_RPC, true);
  const indexer = proxyTo(process.env.KSANA_INDEXER, false);
  const btc = proxyTo(process.env.KSANA_BTC, false);
  return {
    base: './',
    plugins: artifact ? [react(), noFontPreload] : [react()],
    define: { __KSANA_COMMIT__: JSON.stringify(buildCommit()) },
    server: {
      proxy: {
        ...(rpc ? { '/rpc': rpc } : {}),
        ...(indexer ? { '/indexer': indexer } : {}),
        ...(btc ? { '/btc': btc } : {}),
      },
    },
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      assetsInlineLimit: artifact ? 10_000_000 : 4096,
      cssCodeSplit: false,
      modulePreload: artifact ? false : { polyfill: false },
      rolldownOptions: artifact ? { output: { inlineDynamicImports: true } } : {},
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
