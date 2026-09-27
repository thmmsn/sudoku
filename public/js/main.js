// "/" shows the landing page, "/<username>" the profile.
import { renderLanding } from './landing.js';
import { renderProfile } from './profile.js';

const first = decodeURIComponent(location.pathname).split('/').filter(Boolean)[0];
const app = document.getElementById('app');
if (first) renderProfile(app, first);
else renderLanding(app);

// Offline support (sw.js). Registered after the page has rendered.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
