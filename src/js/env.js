/* Facts about this copy of the app. python3 build.py fills in BUILD and APP_VERSION;
   running straight from src/ shows 'dev'. */
export const BUILD = 'dev';
export const APP_VERSION = 'dev';
// opened inside the Claude app (artifact viewer), where progress syncs to the Claude account
export const IN_CLAUDE = !!(window.claude && window.claude.use);
