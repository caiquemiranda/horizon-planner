/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{js,cjs,mjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml,css,html}': ['prettier --write'],
};
