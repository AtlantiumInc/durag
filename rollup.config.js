import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: 'src/index.js',
    output: [
      { file: 'dist/durag.esm.js', format: 'es' },
      { file: 'dist/durag.umd.js', format: 'umd', name: 'durag' }
    ],
    plugins: [resolve(), terser()]
  }
];
