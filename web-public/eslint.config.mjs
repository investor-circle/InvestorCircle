import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// eslint-config-next ships a native flat-config export — no FlatCompat
// shim needed (and FlatCompat + "next/core-web-vitals" currently crashes
// with "Converting circular structure to JSON" on this ESLint/plugin
// version combination; this sidesteps that entirely).
const config = [...nextCoreWebVitals];
export default config;
