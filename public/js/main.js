// "/" shows the landing page, "/<username>" the profile.
import { renderLanding } from './landing.js';
import { renderProfile } from './profile.js';

const first = decodeURIComponent(location.pathname).split('/').filter(Boolean)[0];
const app = document.getElementById('app');
if (first) renderProfile(app, first);
else renderLanding(app);
