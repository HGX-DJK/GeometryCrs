import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const plugins = [
  resolve(),
  commonjs()
];

export default [
  {
    input: 'src/giserConvertCrs.js',
    output: {
      file: 'dist/giserConvertCrs.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins
  },
  {
    input: 'src/browser.js',
    output: [
      {
        file: 'dist/giserConvertCrs.umd.js',
        format: 'umd',
        name: 'giserConvertCrs',
        exports: 'default',
        sourcemap: true
      },
      {
        file: 'dist/giserConvertCrs.min.js',
        format: 'umd',
        name: 'giserConvertCrs',
        exports: 'default',
        plugins: [terser()],
        sourcemap: true
      }
    ],
    plugins
  }
];
