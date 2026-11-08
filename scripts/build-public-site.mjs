import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, realpathSync, copyFileSync } from 'node:fs';
import { resolve, dirname, sep, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export function isPublicSiteFile(name) {
  if (name.split('/').some(segment => segment.startsWith('.'))) return false;
  if (/(?:^|\/)(?:scripts|test|security|docs|node_modules)(?:\/|$)/i.test(name)) return false;
  if (/(?:^|\/)(?:package(?:-lock)?\.json|AGENTS\.md|README\.md)$/i.test(name)) return false;
  return ['.html','.css','.js','.json','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.woff','.woff2','.ttf','.mp3','.mp4','.ogg','.wav','.pdf','.zip','.webmanifest','.xml','.txt'].includes(extname(name).toLowerCase()) || name === 'CNAME';
}
export function buildPublicSite(root) {
  const output=resolve(root,'.public-site');
  if (!output.startsWith(root+sep) || basename(output)!=='.public-site') throw Error('INVALID_BUILD_TARGET');
  const marker=resolve(output,'.preludio-public-build');
  if (existsSync(output)) {
    if (!existsSync(marker) || readFileSync(marker,'utf8')!=='preludio-public-build') throw Error('BUILD_DIRECTORY_NOT_OWNED');
    rmSync(output,{recursive:true,force:true});
  }
  mkdirSync(output);writeFileSync(marker,'preludio-public-build');
  const files=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).split(/\r?\n/).filter(Boolean).filter(isPublicSiteFile);
  for(const file of files){
    const source=realpathSync(resolve(root,file)),dest=resolve(output,file);
    if(!source.startsWith(root+sep)||!dest.startsWith(output+sep))throw Error('INVALID_PUBLIC_ASSET');
    mkdirSync(dirname(dest),{recursive:true});copyFileSync(source,dest);
  }
  writeFileSync(resolve(output,'.nojekyll'),'');
  return {output,files:files.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildPublicSite(realpathSync(resolve(import.meta.dirname,'..')))));
