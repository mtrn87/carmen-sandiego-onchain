// ─── contract exploration data per location ───

export const CHAIN_CONFIG = {
  'Arbitrum Sepolia': { color: '#28a0f0', logo: 'ARB', name: 'Arbitrum Sepolia', symbol: 'ETH', location: 'Tokyo', flag: '\u{1F1EF}\u{1F1F5}' },
  'Base Sepolia': { color: '#0052ff', logo: 'BASE', name: 'Base Sepolia', symbol: 'ETH', location: 'Paris', flag: '\u{1F1EB}\u{1F1F7}' },
  'XDC Apothem': { color: '#ff6b00', logo: 'XDC', name: 'XDC Apothem', symbol: 'XDC', location: 'London', flag: '\u{1F1EC}\u{1F1E7}' },
  'Multi-Chain': { color: '#00f0ff', logo: 'CCIP', name: 'Multi-Chain', symbol: 'ETH', location: '', flag: '' },
}

// ─── placeholder data per location (pre-mission) ───

const acmeBeacon = (name, caseId) => ({
  name,
  address: '0x0000000000000000000000000000000000000000',
  caseId,
  type: 'ACME Beacon',
  status: 'Awaiting Mission',
  deployer: 'ACME HQ',
  deployedAge: '—',
})

export const LOCATION_DATA = {
  'tokyo-sensoji': {
    chain: 'Arbitrum Sepolia',
    headerType: 'contract',
    locationImage: '/tokyo_1.png',
    contract: acmeBeacon('SensojiBeacon.sol', 'CASE-ARB-SENSOJI'),
    transactions: [],
    events: [],
  },
  'tokyo-tower': {
    chain: 'Arbitrum Sepolia',
    headerType: 'contract',
    locationImage: '/tokyo_2.png',
    contract: acmeBeacon('TokyoTowerBeacon.sol', 'CASE-ARB-TOWER'),
    transactions: [],
    events: [],
  },
  'tokyo-chochin': {
    chain: 'Arbitrum Sepolia',
    headerType: 'contract',
    locationImage: '/tokyo_3.png',
    contract: acmeBeacon('ChochinBeacon.sol', 'CASE-ARB-CHOCHIN'),
    transactions: [],
    events: [],
  },
  'paris-eiffel': {
    chain: 'Base Sepolia',
    headerType: 'contract',
    locationImage: '/dubai_1.png',
    contract: acmeBeacon('EiffelBeacon.sol', 'CASE-BASE-EIFFEL'),
    transactions: [],
    events: [],
  },
  'paris-louvre': {
    chain: 'Base Sepolia',
    headerType: 'contract',
    locationImage: '/dubai_2.png',
    contract: acmeBeacon('LouvreBeacon.sol', 'CASE-BASE-LOUVRE'),
    transactions: [],
    events: [],
  },
  'paris-market': {
    chain: 'Base Sepolia',
    headerType: 'contract',
    locationImage: '/dubai_3.png',
    contract: acmeBeacon('MaraisBeacon.sol', 'CASE-BASE-MARAIS'),
    transactions: [],
    events: [],
  },
  'london-bridge': {
    chain: 'XDC Apothem',
    headerType: 'contract',
    locationImage: '/shanghai_1.png',
    contract: acmeBeacon('TowerBridgeBeacon.sol', 'CASE-XDC-BRIDGE'),
    transactions: [],
    events: [],
  },
}

export const DEFAULT_LOCATION = 'tokyo-sensoji'
