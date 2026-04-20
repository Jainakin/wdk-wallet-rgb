// BareRgbLibBinding — Bare worklet implementation of IRgbLibBinding.
//
// Wraps @utexo/rgb-lib-bare (cmake-bare addon) and satisfies the
// IRgbLibBinding interface from @utexo/rgb-sdk-core so it can be
// injected into BaseWalletManager.

import rgblib from '@utexo/rgb-lib-bare'
import { DEFAULT_TRANSPORT_ENDPOINTS, DEFAULT_INDEXER_URLS } from '@utexo/rgb-sdk-core'
import os from 'os'
import fs from 'bare-fs'
import path from 'bare-path'

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
  if (Array.isArray(val)) return JSON.stringify(val.map(v => (typeof v === 'string' ? v : String(v))))
  return JSON.stringify(val)
}

function resolveExpirationTimestamp (params) {
  if (params.expirationTimestamp) return params.expirationTimestamp
  if (params.durationSeconds) return Math.floor(Date.now() / 1000) + params.durationSeconds
  return null
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
    return parseResult(this._wallet.inflateBegin(
      this._online, params.assetId,
      toFFIString(params.amounts),
      toFFIString(params.feeRate),
      toFFIString(params.minConfirmations),
      !!params.dryRun
    ))
  }

  async inflateEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.inflateEnd(this._online, params.signedPsbt))
  }

  async drainToBegin (params) {
    this.getOnline()
    return this._wallet.drainToBegin(
      this._online, params.address, !!params.destroyAssets, toFFIString(params.feeRate)
    )
  }

  async drainToEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.drainToEnd(this._online, params.signedPsbt))
  }

  async sendBegin (params) {
    this.getOnline()

    // Accept either { recipientMap } (raw format) or { invoice, assetId, amount } (WDK format)
    let recipientMap = params.recipientMap
    if (!recipientMap && params.invoice) {
      // Decode the invoice to extract the real recipientId, transportEndpoints,
      // assignment, and assetId — matching how rgb-sdk builds the recipient
      // in Node. rgb-lib's Recipient.recipient_id is the decoded blinded UTXO /
      // script (NOT the full "rgb:..." URI), and transportEndpoints carried in
      // the invoice should be preferred over the sender's wallet fallback.
      let recipientId = params.invoice
      let transportEndpoints = params.transportEndpoints
      let invoiceAssignment
      let invoiceAssetId
      try {
        const inv = new rgblib.Invoice(params.invoice)
        const data = parseResult(inv.invoiceData())
        inv.drop()
        if (data && data.recipientId) recipientId = data.recipientId
        if (data && Array.isArray(data.transportEndpoints) && data.transportEndpoints.length && !transportEndpoints) {
          transportEndpoints = data.transportEndpoints
        }
        if (data && data.assignment) invoiceAssignment = data.assignment
        if (data && data.assetId) invoiceAssetId = data.assetId
      } catch (_) {
        // If invoice decoding fails, fall through — rgb-lib sendBegin will
        // surface a clean error rather than crashing on our side.
      }

      const recipient = {
        recipientId,
        assignment: params.assignment || invoiceAssignment || { Fungible: params.amount || 1 },
        transportEndpoints: transportEndpoints || [this._transportEndpoint]
      }
      if (params.witnessData) {
        recipient.witnessData = params.witnessData
      }
      const assetId = params.assetId || invoiceAssetId || ''
      recipientMap = { [assetId]: [recipient] }
    }

    // fee_rate and min_confirmations are REQUIRED (ptr_to_num crashes on NULL).
    // expiration_timestamp is optional (convert_optional_number handles NULL).
    const result = parseResult(this._wallet.sendBegin(
      this._online,
      toFFIString(recipientMap),
      !!params.donation,
      toFFIString(params.feeRate ?? 1),
      toFFIString(params.minConfirmations ?? 1),
      toFFIString(params.expirationTimestamp || null),
      !!params.dryRun
    ))
    return result?.psbt ?? result
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

  async sendBtcBegin (params) {
    this.getOnline()
    return this._wallet.sendBtcBegin(
      this._online, params.address, toFFIString(params.amount),
      toFFIString(params.feeRate), !!params.skipSync
    )
  }

  async sendBtcEnd (params) {
    this.getOnline()
    return parseResult(this._wallet.sendBtcEnd(
      this._online, params.signedPsbt, !!params.skipSync
    ))
  }

  async blindReceive (params) {
    const assignment = params.assignment || { Fungible: params.amount ?? 0 }
    const expirationTimestamp = resolveExpirationTimestamp(params)
    return parseResult(this._wallet.blindReceive(
      params.assetId || null,
      toFFIString(assignment),
      toFFIString(expirationTimestamp),
      toFFIString(params.transportEndpoints || [this._transportEndpoint]),
      toFFIString(params.minConfirmations ?? 3)
    ))
  }

  async witnessReceive (params) {
    const assignment = params.assignment || { Fungible: params.amount ?? 0 }
    const expirationTimestamp = resolveExpirationTimestamp(params)
    return parseResult(this._wallet.witnessReceive(
      params.assetId || null,
      toFFIString(assignment),
      toFFIString(expirationTimestamp),
      toFFIString(params.transportEndpoints || [this._transportEndpoint]),
      toFFIString(params.minConfirmations ?? 3)
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
