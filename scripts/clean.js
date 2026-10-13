import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('dist');

rmSync(target, { recursive: true, force: true });

console.log(`cleaned ${target}`);