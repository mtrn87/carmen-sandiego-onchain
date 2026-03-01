// ─── City Registry — single source of truth for all 16 cities ───
// Each city maps to a blockchain chain. Multiple cities can share the same real chainId.

export const CHAIN_DEFS = {
  421614:   { name: 'Arbitrum Sepolia', color: '#28A0F0', icon: '/blockchain_icon/arbitrum.png', symbol: 'ETH',  deployable: true,  comingSoon: false },
  97:       { name: 'BNB Testnet',      color: '#F0B90B', icon: '/blockchain_icon/bnb.png',      symbol: 'BNB',  deployable: false, comingSoon: true  },
  84532:    { name: 'Base Sepolia',     color: '#0052FF', icon: '/blockchain_icon/base.png',      symbol: 'ETH',  deployable: true,  comingSoon: false },
  51:       { name: 'XDC Apothem',      color: '#00AEEF', icon: '/blockchain_icon/xdc.png',       symbol: 'TXDC', deployable: true,  comingSoon: false },
  80002:    { name: 'Polygon Amoy',     color: '#8247E5', icon: '/blockchain_icon/polygon.png',   symbol: 'MATIC',deployable: false, comingSoon: true  },
  11155111: { name: 'Ethereum Sepolia', color: '#627EEA', icon: '/blockchain_icon/eth.png',       symbol: 'ETH',  deployable: false, comingSoon: true  },
  31337:    { name: 'Hardhat Local',    color: '#999999', icon: '/blockchain_icon/hardhat.png',   symbol: 'ETH',  deployable: true,  comingSoon: false },
}

// ─── CityNode configuration per deployable chain ───
// deployable=true means a CityNode contract can be deployed on that chain
export const CITYNODE_CONFIG = {
  421614: { rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', deployable: true  },
  84532:  { rpcUrl: 'https://sepolia.base.org',               deployable: true  },
  51:     { rpcUrl: 'https://erpc.apothem.network',           deployable: true  },
  97:     { rpcUrl: 'https://data-seed-prebsc-1-e.bnbchain.org:8545', deployable: false },
  80002:  { rpcUrl: 'https://rpc-amoy.polygon.technology',    deployable: false },
  11155111:{ rpcUrl: 'https://rpc.sepolia.org',               deployable: false },
}

// ─── Hardhat local virtual CityNode mapping ───
// When chainId===31337, each city (by cityId) has its own CityNode contract deployed locally.
// Key = cityId of the city that this local CityNode represents.
// Env var: VITE_HARDHAT_CITYNODE_{cityId}_ADDRESS
export const HARDHAT_CITY_IDS = [421614, 84532, 51, 97, 80002, 11155111]

// ─── 17 cities pool ───
// id = unique city identifier used across the app
// chainId = the real blockchain chainId this city maps to for contract calls

export const CITY_POOL = [
  // ── Arbitrum Sepolia ──
  {
    id: 421614, name: 'Tokyo', flag: '\u{1F5FE}',
    chain: 'Arbitrum Sepolia', chainId: 421614,
    chainColor: '#28A0F0', chainIcon: '/blockchain_icon/arbitrum.png',
    image: '/tokyo.png', coords: { x: 1704, y: 315 },
    cases: [
      { id: 'tokyo-sensoji', name: 'Senso-ji Temple Node', type: 'Bridge Relay', status: 'active', description: 'Ancient relay pulsing with cross-chain traffic.', image: '/tokyo_1.png', chainId: 421614 },
      { id: 'tokyo-tower', name: 'Tokyo Tower Beacon', type: 'Signal Router', status: 'active', description: 'High-altitude signal bouncing encrypted bursts.', image: '/tokyo_2.png', chainId: 421614 },
      { id: 'tokyo-chochin', name: 'Chochin Market', type: 'Swap Protocol', status: 'active', description: 'Token swaps masking asset movements.', image: '/tokyo_3.png', chainId: 421614 },
    ],
  },
  {
    id: 4216141, name: 'Ottawa', flag: '\u{1F1E8}\u{1F1E6}',
    chain: 'Arbitrum Sepolia', chainId: 421614,
    chainColor: '#28A0F0', chainIcon: '/blockchain_icon/arbitrum.png',
    image: '/ottawa.png', coords: { x: 556, y: 237 },
    cases: [
      { id: 'ottawa-rideau', name: 'Rideau Canal Relay', type: 'Bridge Relay', status: 'active', description: 'A relay node pulsing under the frozen Rideau Canal.', image: '/ottawa_1.png', chainId: 421614 },
      { id: 'ottawa-parliament', name: 'Parliament Hill Beacon', type: 'Signal Router', status: 'active', description: 'Encrypted bursts match known thief signatures.', image: '/ottawa_2.png', chainId: 421614 },
      { id: 'ottawa-gallery', name: 'National Gallery Vault', type: 'Custody Protocol', status: 'active', description: 'Custody traffic spiking near the National Gallery.', image: '/ottawa_3.png', chainId: 421614 },
    ],
  },
  // ── BNB Testnet ──
  {
    id: 97, name: 'London', flag: '\u{1F1EC}\u{1F1E7}',
    chain: 'BNB Testnet', chainId: 97,
    chainColor: '#F0B90B', chainIcon: '/blockchain_icon/bnb.png',
    image: '/london.png', coords: { x: 959, y: 188 },
    cases: [
      { id: 'london-bigben', name: 'Big Ben Relay', type: 'Bridge Relay', status: 'active', description: 'A relay hidden beneath Big Ben. BNB ingress confirmed.', image: '/london_1.png', chainId: 97 },
      { id: 'london-palace', name: 'Buckingham Palace Beacon', type: 'Signal Router', status: 'active', description: 'Encrypted signals pulse from behind palace walls.', image: '/london_2.png', chainId: 97 },
      { id: 'london-eye', name: 'London Eye Vault', type: 'Custody Protocol', status: 'active', description: 'Custody flows cycle through the Eye. Assets staged for exit.', image: '/london_3.png', chainId: 97 },
    ],
  },
  {
    id: 98, name: 'Shanghai', flag: '\u{1F3E2}',
    chain: 'BNB Testnet', chainId: 97,
    chainColor: '#F0B90B', chainIcon: '/blockchain_icon/bnb.png',
    image: '/shanghai.png', coords: { x: 1607, y: 350 },
    cases: [
      { id: 'shanghai-pearl', name: 'Oriental Pearl Relay', type: 'Bridge Relay', status: 'active', description: 'A relay broadcasting from the Oriental Pearl. Cross-chain drift detected.', image: '/shanghai_1.png', chainId: 97 },
      { id: 'shanghai-tower', name: 'Shanghai Tower Node', type: 'Signal Router', status: 'active', description: 'Data spikes match the stolen NFT trail.', image: '/shanghai_2.png', chainId: 97 },
      { id: 'shanghai-bund', name: 'The Bund Market', type: 'Market Router', status: 'active', description: 'Heavy market routing on the Bund. Suspicious liquidity loops.', image: '/shanghai_3.png', chainId: 97 },
    ],
  },
  {
    id: 99, name: 'Reykjav\u00EDk', flag: '\u2744\uFE0F',
    chain: 'BNB Testnet', chainId: 97,
    chainColor: '#F0B90B', chainIcon: '/blockchain_icon/bnb.png',
    image: '/island.png', coords: { x: 843, y: 87 },
    cases: [
      { id: 'reykjavik-hallgrimskirkja', name: 'Hallgr\u00EDmskirkja Node', type: 'Signal Router', status: 'active', description: 'BNB transmissions spike in the northern aurora.', image: '/island_1.png', chainId: 97 },
      { id: 'reykjavik-harpa', name: 'Harpa Concert Relay', type: 'Bridge Relay', status: 'active', description: 'Cross-chain flows converge in the cold.', image: '/island_2.png', chainId: 97 },
      { id: 'reykjavik-lagoon', name: 'Blue Lagoon Vault', type: 'Custody Protocol', status: 'active', description: 'Assets are being laundered in geothermal cover.', image: '/island_3.png', chainId: 97 },
    ],
  },
  {
    id: 971, name: 'Berlin', flag: '\u{1F1E9}\u{1F1EA}',
    chain: 'BNB Testnet', chainId: 97,
    chainColor: '#F0B90B', chainIcon: '/blockchain_icon/bnb.png',
    image: '/berlin.png', coords: { x: 1031, y: 180 },
    cases: [
      { id: 'berlin-gate', name: 'Brandenburg Gate Relay', type: 'Bridge Relay', status: 'active', description: 'BNB ingress surging at the historic gate. Cross-chain signatures detected.', image: '/berlin_1.png', chainId: 97 },
      { id: 'berlin-tower', name: 'TV Tower Beacon', type: 'Signal Router', status: 'active', description: 'Encrypted bursts pulse from the Fernsehturm. Signal matches known suspect patterns.', image: '/berlin_2.png', chainId: 97 },
      { id: 'berlin-wall', name: 'East Side Gallery Vault', type: 'Custody Protocol', status: 'active', description: 'Custody traffic spikes along the Wall. Assets staged for cross-chain exit.', image: '/berlin_3.png', chainId: 97 },
    ],
  },
  // ── Base Sepolia ──
  {
    id: 84532, name: 'Paris', flag: '\u{1F5FC}',
    chain: 'Base Sepolia', chainId: 84532,
    chainColor: '#0052FF', chainIcon: '/blockchain_icon/base.png',
    image: '/paris.png', coords: { x: 972, y: 209 },
    cases: [
      { id: 'paris-eiffel', name: 'Eiffel Tower Relay', type: 'Monitoring Beacon', status: 'active', description: 'Monitoring beacon with bridge ingress traces.', image: '/paris_1.png', chainId: 84532 },
      { id: 'paris-louvre', name: 'Louvre Custody Router', type: 'Custody Protocol', status: 'active', description: 'High-value custody operations detected.', image: '/paris_2.png', chainId: 84532 },
      { id: 'paris-notre', name: 'Notre-Dame Gate', type: 'Bridge Relay', status: 'active', description: 'Base traffic converges at this relay.', image: '/paris_3.png', chainId: 84532 },
    ],
  },
  {
    id: 845321, name: 'Rome', flag: '\u{1F3DB}',
    chain: 'Base Sepolia', chainId: 84532,
    chainColor: '#0052FF', chainIcon: '/blockchain_icon/base.png',
    image: '/roma.png', coords: { x: 1027, y: 265 },
    cases: [
      { id: 'rome-st-peter', name: 'Saint Peter Relay', type: 'Bridge Relay', status: 'active', description: 'Base hops stacking rapidly near Saint Peter.', image: '/roma_1.png', chainId: 84532 },
      { id: 'rome-colosseum', name: 'Colosseum Beacon', type: 'Signal Router', status: 'active', description: 'Signal echoes align with the theft trail.', image: '/roma_2.png', chainId: 84532 },
      { id: 'rome-trevi', name: 'Trevi Fountain Vault', type: 'Custody Protocol', status: 'active', description: 'Custody flows spike near Trevi. Assets staged for export.', image: '/roma_3.png', chainId: 84532 },
    ],
  },
  // ── XDC Apothem ──
  {
    id: 51, name: 'Sydney', flag: '\u{1F3A7}',
    chain: 'XDC Apothem', chainId: 51,
    chainColor: '#00AEEF', chainIcon: '/blockchain_icon/xdc.png',
    image: '/sydney.png', coords: { x: 1765, y: 871 },
    cases: [
      { id: 'sydney-opera', name: 'Opera House Node', type: 'Signal Router', status: 'active', description: 'XDC transmissions intensify after dusk.', image: '/sydney_1.png', chainId: 51 },
      { id: 'sydney-bridge', name: 'Harbour Bridge Relay', type: 'Bridge Relay', status: 'active', description: 'Cross-chain drips forming a trail.', image: '/sydney_2.png', chainId: 51 },
      { id: 'sydney-bondi', name: 'Bondi Beach Market', type: 'Market Router', status: 'active', description: 'Unusual swaps mask the stolen assets.', image: '/sydney_3.png', chainId: 51 },
    ],
  },
  {
    id: 511, name: 'Nairobi', flag: '\u{1F333}',
    chain: 'XDC Apothem', chainId: 51,
    chainColor: '#00AEEF', chainIcon: '/blockchain_icon/xdc.png',
    image: '/nairobi.png', coords: { x: 1157, y: 610 },
    cases: [
      { id: 'nairobi-park', name: 'National Park Relay', type: 'Bridge Relay', status: 'active', description: 'XDC ingress confirmed from the park.', image: '/nairobi_1.png', chainId: 51 },
      { id: 'nairobi-giraffe', name: 'Giraffe Centre Beacon', type: 'Signal Router', status: 'active', description: "The thief's route is close.", image: '/nairobi_2.png', chainId: 51 },
      { id: 'nairobi-museum', name: 'National Museum Vault', type: 'Custody Protocol', status: 'active', description: 'Assets in staging near the museum.', image: '/nairobi_3.png', chainId: 51 },
    ],
  },
  {
    id: 512, name: 'Rio de Janeiro', flag: '\u{1F3D6}',
    chain: 'XDC Apothem', chainId: 51,
    chainColor: '#00AEEF', chainIcon: '/blockchain_icon/xdc.png',
    image: '/rio.png', coords: { x: 730, y: 784 },
    cases: [
      { id: 'rio-cristo', name: 'Cristo Redentor Node', type: 'Signal Router', status: 'active', description: 'XDC traffic flares at night.', image: '/rio_1.png', chainId: 51 },
      { id: 'rio-copacabana', name: 'Copacabana Vault', type: 'Custody Protocol', status: 'active', description: 'Custody flows pool near Copacabana Palace.', image: '/rio_2.png', chainId: 51 },
      { id: 'rio-selaron', name: 'Escadaria Selaron Market', type: 'Market Router', status: 'active', description: 'Swap activity masking the trail.', image: '/rio_3.png', chainId: 51 },
    ],
  },
  // ── Polygon Amoy ──
  {
    id: 80002, name: 'Santiago', flag: '\u{1F5FB}',
    chain: 'Polygon Amoy', chainId: 80002,
    chainColor: '#8247E5', chainIcon: '/blockchain_icon/polygon.png',
    image: '/chile.png', coords: { x: 583, y: 868 },
    cases: [
      { id: 'santiago-easter', name: 'Easter Island Relay', type: 'Bridge Relay', status: 'active', description: 'Polygon flows converge at Easter Island.', image: '/chile_1.png', chainId: 80002 },
      { id: 'santiago-torre', name: 'Gran Torre Node', type: 'Signal Router', status: 'active', description: 'Polygon pings align with the suspect route.', image: '/chile_2.png', chainId: 80002 },
      { id: 'santiago-moneda', name: 'La Moneda Vault', type: 'Custody Protocol', status: 'active', description: 'Assets may be staged for exit.', image: '/chile_3.png', chainId: 80002 },
    ],
  },
  {
    id: 800021, name: 'Dakar', flag: '\u{1F30D}',
    chain: 'Polygon Amoy', chainId: 80002,
    chainColor: '#8247E5', chainIcon: '/blockchain_icon/polygon.png',
    image: '/dakar.png', coords: { x: 867, y: 483 },
    cases: [
      { id: 'dakar-renaissance', name: 'Renaissance Monument Relay', type: 'Bridge Relay', status: 'active', description: 'Polygon ingress rising.', image: '/dakar_1.png', chainId: 80002 },
      { id: 'dakar-goree', name: 'Goree Island Node', type: 'Signal Router', status: 'active', description: 'Traffic spikes match the stolen route.', image: '/dakar_2.png', chainId: 80002 },
      { id: 'dakar-mosque', name: 'Grand Mosque Vault', type: 'Custody Protocol', status: 'active', description: 'Assets being staged at the mosque.', image: '/dakar_3.png', chainId: 80002 },
    ],
  },
  {
    id: 800022, name: 'Moscow', flag: '\u26EA',
    chain: 'Polygon Amoy', chainId: 80002,
    chainColor: '#8247E5', chainIcon: '/blockchain_icon/polygon.png',
    image: '/moscow.png', coords: { x: 1161, y: 154 },
    cases: [
      { id: 'moscow-red-square', name: 'Red Square Relay', type: 'Bridge Relay', status: 'active', description: 'Polygon ingress rising fast.', image: '/moscow_1.png', chainId: 80002 },
      { id: 'moscow-kremlin', name: 'Kremlin Beacon', type: 'Signal Router', status: 'active', description: 'Encrypted traffic matches the suspect trail.', image: '/moscow_2.png', chainId: 80002 },
      { id: 'moscow-bolshoi', name: 'Bolshoi Theatre Vault', type: 'Custody Protocol', status: 'active', description: 'Assets staged for exit near the Bolshoi.', image: '/moscow_3.png', chainId: 80002 },
    ],
  },
  // ── Ethereum Sepolia ──
  {
    id: 11155111, name: 'New York City', flag: '\u{1F30E}',
    chain: 'Ethereum Sepolia', chainId: 11155111,
    chainColor: '#627EEA', chainIcon: '/blockchain_icon/eth.png',
    image: '/nyc.png', coords: { x: 565, y: 274 },
    cases: [
      { id: 'nyc-liberty', name: 'Liberty Island Relay', type: 'Bridge Relay', status: 'active', description: 'Ethereum ingress confirmed.', image: '/nyc_1.png', chainId: 11155111 },
      { id: 'nyc-central', name: 'Central Park Beacon', type: 'Signal Router', status: 'active', description: 'Signal bursts ripple across Central Park.', image: '/nyc_2.png', chainId: 11155111 },
      { id: 'nyc-times', name: 'Times Square Market', type: 'Market Router', status: 'active', description: 'Liquidity loops detected in Times Square.', image: '/nyc_3.png', chainId: 11155111 },
    ],
  },
  {
    id: 11155112, name: 'Mexico City', flag: '\u{1F1F2}\u{1F1FD}',
    chain: 'Ethereum Sepolia', chainId: 11155111,
    chainColor: '#627EEA', chainIcon: '/blockchain_icon/eth.png',
    image: '/mexico.png', coords: { x: 431, y: 444 },
    cases: [
      { id: 'mexico-bellas', name: 'Bellas Artes Relay', type: 'Bridge Relay', status: 'active', description: 'Ethereum hops intensify near Bellas Artes.', image: '/mexico_1.png', chainId: 11155111 },
      { id: 'mexico-chapultepec', name: 'Chapultepec Beacon', type: 'Signal Router', status: 'active', description: 'The suspects route passes through here.', image: '/mexico_2.png', chainId: 11155111 },
      { id: 'mexico-mayor', name: 'Templo Mayor Vault', type: 'Custody Protocol', status: 'active', description: 'Assets possibly staged at Templo Mayor.', image: '/mexico_3.png', chainId: 11155111 },
    ],
  },
  {
    id: 11155113, name: 'Dubai', flag: '\u{1F3E0}',
    chain: 'Ethereum Sepolia', chainId: 11155111,
    chainColor: '#627EEA', chainIcon: '/blockchain_icon/eth.png',
    image: '/dubai.png', coords: { x: 1255, y: 398 },
    cases: [
      { id: 'dubai-burj', name: 'Burj Khalifa Node', type: 'Signal Router', status: 'active', description: 'Ethereum bursts align with the theft.', image: '/dubai_1.png', chainId: 11155111 },
      { id: 'dubai-airport', name: 'Dubai Airport Relay', type: 'Bridge Relay', status: 'active', description: 'Cross-chain transfers accelerating.', image: '/dubai_2.png', chainId: 11155111 },
      { id: 'dubai-mall', name: 'Dubai Mall Market', type: 'Market Router', status: 'active', description: 'Liquidity trails are fresh at the Mall.', image: '/dubai_3.png', chainId: 11155111 },
    ],
  },
]

// ─── Lookup maps ───

export const CITY_POOL_MAP = Object.fromEntries(CITY_POOL.map((c) => [c.id, c]))

export const CITY_IDS = CITY_POOL.map((c) => c.id)

// ─── Utility functions ───

export function getCitiesExcludingChain(chainId) {
  return CITY_POOL.filter((c) => c.chainId !== chainId)
}

export function getCitiesByChain(chainId) {
  return CITY_POOL.filter((c) => c.chainId === chainId)
}

// ─── Mock locations per city (3 per city, for CityNode gameplay) ───

const CATEGORY_IDS = { 'Bridge Relay': 0, 'Signal Router': 1, 'Swap Protocol': 2, 'Monitoring Beacon': 3, 'Custody Protocol': 4, 'Cross-Chain Bridge': 5, 'Market Router': 2 }

function deriveLocations(city) {
  return city.cases.map((c, i) => ({
    name: c.name,
    category: CATEGORY_IDS[c.type] ?? 0,
    fakeLevel: 1 + (i % 3),
    riskLevel: 2 + ((i * 2) % 4),
    description: c.description,
  }))
}

export function getMockLocations(cityId) {
  const city = CITY_POOL_MAP[cityId]
  if (!city) return []
  return deriveLocations(city)
}

// ─── Location images per city ───

export function getLocationImages(cityId) {
  const city = CITY_POOL_MAP[cityId]
  if (!city) return []
  return city.cases.map((c) => c.image)
}

// ─── Location narratives per city ───

const STATUS_CYCLE = [
  { status: 'ACTIVE RELAY \u2014 MEDIUM THREAT', statusColor: 'yellow' },
  { status: 'SIGNAL INTERCEPT \u2014 HIGH THREAT', statusColor: 'red' },
  { status: 'TRAFFIC ANALYSIS \u2014 LOW THREAT', statusColor: 'green' },
]

// location & network curiosities for all 16 cities
const CUSTOM_NARRATIVES = {
  // ── Tokyo (421614) — Arbitrum Sepolia ──
  421614: {
    0: { title: 'Senso-ji Temple Node', analysis: "Senso-ji is Tokyo's oldest temple, founded in 645 AD. Its Kaminarimon (Thunder Gate) has welcomed visitors for over a thousand years. Much like this ancient gateway, Arbitrum serves as a gateway to Ethereum \u2014 an L2 rollup that batches thousands of transactions before posting them to mainnet, achieving speeds of up to 40,000 TPS while keeping fees a fraction of L1 costs.", status: 'LANDMARK \u2014 FOUNDED 645 AD', statusColor: 'yellow' },
    1: { title: 'Tokyo Tower Beacon', analysis: "Tokyo Tower stands 333 meters tall, built in 1958 from steel \u2014 including recycled American tanks from the Korean War. It broadcasts TV and radio signals across the Kanto region. Similarly, Arbitrum broadcasts rollup proofs to Ethereum mainnet, using optimistic fraud proofs to ensure every transaction is valid. The tower's dual observation decks mirror Arbitrum's dual layers: fast execution off-chain, finality on-chain.", status: 'BEACON \u2014 333M ALTITUDE', statusColor: 'green' },
    2: { title: 'Chochin Market', analysis: "Nakamise-dori, the shopping street leading to Senso-ji, has been a marketplace since the 1680s \u2014 one of Japan's oldest commercial streets. Vendors sell traditional chochin paper lanterns handcrafted in the same way for centuries. Arbitrum's DEX ecosystem processes billions in daily volume with the same reliability, offering swap fees as low as $0.01 thanks to its efficient rollup compression.", status: 'MARKET \u2014 SINCE 1680', statusColor: 'yellow' },
  },
  // ── Ottawa (4216141) — Arbitrum Sepolia ──
  4216141: {
    0: { title: 'Rideau Canal Relay', analysis: "The Rideau Canal is a UNESCO World Heritage Site and, at 7.8 km, the world's largest naturally frozen skating rink. Built in 1832 as a military supply route, it now connects communities across Ottawa. Arbitrum connects dApps to Ethereum's security in a similar way \u2014 providing a smooth, frictionless pathway for tokens and data to flow between L2 and L1.", status: 'UNESCO HERITAGE \u2014 7.8 KM', statusColor: 'green' },
    1: { title: 'Parliament Hill Beacon', analysis: "Parliament Hill's Gothic Revival buildings have housed Canada's federal government since 1866. The Peace Tower stands 92.2 meters tall with a 53-bell carillon. Just as Canada's parliamentary system provides stable governance, Arbitrum's decentralized sequencer and fraud-proof system ensure that no single entity can manipulate transaction ordering.", status: 'PARLIAMENT \u2014 EST. 1866', statusColor: 'yellow' },
    2: { title: 'National Gallery Vault', analysis: "The National Gallery of Canada houses over 93,000 works, including the world's most comprehensive collection of Canadian art. Its iconic glass and granite building was designed by Moshe Safdie. Arbitrum hosts a similarly impressive collection \u2014 over 600 protocols and dApps, making it the most adopted Ethereum L2 by total value locked.", status: 'GALLERY \u2014 93,000 WORKS', statusColor: 'yellow' },
  },
  // ── London (97) — BNB Testnet ──
  97: {
    0: { title: 'Big Ben Relay', analysis: "Fun fact: \"Big Ben\" is actually the name of the 13.5-ton bell inside the Elizabeth Tower, not the tower itself. It has kept time for London since 1859, losing no more than 2 seconds per day. BNB Chain keeps similar precision with its 3-second block times \u2014 one of the fastest among major blockchains \u2014 processing over 2,000 transactions per second.", status: 'CLOCK \u2014 3-SEC PRECISION', statusColor: 'green' },
    1: { title: 'Buckingham Palace Beacon', analysis: "Buckingham Palace has 775 rooms, including 78 bathrooms and 92 offices. It has been the official London residence of British monarchs since 1837. BNB Chain's ecosystem is equally grand \u2014 it hosts thousands of dApps and over 21 active validators that rotate to keep the network secure and decentralized through its Proof of Staked Authority consensus.", status: 'PALACE \u2014 775 ROOMS', statusColor: 'yellow' },
    2: { title: 'London Eye Vault', analysis: "The London Eye stands 135 meters tall with 32 passenger capsules, each representing a London borough. One full rotation takes exactly 30 minutes. BNB Chain's validator rotation cycles keep the network turning with similar precision \u2014 rotating validators ensure no single node dominates, while the chain processes transactions worth billions daily.", status: 'EYE \u2014 135M ALTITUDE', statusColor: 'green' },
  },
  // ── Shanghai (98) — BNB Testnet ──
  98: {
    0: { title: 'Oriental Pearl Relay', analysis: "The Oriental Pearl Tower is 468 meters tall with its distinctive pink sphere design, making it one of the most recognizable structures in Asia. Built in 1994, it was Shanghai's tallest building for a decade. BNB Chain similarly stood as one of the most-used blockchains for years, pioneering low-cost DeFi access for millions of users across Asia and beyond.", status: 'TOWER \u2014 468M HEIGHT', statusColor: 'green' },
    1: { title: 'Shanghai Tower Node', analysis: "Shanghai Tower reaches 632 meters \u2014 the world's second tallest building. Its twisted design reduces wind load by 24%, an elegant engineering solution. BNB Chain's architecture is similarly optimized: its dual-chain structure (BNB Beacon Chain for governance + BNB Smart Chain for smart contracts) elegantly separates concerns to maximize throughput.", status: 'SKYSCRAPER \u2014 632M', statusColor: 'green' },
    2: { title: 'The Bund Market', analysis: "The Bund is Shanghai's iconic waterfront, featuring 52 buildings in Art Deco, Baroque, and Romanesque styles \u2014 a living museum of early 20th-century architecture. It was once the financial hub of East Asia. BNB Chain carries this legacy forward as one of the most active DeFi ecosystems, where PancakeSwap alone processes billions in daily trading volume.", status: 'BUND \u2014 52 HISTORIC BUILDINGS', statusColor: 'yellow' },
  },
  // ── Reykjav\u00edk (99) — BNB Testnet ──
  99: {
    0: { title: 'Hallgr\u00edmskirkja Node', analysis: "Hallgr\u00edmskirkja is Iceland's largest church at 74.5 meters, designed to resemble basalt lava columns found across Iceland's volcanic landscape. It took 41 years to build (1945-1986). BNB Chain's structured validator architecture mirrors these natural columns \u2014 orderly, resilient, and built to withstand the test of time through consistent block production.", status: 'CHURCH \u2014 74.5M HEIGHT', statusColor: 'yellow' },
    1: { title: 'Harpa Concert Relay', analysis: "Harpa Concert Hall's facade consists of 1,000 steel and glass panels designed by artist Olafur Eliasson, creating a kaleidoscopic light show as the sun shifts. The geometric patterns reflect Iceland's basalt formations. BNB Chain's modular design philosophy echoes this \u2014 each component (consensus, execution, storage) works independently but creates a unified, cohesive system.", status: 'HARPA \u2014 1,000 GLASS PANELS', statusColor: 'green' },
    2: { title: 'Blue Lagoon Vault', analysis: "The Blue Lagoon's milky-blue water is a byproduct of the nearby Svartsengi geothermal power plant, maintained at 37-39\u00b0C year-round. Iceland generates nearly 100% of its electricity from renewable sources. This makes it a prime location for sustainable blockchain operations \u2014 BNB Chain's Proof of Staked Authority consensus uses far less energy than Proof of Work, aligning with Iceland's green philosophy.", status: 'GEOTHERMAL \u2014 37-39\u00b0C', statusColor: 'green' },
  },
  // ── Paris (84532) — Base Sepolia ──
  84532: {
    0: { title: 'Eiffel Tower Relay', analysis: "The Eiffel Tower is made of 7,300 tons of wrought iron with 2.5 million rivets. Originally built as a temporary exhibit for the 1889 World's Fair, artists protested it as an eyesore \u2014 yet it became Paris's most iconic symbol. Base, built by Coinbase, follows a similar trajectory: a practical L2 solution that's rapidly becoming a cornerstone of the on-chain economy, bringing the next billion users to Ethereum.", status: 'TOWER \u2014 7,300 TONS OF IRON', statusColor: 'yellow' },
    1: { title: 'Louvre Custody Router', analysis: "The Louvre is the world's most visited museum, welcoming over 7.8 million visitors annually. It houses 380,000 objects across 72,735 square meters. Base's mission to bring the next billion users on-chain echoes the Louvre's role as a gateway to culture \u2014 both make something valuable accessible to everyone, with Base's sub-cent transaction fees removing the cost barrier.", status: 'MUSEUM \u2014 380,000 OBJECTS', statusColor: 'yellow' },
    2: { title: 'Notre-Dame Gate', analysis: "Notre-Dame Cathedral took 182 years to build (1163-1345) and survived the devastating 2019 fire thanks to the bravery of firefighters and the resilience of its medieval stone vault. Base is similarly built for the long term \u2014 as an MIT-licensed, open-source L2, its infrastructure is designed to outlast any single company, with decentralized sequencing on the roadmap.", status: 'CATHEDRAL \u2014 182 YEARS TO BUILD', statusColor: 'yellow' },
  },
  // ── Rome (845321) — Base Sepolia ──
  845321: {
    0: { title: 'Saint Peter Relay', analysis: "St. Peter's Basilica is the world's largest church, covering 23,000 square meters. Its dome, designed by Michelangelo, rises 136 meters and took 120 years to complete. Base's infrastructure is built with similar ambition \u2014 designed to handle massive throughput at scale, with the goal of making on-chain interactions as common as online shopping.", status: 'BASILICA \u2014 23,000 SQ METERS', statusColor: 'yellow' },
    1: { title: 'Colosseum Beacon', analysis: "The Colosseum could seat 50,000 to 80,000 spectators and featured a retractable awning system (velarium) operated by a team of sailors. It was the ancient world's largest amphitheatre. Base channels this same capacity \u2014 processing thousands of transactions per second with Ethereum's security backing every operation, like the Colosseum's engineering backing every spectacle.", status: 'ARENA \u2014 50,000+ CAPACITY', statusColor: 'green' },
    2: { title: 'Trevi Fountain Vault', analysis: "Visitors throw approximately \u20ac3,000 into the Trevi Fountain daily (over \u20ac1 million per year), which is collected and donated to charity. The fountain's Baroque design took 30 years to complete. Base's low transaction fees (often under $0.01) make micro-transactions viable \u2014 so even tossing a digital coin into a smart contract fountain is economically feasible.", status: 'FOUNTAIN \u2014 \u20ac3,000/DAY', statusColor: 'green' },
  },
  // ── Sydney (51) — XDC Apothem ──
  51: {
    0: { title: 'Opera House Node', analysis: "The Sydney Opera House took 16 years to build and features over 1 million Swedish-made roof tiles. Its construction went 1,357% over budget \u2014 from AU$7 million to AU$102 million. XDC Network focuses on trade finance and enterprise solutions with a similarly ambitious scope, aiming to digitize the $5 trillion global trade finance market through ISO 20022-compliant blockchain infrastructure.", status: 'OPERA \u2014 1M ROOF TILES', statusColor: 'yellow' },
    1: { title: 'Harbour Bridge Relay', analysis: "The Sydney Harbour Bridge, nicknamed \"The Coathanger,\" is 134 meters tall and used 52,800 tonnes of steel. It took 8 years to build and connects Sydney's CBD to the North Shore. XDC Network similarly bridges the gap between traditional trade finance and blockchain \u2014 connecting banks, exporters, and importers through its hybrid relay architecture.", status: 'BRIDGE \u2014 52,800 TONNES STEEL', statusColor: 'green' },
    2: { title: 'Bondi Beach Market', analysis: "Bondi Beach stretches 1 kilometer of golden sand and hosts some of the world's largest surf competitions. The Bondi to Coogee coastal walk attracts over 3 million visitors yearly. XDC's decentralized exchange ecosystem carries a similar energy \u2014 with fast 2-second block times and near-zero gas fees, tokens flow through the XDC network like waves through Bondi's famous break.", status: 'BEACH \u2014 1 KM GOLDEN SAND', statusColor: 'green' },
  },
  // ── Nairobi (511) — XDC Apothem ──
  511: {
    0: { title: 'National Park Relay', analysis: "Nairobi National Park is the only national park in the world located within a capital city. Just 7 km from downtown, you can see lions with the Nairobi skyline in the background. XDC Network is similarly unique \u2014 the only enterprise-grade blockchain fully focused on trade finance, operating right alongside traditional financial institutions rather than in isolation.", status: 'PARK \u2014 7 KM FROM DOWNTOWN', statusColor: 'green' },
    1: { title: 'Giraffe Centre Beacon', analysis: "The African Fund for Endangered Wildlife's Giraffe Centre was established in 1979 to protect the Rothschild's giraffe, of which fewer than 800 remain in the wild. Their long necks evolved for reaching high foliage. XDC takes a similarly far-sighted approach to blockchain \u2014 building long-term trade finance infrastructure that reaches across borders and institutions.", status: 'CONSERVATION \u2014 EST. 1979', statusColor: 'green' },
    2: { title: 'National Museum Vault', analysis: "The National Museum of Kenya houses some of humanity's oldest fossils, including the famous Turkana Boy \u2014 a 1.6 million-year-old Homo erectus skeleton. These artifacts trace the origins of human civilization. XDC traces the origins of digital trade finance, creating immutable records of transactions that will endure as long as the blockchain itself.", status: 'MUSEUM \u2014 1.6M YEAR OLD FOSSILS', statusColor: 'yellow' },
  },
  // ── Rio de Janeiro (512) — XDC Apothem ──
  512: {
    0: { title: 'Cristo Redentor Node', analysis: "Cristo Redentor stands 30 meters tall on an 8-meter pedestal atop Corcovado mountain at 710 meters elevation. Built between 1922-1931, it is made of reinforced concrete and soapstone. Its open arms span 28 meters, symbolizing welcome. XDC Network's architecture is equally open \u2014 its hybrid blockchain allows both public and private participation, welcoming enterprises and individuals alike.", status: 'STATUE \u2014 710M ELEVATION', statusColor: 'yellow' },
    1: { title: 'Copacabana Vault', analysis: "Copacabana Beach stretches 4 kilometers and hosts the world's largest New Year's celebration, drawing over 2 million people. Its distinctive Portuguese wave-pattern sidewalk was designed in the 1930s. XDC's vibrant DeFi ecosystem mirrors this energy \u2014 a growing community of builders creating decentralized applications for trade finance and beyond.", status: 'BEACH \u2014 4 KM STRETCH', statusColor: 'green' },
    2: { title: 'Escadaria Selar\u00f3n Market', analysis: "The Escadaria Selar\u00f3n consists of 215 steps covered with over 2,000 hand-painted tiles from more than 60 countries around the world. Chilean-born artist Jorge Selar\u00f3n called it his tribute to the Brazilian people. XDC connects trade across a similarly global network \u2014 facilitating cross-border transactions between enterprises in dozens of countries through its interoperable protocol.", status: 'STAIRS \u2014 60+ COUNTRIES', statusColor: 'yellow' },
  },
  // ── Santiago (80002) — Polygon Amoy ──
  80002: {
    0: { title: 'Easter Island Relay', analysis: "Easter Island (Rapa Nui) is home to 887 monumental moai statues carved by the Rapa Nui people between 1250-1500 AD. The largest erected moai stands 10 meters tall and weighs 82 tonnes. Like these enduring sentinels, Polygon's validator nodes stand watch over the network \u2014 hundreds of validators securing billions in value through Proof of Stake consensus.", status: 'ISLAND \u2014 887 MOAI STATUES', statusColor: 'yellow' },
    1: { title: 'Gran Torre Node', analysis: "Gran Torre Santiago is the tallest building in Latin America at 300 meters with 64 floors. It was completed in 2013 and houses offices, a hotel, and a mall. Polygon scales to similar heights in the blockchain world \u2014 its zkEVM and PoS chains process thousands of transactions per second, making it one of the most scalable Ethereum L2 solutions available.", status: 'TOWER \u2014 300M / 64 FLOORS', statusColor: 'green' },
    2: { title: 'La Moneda Vault', analysis: "La Moneda Palace has served as Chile's presidential seat since 1846. Originally built as the national mint (hence the name \"La Moneda\" meaning \"The Coin\"). This connection to currency is fitting \u2014 Polygon's MATIC token powers the entire ecosystem, and the network's governance model is as established as Chile's democratic institutions.", status: 'PALACE \u2014 \"THE COIN\" SINCE 1846', statusColor: 'yellow' },
  },
  // ── Dakar (800021) — Polygon Amoy ──
  800021: {
    0: { title: 'Renaissance Monument Relay', analysis: "The African Renaissance Monument in Dakar stands 49 meters tall \u2014 taller than the Statue of Liberty. Built in 2010, it depicts a man, woman, and child emerging from a volcano, symbolizing Africa's emergence into the modern world. Polygon represents a similar renaissance for Web3 \u2014 bringing scalable, low-cost blockchain access to emerging markets worldwide.", status: 'MONUMENT \u2014 49M HEIGHT', statusColor: 'yellow' },
    1: { title: 'Gor\u00e9e Island Node', analysis: "Gor\u00e9e Island is a UNESCO World Heritage Site located 3 km off the coast of Dakar. It serves as a powerful symbol of historical memory and reconciliation. Polygon's blockchain technology shares a core principle with this site \u2014 the immutable preservation of records. Once a transaction is written to Polygon, it cannot be erased or rewritten.", status: 'UNESCO \u2014 3 KM OFFSHORE', statusColor: 'yellow' },
    2: { title: 'Grand Mosque Vault', analysis: "The Grand Mosque of Dakar is one of the largest in West Africa, combining traditional Islamic architecture with local Senegalese design elements. Its community serves as a gathering point for millions. Polygon's developer community echoes this scale \u2014 with over 53,000 dApps deployed and millions of daily active users, it's one of the most vibrant blockchain ecosystems.", status: "MOSQUE \u2014 WEST AFRICA'S LARGEST", statusColor: 'yellow' },
  },
  // ── Moscow (800022) — Polygon Amoy ──
  800022: {
    0: { title: 'Red Square Relay', analysis: "Red Square spans 330 meters in length and 70 meters in width, serving as Moscow's central hub since the 15th century. Its name comes from the old Russian word \"krasnaya\" meaning \"beautiful,\" not \"red.\" Polygon's network is similarly central to Ethereum's ecosystem \u2014 a scalable solution that hosts thousands of active dApps and processes millions of transactions daily.", status: 'SQUARE \u2014 330M LENGTH', statusColor: 'yellow' },
    1: { title: 'Kremlin Beacon', analysis: "The Moscow Kremlin is a fortified complex spanning 27.5 hectares, containing palaces, cathedrals, and the seat of government. Its walls are 2.2 km long with 20 towers. Polygon's security architecture is fortress-like in its own right \u2014 its proof-of-stake checkpoints anchor to Ethereum's mainnet, creating multiple layers of protection for billions in assets.", status: 'FORTRESS \u2014 20 TOWERS', statusColor: 'green' },
    2: { title: 'Bolshoi Theatre Vault', analysis: "The Bolshoi Theatre was founded in 1776 and is one of the world's oldest and most renowned ballet and opera companies. Its 2,150-seat main hall features extraordinary acoustics perfected over centuries. Polygon orchestrates blockchain transactions with similar precision \u2014 its fast finality and low latency create a seamless experience for DeFi, gaming, and NFT applications.", status: 'THEATRE \u2014 FOUNDED 1776', statusColor: 'yellow' },
  },
  // ── New York City (11155111) — Ethereum Sepolia ──
  11155111: {
    0: { title: 'Liberty Island Relay', analysis: "The Statue of Liberty was a gift from France in 1886, made entirely of copper plates just 2.4 mm thick \u2014 which is why it turned green through oxidation over decades. It symbolizes freedom and opportunity. Ethereum embodies this same spirit as the original decentralized smart contract platform \u2014 permissionless, open, and accessible to anyone with an internet connection.", status: 'STATUE \u2014 2.4 MM COPPER', statusColor: 'yellow' },
    1: { title: 'Central Park Beacon', analysis: "Central Park covers 843 acres in the heart of Manhattan and was the first landscaped public park in the United States, opened in 1858. It receives over 42 million visitors annually. Ethereum is the Central Park of DeFi \u2014 the foundational ecosystem where thousands of protocols, from Uniswap to Aave, have taken root and flourished since 2015.", status: 'PARK \u2014 843 ACRES', statusColor: 'green' },
    2: { title: 'Times Square Market', analysis: "Times Square sees about 330,000 visitors daily and is known as \"The Crossroads of the World.\" Its iconic electronic billboards consume roughly 161 megawatts annually. Ethereum is the crossroads of crypto \u2014 the most connected blockchain where the majority of cross-chain bridges, token standards (ERC-20, ERC-721), and DeFi protocols converge.", status: 'CROSSROADS \u2014 330K DAILY VISITORS', statusColor: 'green' },
  },
  // ── Mexico City (11155112) — Ethereum Sepolia ──
  11155112: {
    0: { title: 'Bellas Artes Relay', analysis: "The Palacio de Bellas Artes is a masterpiece of Art Nouveau and Art Deco architecture, home to murals by Diego Rivera, David Alfaro Siqueiros, and Rufino Tamayo. Its construction took 30 years due to the Mexican Revolution. Ethereum's smart contracts are equally artful \u2014 composable, programmable building blocks that developers combine to create complex financial instruments.", status: 'PALACE \u2014 30 YEARS TO BUILD', statusColor: 'yellow' },
    1: { title: 'Chapultepec Beacon', analysis: "Bosque de Chapultepec is one of the largest city parks in the Western Hemisphere at 686 hectares \u2014 nearly twice the size of Central Park. It contains a castle, a zoo, museums, and an ancient forest of Montezuma cypress trees. Ethereum's ecosystem is similarly expansive \u2014 hosting the largest collection of dApps, developer tools, and standards in all of crypto.", status: 'FOREST \u2014 686 HECTARES', statusColor: 'green' },
    2: { title: 'Templo Mayor Vault', analysis: "Templo Mayor was the main temple of the Aztec capital Tenochtitlan, rediscovered accidentally in 1978 beneath modern Mexico City. Archaeological layers reveal 7 phases of construction spanning 200 years. Ethereum's architecture has similarly deep layers \u2014 from the EVM execution layer to the consensus layer, each upgrade (Merge, Shanghai, Dencun) builds upon the last.", status: 'TEMPLE \u2014 7 LAYERS DEEP', statusColor: 'yellow' },
  },
  // ── Dubai (11155113) — Ethereum Sepolia ──
  11155113: {
    0: { title: 'Burj Khalifa Node', analysis: "The Burj Khalifa reaches 828 meters \u2014 the tallest structure ever built by humans, with 163 floors. Its Y-shaped design resists wind forces at extreme heights. Ethereum similarly aims high with its ambitious roadmap: the Surge for 100,000+ TPS through L2s, the Verge for stateless clients, and the Purge for reduced node requirements.", status: 'TOWER \u2014 828M / 163 FLOORS', statusColor: 'green' },
    1: { title: 'Dubai Airport Relay', analysis: "Dubai International Airport (DXB) is the world's busiest by international passenger traffic, serving over 87 million travelers annually across 260+ destinations. It never closes. Ethereum processes transactions 24/7 as well \u2014 the network has maintained nearly 100% uptime since launch in 2015, serving as the world's busiest decentralized finance hub.", status: 'AIRPORT \u2014 87M PASSENGERS/YEAR', statusColor: 'green' },
    2: { title: 'Dubai Mall Market', analysis: "The Dubai Mall is the world's largest shopping mall by total area at 502,000 square meters, housing over 1,200 retail outlets, an aquarium, and an ice rink. Ethereum is the world's largest on-chain marketplace \u2014 hosting the majority of NFT trading volume, DeFi liquidity, and tokenized assets, with over $50 billion in total value locked across its ecosystem.", status: 'MALL \u2014 502,000 SQ METERS', statusColor: 'yellow' },
  },
}

function generateNarrative(city, locIdx) {
  const c = city.cases[locIdx]
  if (!c) return null
  const cycle = [
    { status: 'LANDMARK \u2014 ACTIVE NODE', statusColor: 'yellow' },
    { status: 'NETWORK INSIGHT \u2014 INFRASTRUCTURE', statusColor: 'green' },
    { status: 'REGIONAL HUB \u2014 CONNECTED', statusColor: 'yellow' },
  ]
  return {
    title: c.name,
    analysis: `${c.name} is a notable landmark in ${city.name}, connected to the ${city.chain} network (Chain ID: ${city.chainId}). This ${c.type.toLowerCase()} node operates on one of the blockchain ecosystem's key networks. ${city.chain} provides the infrastructure for fast, low-cost transactions that power decentralized applications across the globe.`,
    ...cycle[locIdx % 3],
  }
}

export function getLocationNarratives(cityId) {
  if (CUSTOM_NARRATIVES[cityId]) return CUSTOM_NARRATIVES[cityId]
  const city = CITY_POOL_MAP[cityId]
  if (!city) return {}
  const result = {}
  city.cases.forEach((_, i) => { result[i] = generateNarrative(city, i) })
  return result
}

// ─── Clue data per city ───
// Tiered: weak (strength <= 40), medium (41-65), strong (> 65)

// hand-crafted clue data for the original 3 cities
const CUSTOM_CLUE_DATA = {
  // ── Tokyo (421614) — Arbitrum Sepolia ──
  421614: {
    0: {
      weak: [
        'Faint residual signals at the Senso-ji relay \u2014 someone was here, but the trace is too degraded to analyze. Could be anyone.',
        'Dead end \u2014 incense smoke and encrypted noise. No actionable intel at this relay point.',
      ],
      medium: [
        "Temple node logs reveal a secondary handshake protocol \u2014 someone tested a custody transfer that was later aborted. The abort signature matches Carmen's operational style.",
        'Cross-chain bridge packets routed through Senso-ji relay show unusual timing. Pattern is consistent with obfuscation but too fragmented to confirm identity.',
      ],
      strong: [
        "Cross-chain bridge packets routed through Senso-ji carry encoded wallet fragments. Pattern matches Carmen's known obfuscation \u2014 she was here within the last 12 blocks. [WALLET INTEL: suspect wallet holds exactly 2 assets on the ethereum network]",
        "Temple relay decrypted: full handshake captured. The custody transfer abort reveals a source address linked to Carmen's primary extraction network. [WALLET INTEL: suspect wallet has interacted with bridge contracts in the last 48 hours]",
      ],
    },
    1: {
      weak: [
        'Tokyo Tower beacon is noisy \u2014 too many signals overlapping to isolate anything useful. Standard broadcast interference.',
        'Beacon logs show routine traffic only. The signal router appears clean \u2014 this may be a decoy.',
      ],
      medium: [
        'Signal analysis reveals a repeating pattern: every 7 blocks, a micro-transaction pings this beacon. The sender wallet has ties to a known Carmen associate.',
        'Tokyo Tower beacon intercepted a burst transmission containing partial coordinates. Destination chain unclear \u2014 could be Paris or London.',
      ],
      strong: [
        'Tokyo Tower beacon intercepted a burst with partial coordinates. The destination chain resolves to another L2 network. [WALLET INTEL: suspect wallet contains WBTC among its holdings]',
        "Full burst decoded from Tower beacon: Carmen's relay signature confirmed. Transmission target locked. [WALLET INTEL: suspect wallet holds tokens on at least 2 different chains]",
      ],
    },
    2: {
      weak: [
        'Chochin Market swap volume is high but nothing stands out. Standard token churn across retail pairs.',
        'Market noise. The swap volume here is organic \u2014 no signs of manipulation.',
      ],
      medium: [
        'A swap pair was created and burned within 3 blocks \u2014 classic Carmen counter-forensics. The residual token dust points toward XDC Apothem.',
        'Chochin Market shows a micro-swap convergence pattern. Volume is suspicious but the final destination wallet is fully obscured.',
      ],
      strong: [
        'Chochin Market swap logs expose a layering scheme: thousands of micro-swaps converging into a single wallet. Volume matches a major asset extraction. [WALLET INTEL: the receiving wallet has assets on more than one chain]',
        "Market layering fully traced: swap convergence leads to a consolidation address. Carmen's extraction wallet identified. [WALLET INTEL: suspect wallet executed swaps through at least 3 DEX protocols]",
      ],
    },
  },
  // ── Ottawa (4216141) — Arbitrum Sepolia ──
  4216141: {
    0: {
      weak: [
        'Rideau Canal relay shows ice-cold traffic \u2014 nothing but routine Arbitrum heartbeats. The node appears dormant.',
        'Relay scan returned empty. The frozen canal masks any residual signals beneath layers of noise.',
      ],
      medium: [
        "Rideau Canal relay detected a brief thaw in encrypted traffic \u2014 a 3-block burst of bridge packets with non-standard headers. The timing aligns with Carmen's known transit windows.",
        'Canal relay intercepted partial bridge fragments. The origin chain is Arbitrum but the destination address self-destructed 2 blocks after creation.',
      ],
      strong: [
        "Rideau Canal relay fully decoded: bridge packets carry encoded wallet fragments routed through Ottawa. Carmen's relay signature confirmed in the packet headers. [WALLET INTEL: suspect wallet executed bridge transactions on Arbitrum in the last 24 hours]",
        "Full canal intercept: the thawed burst contains Carmen's extraction coordinates. The bridge destination resolves to a known staging wallet. [WALLET INTEL: suspect wallet holds ARB tokens and has pending bridge transfers]",
      ],
    },
    1: {
      weak: [
        'Parliament Hill beacon broadcasts within normal parameters. Standard government-band interference masking any useful signals.',
        'Encrypted bursts detected but they match known legislative traffic patterns \u2014 likely a false positive.',
      ],
      medium: [
        "Parliament Hill beacon intercepted a coded transmission using Carmen's known frequency-hopping pattern. The message is fragmented but suggests coordination with a node in London.",
        'Beacon signal analysis reveals a secondary encrypted channel hidden beneath official broadcasts. The channel went dark after 5 blocks.',
      ],
      strong: [
        "Parliament Hill beacon decoded: Carmen is using government-band frequencies to mask her relay coordination. Full transmission captured \u2014 she's coordinating a cross-chain extraction through Ottawa. [WALLET INTEL: suspect wallet received tokens from a Canadian-registered exchange contract]",
        "Beacon fully compromised: Carmen's frequency-hopping protocol mapped. She's using Parliament Hill as a signal repeater to coordinate with nodes in London and Tokyo. [WALLET INTEL: suspect wallet interacted with a known mixer contract in the last 48 hours]",
      ],
    },
    2: {
      weak: [
        'National Gallery vault shows standard custody operations. Art-world tokenization traffic is high but all signers are verified.',
        'Vault scan clean. No anomalous custody flows detected near the Gallery.',
      ],
      medium: [
        'National Gallery vault logged a rapid signer rotation \u2014 3 new keys added in a single block. One key traces to a wallet seen in Tokyo.',
        "Custody traffic spiking at the Gallery. Someone is pre-staging assets through a multi-sig with an unusual 2/7 threshold \u2014 matches Carmen's paranoid operational security.",
      ],
      strong: [
        "National Gallery vault breached: Carmen's multi-sig wallet identified among the new signers. She's using art tokenization as cover to consolidate extracted assets. [WALLET INTEL: suspect wallet holds NFT-standard tokens alongside fungible assets]",
        "Full vault analysis: Carmen staged 4 high-value custody transfers through the Gallery in a single block window. Destination wallets mapped across 3 chains. [WALLET INTEL: suspect wallet approved multi-sig operations on at least 2 chains simultaneously]",
      ],
    },
  },
  // ── London (97) — BNB Testnet ──
  97: {
    0: {
      weak: [
        'Big Ben relay ticks with metronomic BNB heartbeats. No deviation from standard traffic patterns.',
        'Relay scan nominal. The ancient relay beneath Big Ben shows no signs of tampering.',
      ],
      medium: [
        'Big Ben relay detected irregular timing \u2014 every 13th block carries an oversized packet. The payload is encrypted but the cadence matches a known Carmen dead-drop protocol.',
        'BNB ingress at the Big Ben relay spiked 400% for exactly 3 blocks before returning to baseline. Someone tested a high-volume bridge and aborted.',
      ],
      strong: [
        "Big Ben relay cracked: the oversized 13th-block packets contain wallet fragments. Carmen is using the relay's trusted timing to embed extraction coordinates in BNB heartbeats. [WALLET INTEL: suspect wallet holds BNB and has interacted with PancakeSwap contracts]",
        "Full relay decode: Carmen's dead-drop protocol mapped. Each 13th block contains a fragment of her extraction wallet's private metadata. Reconstruction possible with 3 more fragments. [WALLET INTEL: suspect wallet executed BNB bridge transactions in the last 12 hours]",
      ],
    },
    1: {
      weak: [
        'Buckingham Palace beacon shows encrypted signals but they match known royal security frequencies. Likely a false alarm.',
        'Beacon monitoring returned classified-band noise. No actionable intel distinguishable from background.',
      ],
      medium: [
        "Palace beacon intercepted a transmission aimed at a relay in Paris. The signal strength suggests a directional broadcast \u2014 Carmen's operatives use focused beams to avoid detection.",
        'Encrypted signals from behind palace walls decoded partially: coordinate pairs embedded in the signal phase. Destination chain unclear but timing matches the Ottawa intercept.',
      ],
      strong: [
        "Buckingham Palace beacon fully decoded: Carmen is using royal security frequencies as carrier waves for her relay coordination. Target identified \u2014 she's directing asset flow to BNB chain. [WALLET INTEL: suspect wallet holds BUSD or BSC-pegged stablecoins]",
        "Palace transmission intercepted and triangulated: Carmen's signal points directly to a BNB vault contract. Relay coordination with at least 3 other cities confirmed. [WALLET INTEL: suspect wallet has cross-chain approval pending on BNB Bridge]",
      ],
    },
    2: {
      weak: [
        'London Eye vault cycles show standard custody flows. Assets rotating through the Eye match known DeFi protocols.',
        'Vault operations nominal. The Eye completes its rotation cycle without anomalous signer activity.',
      ],
      medium: [
        "London Eye vault flagged a custody anomaly: assets staged for exit through an unusual time-locked contract. The lock expires in exactly 42 blocks \u2014 Carmen's signature number.",
        'Eye vault detected a phantom signer \u2014 a wallet that approved a custody transfer without leaving any on-chain trace of its creation. Ghost wallet pattern.',
      ],
      strong: [
        "London Eye vault fully compromised: Carmen's time-locked extraction contract identified. She staged assets for exit in exactly 42 blocks. The vault holds the final piece of her BNB extraction puzzle. [WALLET INTEL: suspect wallet created a time-locked contract with a 42-block expiry]",
        "Eye vault signer unmasked: the phantom wallet traces back to a known Carmen associate. Full custody chain mapped from London to Sydney. [WALLET INTEL: suspect wallet holds assets staged across BNB and XDC chains simultaneously]",
      ],
    },
  },
  // ── Shanghai (98) — BNB Testnet ──
  98: {
    0: {
      weak: [
        'Oriental Pearl relay broadcasting standard BNB traffic. Cross-chain drift is within normal parameters for this time of day.',
        'Relay scan clean. The Oriental Pearl shows no deviation from expected broadcast patterns.',
      ],
      medium: [
        'Oriental Pearl relay detected cross-chain drift exceeding 3 standard deviations. Someone is injecting packets into the broadcast stream \u2014 the injection pattern matches a known Carmen tool.',
        "Pearl relay intercepted a rapid-fire sequence of micro-bridges. Each bridge carries exactly 0.001 BNB \u2014 Carmen's dust-trail technique for mapping extraction routes.",
      ],
      strong: [
        "Oriental Pearl relay decoded: Carmen's packet injection fully captured. She's mapping a BNB-to-Arbitrum extraction corridor through Shanghai. The dust-trail resolves to a staging wallet. [WALLET INTEL: suspect wallet sent exactly 0.001 BNB in more than 20 consecutive transactions]",
        "Full Pearl intercept: Carmen's extraction corridor mapped from Shanghai to 4 other cities. Micro-bridge convergence confirms active asset staging. [WALLET INTEL: suspect wallet holds BEP-20 tokens from at least 3 different protocols]",
      ],
    },
    1: {
      weak: [
        'Shanghai Tower node shows data spikes but they correlate with market hours. Likely legitimate high-frequency trading.',
        'Node traffic at the Tower is dense but organic. No clear anomaly signatures detected.',
      ],
      medium: [
        "Shanghai Tower node flagged: data spikes contain embedded steganographic data \u2014 wallet addresses hidden in gas price decimals. The encoding matches Carmen's signature.",
        'Tower node analysis reveals a shadow transaction layer running parallel to legitimate trades. The shadow layer processes exactly one transaction per block.',
      ],
      strong: [
        "Shanghai Tower node compromised: Carmen's steganographic layer fully decoded. Wallet addresses extracted from gas price decimals. The stolen NFT trail leads directly through this node. [WALLET INTEL: suspect wallet interacted with NFT marketplace contracts on BNB chain]",
        "Tower shadow layer mapped: Carmen is using legitimate trading noise as cover for a systematic asset extraction. Every shadow transaction routes to the same consolidation wallet. [WALLET INTEL: suspect wallet holds both NFTs and fungible tokens on BNB chain]",
      ],
    },
    2: {
      weak: [
        'The Bund market routing is heavy but consistent with Shanghai trading hours. No suspicious liquidity anomalies.',
        'Market scan nominal at the Bund. High volume but all swap pairs check out against known protocol pools.',
      ],
      medium: [
        'Bund market detected suspicious liquidity loops \u2014 assets cycling through 5 swap pairs in a circle, each loop gaining exactly 0.01%. Classic Carmen wash-trading pattern.',
        "Heavy market routing at the Bund masks a deeper pattern: someone is building a synthetic position across 3 DEXes simultaneously. The coordination speed suggests Carmen's MEV bot.",
      ],
      strong: [
        "Bund market liquidity loops cracked: Carmen's wash-trading cycle fully mapped. Each loop launders a fragment of the stolen assets through BNB pools. Final destination wallet identified. [WALLET INTEL: suspect wallet provided liquidity to at least 3 DEX pools in the last 24 hours]",
        "Full market forensics at the Bund: Carmen's synthetic position decoded. She's using cross-DEX arbitrage to convert stolen assets into stablecoins. Conversion wallet traced. [WALLET INTEL: suspect wallet holds USDT on BNB chain \u2014 likely from asset conversion]",
      ],
    },
  },
  // ── Reykjav\u00edk (99) — BNB Testnet ──
  99: {
    0: {
      weak: [
        'Hallgr\u00edmskirkja node shows faint BNB transmissions masked by auroral interference. Signal too weak to isolate.',
        'Northern aurora blankets the signal spectrum. Any useful intel is buried beneath geomagnetic noise.',
      ],
      medium: [
        "Hallgr\u00edmskirkja node detected a burst that cuts through the aurora \u2014 the signal frequency is precisely tuned to avoid geomagnetic interference. Only Carmen's custom transmitter operates at this frequency.",
        'Node analysis reveals a repeating 7-block signal pattern hidden in the auroral noise. The pattern encodes geographic coordinates pointing toward London.',
      ],
      strong: [
        "Hallgr\u00edmskirkja node decoded: Carmen is exploiting aurora-band frequencies to transmit undetected. Full coordinate set extracted \u2014 she's coordinating BNB movements from Iceland to London. [WALLET INTEL: suspect wallet sent transactions during extreme geomagnetic activity windows only]",
        "Aurora-band transmission cracked: Carmen's Reykjav\u00edk relay is a critical hub in her Nordic extraction network. All signals route through Hallgr\u00edmskirkja before reaching continental nodes. [WALLET INTEL: suspect wallet has a recurring 7-block transaction pattern on BNB chain]",
      ],
    },
    1: {
      weak: [
        'Harpa Concert relay shows cross-chain flows but they match known BNB liquidity provider patterns. Likely legitimate.',
        'Relay monitoring at Harpa returned cold results. The concert hall acoustics may be interfering with signal capture.',
      ],
      medium: [
        'Harpa relay detected harmonic interference in the cross-chain flow \u2014 someone is embedding data in the BNB packet timing. The harmonic frequency matches a known Carmen cipher.',
        'Concert relay intercepted a coded burst aimed at the Eiffel Tower relay. The signal carries partial wallet fragments encrypted with an unknown key.',
      ],
      strong: [
        "Harpa Concert relay decoded: Carmen's cipher cracked using harmonic analysis. She's encoding wallet fragments in BNB timing patterns. Full fragment set extracted. [WALLET INTEL: suspect wallet holds tokens that were bridged from BNB to Ethereum in the last 48 hours]",
        "Full Harpa intercept: Carmen's Nordic relay chain mapped. Reykjav\u00edk \u2192 London \u2192 Paris. Concert hall acoustics actually amplify her signal \u2014 she chose this location deliberately. [WALLET INTEL: suspect wallet executed exactly 3 bridge operations in the last 72 hours]",
      ],
    },
    2: {
      weak: [
        'Blue Lagoon vault shows thermal activity masking the signal layer. Geothermal cover too dense to penetrate.',
        'Vault scan at the Blue Lagoon returned steamy interference. No clear custody flows discernible.',
      ],
      medium: [
        "Blue Lagoon vault flagged: geothermal energy spikes correlate with BNB custody operations. Someone is using Iceland's cheap power to run a hidden validation node.",
        'Lagoon vault detected asset laundering through thermal noise \u2014 transactions are timed to coincide with geyser eruptions, creating plausible interference cover.',
      ],
      strong: [
        "Blue Lagoon vault exposed: Carmen is running a hidden BNB validator beneath the geothermal plant. The validator processes laundered assets during geyser eruptions for cover. [WALLET INTEL: suspect wallet is associated with a validator node on BNB chain]",
        "Full Lagoon forensics: Carmen's geothermal laundering operation mapped. Assets flow in cold, emerge clean through the thermal validator. Extraction wallet identified. [WALLET INTEL: suspect wallet received staking rewards from a BNB validator in the last 24 hours]",
      ],
    },
  },
  // ── Paris (84532) — Base Sepolia ──
  84532: {
    0: {
      weak: [
        'Eiffel relay shows standard bridge traffic. Nothing anomalous in the current scan window.',
        'Beacon monitoring returned nominal results. Traffic appears clean at this time.',
      ],
      medium: [
        'Monitoring data shows a custody pre-staging event. Someone moved a significant payload through this beacon \u2014 the gas pattern is identical to the Tokyo extraction.',
        'Eiffel relay captured bridge ingress from multiple L2 chains. Cross-referencing shows flagged address proximity but no direct match.',
      ],
      strong: [
        "Eiffel relay captured bridge ingress from three separate L2 chains in a 5-block window. Two flagged addresses confirmed \u2014 Carmen's network is active in Paris. [WALLET INTEL: suspect wallet holds 3 or more ethereum-based assets]",
        "Full bridge analysis complete: Eiffel relay ingress points trace directly to Carmen's operational cluster. Extraction route mapped. [WALLET INTEL: suspect wallet received a cross-chain transfer in the last 24 hours]",
      ],
    },
    1: {
      weak: [
        'Louvre custody router processed routine vault operations. Signer addresses are all known entities \u2014 nothing suspicious.',
        'Custody logs reveal routine operations. The vault has not been accessed by flagged addresses recently.',
      ],
      medium: [
        'Vault staging detected \u2014 assets are being consolidated here from multiple chains. The aggregation pattern suggests an imminent large transfer. Carmen is preparing something.',
        'Louvre router processed a high-value operation with multi-sig approval. One signer is unfamiliar but the trail goes cold after 2 hops.',
      ],
      strong: [
        'Louvre custody router processed a high-value vault operation: multi-sig 3/5 threshold. One signer maps to a wallet seen at Senso-ji Temple Node. [WALLET INTEL: suspect wallet does NOT hold any XDC tokens]',
        "Vault signer fully identified: multi-sig key traces back to Carmen's known custodial setup. Asset staging confirmed. [WALLET INTEL: suspect wallet approved a multi-sig transaction within the last 10 blocks]",
      ],
    },
    2: {
      weak: [
        'Notre-Dame gate traffic is heavy but appears organic. No anomalous patterns detected in this scan window.',
        'Gate relay shows standard Base traffic convergence. Volume is expected for this time of day.',
      ],
      medium: [
        'Bridge relay detected an unusual gas spike: someone overpaid by 300% to embed metadata in the transaction. Decoded fragments contain encrypted coordinates.',
        'Notre-Dame gate funneled traffic from multiple origin chains. Convergence timing is suspicious but could be coincidental network congestion.',
      ],
      strong: [
        "Notre-Dame gate funneled Base traffic from 4 distinct origin chains. Convergence timing aligns with Carmen's known movement windows \u2014 she uses the noise as cover. [WALLET INTEL: suspect wallet holds USDC \u2014 likely used for stable-value extraction]",
        "Gate analysis complete: convergence pattern decoded. Carmen's cover traffic identified and filtered. [WALLET INTEL: suspect wallet holds stablecoins across 2 or more chains]",
      ],
    },
  },
  // ── Rome (845321) — Base Sepolia ──
  845321: {
    0: {
      weak: [
        'Saint Peter relay shows standard Base hops. The Vatican-band frequencies carry only routine traffic.',
        'Relay scan at Saint Peter returned empty. Holy interference masks any useful signals.',
      ],
      medium: [
        "Saint Peter relay detected rapid Base hops stacking 5 deep in a single block \u2014 someone is stress-testing the relay's throughput. The test pattern matches Carmen's pre-extraction reconnaissance.",
        'Relay intercepted a burst aimed at Notre-Dame gate in Paris. The signal carries partial routing tables for a multi-city extraction network.',
      ],
      strong: [
        "Saint Peter relay compromised: Carmen's pre-extraction stress test decoded. She's testing maximum throughput for a massive asset extraction through Base Sepolia. Rome is a critical node. [WALLET INTEL: suspect wallet sent more than 5 transactions in a single Base block]",
        "Full relay analysis: Carmen is routing her entire European extraction network through Saint Peter. The relay connects Rome \u2192 Paris \u2192 London in a triangular pattern. [WALLET INTEL: suspect wallet holds Base-native tokens and has pending L2 withdrawals]",
      ],
    },
    1: {
      weak: [
        'Colosseum beacon echoes with standard signal traffic. The ancient amphitheatre produces too much acoustic interference for clean capture.',
        'Beacon scan at the Colosseum returned only echo artifacts. No clear signal isolated.',
      ],
      medium: [
        "Colosseum beacon flagged: signal echoes contain a hidden data layer \u2014 the amphitheatre's acoustics actually amplify a specific frequency used by Carmen's relays.",
        'Beacon analysis reveals the theft trail passes through the Colosseum. Cross-referencing timestamps with the Tokyo intercept shows coordinated activity across continents.',
      ],
      strong: [
        "Colosseum beacon decoded: Carmen deliberately chose this location \u2014 the amphitheatre acoustics amplify her relay signal by 300%. Full transmission captured. [WALLET INTEL: suspect wallet interacted with contracts on both Base and Arbitrum in the same hour]",
        "Full Colosseum intercept: Carmen's European signal network mapped. The beacon coordinates with Parliament Hill in Ottawa and Shanghai Tower. Tri-continental extraction confirmed. [WALLET INTEL: suspect wallet executed cross-chain swaps through Base bridge contracts]",
      ],
    },
    2: {
      weak: [
        'Trevi Fountain vault shows standard custody flows. Asset exports within normal parameters.',
        'Vault operations at Trevi are routine. Coins tossed in generate more noise than the custody transactions.',
      ],
      medium: [
        "Trevi vault detected asset staging \u2014 someone is consolidating tokens from 4 chains into a single vault address. The aggregation speed suggests Carmen's automated pipeline.",
        "Custody spike at Trevi: a new multi-sig vault was created with non-standard threshold (1/13). Carmen's lucky numbers pattern detected.",
      ],
      strong: [
        "Trevi Fountain vault cracked: Carmen's 1/13 multi-sig is a single-signer vault disguised as multi-party custody. She's the only keyholder. Full asset inventory extracted. [WALLET INTEL: suspect wallet is the sole signer on a multi-sig vault holding assets from 4 chains]",
        "Full Trevi forensics: Carmen's Roman vault holds consolidated assets from her entire European operation. Export routes mapped to Sydney and Rio. [WALLET INTEL: suspect wallet approved vault operations with only 1 of 13 required signatures]",
      ],
    },
  },
  // ── Sydney (51) — XDC Apothem ──
  51: {
    0: {
      weak: [
        'Opera House node shows routine XDC traffic. Nothing definitively anomalous.',
        'Node traffic appears legitimate. Patterns are consistent with standard XDC activity.',
      ],
      medium: [
        "Opera House node analysis reveals a phantom wallet placing identical orders across 4 chains simultaneously. The timing precision is sub-block \u2014 only Carmen's custom MEV bot operates this fast.",
        'Node shows deliberate gas mispricing on cross-chain swaps. The pattern is suspicious but the trail fragments after the first hop.',
      ],
      strong: [
        "Opera House node processed high-frequency cross-chain swaps with deliberately mismatched gas pricing. The arbitrage pattern is a known Carmen laundering technique. [WALLET INTEL: suspect wallet holds exactly 1 asset on the ethereum network]",
        "Node forensics complete: Carmen's laundering cycle fully mapped. Micro-trade convergence leads to extraction wallet. [WALLET INTEL: suspect wallet performed more than 10 swaps in the last 50 blocks]",
      ],
    },
    1: {
      weak: [
        'Harbour Bridge relay broadcasts are within normal parameters. Standard network synchronization signals.',
        'Relay monitoring shows nothing actionable. Signal strength is too low to extract meaningful data.',
      ],
      medium: [
        "Relay signal analysis detected a hidden data layer beneath routine XDC heartbeat pings. The steganographic encoding matches Carmen's signature.",
        'Harbour Bridge relay intercepted encrypted bursts aimed at a relay. The signal carries fragmented data but the encryption key is unknown.',
      ],
      strong: [
        "Harbour Bridge relay intercepted encrypted burst transmissions aimed at another chain. The signal carries fragmented wallet signatures \u2014 Carmen is coordinating a multi-chain extraction. [WALLET INTEL: suspect wallet contains ARB tokens \u2014 likely bridged from Arbitrum]",
        "Full relay intercept decoded: Carmen's relay coordination protocol captured. Multi-chain extraction timeline confirmed. [WALLET INTEL: suspect wallet bridged tokens from Arbitrum within the last 72 hours]",
      ],
    },
    2: {
      weak: [
        'Bondi Beach market operations are routine. Custody logs show standard DeFi yield farming rebalances.',
        'Market access patterns look normal. No unusual activity detected.',
      ],
      medium: [
        "Market access logs show a signer rotation \u2014 one key was freshly generated 3 blocks before approval. The new signer's funding trail traces back to a known Carmen associate wallet.",
        'Bondi market logged a suspicious operation: token consolidation from multiple chains. The pattern is notable but partially obscured.',
      ],
      strong: [
        "Bondi Beach market logged an unusual custody op: a new multi-sig wallet seeded with tokens from 6 chains in a single block. Consolidation matches Carmen's pre-extraction staging. [WALLET INTEL: suspect wallet holds at least 2 assets with total value exceeding 50 units]",
        "Market fully compromised: Carmen's staging protocol confirmed. All 6 funding chains traced to origin wallets. [WALLET INTEL: suspect wallet created a new multi-sig address in the last 20 blocks]",
      ],
    },
  },
  // ── Nairobi (511) — XDC Apothem ──
  511: {
    0: {
      weak: [
        'National Park relay shows faint XDC ingress masked by wildlife telemetry data. Signal indistinguishable from background.',
        'Relay scan at the park returned only GPS collar pings. No actionable blockchain traffic isolated.',
      ],
      medium: [
        "National Park relay detected XDC ingress hidden within wildlife tracking data. The bandwidth spikes correlate with Carmen's known data-hiding technique \u2014 she embeds packets in IoT telemetry streams.",
        'Park relay flagged: a secondary data channel runs parallel to animal tracking. The channel transmits encrypted wallet metadata every 11 blocks.',
      ],
      strong: [
        "National Park relay decoded: Carmen is piggybacking on wildlife telemetry to transmit XDC wallet data undetected. Full metadata extracted from the IoT stream. [WALLET INTEL: suspect wallet interacted with XDC DeFi protocols in the last 24 hours]",
        "Full park intercept: Carmen's IoT piggyback network mapped across East Africa. The wildlife telemetry carries encrypted extraction coordinates targeting Sydney. [WALLET INTEL: suspect wallet holds XDC tokens and has pending DeFi positions]",
      ],
    },
    1: {
      weak: [
        'Giraffe Centre beacon shows standard XDC pings. The signal router operates within expected parameters.',
        "Beacon monitoring nominal at the Giraffe Centre. The thief's route does not visibly pass through here.",
      ],
      medium: [
        "Giraffe Centre beacon intercepted a directional burst aimed at the Harbour Bridge relay in Sydney. The signal carries Carmen's relay handshake signature.",
        'Beacon flagged: a hidden signal layer uses giraffe feeding schedules as timing markers for encrypted packet bursts. The correlation is too precise to be coincidental.',
      ],
      strong: [
        "Giraffe Centre beacon fully compromised: Carmen is using animal feeding schedules as a covert clock for her relay network. Full handshake captured \u2014 the route passes directly through Nairobi. [WALLET INTEL: suspect wallet transacted with XDC bridge contracts linking to Arbitrum]",
        "Full beacon decode: Carmen's Nairobi relay is a critical junction between African and Pacific nodes. Asset flow mapped: Nairobi \u2192 Sydney \u2192 Tokyo. [WALLET INTEL: suspect wallet has active positions on XDC that were funded from a cross-chain bridge]",
      ],
    },
    2: {
      weak: [
        'National Museum vault shows standard custody operations. No anomalous activity detected in the artifact tokenization layer.',
        'Vault scan at the museum returned routine DeFi rebalances. Nothing out of the ordinary.',
      ],
      medium: [
        "Museum vault flagged: asset staging detected in the artifact tokenization layer. Someone is minting synthetic tokens backed by real-world artifacts \u2014 Carmen's known monetization strategy.",
        'Custody flows spike near the museum. A burst of 7 vault operations in 2 blocks suggests automated staging \u2014 consistent with pre-extraction behavior.',
      ],
      strong: [
        "National Museum vault breached: Carmen is monetizing stolen digital artifacts through XDC tokenization. Synthetic tokens traced back to assets extracted from Rome and London. [WALLET INTEL: suspect wallet minted synthetic tokens on XDC backed by cross-chain collateral]",
        "Full museum forensics: Carmen's artifact monetization pipeline mapped. She converts stolen assets into museum-grade synthetic tokens for clean liquidation. [WALLET INTEL: suspect wallet holds synthetic asset tokens on XDC with total collateral from 3 chains]",
      ],
    },
  },
  // ── Rio de Janeiro (512) — XDC Apothem ──
  512: {
    0: {
      weak: [
        'Cristo Redentor node shows faint XDC traffic flares after sunset. Too intermittent to analyze meaningfully.',
        'Node scan at Cristo returned atmospheric noise. The elevation interferes with clean signal capture.',
      ],
      medium: [
        "Cristo Redentor node detected nighttime XDC flares that encode geographic coordinates. The coordinates point to Copacabana \u2014 Carmen's operatives may be nearby.",
        'Node flagged: nighttime traffic spikes carry steganographic data in the gas price field. The encoding matches the pattern seen at Shanghai Tower.',
      ],
      strong: [
        "Cristo Redentor node decoded: Carmen's nighttime transmissions fully captured. She uses the statue's elevation as a signal amplifier to reach Pacific relay nodes. [WALLET INTEL: suspect wallet executed XDC transactions exclusively during nighttime blocks (UTC-3)]",
        "Full Cristo intercept: Carmen's South American relay hub identified. Nighttime flares coordinate with dawn transmissions in Sydney. Full extraction timeline mapped. [WALLET INTEL: suspect wallet holds XDC with transaction patterns matching a 12-hour day/night cycle]",
      ],
    },
    1: {
      weak: [
        'Copacabana vault shows standard custody flows. Pool-side token operations within normal parameters.',
        'Vault scan at Copacabana Palace returned routine results. Luxury-tier custody traffic is high but all verified.',
      ],
      medium: [
        "Copacabana vault flagged: custody flows pooling near the Palace suggest asset consolidation. The consolidation pattern matches Carmen's known pre-exit staging.",
        "Vault detected a phantom signer with freshly minted keys \u2014 the key generation timestamp is exactly 42 blocks old. Carmen's signature number again.",
      ],
      strong: [
        "Copacabana vault compromised: Carmen's 42-block phantom key traced to a custody operation worth significant XDC value. She's preparing a major South American extraction. [WALLET INTEL: suspect wallet created a new signing key exactly 42 blocks before a vault approval]",
        "Full Copacabana forensics: Carmen's Rio vault is the southern terminus of her extraction pipeline. Assets flow from Ottawa through London and Nairobi before arriving here. [WALLET INTEL: suspect wallet holds custody tokens with multi-chain provenance spanning 4 or more networks]",
      ],
    },
    2: {
      weak: [
        'Escadaria Selaron market shows colorful swap activity but nothing anomalous. Standard tourist-grade token trading.',
        'Market scan at Selaron returned organic volume. Swap pairs are consistent with legitimate local protocols.',
      ],
      medium: [
        'Selaron market detected a mosaic pattern in swap timing \u2014 transactions arranged to spell out an address when viewed chronologically. Classic Carmen artistic flair.',
        "Market flagged: someone is building a synthetic position across Rio's DEX ecosystem using 12 different token pairs. The complexity suggests Carmen's algorithm.",
      ],
      strong: [
        "Escadaria Selaron market decoded: Carmen's mosaic swap pattern spells out a wallet address. The destination wallet holds consolidated assets from her entire operation. [WALLET INTEL: suspect wallet received tokens from exactly 12 different swap pairs in a 24-hour window]",
        "Full Selaron forensics: Carmen's artistic swap algorithm mapped. She uses the mosaic pattern as a self-destruct trigger \u2014 once the address is spelled, the funds auto-bridge to a cold wallet. [WALLET INTEL: suspect wallet has pending auto-bridge transactions triggered by swap pattern completion]",
      ],
    },
  },
  // ── Santiago (80002) — Polygon Amoy ──
  80002: {
    0: {
      weak: [
        'Easter Island relay shows isolated Polygon traffic. The remote location makes signal analysis unreliable.',
        'Relay scan from Easter Island returned fragmented data. Pacific interference too strong for clean capture.',
      ],
      medium: [
        "Easter Island relay detected Polygon flows converging from 3 Pacific nodes. The convergence timing matches Carmen's known relay synchronization protocol.",
        'Relay flagged: moai-frequency transmissions carry encoded metadata. The ancient stone resonance is being exploited as a natural signal amplifier.',
      ],
      strong: [
        "Easter Island relay decoded: Carmen is using moai-frequency resonance to amplify Polygon relay signals across the Pacific. Full convergence pattern captured. [WALLET INTEL: suspect wallet interacted with Polygon bridge contracts targeting 3 different destination chains]",
        "Full Easter Island intercept: Carmen's Pacific relay network mapped. Easter Island serves as the central hub connecting Santiago, Sydney, and Tokyo. [WALLET INTEL: suspect wallet holds MATIC and has active bridge transfers pending on Polygon]",
      ],
    },
    1: {
      weak: [
        'Gran Torre node shows standard Polygon pings. The tower height provides good signal coverage but nothing anomalous detected.',
        'Node scan at Gran Torre returned routine traffic. Signal quality excellent but content unremarkable.',
      ],
      medium: [
        "Gran Torre node intercepted Polygon pings that align precisely with the suspect's known route through South America. Timing correlation is 94%.",
        'Tower node analysis reveals a shadow ping running 1 block behind the legitimate traffic. The shadow ping carries encrypted coordinate fragments.',
      ],
      strong: [
        "Gran Torre node cracked: Carmen's shadow ping protocol captured. She trails legitimate Polygon traffic by exactly 1 block, hiding her transmissions in the network echo. [WALLET INTEL: suspect wallet sends transactions exactly 1 block after a specific Polygon contract emits an event]",
        "Full Torre intercept: Carmen's Chilean relay maps her entire South American extraction network. Shadow pings coordinate with Easter Island and Copacabana. [WALLET INTEL: suspect wallet holds Polygon-native tokens and mirrors transaction patterns of a known contract]",
      ],
    },
    2: {
      weak: [
        'La Moneda vault shows standard government-grade custody operations. All signers verified and authorized.',
        'Vault scan at La Moneda returned clean results. Custody flows match expected sovereign asset patterns.',
      ],
      medium: [
        "La Moneda vault flagged: government-grade custody operations show a secondary layer \u2014 someone embedded unauthorized transactions within legitimate sovereign asset operations. Carmen's infiltration technique.",
        "Vault detected assets staged for exit through diplomatic-tier custody channels. The staging pattern matches Carmen's known use of government infrastructure as cover.",
      ],
      strong: [
        "La Moneda vault exposed: Carmen infiltrated sovereign custody operations to stage her extraction. She's using diplomatic immunity channels to bypass standard AML checks. [WALLET INTEL: suspect wallet transacted through a government-flagged custody contract on Polygon]",
        "Full La Moneda forensics: Carmen's sovereign custody exploit mapped. She embedded extraction transactions within legitimate government operations across 3 countries. [WALLET INTEL: suspect wallet has approval from a multi-sig controlled by a government-tier custody contract]",
      ],
    },
  },
  // ── Dakar (800021) — Polygon Amoy ──
  800021: {
    0: {
      weak: [
        'Renaissance Monument relay shows rising Polygon ingress but within expected parameters for the region.',
        'Relay scan at the Monument returned growing but organic Polygon traffic. No clear anomaly signatures.',
      ],
      medium: [
        "Renaissance Monument relay flagged: Polygon ingress rising 200% above baseline. The growth curve matches Carmen's known network expansion pattern \u2014 she's establishing a new relay node.",
        'Monument relay detected encoded metadata in rising Polygon traffic. The metadata contains partial wallet addresses that match fragments seen in Nairobi.',
      ],
      strong: [
        "Renaissance Monument relay decoded: Carmen is establishing a new West African relay node. Full expansion plan captured \u2014 Dakar connects to Nairobi and London in her African extraction network. [WALLET INTEL: suspect wallet funded a new contract deployment on Polygon in the last 48 hours]",
        "Full Monument intercept: Carmen's African network expansion mapped. Dakar is the western anchor, Nairobi the eastern. Asset flow between them is bidirectional and accelerating. [WALLET INTEL: suspect wallet deployed a new smart contract on Polygon with bridge capabilities]",
      ],
    },
    1: {
      weak: [
        'Goree Island node shows traffic spikes but they correlate with historical tourism data feeds. Likely legitimate.',
        'Node scan at Goree returned mixed signals. Historical data overlay makes blockchain traffic hard to isolate.',
      ],
      medium: [
        "Goree Island node flagged: traffic spikes contain a hidden layer that doesn't correlate with tourism \u2014 someone is using historical data feeds as cover for blockchain relay operations.",
        'Island node detected the stolen asset route passing through. Transaction timestamps align with ferry schedules \u2014 Carmen is timing her relay bursts to coincide with ferry crossings.',
      ],
      strong: [
        "Goree Island node compromised: Carmen uses ferry crossing schedules to time her relay bursts, creating plausible network interference cover. Full routing table extracted. [WALLET INTEL: suspect wallet transactions occur within a 5-minute window of specific real-world scheduled events]",
        "Full Goree intercept: Carmen's timing-based relay protocol mapped. She synchronizes with physical-world events across 4 cities to mask her blockchain activity. [WALLET INTEL: suspect wallet holds Polygon tokens transferred in precisely timed intervals matching an external schedule]",
      ],
    },
    2: {
      weak: [
        'Grand Mosque vault shows assets in staging but the custody pattern matches legitimate religious endowment flows.',
        'Vault scan at the Grand Mosque returned endowment-tier custody traffic. Nothing anomalous detected.',
      ],
      medium: [
        "Grand Mosque vault flagged: asset staging exceeds endowment volumes by 3x. Someone is layering extraction transactions beneath legitimate charitable custody flows.",
        "Vault detected a rapid signer addition \u2014 5 new keys in 2 blocks. The new signers' funding trails converge on a wallet seen at the Trevi Fountain vault in Rome.",
      ],
      strong: [
        "Grand Mosque vault exposed: Carmen is layering her extraction beneath charitable endowment flows. The stolen assets are disguised as legitimate custody operations. Signer wallet traced to Rome. [WALLET INTEL: suspect wallet added as signer to a custody vault in both Dakar and Rome within the same 24-hour window]",
        "Full Mosque forensics: Carmen's charitable-cover extraction mapped. She uses endowment-tier custody across religious and cultural institutions in 4 cities. [WALLET INTEL: suspect wallet is a signer on custody vaults across at least 3 different chains]",
      ],
    },
  },
  // ── Moscow (800022) — Polygon Amoy ──
  800022: {
    0: {
      weak: [
        'Red Square relay shows standard Polygon ingress. Heavy traffic but consistent with Moscow network density.',
        'Relay scan at Red Square returned dense but organic Polygon traffic. No deviation from expected patterns.',
      ],
      medium: [
        "Red Square relay detected rapidly rising Polygon ingress \u2014 the acceleration curve matches Carmen's known blitz protocol for establishing high-throughput relay corridors.",
        'Relay flagged: Polygon packets carry embedded Cyrillic-encoded metadata. The encoding is a double layer \u2014 Cyrillic characters map to wallet address bytes.',
      ],
      strong: [
        "Red Square relay compromised: Carmen's blitz protocol decoded. She established a high-throughput Polygon corridor through Moscow in under 10 blocks. Full corridor routing captured. [WALLET INTEL: suspect wallet executed more than 50 Polygon transactions in a 10-block window]",
        "Full Red Square intercept: Carmen's Cyrillic encoding cracked. Wallet addresses hidden in the metadata connect Moscow to Ottawa and Reykjav\u00edk in a northern extraction arc. [WALLET INTEL: suspect wallet holds MATIC bridged through 3 intermediate contracts before arriving at current address]",
      ],
    },
    1: {
      weak: [
        'Kremlin beacon shows encrypted traffic but it matches known government security frequencies. Likely institutional.',
        'Beacon scan at the Kremlin returned heavily encrypted signals. Cannot distinguish suspect traffic from official.',
      ],
      medium: [
        "Kremlin beacon intercepted: encrypted traffic contains a secondary layer that doesn't match government protocols. Someone is running a shadow relay on institutional frequencies.",
        'Beacon analysis reveals the suspect trail passes through the Kremlin. The shadow layer transmits wallet fragments every 13 blocks \u2014 matching the Big Ben pattern in London.',
      ],
      strong: [
        "Kremlin beacon decoded: Carmen's shadow relay exposed. She's exploiting government frequencies to run an undetectable relay network across Moscow, London, and Ottawa. [WALLET INTEL: suspect wallet transactions are always preceded by government-tier contract interactions on the same block]",
        "Full Kremlin intercept: Carmen's institutional-frequency network mapped. The 13-block fragment pattern connects Moscow \u2192 London \u2192 Ottawa in a coordinated extraction chain. [WALLET INTEL: suspect wallet operates within blocks that also contain high-value institutional transactions]",
      ],
    },
    2: {
      weak: [
        'Bolshoi Theatre vault shows standard custody operations. Cultural asset tokenization within normal parameters.',
        'Vault scan at the Bolshoi returned routine performance-linked custody flows. Nothing anomalous.',
      ],
      medium: [
        "Bolshoi vault flagged: assets staged for exit coincide with performance schedules. Carmen is timing custody operations to curtain calls \u2014 the network congestion from ticket sales provides cover.",
        'Vault detected unusual multi-sig activity: a 3/7 threshold with 4 newly generated signers. The key generation pattern mirrors the Trevi Fountain vault in Rome.',
      ],
      strong: [
        "Bolshoi Theatre vault exposed: Carmen times her custody operations to performance intermissions, using ticket-sale congestion as network cover. Full extraction schedule aligned with the opera calendar. [WALLET INTEL: suspect wallet executes high-value transactions during periods of peak network congestion]",
        "Full Bolshoi forensics: Carmen's cultural-institution vault network mapped. Bolshoi connects to the National Gallery in Ottawa and National Museum in Nairobi. [WALLET INTEL: suspect wallet is a signer on cultural-asset custody vaults across 3 continents]",
      ],
    },
  },
  // ── New York City (11155111) — Ethereum Sepolia ──
  11155111: {
    0: {
      weak: [
        'Liberty Island relay shows standard Ethereum ingress. Statue-band frequencies carry routine traffic.',
        'Relay scan at Liberty Island returned harbor noise. Ethereum packets indistinguishable from background.',
      ],
      medium: [
        'Liberty Island relay detected concentrated Ethereum ingress from 5 L2 chains simultaneously. The convergence timing is too precise for organic traffic \u2014 someone is coordinating.',
        "Relay flagged: harbor-frequency transmissions embed block hashes in tide-timing metadata. The encoding matches Carmen's oceanographic camouflage technique.",
      ],
      strong: [
        "Liberty Island relay decoded: Carmen's oceanographic camouflage cracked. She uses tidal timing to synchronize Ethereum L2 convergence at Liberty Island. Full coordination protocol captured. [WALLET INTEL: suspect wallet interacted with L2 bridge contracts on Ethereum for at least 3 different L2 chains]",
        "Full Liberty intercept: Carmen's US relay hub identified. Liberty Island coordinates with Central Park and Times Square in a Manhattan triangle. [WALLET INTEL: suspect wallet holds ETH and has pending L2 withdrawal proofs on Ethereum mainnet]",
      ],
    },
    1: {
      weak: [
        'Central Park beacon shows standard signal bursts. The park canopy interferes with directional analysis.',
        'Beacon scan at Central Park returned green noise. Signal ripples are consistent with environmental interference.',
      ],
      medium: [
        "Central Park beacon detected signal bursts that ripple outward in concentric patterns. The ripple frequency matches Carmen's known signal propagation technique.",
        'Beacon flagged: someone is using the park\'s mesh of IoT sensors as a distributed antenna array. Signal strength amplified 500% compared to a single transmitter.',
      ],
      strong: [
        "Central Park beacon cracked: Carmen converted the park's IoT sensor mesh into a distributed relay antenna. Full amplified transmission captured with wallet extraction coordinates. [WALLET INTEL: suspect wallet funded IoT-related contract interactions on Ethereum in the last 48 hours]",
        "Full Central Park intercept: Carmen's distributed antenna broadcasts to all 3 Manhattan nodes simultaneously. The mesh network provides redundant relay coverage. [WALLET INTEL: suspect wallet holds tokens from at least 3 different Ethereum DeFi protocols]",
      ],
    },
    2: {
      weak: [
        'Times Square market shows heavy liquidity routing but consistent with standard NYC trading volume.',
        'Market scan at Times Square returned intense but organic swap activity. Billboard noise masks any anomalies.',
      ],
      medium: [
        "Times Square market detected liquidity loops hidden in high-frequency billboard data feeds. Carmen is embedding swap instructions in the digital signage network.",
        'Market flagged: someone is front-running legitimate NYSE-correlated trades with micro-swaps that extract value through MEV. The MEV bot signature matches Tokyo.',
      ],
      strong: [
        "Times Square market decoded: Carmen's billboard-embedded swap network exposed. She controls liquidity routing through digital signage data feeds across Manhattan. [WALLET INTEL: suspect wallet executes MEV-style trades that correlate with NYSE trading hours]",
        "Full Times Square forensics: Carmen's NYC market manipulation mapped. She uses correlated trading across traditional and crypto markets to mask extraction flows. [WALLET INTEL: suspect wallet holds wrapped equity tokens alongside standard crypto assets on Ethereum]",
      ],
    },
  },
  // ── Mexico City (11155112) — Ethereum Sepolia ──
  11155112: {
    0: {
      weak: [
        'Bellas Artes relay shows Ethereum hops intensifying but the traffic matches cultural data feed patterns.',
        'Relay scan at Bellas Artes returned artistic-band noise. No actionable blockchain signals isolated.',
      ],
      medium: [
        'Bellas Artes relay detected Ethereum hops that encode mural-pixel coordinates in transaction nonces. The art-encoding technique points toward Carmen.',
        "Relay flagged: someone is using the Palace's cultural data feed as a carrier for encrypted blockchain relay signals. Bandwidth spikes correlate with exhibition hours.",
      ],
      strong: [
        "Bellas Artes relay decoded: Carmen encodes extraction coordinates as pixel positions in digitized murals. Full coordinate set extracted from Ethereum nonce data. [WALLET INTEL: suspect wallet transactions carry non-standard nonce patterns encoding geographic metadata]",
        "Full Bellas Artes intercept: Carmen's Mexican relay hub identified. Mural-encoded coordinates map an extraction route through Mexico City to Santiago and Rio. [WALLET INTEL: suspect wallet interacted with Ethereum contracts using sequentially encoded nonces in the last 72 hours]",
      ],
    },
    1: {
      weak: [
        'Chapultepec beacon shows standard Ethereum pings. The forest canopy degrades signal quality.',
        "Beacon scan at Chapultepec returned diffuse signals. The suspect's route is not clearly visible here.",
      ],
      medium: [
        "Chapultepec beacon intercepted a signal that bounces through the forest canopy in a specific pattern. The bounce path spells geographic coordinates \u2014 Carmen's arboreal encoding.",
        "Beacon flagged: the suspect's route demonstrably passes through Chapultepec. Signal analysis reveals a handshake with the Easter Island relay in Santiago.",
      ],
      strong: [
        "Chapultepec beacon compromised: Carmen's arboreal encoding decoded. Forest canopy bounce patterns map her complete Latin American relay network. [WALLET INTEL: suspect wallet coordinates transactions with contracts on both Ethereum and Polygon simultaneously]",
        "Full Chapultepec intercept: Carmen's Mexico City beacon links to Santiago and Dakar through a triangular relay pattern. Latin American extraction network fully mapped. [WALLET INTEL: suspect wallet holds tokens on Ethereum that were originally bridged from Polygon Amoy]",
      ],
    },
    2: {
      weak: [
        'Templo Mayor vault shows standard archaeological tokenization custody. Operations within expected parameters.',
        'Vault scan at Templo Mayor returned routine custody flows. Ancient artifact tokens trading normally.',
      ],
      medium: [
        "Templo Mayor vault flagged: archaeological tokens are being used as collateral for synthetic asset creation. The synthetic minting pattern matches Carmen's known monetization pipeline.",
        "Vault detected: assets possibly staged at Templo Mayor through an archaeological token wrapping scheme. The wrapper contract was deployed by a wallet linked to Carmen's Nairobi operation.",
      ],
      strong: [
        "Templo Mayor vault exposed: Carmen is wrapping archaeological tokens as collateral for a synthetic extraction pipeline. Wrapper contract traces to the same deployer as the National Museum vault in Nairobi. [WALLET INTEL: suspect wallet deployed token wrapper contracts on both Ethereum and XDC chains]",
        "Full Templo Mayor forensics: Carmen's archaeological monetization network spans Mexico City, Nairobi, and Rome. Cultural asset tokenization used to launder extraction proceeds. [WALLET INTEL: suspect wallet holds synthetic tokens backed by wrapped archaeological assets across 2 chains]",
      ],
    },
  },
  // ── Dubai (11155113) — Ethereum Sepolia ──
  11155113: {
    0: {
      weak: [
        'Burj Khalifa node shows Ethereum bursts but they align with standard exchange settlement windows.',
        'Node scan at Burj Khalifa returned high-altitude interference. Standard Ethereum traffic patterns.',
      ],
      medium: [
        "Burj Khalifa node detected Ethereum bursts aligned with the theft timeline. The burst frequency matches Carmen's known high-altitude relay technique from Tokyo Tower.",
        'Node flagged: someone is using the Burj\'s communication array to amplify Ethereum relay signals across the Persian Gulf. Signal reach extends to Nairobi and Moscow.',
      ],
      strong: [
        "Burj Khalifa node compromised: Carmen is using the world's tallest building as a relay amplifier. Her signal reaches 6 other cities from this single node. Full routing table captured. [WALLET INTEL: suspect wallet interacted with Ethereum contracts registered to Dubai-based entities]",
        "Full Burj intercept: Carmen's Dubai relay is the central hub of her Middle Eastern operation. It connects to Moscow, Nairobi, and Shanghai in a star topology. [WALLET INTEL: suspect wallet holds ETH with transaction patterns matching Dubai exchange settlement hours]",
      ],
    },
    1: {
      weak: [
        'Dubai Airport relay shows heavy cross-chain traffic but consistent with international transit volume.',
        'Relay scan at the airport returned dense but expected transfer activity. No clear anomaly isolated.',
      ],
      medium: [
        "Dubai Airport relay detected cross-chain transfers accelerating beyond transit-correlated baselines. Someone is using the airport's network infrastructure for unauthorized bridge operations.",
        "Airport relay flagged: bridge operations timed to coincide with international flight departures. Carmen is using boarding-gate congestion windows for high-volume transfers.",
      ],
      strong: [
        "Dubai Airport relay decoded: Carmen exploits international transit network infrastructure for bridge operations. Transfers timed to flight departures for maximum congestion cover. [WALLET INTEL: suspect wallet executes bridge transfers that correlate with international airline departure schedules]",
        "Full airport intercept: Carmen's transit-based bridge network mapped. She routes through Dubai, London, and Ottawa airports in a global transfer ring. [WALLET INTEL: suspect wallet has cross-chain bridge transactions spanning 4 or more networks within a 6-hour window]",
      ],
    },
    2: {
      weak: [
        'Dubai Mall market shows liquidity trails but consistent with luxury retail tokenization activity.',
        'Market scan at the Mall returned premium-tier trading noise. Standard luxury asset swap patterns.',
      ],
      medium: [
        "Dubai Mall market flagged: liquidity trails are fresh \u2014 someone is actively building positions in luxury asset tokens. The accumulation pattern matches Carmen's known pre-extraction hoarding.",
        "Market detected a flash loan cascade through 7 luxury token pools in a single block. The cascade complexity suggests Carmen's automated arbitrage system.",
      ],
      strong: [
        "Dubai Mall market exposed: Carmen's luxury token hoarding decoded. She's accumulating high-value tokenized assets across 7 pools for a coordinated liquidation. [WALLET INTEL: suspect wallet executed flash loans through at least 5 DeFi pools in a single transaction]",
        "Full Mall forensics: Carmen's luxury extraction mapped. She converts stolen crypto into tokenized luxury goods across Dubai, Paris, and Shanghai for untraceable liquidation. [WALLET INTEL: suspect wallet holds luxury-category tokenized assets on Ethereum with provenance from 3 different market protocols]",
      ],
    },
  },
}

// template clue generator for cities without custom data
function generateClueData(city) {
  const locations = city.cases
  const result = {}
  locations.forEach((loc, i) => {
    result[i] = {
      weak: [
        `${loc.name} shows routine ${city.chain} traffic. No actionable intel at this ${loc.type.toLowerCase()} node.`,
        `Scan returned nominal results at ${loc.name}. The trace is too degraded to analyze \u2014 could be anyone.`,
      ],
      medium: [
        `${loc.name} analysis reveals unusual timing patterns on ${city.chain}. Someone tested a transfer that was later aborted \u2014 the abort signature matches Carmen's operational style.`,
        `${city.name} ${loc.type.toLowerCase()} shows suspicious traffic spikes. Cross-referencing with known associates reveals flagged address proximity.`,
      ],
      strong: [
        `${loc.name} confirmed: Carmen's network is active at this ${loc.type.toLowerCase()} in ${city.name}. Flagged addresses routing through ${city.chain} in the last 48 blocks. [WALLET INTEL: suspect wallet holds tokens on at least 2 different chains]`,
        `Full analysis complete at ${loc.name}: Carmen's operational cluster identified on ${city.chain}. Extraction route mapped through ${city.name}. [WALLET INTEL: suspect wallet received a cross-chain transfer in the last 24 hours]`,
      ],
    }
  })
  return result
}

export function getMockClueData(cityId) {
  if (CUSTOM_CLUE_DATA[cityId]) return CUSTOM_CLUE_DATA[cityId]
  const city = CITY_POOL_MAP[cityId]
  if (!city) return {}
  return generateClueData(city)
}

// ─── Discovery algorithm ───
// Deterministic city revelation based on missionId and scanCount

function hashSeed(a, b) {
  let h = 0x811c9dc5
  const s = `${a}-${b}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function pickStartingCity(missionId) {
  const seed = hashSeed(missionId, 0)
  return CITY_POOL[seed % CITY_POOL.length].id
}

/**
 * Parse CSS coord string (e.g. '83%') to a number.
 * Falls back to 50 for unparseable values.
 */
function parseCoord(val) {
  if (typeof val !== 'string') return 50
  return parseFloat(val) || 50
}

/**
 * Euclidean distance between two cities based on their map coords.
 */
function cityDistance(a, b) {
  const ax = parseCoord(a.coords?.left), ay = parseCoord(a.coords?.top)
  const bx = parseCoord(b.coords?.left), by = parseCoord(b.coords?.top)
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/**
 * Pick up to 3 cities to reveal, sorted by proximity to originCityId.
 * Guarantees at least 1 never-scanned city when available.
 *
 * @param {number}   missionId      - current mission
 * @param {number}   scanCount      - deterministic seed offset
 * @param {number[]} excludeIds     - city IDs already on the map (discoveredCityIds)
 * @param {number}   originCityId   - city the player just scanned (proximity anchor)
 * @param {number[]} scannedIds     - all cities the player has ever scanned
 */
export function pickRevealedCities(missionId, scanCount, excludeIds, originCityId = null, scannedIds = []) {
  const seed = hashSeed(missionId, scanCount)
  const excluded = new Set(excludeIds)
  const scannedSet = new Set(scannedIds)

  const origin = originCityId ? CITY_POOL_MAP[originCityId] : null

  // all cities not currently on the map
  const candidates = CITY_POOL.filter((c) => !excluded.has(c.id))
  if (candidates.length === 0) return []

  // sort by proximity to origin city, with deterministic tiebreaker
  if (origin) {
    candidates.sort((a, b) => {
      const da = cityDistance(origin, a)
      const db = cityDistance(origin, b)
      if (Math.abs(da - db) > 1) return da - db
      return hashSeed(seed, a.id) - hashSeed(seed, b.id)
    })
  } else {
    candidates.sort((a, b) => hashSeed(seed, a.id) - hashSeed(seed, b.id))
  }

  // split into never-scanned and already-scanned
  const fresh = candidates.filter((c) => !scannedSet.has(c.id))
  const revisit = candidates.filter((c) => scannedSet.has(c.id))

  const result = []

  // guarantee at least 1 fresh city when available
  if (fresh.length > 0) {
    result.push(fresh.shift())
  }

  // fill remaining 2 slots from the full proximity-sorted list
  for (const c of candidates) {
    if (result.length >= 3) break
    if (result.some((r) => r.id === c.id)) continue
    result.push(c)
  }

  return result.slice(0, 3)
}

// ─── Country code lookup ───

const COUNTRY_CODES = {
  421614: 'JP', 4216141: 'CA', 97: 'GB', 98: 'CN', 99: 'IS', 971: 'DE',
  84532: 'FR', 845321: 'IT', 51: 'AU', 511: 'KE', 512: 'BR',
  80002: 'CL', 800021: 'SN', 800022: 'RU',
  11155111: 'US', 11155112: 'MX', 11155113: 'AE',
}

export function getCountryCode(cityId) {
  return COUNTRY_CODES[cityId] || 'XX'
}
