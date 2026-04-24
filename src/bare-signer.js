// BareSigner — Bare worklet implementation of ISigner.
//
// Uses @utexo/rgb-sdk's pure-JS PSBT signer (signPsbtFromSeed) which supports
// BIP86 Taproot signing with RGB-specific preprocessing. This lets us sign
// PSBTs returned by rgb-lib's sendBtcBegin/sendBegin flows even when the
// underlying rgb-lib wallet is watch-only (mnemonic: null).
//
// Message signing/verification use @utexo/rgb-sdk-core's shared crypto.

import { signMessage, verifyMessage } from '@utexo/rgb-sdk-core'
import { signPsbtFromSeed, signPsbt as signPsbtFromMnemonic } from '@utexo/rgb-sdk'

/** @implements {import('@utexo/rgb-sdk-core').ISigner} */
export class BareSigner {
  constructor (binding) {
    this._binding = binding
  }

  async signPsbtWithMnemonic (mnemonic, psbt, network) {
    return signPsbtFromMnemonic(mnemonic, psbt, network)
  }

  async signPsbtWithSeed (seed, psbt, network) {
    return signPsbtFromSeed(seed, psbt, network)
  }

  async signMessage (params) {
    return signMessage(params)
  }

  async verifyMessage (params) {
    return verifyMessage(params)
  }

  async estimateFee (_psbt) {
    // estimatePsbt is not exported from rgb-sdk's main bundle.
    // Fee can be computed from the PSBT directly if needed.
    return { fee: 0, feeRate: 0, vbytes: 0 }
  }
}
