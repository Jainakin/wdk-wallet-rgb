// Mock for @utexo/rgb-lib-bare (native addon not available in Node.js test env)
// Uses jest.fn() so tests can call .mockReturnValue() etc.
// Must export 'default' for ESM compatibility (bare-binding.js uses: import rgblib from '@utexo/rgb-lib-bare')
const { jest } = require('@jest/globals')

const mock = {
  Wallet: jest.fn(),
  WalletData: jest.fn(),
  Online: jest.fn(),
  Invoice: jest.fn().mockImplementation(() => ({ invoiceData: jest.fn() })),
  VssBackupClient: { create: jest.fn().mockReturnValue({ drop: jest.fn() }) },
  DatabaseType: { Sqlite: 'Sqlite' },
  AssetSchema: { Nia: 'Nia', Cfa: 'Cfa', Uda: 'Uda' },
  BitcoinNetwork: { Mainnet: 'Mainnet', Testnet: 'Testnet', Regtest: 'Regtest' },
  generateKeys: jest.fn(),
  restoreKeys: jest.fn(),
  restoreBackup: jest.fn(),
  dropOnline: jest.fn(),
  validateConsignment: jest.fn(),
  restoreFromVss: jest.fn()
}

// ESM default export
module.exports = mock
module.exports.default = mock
