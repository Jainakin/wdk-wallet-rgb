import { jest } from '@jest/globals'

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

export default mock
export const { Wallet, WalletData, Online, Invoice, VssBackupClient, DatabaseType, AssetSchema, BitcoinNetwork, generateKeys, restoreKeys, restoreBackup, dropOnline, validateConsignment, restoreFromVss } = mock
