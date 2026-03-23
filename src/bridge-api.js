'use strict'

// UTEXO Gateway Bridge API Client
// Ported from @utexo/rgb-sdk UtexoBridgeApiClient.
// Uses fetch (available in bare, Node 18+, and browsers).

const DEFAULT_GATEWAY_BASE_URLS = {
  mainnet: 'https://gateway.utexo.utexo.com/',
  testnet: 'https://dev.gateway.utexo.tricorn.network/'
}

const TransferStatuses = {
  0: 'Unspecified',
  1: 'Confirming',
  2: 'Canceled',
  3: 'Finished',
  4: 'Waiting',
  5: 'Cancelling',
  6: 'Failed',
  7: 'Fetching'
}

function encodeTransferStatus (status) {
  return new TextEncoder().encode(String(status))[0]
}

class FetchClient {
  constructor (baseURL) {
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  async post (path, body) {
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      const error = new Error(errorBody || `HTTP ${res.status}`)
      error.response = { status: res.status, data: errorBody }
      throw error
    }
    return { data: await res.json() }
  }

  async get (path, options) {
    let url = `${this.baseURL}${path}`
    if (options?.params) {
      const qs = new URLSearchParams(
        Object.entries(options.params).map(([k, v]) => [k, String(v)])
      ).toString()
      url += `?${qs}`
    }
    const res = await fetch(url)
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      const error = new Error(errorBody || `HTTP ${res.status}`)
      error.response = { status: res.status, data: errorBody }
      throw error
    }
    return { data: await res.json() }
  }
}

class UtexoBridgeApiClient {
  constructor (httpClient, basePath = '/v1/utexo/bridge') {
    this.http = httpClient
    this.basePath = basePath
  }

  async getBridgeInSignature (request) {
    try {
      const { data } = await this.http.post(
        `${this.basePath}/bridge-in-signature`,
        request
      )
      return data
    } catch (error) {
      const responseData = error?.response?.data
      if (responseData !== undefined) {
        const message = typeof responseData === 'string'
          ? responseData
          : JSON.stringify(responseData)
        throw new Error(message)
      }
      throw error
    }
  }

  async submitTransaction (request) {
    const { data } = await this.http.post(
      `${this.basePath}/submit-transaction`,
      request
    )
    return data.txHash
  }

  async verifyBridgeIn (request) {
    await this.http.post(`${this.basePath}/verify-bridge-in`, request)
  }

  async getReceiverInvoice (transferId, networkId) {
    const { data } = await this.http.get(
      `${this.basePath}/receiver-invoice/${transferId}/${networkId}`
    )
    return data.invoice
  }

  async getWithdrawTransfer (invoice, networkId) {
    const { data } = await this.http.get(`${this.basePath}/transfers/history`, {
      params: {
        network_id: String(networkId),
        offset: String(0),
        limit: String(10),
        address: 'rgb-address'
      }
    })
    if (data.transfers.length === 0) return null
    const transfer = data.transfers
      .map(t => ({
        ...t,
        status: TransferStatuses[encodeTransferStatus(t.status)]
      }))
      .find(t => t.recipient.address === invoice)
    return transfer || null
  }

  async getTransferByMainnetInvoice (mainnetInvoice, networkId) {
    try {
      const { data } = await this.http.get(
        `${this.basePath}/transfer-by-mainnet-invoice`,
        {
          params: {
            mainnet_invoice: mainnetInvoice,
            network_id: networkId
          }
        }
      )
      if (data) {
        return {
          ...data,
          status: TransferStatuses[encodeTransferStatus(data.status)]
        }
      }
      return data
    } catch (_error) {
      console.log('Mainnet invoice not found')
      return null
    }
  }
}

function getBridgeAPI (network = 'mainnet') {
  const httpClient = new FetchClient(DEFAULT_GATEWAY_BASE_URLS[network])
  return new UtexoBridgeApiClient(httpClient)
}

module.exports = {
  getBridgeAPI,
  UtexoBridgeApiClient,
  FetchClient,
  DEFAULT_GATEWAY_BASE_URLS,
  TransferStatuses
}
