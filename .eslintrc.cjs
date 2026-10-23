module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  ignorePatterns: [
    ".next",
    ".next-free",
    ".next-production-check",
    ".runtime",
    ".pnpm-store",
    ".pytest_cache",
    ".codex-*",
    "next-env.d.ts",
    "coverage",
    "dist",
    "node_modules",
    "pnpm-lock.yaml",
    "*.config.js",
    "*.config.mjs",
  ],
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "no-undef": "off",
  },
};
