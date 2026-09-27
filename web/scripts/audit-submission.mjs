import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, stat, mkdtemp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const reportPath='docs/evidence/submission-size.json';
const changes=git(['status','--porcelain','--untracked-files=all']).split('\n').filter(Boolean).map(l=>l.slice(3));
for(const path of changes){
  if(!/^(web|dist|docs)\//.test(path))throw Error(`Out-of-scope change: ${path}`);
  if(path.split('/').some(part=>part.startsWith('.'))&&path!=='web/.gitignore')throw Error(`Unbudgeted dotfile: ${path}`);
}
const files=git(['ls-files','-co','--exclude-standard','-z']).split('\0').filter(p=>p&&p!==reportPath);
if(files.some(p=>/(^|\/)(node_modules|\.cache|vendor\/npm)(\/|$)|\.tgz$/.test(p)))throw Error('Dependency or packaging artifacts included');
if(git(['ls-files','--stage']).split('\n').some(l=>l.startsWith('160000 ')))throw Error('Submodule detected');
const sizes=await Promise.all(files.map(async path=>({path,bytes:(await stat(join(root,path))).size})));
const raw=sizes.reduce((n,f)=>n+f.bytes,0);
if(raw>=8388608)throw Error('Uncompressed source/export/evidence snapshot exceeds 8 MiB');
const manifest=JSON.parse(await readFile(join(root,'dist/imd-deployment.json')));
const exportBytes=(await stat(join(root,'dist/imd-deployment.json'))).size+(await Promise.all(manifest.assets.map(async a=>(await stat(join(root,'dist',a.path))).size))).reduce((a,b)=>a+b,0);
const report={
  scopeAudit:'passed: all changed paths are web/, dist/, or docs/; only web/.gitignore is an added dotfile',
  fileCountExcludingThisReport:files.length,rawSnapshotBytesExcludingThisReport:raw,
  limitBytes:8388608,exportBytes,exportAssetCount:manifest.assets.length,
  dependencyDirectoriesIncluded:false,submodulesIncluded:false,
  fullGitBundleUnderLimit:true,
  method:'Reconstruct the complete current working snapshot plus this identical report in a disposable local clone under test/scratch; commit only in that test clone and measure git bundle --all. Assert below 8 MiB before writing this evidence. The original repository Git metadata remains unchanged.',
  repositoryCommit:'unavailable: original .git is read-only; the test clone is measurement scaffolding, not the submitted repository',
};
const reportBytes=JSON.stringify(report,null,2)+'\n';
await mkdir(join(root,'test/scratch'),{recursive:true});
const scratch=await mkdtemp(join(root,'test/scratch/bundle-audit-'));
const clone=join(scratch,'snapshot');
git(['clone','--no-hardlinks','--quiet',root,clone]);
for(const file of files){await mkdir(dirname(join(clone,file)),{recursive:true});await copyFile(join(root,file),join(clone,file));}
await writeFile(join(clone,reportPath),reportBytes);
git(['add','--all'],clone);
git(['-c','user.name=Frontend validation fixture','-c','user.email=validation@localhost','-c','commit.gpgsign=false','commit','--quiet','-m','Disposable frontend snapshot for bundle-size validation'],clone);
const bundle=join(scratch,'submission.bundle');
git(['bundle','create',bundle,'--all'],clone);
const bytes=(await stat(bundle)).size;
if(bytes>8388608)throw Error(`Complete snapshot bundle is too large: ${bytes}`);
await writeFile(join(root,reportPath),reportBytes);
console.log(JSON.stringify({completeBundleBytes:bytes,limitBytes:8388608,rawSnapshotBytesExcludingReport:raw,files:files.length,exportBytes,assetCount:manifest.assets.length,repositoryCommit:'not created; read-only Git metadata',scratchBundle:bundle},null,2));
