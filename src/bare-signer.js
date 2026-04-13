// BareSigner — Bare worklet implementation of ISigner.
//
// Delegates PSBT signing to rgb-lib-bare's native wallet (which has
// the keys internally). Message signing and verification use
// @utexo/rgb-sdk-core's shared crypto utilities.

import { signMessage, verifyMessage } from '@utexo/rgb-sdk-core'

export class BareSigner {
  constructor (binding) {
    this._binding = binding
  }

  async signPsbtWithMnemonic (_mnemonic, psbt, _network) {
    // rgb-lib-bare's wallet already has the keys — just call signPsbt
    const wallet = this._binding.getRawWallet()
    return wallet.signPsbt(psbt)
  }

  async signPsbtWithSeed (_seed, psbt, _network) {
    const wallet = this._binding.getRawWallet()
    return wallet.signPsbt(psbt)
  }

  async signMessage (params) {
    return signMessage(params)
  }

  async verifyMessage (params) {
    return verifyMessage(params)
  }

  async estimateFee (psbt) {
    // Rough estimate based on PSBT size
    // More accurate estimation requires BDK which isn't available in bare
    const sizeBytes = psbt.length * 3 / 4 // base64 → bytes approx
    const vbytes = Math.ceil(sizeBytes * 0.4) // rough vbyte estimate
    return { fee: vbytes, vsize: vbytes }
  }
}
