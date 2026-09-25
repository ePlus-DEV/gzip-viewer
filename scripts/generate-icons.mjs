import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const image = await readFile(resolve(root, 'assets/brand-mark.svg'));
const output = resolve(root, 'public');
await mkdir(output, {recursive: true});
for (const size of [16, 32, 48, 128]) {
  await sharp(image).resize(size, size).png({compressionLevel: 9})
    .toFile(resolve(output, 'icon-' + size + '.png'));
}
