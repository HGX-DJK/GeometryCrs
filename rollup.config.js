import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const plugins = [
  resolve(),
  commonjs()
];

export default [
  {
    input: 'src/giserConvertCrs.js',
    output: {
      file: 'dist/giserConvertCrs.esm.js',
      format: 'esm'
    },
    plugins
  },
  {
    input: 'src/browser.js',
    output: {
      file: 'dist/giserConvertCrs.umd.js',
      format: 'umd',
      name: 'giserConvertCrs',
      exports: 'default'
    },
    plugins
  }
];
