import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const from = resolve('src/index.d.ts');
const to = resolve('dist/index.d.ts');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
