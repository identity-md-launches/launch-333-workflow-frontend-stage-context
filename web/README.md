# Heartbeat frontend

A single-page interface to the attested Heartbeat (BEAT) and DeadMansSwitch deployment on Sepolia. **This is a Sepolia test toy, not a custody or inheritance product.** Switches hold only test ETH and do not use BEAT. No contract changes, deployments, real transaction broadcasts, IPFS pinning, or site publication are part of this frontend delivery.

## Run and rebuild

Requires Node 22.18+ (validated on Node 24.21.0), npm, and Git with the pinned source commit available.

```sh
cd web
npm ci --cache node_modules/.cache/npm --no-audit --no-fund
npm run typecheck
npm run test
npm run build
npm run preview
```

`npm run dev` builds and starts the static preview. It intentionally previews the actual export, including the generated runtime manifest; rebuild after editing source. There is no backend, hot-reload dependency, wallet project ID, or private credential. `npm run preview` serves `../dist/`. The delivered export works without npm or a build server: serve the **entire** `dist/` directory at any static directory/gateway prefix. Do not open it as `file://` because browsers restrict module and JSON fetches there. Vite uses `base: './'`, and navigation uses same-page anchors.

## Deployment configuration and ABIs

`config/deployment.json` and `config/network.json` are byte-identical copies of the supplied deployment handoff and network input. They are retained because the pinned input directory is removed before submission. They are build inputs, never imported into the browser bundle.

The app fetches `./imd-deployment.json`, then each contract's `abiPath`. This is the only runtime deployment address, chain, RPC, pool, and wallet-add-chain configuration. Protocol interface fragments in `src/config.ts` contain signatures only, with no independent destination addresses.

The final build runs `scripts/export.mjs`. It:

1. Reads each implementation-derived ABI from `git show <sourceCommit>:docs/abi/<Contract>.json`, preserving its original bytes as `dist/abi/<Contract>.json`.
2. Recursively sorts object keys, preserves array order, compact-serializes JSON as UTF-8, and verifies Keccak-256 against each handoff `abiHash`.
3. Copies the exact contract set and identifiers, the unchanged `network` object, exact `walletAddChain`, pool parameters, and deployment blocks into the runtime manifest.
4. Inventories every final exported file except the manifest itself, recording lowercase SHA-256 hashes. It rejects symlinks, missing index, more than 128 assets, files over 8 MiB, and exports at/above 30 MiB.

`npm run verify` checks the final bytes and inventory without rewriting them. Run `npm run build` after **any** source/export change; never hand-edit an exported asset after the manifest has been generated. Supply the complete attested Git source history when rebuilding. This deployment's contracts have no hook, so the pool key uses the zero address for hooks. The app only enables its native-ETH swap panel for the supplied vetted pool.

Runtime ABI hashing binds the ABI bytes semantically to the manifest. RPC chain ID and nonempty code checks guard transaction readiness. These checks are **not** a signature validation of the attestation, a runtime-bytecode audit, or a substitute for the publisher's immutable-CID verification.

## Wallet and contract behavior

Use an injected EIP-1193 Ethereum browser wallet (including a wallet's mobile browser). No WalletConnect project ID was supplied, so there is no WalletConnect connector. When multiple extensions compete for `window.ethereum`, choose the desired provider in the wallet/browser settings. Adding a future connector must retain the same manifest and signer guards.

Connection is explicit. The page shows account, wrong network, pending simulation/signature/receipt, rejection, decoded contract errors, transaction explorer links, and RPC failures. On unknown-chain errors it submits the exact supplied `wallet_addEthereumChain` parameters, then retries switching. Account/chain changes clear account state. Signing remains with the visitor's wallet; public RPC reads fall back across the three configured endpoints. If all public RPCs fail, reads show an error and actions disable rather than trusting stale state.

Switch IDs are discovered only from indexed `Created(depositor)`, `Created(beneficiary)`, and `BeneficiaryChanged(newBeneficiary)` logs, starting at the attested deployment block. Queries start at 5,000-block ranges and shrink to 100 when necessary. IDs are deduplicated and read from `switchInfo` and `timeLeft` at one block. Current roles filter historical membership. No backend, indexer, account database, or local-storage authority exists. The page rescans on refresh, every 20 seconds, and after confirmed transactions; large historical deployments can be slow and RPC rate limits remain a limitation. A failed scan is never represented as a complete empty list.

All eight application mutations have controls. Periods support exact seconds, including both 1-day and 365-day bounds. Zero initial deposits are supported. Depositor maintenance is available strictly before lapse and resets the timer. A beneficiary may claim from the lapse boundary; recovery opens to the depositor after 365 additional days. Either can settle first once recovery opens. Claim/reclaim can pay a different nonzero recipient, close permanently, and can settle a zero balance. Closed switches remain visible as history. The countdown extrapolates the last chain timestamp and is labeled an estimate. State older than 90 seconds, a read failure, wrong chain, missing code, or failed ABI verification blocks writes. Every transaction is simulated again before signing, and wallet account/chain are checked before and after simulation.

BEAT controls include `transfer`, `approve` (including zero to revoke), and `transferFrom`. Balances/allowances are read before token actions. Swaps use `simulateContract` for `quoteExactInputSingle`, never a quote transaction. The v4 Universal Router encoding is `commands=0x10`, `actions=0x060c0f`, exact input and slippage-derived minimum output. Native input sends exact value without approvals. BEAT input presents separate exact-amount token-to-Permit2 and Permit2-to-router approval transactions, with a 20-minute router expiration. Quotes expire after 60 seconds and invalidate when inputs/account/chain change. Swap deadlines are 20 minutes after the quote block timestamp. The `execute` call is simulated before signing. Slippage is adjustable from 0.01% to 5%. All swap destinations come from `network.uniswapV4`.

## Validation

```sh
cd web
PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright npx playwright install chromium
npm run test:browser
npm run check:rpc
npm run verify
node scripts/audit-submission.mjs
```

The browser script starts and closes its own local server at `/ipfs/heartbeat/`. Playwright loads the production export, intercepts all configured RPC destinations, injects a test wallet, and exercises the real application without funds. It records screenshots and JSON under `docs/evidence/`. `check:rpc` performs read-only live network checks and records each endpoint's result; it does not broadcast.

The submission audit checks changed paths and reconstructs a disposable Git snapshot under `test/scratch/` to measure a complete bundle against 8 MiB. It never modifies the original repository’s Git metadata.

See [validation and limitations](../docs/VALIDATION.md), [implemented design](../docs/DESIGN.md), and the machine-readable evidence. Automated accessibility checks and mock transactions are worker evidence, not independent certification. Actual signed-wallet behavior, live swaps, real transaction execution, screen-reader sessions, physical devices, browser-native zoom, Safari, Firefox, and publication checks remain unperformed.

## Submission boundaries

Source, dependency lockfile, frontend configuration, and tests live in `web/`; the complete static export is in repository-root `dist/`; documentation/evidence is in `docs/`. Only `web/.gitignore` changes ignore rules, using the assignment's explicit allowance. Its patterns exclude dependency/cache/report directories recursively under `web/`. Do not add `node_modules`, browser downloads, registry caches, tarballs, or a submodule to Git.

The task also requested root `DESIGN.md`, but the overriding write scope permits only `web/**`, `dist/**`, and `docs/**` (plus the explicit ignore allowance). The required design content is delivered at `docs/DESIGN.md`; no root file was created.

## References and attribution

Design guidance: Jakub Krehel, [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT, as supplied in the pinned assignment guide. Documentation method: Paul Bakaus, [Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. These are distinct upstream works; their guidance was applied, not relicensed or redistributed as a combined skill. Protocol encoding was cross-checked with the [official Uniswap v4 swap guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/swapping). The application and its pulse icon are implemented locally with no remote fonts or imagery.
