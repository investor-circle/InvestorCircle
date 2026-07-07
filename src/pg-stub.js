// Browser stub for the 'pg' package.
// pg is Node.js-only and is only used in scripts/stamp-prices.js.
// @neondatabase/serverless uses fetch() in the browser — it never calls pg.
// Vite's alias replaces any pg import with this empty stub during the build.
export default {};
export const Client = undefined;
export const Pool   = undefined;
export const types  = undefined;
