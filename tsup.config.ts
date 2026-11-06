import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['@dloizides/llm-run'],
});
