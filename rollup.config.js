import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';

export default [
  // Main bundle (mount + engine)
  {
    input: 'src/index.js',
    output: [
      { file: 'dist/durag.esm.js', format: 'es' },
      { file: 'dist/durag.umd.js', format: 'umd', name: 'durag' }
    ],
    external: ['three'],
    plugins: [resolve(), terser()]
  },
  // Engine-only bundle
  {
    input: 'src/engine/index.js',
    output: [
      { file: 'dist/engine.esm.js', format: 'es' },
      { file: 'dist/engine.umd.js', format: 'umd', name: 'duragEngine' }
    ],
    plugins: [resolve(), terser()]
  }
];
