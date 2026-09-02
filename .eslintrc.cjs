// Minimal, high-signal lint config — scoped to catch real bugs (undefined
// references, broken hook rules, duplicate keys) rather than style. This is
// a large, pre-existing untyped JS/JSX codebase with no prior lint setup,
// so style/unused-var rules are intentionally left as warnings (or off) to
// avoid a wall of pre-existing noise blocking CI on day one. `no-undef` is
// the one that matters most here: it's exactly the class of bug (a stray
// reference to a variable that was never declared) that has caused real
// runtime crashes in this codebase.
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "18.3" } },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  plugins: ["react", "react-hooks"],
  rules: {
    // React 17+ JSX transform — no need to import React in every file.
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "react/no-unescaped-entities": "off",
    "react/no-unknown-property": "off",
    "react/display-name": "off",

    // The two rules that actually catch crash-class bugs in this codebase.
    "no-undef": "error",
    "react-hooks/rules-of-hooks": "error",

    // Style/hygiene — warnings only, never block CI.
    "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
    "react-hooks/exhaustive-deps": "warn",
    "no-empty": ["warn", { allowEmptyCatch: true }],
    "no-constant-condition": ["warn", { checkLoops: false }],
  },
  overrides: [
    {
      // The mobile app's tests run on Jest, whose describe/it/expect are
      // globals (the web's Vitest tests import theirs, so they need nothing
      // here). Without this, linting mobile/ reports every assertion as
      // no-undef and buries the real findings.
      files: ["mobile/**/*.test.js"],
      env: { jest: true },
    },
  ],
  ignorePatterns: ["dist", "node_modules", "*.config.js", "*.config.cjs"],
};
