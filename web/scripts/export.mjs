import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { keccak256, toHex, isAddress } from 'viem';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');
const handoff = JSON.parse(await readFile(join(root, 'web/config/deployment.json')));
const network = JSON.parse(await readFile(join(root, 'web/config/network.json')));
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
const check = process.argv.includes('--check');
if (handoff.version !== 1 || handoff.chainId !== network.network.chainId ||
    Number(BigInt(network.walletAddChain.chainId)) !== handoff.chainId ||
    !/^[a-f0-9]{40}$/.test(handoff.sourceCommit) || !/^[a-f0-9]{64}$/.test(handoff.attestationHash)) throw Error('Invalid handoff binding');
const contracts = [];
for (const c of handoff.contracts) {
  if (!/^[A-Za-z0-9_]{1,32}$/.test(c.name) || !isAddress(c.address)) throw Error('Invalid contract entry');
  // Obtain the ABI from the actual attested Git object, never a handwritten subset.
  const raw = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${c.name}.json`], { cwd: root });
  const abi = JSON.parse(raw);
  const hash = keccak256(toHex(canonical(abi))).slice(2);
  if (!Array.isArray(abi) || hash !== c.abiHash) throw Error(`ABI hash mismatch: ${c.name}: ${hash}`);
  const abiPath = `abi/${c.name}.json`;
  if (!check) {
    await mkdir(join(dist, 'abi'), { recursive: true });
    await writeFile(join(dist, abiPath), raw);
  } else if (!(await readFile(join(dist, abiPath))).equals(raw)) throw Error(`ABI bytes changed: ${c.name}`);
  contracts.push({ name: c.name, address: c.address, abiHash: c.abiHash, abiPath });
  console.log(`${c.name}: pinned ABI ${hash} verified`);
}
async function inventory(dir, prefix = '') {
  const files = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('Symlinks are not allowed in export');
    if (entry.isDirectory()) files.push(...await inventory(join(dir, entry.name), path + '/'));
    else if (path !== 'imd-deployment.json') {
      const bytes = await readFile(join(dir, entry.name));
      if (bytes.length > 8388608) throw Error(`Asset too large: ${path}`);
      files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return files;
}
const assets = await inventory(dist);
if (assets.length > 128 || !assets.some(a => a.path === 'index.html')) throw Error('Invalid asset inventory');
const manifest = {
  version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
  contracts, assets, network: network.network, walletAddChain: network.walletAddChain,
  pool: handoff.manifest.pool,
  deploymentBlocks: Object.fromEntries(handoff.contracts.map(c => [c.name, c.blockNumber])),
};
const target = join(dist, 'imd-deployment.json');
if (check) {
  if (canonical(JSON.parse(await readFile(target))) !== canonical(manifest)) throw Error('Export manifest mismatch');
} else await writeFile(target, JSON.stringify(manifest, null, 2) + '\n');
let size = (await stat(target)).size;
for (const a of assets) size += (await stat(resolve(dist, a.path))).size;
if (size >= 30 * 1024 * 1024) throw Error('Export exceeds HTTP response budget');
console.log(`${check ? 'Checked' : 'Generated'} final manifest: ${assets.length} assets, ${size} bytes total`);
