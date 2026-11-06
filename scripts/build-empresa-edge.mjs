import { copyFile, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { EMPRESA_ASSET_FILES } from '../security/edge/empresa-assets.mjs';
const root = await realpath(resolve(import.meta.dirname, '..'));
const output = resolve(root, '.empresa-edge-assets');
let size = 0;
for (const file of EMPRESA_ASSET_FILES) {
  const source = await realpath(resolve(root, file));
  const destination = resolve(output, file);
  if (!source.startsWith(root + sep) || !destination.startsWith(output + sep)) throw new Error('INVALID_ASSET_PATH');
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  size += (await stat(source)).size;
}
console.log(`${EMPRESA_ASSET_FILES.length} arquivos públicos preparados para entrega do painel (${Math.ceil(size / 1024)} KB).`);
