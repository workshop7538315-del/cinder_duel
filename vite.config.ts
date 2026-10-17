import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages の /cinder_duel/ 配下でもローカルでも動くよう相対パスにする
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});
