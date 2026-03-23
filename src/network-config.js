// UTEXO network configuration — asset ID mappings for bridge operations.
// Ported from @utexo/rgb-sdk utexo-presets.ts

function withGetAssetById (config) {
  return {
    ...config,
    getAssetById (tokenId) {
      return config.assets.find(a => a.tokenId === tokenId)
    }
  }
}

export const testnetConfig = {
  networkMap: { mainnet: 'testnet', utexo: 'signet' },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: 'RGB',
      networkId: 36,
      assets: [{
        assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 4
      }]
    }),
    mainnetLightning: withGetAssetById({
      networkName: 'RGB Lightning',
      networkId: 94,
      assets: [{
        assetId: 'rgb:WPRv95Nj-icdrgPp-zpQhIp_-2TyJ~Ge-k~FvuMZ-~vVnkA0',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 4
      }]
    }),
    utexo: withGetAssetById({
      networkName: 'UTEXO',
      networkId: 96,
      assets: [{
        assetId: 'rgb:yJW4k8si-~8JdNfl-nM91qFu-r5rH_HS-1hM7jpi-L~lBf90',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 4
      }]
    })
  }
}

export const mainnetConfig = {
  networkMap: { mainnet: 'mainnet', utexo: 'signet' },
  networkIdMap: {
    mainnet: withGetAssetById({
      networkName: 'RGB',
      networkId: 36,
      assets: [{
        assetId: 'rgb:nkHbmy97-R4cjRCe-j~VvT~E-0UQ0OW8-jOCCW6O-EqeCq9M',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 3
      }]
    }),
    mainnetLightning: withGetAssetById({
      networkName: 'RGB Lightning',
      networkId: 94,
      assets: [{
        assetId: 'rgb:nkHbmy97-R4cjRCe-j~VvT~E-0UQ0OW8-jOCCW6O-EqeCq9M',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 3
      }]
    }),
    utexo: withGetAssetById({
      networkName: 'UTEXO',
      networkId: 96,
      assets: [{
        assetId: 'rgb:0yyfySrb-TArdWKB-6Y0yhUX-dbqMpN3-NnjsV2F-2fMhOI4',
        tokenName: 'tUSD', longName: 'USDT', precision: 6, tokenId: 3
      }]
    })
  }
}

export function getNetworkConfig (network) {
  return network === 'mainnet' ? mainnetConfig : testnetConfig
}

export function getDestinationAsset (senderNetwork, destinationNetwork, assetIdSender, networkIdMap) {
  const destinationConfig = networkIdMap[destinationNetwork]
  if (assetIdSender == null) return destinationConfig.assets[0]
  const senderConfig = networkIdMap[senderNetwork]
  const senderAsset = senderConfig.assets.find(a => a.assetId === assetIdSender)
  if (!senderAsset) return undefined
  return destinationConfig.assets.find(a => a.tokenId === senderAsset.tokenId)
}

export function toUnitsNumber (value, precision) {
  const s = String(value).trim()
  const neg = s.startsWith('-')
  const [iRaw, fRaw = ''] = (neg ? s.slice(1) : s).split('.')
  const frac = (fRaw + '0'.repeat(precision)).slice(0, precision)
  const units = Number((iRaw || '0') + frac)
  return neg ? -units : units
}

