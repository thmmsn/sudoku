// "/" shows the landing page, "/<username>" the profile.
import { renderLanding } from './landing.js';
import { renderProfile } from './profile.js';

const first = decodeURIComponent(location.pathname).split('/').filter(Boolean)[0];
const app = document.getElementById('app');
if (first) renderProfile(app, first);
else renderLanding(app);

// Offline support (sw.js), for profile pages only: the offline app is your
// profile, not the name screen. Registered after the page has rendered.
if (first && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
