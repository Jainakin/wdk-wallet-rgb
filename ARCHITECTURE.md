# Architecture Notes

`@utexo/wdk-wallet-rgb` is a stateless WDK wallet package designed to drop
into the **agnostic `@tetherto/pear-wrk-wdk`** worklet architecture.

## Consumption via the new worklet bundler

Apps that use the new architecture follow this pattern:

### 1. Declare the package in `wdk.config.js`

```js
// wdk.config.js
module.exports = {
  networks: {
    rgb:     { package: '@utexo/wdk-wallet-rgb' },
    bitcoin: { package: '@tetherto/wdk-wallet-btc' }
  }
}
```

### 2. Generate the worklet bundle

```bash
npx @tetherto/wdk-worklet-bundler generate --install
```

Produces `.wdk-bundle/wdk-worklet.bundle.js` — a multi-platform bundle
containing iOS + Android native addons and the resolved wallet
managers.

### 3. Wire up `<WdkAppProvider>`

```tsx
import { WdkAppProvider, useAccount } from '@tetherto/wdk-react-native-core'
import bundle from './.wdk-bundle/wdk-worklet.bundle.js'

<WdkAppProvider
  bundle={{ bundle }}
  wdkConfigs={{
    networks: {
      rgb: {
        blockchain: 'rgb',
        config: {
          network: 'testnet',                                        // 'mainnet' | 'testnet' | 'regtest'
          indexerUrl: 'ssl://electrum.iriswallet.com:50013',
          transportEndpoint: 'rpcs://rgb-proxy-testnet3.utexo.com/json-rpc'
        }
      }
    }
  }}
>
  <App />
</WdkAppProvider>
```

### 4. Call RGB methods from components

The core's `useAccount` hook gives both the standard methods (`send`,
`sign`, `verify`, `estimateFee`, `getBalance`) and an `extension()`
proxy for any additional account method.

```tsx
import { useAccount } from '@tetherto/wdk-react-native-core'

function RgbScreen() {
  const rgb = useAccount({ network: 'rgb', accountIndex: 0 })
  const ext = rgb.extension()

  // Standard WDK methods
  const onSign = async () => {
    const { signature } = await rgb.sign('hello rgb')
    const { verified } = await rgb.verify('hello rgb', signature)
  }

  // RGB-specific methods via the extension proxy (all forward to
  // WalletAccountRgb methods through HRPC callMethod):
  const issueNia = async () => ext.issueAssetNia({ ticker: 'TST', name: 'Test', precision: 0, amounts: [1000] })
  const blindReceive = async () => ext.receiveAsset({ witness: false, amount: 100 })
  const witnessReceive = async () => ext.receiveAsset({ witness: true, amount: 100 })
  const createUtxos = async () => ext.createUtxos({ upTo: true, num: 5, size: 2000, feeRate: 2 })
  const inflate = async (assetId) => ext.inflate({ assetId, amounts: [500] })
  const drainTo = async (address) => ext.drainTo({ address, destroyAssets: false, feeRate: 2 })
  const listAssets = async () => ext.listAssets()
  const listTransfers = async (assetId) => ext.getTransfers({ assetId })
  const backup = async () => ext.createBackup({ password: '...', backupPath: '...' })
  const restore = async () => ext.restoreFromBackup({ backupFilePath: '...', password: '...', dataDir: '...' })
}
```

## Method surface

All methods below are dispatched via `AccountService.callAccountMethod(network='rgb', accountIndex=0, methodName, ...args)` under the hood.

### Standard (WDK core contract — covered by `useAccount`)

| Method | Args | Returns | Location |
|---|---|---|---|
| `getAddress()` | — | `string` | read-only |
| `getBalance()` | — | `bigint` (BTC sats in vanilla) | read-only |
| `getTokenBalance(assetId)` | `string` | `bigint` (settled) | read-only |
| `verify(message, signature)` | `string, string` | `boolean` | read-only |
| `sign(message)` | `string` | `string` (signature) | read-write |
| `sendTransaction({to, value})` | BTC send | `{hash, fee}` | read-write |
| `transfer({token, recipient, amount})` | RGB send | `{hash, fee}` | read-write |
| `quoteSendTransaction({to, value})` | — | `{fee}` | read-write |
| `quoteTransfer({token, recipient, amount})` | — | `{fee}` | read-write |

### RGB-specific (accessed via `extension()`)

| Method | Notes |
|---|---|
| `receiveAsset({witness, assetId?, amount?, transportEndpoints?})` | `witness: false` → blind receive, `true` → witness receive |
| `sendBegin({invoice, assetId, amount, feeRate, minConfirmations, witnessData?})` | For explicit begin/sign/end flows |
| `sendEnd({signedPsbt})` | |
| `signPsbt(psbt)` | Signs via the `BareSigner` (pure-JS Taproot from rgb-sdk) |
| `createUtxos({upTo, num, size, feeRate})` | |
| `inflate({assetId, amounts, feeRate?, minConfirmations?})` | IFA re-issuance |
| `drainTo({address, destroyAssets?, feeRate?})` | |
| `issueAssetNia({ticker, name, precision, amounts})` | |
| `issueAssetCfa({name, precision, amounts, details?, filePath?})` | |
| `issueAssetUda({ticker, name, precision, details?, mediaFilePath?, attachmentsFilePaths?})` | |
| `issueAssetIfa({ticker, name, precision, amounts, inflationAmounts, rejectListUrlOpt?})` | |
| `listAssets()` | `{nia: [...], cfa: [...], uda: [...], ifa: [...]}` |
| `listUnspents()` | All UTXOs with allocations |
| `listTransactions()` | Bitcoin transactions at the BDK level |
| `getTransfers({assetId?, limit?, skip?})` | RGB transfer history for one asset |
| `refreshWallet()` | Pull new state from the indexer |
| `syncWallet()` | Chain resync |
| `createBackup({password, backupPath})` | Encrypted backup |
| `restoreFromBackup({backupFilePath, password, dataDir})` | |
| `backupInfo()` | Backup metadata |
| `decodeRGBInvoice({invoice})` | Parse an RGB invoice URI |
| `estimateFeeRate(blocks)` | Clamped ≥ 1 sat/vB internally |

## Interface compliance

- Extends `@tetherto/wdk-wallet`'s `WalletManager` / `WalletAccountReadOnly`
  / `WalletAccount` at **v1.0.0-beta.7** (breaking change: `verify` is now
  mandatory on the read-only class; we implement it via rgb-sdk-core's
  `verifyMessage`, which needs only the vanilla xpub + network).
- Bare-runtime entry: `bare.js` re-exports `index.js` with
  `{ imports: 'bare-node-runtime/imports' }` so `@tetherto/wdk-worklet-bundler`
  picks the correct module graph.
- Native addons (rgb-lib-bare) are resolved by the bundler from
  `@utexo/rgb-lib-bare`'s `prebuilds/` directory — no manual bundle
  merging required. `@utexo/rgb-lib-bare` ships as a **source-only npm
  package** (`^0.3.0-beta.18`); a `postinstall` hook downloads the
  per-platform static libs (`lib/`) and bare addons (`prebuilds/`) from
  that version's GitHub Release on `npm install`. No binaries live in
  git; there is nothing to rebuild or copy by hand.

## Signing model

The underlying `rgb-lib-bare` wallet is created **watch-only**
(`mnemonic: null`). All PSBT signing happens externally in pure JS via
`BareSigner` (`rgb-sdk`'s `signPsbtFromSeed`). This avoids embedding
mnemonics into rgb-lib's internal keystore and keeps the seed under
the `@tetherto/wdk-secret-manager`'s secure-storage contract.
