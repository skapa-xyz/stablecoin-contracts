const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    rules: {
      "no-undef": 0,
      "no-console": 0,
      eqeqeq: "error",
      "no-unused-vars": "off",
    },
    files: ["**/*.js"],
    ignores: [
      "node_modules/*",
      "artifacts/*",
      "bin/*",
      "cache/*",
      "package-lock.json",
      "deployments/outputs/*.json",
    ],
  },
];
