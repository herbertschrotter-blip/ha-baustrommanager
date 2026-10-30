// Baut die Seite „Baustelle“: src/alt.js (später src/main.js) → baustelle-panel.js (docs/bauplan-lit.md §4, BSM-022).
// Aufruf aus dem Repo: node custom_components/baustelle/frontend/bauen.mjs [--pruefen]
//   ohne Schalter: schreibt baustelle-panel.js neu
//   --pruefen:     baut im Speicher und vergleicht mit der eingecheckten Datei (Abbruch, wenn sie nicht passt; schreibt nichts)
// Die Version kommt aus version.json (erzeugt von tools/changelog.py aus CHANGELOG.md) und wird über esbuild `define`
// eingesetzt – kein Werkzeug schreibt danach in die gebaute Datei.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const ziel = join(hier, 'baustelle-panel.js');
const pruefen = process.argv.includes('--pruefen');
const { version } = JSON.parse(readFileSync(join(hier, 'version.json'), 'utf8'));

const ergebnis = await build({
  entryPoints: [join(hier, 'src', 'alt.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  splitting: false,
  target: ['es2022'],          // Edge und Android-WebView (S23 Ultra) – Abnahmebasis
  minify: false,               // lesbar für die Fehlersuche
  legalComments: 'inline',
  charset: 'utf8',
  sourcemap: false,
  write: false,
  absWorkingDir: hier,
  preserveSymlinks: true,      // tools/deploy.sh leiht node_modules im git worktree per Verknüpfung – Pfade im Bundle gleich
  define: { __BAUSTELLE_VERSION__: JSON.stringify(version) },
  banner: { js: '// Seite „Baustelle“ – gebaut mit esbuild aus custom_components/baustelle/frontend/src (nicht von Hand ändern, BSM-022)' },
  logLevel: 'warning',
});
const neu = ergebnis.outputFiles[0].text;

if (pruefen) {
  let alt = '';
  try { alt = readFileSync(ziel, 'utf8'); } catch { /* fehlt */ }
  if (alt !== neu) {
    console.error('baustelle-panel.js passt nicht zur Quelle – node custom_components/baustelle/frontend/bauen.mjs ausführen');
    process.exit(1);
  }
  console.log(`baustelle-panel.js aktuell (Version ${version}, ${Math.round(neu.length / 1024)} KB)`);
} else {
  writeFileSync(ziel, neu);
  console.log(`baustelle-panel.js gebaut (Version ${version}, ${Math.round(neu.length / 1024)} KB)`);
}
