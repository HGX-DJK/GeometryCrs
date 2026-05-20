import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const plugins = [
  resolve(),
  commonjs()
];

export default [
  {
    input: 'src/geometryCrs.js',
    output: {
      file: 'dist/geometryCrs.esm.js',
      format: 'esm'
    },
    plugins
  },
  {
    input: 'src/browser.js',
    output: {
      file: 'dist/geometryCrs.umd.js',
      format: 'umd',
      name: 'geometryCrs',
      exports: 'default'
    },
    plugins
  }
];
