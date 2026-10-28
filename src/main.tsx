import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import { holdReadersPlace } from './app/anchor';
import { loadFaces } from './app/fonts';
import { applyTheme, dismissToast, themeStore, toast } from './app/prefs';
import { chain, onStartedOver } from './app/store';
import { loadDeployment } from './app/deployment';
import { watchForUpdates } from './app/update';
import { App } from './app/App';
import { detectLocale, initLocale, t, useLocale } from './i18n';

applyTheme(themeStore.get());
// The faces the first page is drawn in arrive while it connects, rather than a round trip after it drew its figures
loadFaces(detectLocale());
// The reader's place is kept as content arrives above it: the keyboard's focus where it shows, else, in a browser with no scroll anchoring
// of its own (WebKit before Safari 27), the first thing in view
holdReadersPlace();
// A page left open while a newer version is published learns of it, and offers the reload
watchForUpdates();
// A network that started over while the page was open is read anew, and the page says so until the notice is closed, a later restart's
// notice taking its place
let startedOver: number | undefined;
onStartedOver(() => {
  if (startedOver !== undefined) dismissToast(startedOver);
  startedOver = toast({ tone: 'warn', title: t().shell.startedOver.title, body: t().shell.startedOver.body, keep: true }, 0);
});
// In development, expose the data source on window for debugging (simulator or node data source)
if (import.meta.env.DEV) Object.defineProperty(window, '__devnet', { get: chain });

/** The whole UI remounts when the language changes: chain, wallet and preference state live outside React and are unaffected */
function Root() {
  const locale = useLocale();
  return <App key={locale} />;
}

// Load the UI language first (English is bundled; other languages load on demand) to avoid a flash of another language,
// and the network a hosted copy was published for (deployment.json, D-107, asked for by index.html while this script downloaded) before the data source starts.
// Not a top-level await: the bundler does not merge the chunks the app and its language packs share into the app's own file for a module
// with one, and the page asked for each such chunk on its own (seven files where one does)
void Promise.all([initLocale(), loadDeployment()]).then(() => {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    );
  }
});
