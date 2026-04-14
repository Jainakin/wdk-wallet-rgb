// BareRgbLibBinding — Bare worklet implementation of IRgbLibBinding.
//
// Wraps @utexo/rgb-lib-bare (cmake-bare addon) and satisfies the
// IRgbLibBinding interface from @utexo/rgb-sdk-core so it can be
// injected into BaseWalletManager.

import rgblib from '@utexo/rgb-lib-bare'
import os from 'os'
import fs from 'bare-fs'
import path from 'bare-path'

const DEFAULT_TRANSPORT_ENDPOINTS = {
  mainnet: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
  testnet: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
  signet: 'rpcs://proxy.iriswallet.com/0.2/json-rpc',
  regtest: 'rpc://127.0.0.1:3000/json-rpc'
}

const DEFAULT_INDEXER_URLS = {
  mainnet: 'ssl://electrum.iriswallet.com:50003',
  testnet: 'ssl://electrum.iriswallet.com:50003',
  signet: 'ssl://electrum.iriswallet.com:50003',
  regtest: 'tcp://127.0.0.1:50001'
}

function mapNetwork (network) {
  const map = {
    mainnet: 'Mainnet',
    testnet: 'Testnet',
    testnet4: 'Testnet4',
    signet: 'Signet',
    utexo: 'Signet',
    regtest: 'Regtest'
  }
  return map[String(network).toLowerCase()] || 'Regtest'
}

function parseResult (raw) {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

function toFFIString (val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'bigint') return String(val)
  return JSON.stringify(val)
}

export class BareRgbLibBinding {
  constructor (params) {
    this._params = params
    this._wallet = null
    this._online = null

    const network = String(params.network || 'regtest').toLowerCase()
    this._network = network
    this._transportEndpoint = params.transportEndpoint || DEFAULT_TRANSPORT_ENDPOINTS[network] || DEFAULT_TRANSPORT_ENDPOINTS.signet
    this._indexerUrl = params.indexerUrl || DEFAULT_INDEXER_URLS[network] || DEFAULT_INDEXER_URLS.signet

    const defaultDataDir = path.join(os.tmpdir(), 'rgb-wallet')
    const dataDir = params.dataDir || defaultDataDir

    // Ensure the data directory exists (rgb-lib requires it)
    try {
      fs.mkdirSync(dataDir, { recursive: true })
    } catch (err) {
      // Ignore EEXIST — directory already exists
      if (err.code !== 'EEXIST') throw err
    }

    const walletData = {
      dataDir,
      bitcoinNetwork: mapNetwork(network),
      databaseType: 'Sqlite',
      maxAllocationsPerUtxo: String(params.maxAllocationsPerUtxo || 1),
      reuseAddresses: params.reuseAddresses || false,
      supportedSchemas: ['Nia', 'Cfa', 'Uda', 'Ifa']
    }

    const keys = {
      accountXpubVanilla: params.xpubVan,
      accountXpubColored: params.xpubCol,
      masterFingerprint: params.masterFingerprint,
      vanillaKeychain: params.vanillaKeychain !== undefined ? params.vanillaKeychain : 0,
      mnemonic: params.mnemonic || null
    }

    this._wallet = new rgblib.Wallet(walletData, keys)
  }

  getOnline () {
    if (!this._online) {
      this._online = this._wallet.goOnline(false, this._indexerUrl)
    }
  }

  dropWallet () {
    if (this._online) {
      try { rgblib.dropOnline(this._online) } catch {}
      this._online = null
    }
    if (this._wallet) {
      this._wallet.drop()
      this._wallet = null
    }
  }

  registerWallet () {
    this.getOnline()
    const address = this._wallet.getAddress()
    const btcBalance = parseResult(this._wallet.getBtcBalance(this._online, false))
    return { address, btcBalance }
  }

  async getBtcBalance () {
    this.getOnline()
    return parseResult(this._wallet.getBtcBalance(this._online, false))
  }

  async getAddress () {
    return this._wallet.getAddress()
  }

  async rotateVanillaAddress () {
    return parseResult(this._wallet.rotateVanillaAddress())
  }

  async rotateColoredAddress () {
    return parseResult(this._wallet.rotateColoredAddress())
  }

  async listUnspents () {
    this.getOnline()
    return parseResult(this._wallet.listUnspents(this._online, false, false))
  }

  async createUtxosBegin (params) {
    this.getOnline()
    return this._wallet.createUtxosBegin(
      this._online,
      !!params.upTo,
      toFFIString(params.num),
      toFFIString(params.size),
      toFFIString(params.feeRate),
      !!params.skipSync
    )
  }

  async createUtxosEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.createUtxosEnd(this._online, params.signedPsbt, !!params.skipSync))
  }

  async listAssets () {
    return parseResult(this._wallet.listAssets([]))
  }

  async getAssetBalance (assetId) {
    return parseResult(this._wallet.getAssetBalance(assetId))
  }

  async issueAssetNia (params) {
    return parseResult(this._wallet.issueAssetNia(
      params.ticker, params.name,
      toFFIString(params.precision),
      toFFIString(params.amounts)
    ))
  }

  async issueAssetIfa (params) {
    return parseResult(this._wallet.issueAssetIfa(
      params.ticker, params.name,
      toFFIString(params.precision),
      toFFIString(params.amounts),
      toFFIString(params.inflationAmounts),
      params.rejectListUrlOpt || null
    ))
  }

  async inflateBegin (params) {
    this.getOnline()
    return this._wallet.inflate(
      this._online, params.assetId,
      toFFIString(params.amounts),
      toFFIString(params.feeRate),
      toFFIString(params.minConfirmations)
    )
  }

  async inflateEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.sendEnd(this._online, params.signedPsbt, false))
  }

  async sendBegin (params) {
    this.getOnline()

    // Accept either { recipientMap } (raw format) or { invoice, assetId, amount } (WDK format)
    let recipientMap = params.recipientMap
    if (!recipientMap && params.invoice) {
      // Convert WDK-style params to rgb-lib recipientMap format
      const recipient = {
        recipientId: params.invoice,
        witnessLevel: 1,
        amount: params.amount || 1
      }
      if (params.witnessData) {
        recipient.witnessData = params.witnessData
      }
      const assetId = params.assetId || ''
      recipientMap = { [assetId]: [recipient] }
    }

    return this._wallet.sendBegin(
      this._online,
      toFFIString(recipientMap),
      !!params.donation,
      toFFIString(params.feeRate),
      toFFIString(params.minConfirmations),
      toFFIString(params.expirationTimestamp || null),
      !!params.dryRun
    )
  }

  async sendBeginBatch (params) {
    return this.sendBegin({
      recipientMap: params.recipientMap,
      feeRate: params.feeRate,
      minConfirmations: params.minConfirmations,
      donation: params.donation
    })
  }

  async sendEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.sendEnd(this._online, params.signedPsbt, !!params.skipSync))
  }

  async sendBtcBegin (_params) {
    throw new Error('sendBtcBegin removed in rgb-lib dev branch — use sendBtc()')
  }

  async sendBtcEnd (_params) {
    throw new Error('sendBtcEnd removed in rgb-lib dev branch — use sendBtc()')
  }

  async blindReceive (params) {
    return parseResult(this._wallet.blindReceive(
      params.assetId || null,
      toFFIString(params.assignment || 1),
      toFFIString(params.durationSeconds),
      toFFIString(params.transportEndpoints || [this._transportEndpoint]),
      toFFIString(params.minConfirmations)
    ))
  }

  async witnessReceive (params) {
    return parseResult(this._wallet.witnessReceive(
      params.assetId || null,
      toFFIString(params.assignment || 1),
      toFFIString(params.durationSeconds),
      toFFIString(params.transportEndpoints || [this._transportEndpoint]),
      toFFIString(params.minConfirmations)
    ))
  }

  async decodeRGBInvoice (params) {
    const invoice = new rgblib.Invoice(params.invoice)
    return parseResult(invoice.invoiceData())
  }

  async listTransactions () {
    this.getOnline()
    return parseResult(this._wallet.listTransactions(this._online, false))
  }

  async listTransfers (assetId) {
    return parseResult(this._wallet.listTransfers(assetId || null))
  }

  async failTransfers (params) {
    this.getOnline()
    // Accept both string (transferId) and object { batchTransferIdx, noAssetOnly, skipSync }
    const batchIdx = typeof params === 'string' ? params : (params.batchTransferIdx || params)
    const noAssetOnly = typeof params === 'object' ? !!params.noAssetOnly : false
    const skipSync = typeof params === 'object' ? !!params.skipSync : false
    return parseResult(this._wallet.failTransfers(
      this._online,
      toFFIString(batchIdx),
      noAssetOnly,
      skipSync
    ))
  }

  refreshWallet () {
    this.getOnline()
    this._wallet.refresh(this._online, null, '[]', false)
  }

  syncWallet () {
    this.getOnline()
    this._wallet.sync(this._online)
  }

  async getFeeEstimation (params) {
    this.getOnline()
    return parseResult(this._wallet.getFeeEstimation(this._online, toFFIString(params.blocks || 1)))
  }

  async createBackup (params) {
    this._wallet.backup(params.backupPath, params.password)
    return { success: true }
  }

  configureVssBackup (config) {
    this._wallet.configureVssBackup(toFFIString(config))
  }

  disableVssAutoBackup () {
    this._wallet.disableVssAutoBackup()
  }

  async vssBackup (config) {
    const client = rgblib.VssBackupClient.create(toFFIString(config))
    try {
      return parseResult(this._wallet.vssBackup(client))
    } finally {
      client.drop()
    }
  }

  async vssBackupInfo (config) {
    const client = rgblib.VssBackupClient.create(toFFIString(config))
    try {
      return parseResult(this._wallet.vssBackupInfo(client))
    } finally {
      client.drop()
    }
  }

  // Additional methods used directly by WalletAccountRgb

  async signPsbt (psbt) {
    return this._wallet.signPsbt(psbt)
  }

  async signMessage (message) {
    // rgb-lib-bare doesn't have native message signing.
    // This is handled by BareSigner at the account level.
    // If called directly, provide a helpful error.
    throw new Error('Use BareSigner.signMessage() instead — call through WalletAccountRgb.sign()')
  }

  async verifyMessage (message, signature) {
    // Same as signMessage — handled by BareSigner at account level.
    throw new Error('Use BareSigner.verifyMessage() instead — call through WalletAccountRgb.verify()')
  }

  async estimateFeeRate (blocks) {
    this.getOnline()
    const result = parseResult(this._wallet.getFeeEstimation(this._online, toFFIString(blocks || 1)))
    // Return the fee rate as a number (sat/vbyte)
    if (typeof result === 'object' && result !== null) {
      return result.feeRate || result.fee_rate || 1
    }
    return Number(result) || 1
  }

  async estimateFee (signedPsbt) {
    const sizeBytes = signedPsbt.length * 3 / 4
    const vbytes = Math.ceil(sizeBytes * 0.4)
    const feeRate = await this.estimateFeeRate(1)
    return { fee: Math.ceil(vbytes * feeRate), vsize: vbytes }
  }

  async createUtxos (options) {
    this.getOnline()
    return parseResult(this._wallet.createUtxos(
      this._online,
      !!options.upTo,
      toFFIString(options.num),
      toFFIString(options.size),
      toFFIString(options.feeRate),
      false
    ))
  }

  async issueAssetCfa (options) {
    return parseResult(this._wallet.issueAssetCfa(
      options.name,
      options.details || null,
      toFFIString(options.precision),
      toFFIString(options.amounts),
      options.filePath || null
    ))
  }

  async issueAssetUda (options) {
    return parseResult(this._wallet.issueAssetUda(
      options.ticker, options.name,
      options.details || null,
      toFFIString(options.precision),
      options.mediaFilePath || null,
      toFFIString(options.attachmentsFilePaths || [])
    ))
  }

  sendBtc (address, amount, feeRate) {
    this.getOnline()
    return parseResult(this._wallet.sendBtc(
      this._online, address, toFFIString(amount), toFFIString(feeRate), false
    ))
  }

  dispose () {
    this.dropWallet()
  }

  // Direct access to the underlying wallet
  getRawWallet () { return this._wallet }
  getRawOnline () { this.getOnline(); return this._online }
}
