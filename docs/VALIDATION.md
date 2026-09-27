# Frontend validation — Heartbeat

## Scope and result

Implemented the one-page Sepolia frontend against source commit `9ce28708c176cc89f2e5d0e4154ac829eee5af58`, launch `f84877c1-85ef-4815-9ad7-f827272adcef`. No Solidity, root build configuration, `lib/`, or `.github/` files were changed. Source/configuration/tests are under `web/`; the static export is under root `dist/`; documentation/evidence is under `docs/`. Only the explicitly allowed `web/.gitignore` adds ignore rules, excluding dependency/cache/report directories recursively.

**Implementation and worker validation are complete within the permitted write scope.** Two delivery constraints remain explicit: root `DESIGN.md` conflicts with the overriding path rules, so its content is delivered as `docs/DESIGN.md`; and `.git` is mounted read-only. `git add -- web dist docs` failed with `Unable to create .../.git/index.lock: Read-only file system`, so the worker cannot stage or commit the saved files. No commit, publication, CID, or independent certification is claimed.

## Commands and outcomes

Commands ran from the repository root using `npm --prefix web`, or equivalently from `web/`.

| Check | Final result |
| --- | --- |
| `npm install --cache node_modules/.cache/npm --no-audit --no-fund` | Frontend dependencies installed under `web/`; lockfile preserved |
| `npm run build` | Passed TypeScript/Vite production build; regenerated manifest after the last source change |
| `npm run typecheck` (inside build) | Passed strict TypeScript |
| `npm run test` | 8/8 logic tests passed |
| `npm run test:browser` | 19/19 production-browser scenarios passed; all transaction tests mocked |
| `npm run check:rpc` | All three supplied public RPCs passed read-only chain/code/state checks |
| `npm run verify` | Both pinned ABI hashes and 6 final asset hashes verified; export 530,078 bytes including manifest |
| `cmp` of retained handoff/network inputs to pinned files | Both byte-identical |
| Git index mode inspection | No gitlink/submodule entries |
| `node web/scripts/audit-submission.mjs` | Changed-path audit passed; full-history Git bundle reconstructed in disposable test scaffolding is below 8 MiB; original Git metadata untouched |

The initial typecheck exposed a TypeScript narrowing issue after `Array.isArray` on the runtime ABI. Returning the verified ABI as `Abi` corrected it before successful builds. Browser-harness setup and locator/timer assumptions were corrected during development; only the final successful scenarios are reported as passes in `evidence/browser-results.json`.

## Deployment integrity and live reads

The build obtains raw ABIs from the actual pinned Git object. Recursive canonical key ordering + compact UTF-8 JSON + Keccak-256 matches:

| Contract | Canonical ABI Keccak-256 |
| --- | --- |
| LaunchToken | `02dffa8d3c3109917f325acd9170704f417911b4102a0d947e5933076d2a863e` |
| DeadMansSwitch | `adf8ef453b7bd1a121259c49eae882c4f1131d1ce1e237c45cfe47597e2b77d4` |

`dist/imd-deployment.json` copies the exact launch ID, chain ID, source commit, attestation hash, complete contract names/addresses/hashes, and unchanged network block. It also carries exact wallet-add parameters, pool data, and event start blocks. Its inventory contains `index.html`, both raw ABI files, CSS, and both JavaScript chunks, excluding itself. Every path is relative. The runtime fetches this same manifest and its referenced ABIs; there is no separate bundled address map.

Live read-only checks (`evidence/rpc.json`) returned chain 11155111 at block 11791500 from each endpoint, with 1,521 bytes of LaunchToken code, 3,271 bytes of DeadMansSwitch code, `totalSupply = 10^27`, and `switchCount = 0`. The assigned browser loaded the export and completed deployment verification through live RPC, with no console warnings/errors or failed observed resource requests. This establishes those observed reads, not future availability or live transaction correctness.

## Interaction coverage

`web/tests/logic.test.ts` verifies exact lapse/recovery boundaries, closed/unauthorized eligibility, amount/period/address validation, slippage limits, native/token swap encoding and uint128 bounds, canonical JSON hashing, exact unknown-chain fallback, and rejection without unsolicited chain addition.

`web/tests/browser.mjs` uses Chromium 141 through Playwright 1.56.1, serves the final export at `/ipfs/heartbeat/`, and injects a deterministic EIP-1193 wallet/RPC harness. It exercises:

- Disconnected/missing-wallet state, rejected connection, wrong-chain disabled controls, and exact switch → add → switch behavior.
- Created/BeneficiaryChanged discovery, deduplication, obsolete-beneficiary exclusion, filters, and closed/active/lapsed roles.
- Zero-value creation with an exact custom period; all depositor actions; excessive withdrawal rejection; claim/reclaim to another recipient; refreshed state and permanent closure.
- Decoded simulation failure and signing rejection without sending.
- Native-input quoting via `eth_call`, router simulation/encoding, exact value and slippage minimum; token-input separate exact-amount Permit2/router approvals; transfer, allowance revocation, and delegated transfer.
- Input edits invalidating quotes, expiry after a controlled clock offset, and router revert preventing signing.
- Keyboard-only creation with visible focus; RPC failure/disabled writes/recovery; adaptive block-range reduction.
- Account/chain changes clearing state, missing code blocking writes, ABI tampering blocking writes, and no browser exceptions/console errors in successful flows.

A fixture with a one-wei fraction verifies that all 18 decimal places remain visible. The deterministic wallet, simulation and receipts do not prove on-chain execution. No real transaction was signed or broadcast.

## Better Interface consolidated review

Read and applied the supplied workflow, all six domains' core principles, and design documentation method. Reviewed source and rendered export. A flat light theme and native controls were chosen for this brief.

| Domain | Coverage | Evidence and limits |
| --- | --- | --- |
| Accessibility | Checked | Native controls/details, named fields with separate hints, disabled prerequisites, skip link, keyboard creation, focus screenshot; axe WCAG A/AA scan has zero violations. Native screen-reader testing and all keyboard combinations remain unperformed. |
| Layout | Checked | Rendered widths 1440, 768, 390, 320; no horizontal overflow; 200% root text enlargement passed. Browser-native zoom, RTL and localization were not tested. |
| Writing | Checked | Persistent test-toy notice; specific labels, claim/reclaim consequences, units, recoverable decoded errors and empty/disabled guidance. |
| Typography | Checked | System fonts, serif display line, 16px inputs, balanced headings, full-precision amounts/wrapping addresses, tabular values. Other OS font availability unverified. |
| Colors | Checked | Semantic tokens and rendered contrast measurement; labels supplement status colors. Four measured pairs exceed 4.5:1. Axe retains an incomplete color-contrast category requiring manual review; no full compliance claim. Dark theme not applicable. |
| UI | Checked | Disconnected/loading/empty/active/lapsed/closed/error/pending/confirmed states; disclosure, 44px controls, hover guard and reduced-motion rules. Reduced-motion Chromium scenarios ran. Animation-panel slow playback, touch hardware and every native control appearance were not inspected. |

### Findings, repairs and rechecks

| Severity / domain | Source location | Observation, correction and evidence |
| --- | --- | --- |
| Medium — Writing/UI | `web/src/logic.ts:51` | Initial viem short-message rendering lost `AlreadyLapsed`. Walk nested causes and expose the custom error with a corrective action. Final browser test sees the reason and confirms no send. |
| Medium — UI/Layout | `web/src/Switches.tsx:10` | Custom-period selection initially did not open its input. Added controlled disclosure. Final browser test enters 86,401 seconds and checks the transaction argument. |
| Medium — Typography/Accessibility | `web/src/components.tsx:24` | More than six fractional digits originally required hover. Render full precision with wrapping; tested a one-wei fraction at mobile/desktop widths. |
| Medium — Accessibility | `web/src/components.tsx:7` | Hints inside wrapping labels became part of the accessible name and description. Separate explicit labels and described hints. Exact-name field interaction and final axe scan pass. |
| Low — Writing | `web/src/Swap.tsx:60`, `web/src/TokenTools.tsx:25` | Disconnected zeros could look like fetched balances/supply. Use connection guidance and em dashes until loaded. Final disconnected evidence reflects the correction. |
| Medium — UI/state | `web/src/useHeartbeat.ts:141` | Code review found pre-transaction state could briefly remain eligible after a receipt. Clear freshness, then refresh, before re-enabling writes. Sequential browser transactions await refreshed state. |

No unresolved blocker was found in the implemented browser flows. These are worker observations, not independent contract-security findings.

## Evidence

- `evidence/browser-results.json`: all final scenarios and timestamp.
- `evidence/accessibility.json`: axe violations (none), passed rules and incomplete categories.
- `evidence/contrast.json`: computed foreground/background values and measured ratios.
- `evidence/rpc.json`: read-only checks of all supplied RPCs.
- `evidence/desktop-disconnected.png`, `desktop-connected.png`, `mobile-connected.png`: production export with deterministic mocked chain/wallet state.
- `evidence/keyboard-focus.png`: visible native focus during keyboard-only creation.
- `evidence/live-desktop.png`, `live-mobile.png`: assigned-browser views with live deployment verification and a disconnected wallet.
- `evidence/live-console.txt`, `live-network.txt`, `live-snapshot.txt`: assigned-browser resource, console and semantic observations.
- `evidence/submission-size.json`: path/budget audit, export limits and Git-bundle measurement/limitation.

## Unperformed behavior and delivery limitations

No live creation, deposit, withdrawal, beneficiary/period change, claim, reclaim, BEAT approval/transfer or swap was broadcast. Actual wallet UI, mempool races, replacement, reorg execution, live liquidity/slippage, receiver failures, prolonged RPC outages and very large event histories remain untested. Full history rescanning avoids persistent stale membership across reorgs, but can become slow as the deployment ages. Generic ERC-20 allowance replacement retains the ordinary allowance-change race; the page states the replacement effect and supports explicit zero revocation.

No browser-native 200% zoom, native screen reader, physical mobile device, Firefox/Safari, translation or RTL check is claimed. Axe coverage does not establish accessibility conformance. Immutable-CID/named-entrypoint checks and hosting are subsequent publisher actions and have not run here.

The size audit reconstructs the full current snapshot, including its identical evidence report, in a disposable local clone under `test/scratch/` and measures `git bundle --all`. Its temporary commit is only a packaging test; no bundle or cloned repository is added to the deliverable.

Git staging/committing in the submitted repository is blocked by the read-only metadata mount. Saved files remain for the contributor system to collect. Design content remains under allowed `docs/` rather than violating the root-file restriction.
