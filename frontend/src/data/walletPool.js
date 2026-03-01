// ─── Wallet Pool — 25 deterministic wallets shared across the entire game ───
// Single source of truth for wallet addresses, aliases, assets, and NFTs.

// ── Deterministic helpers ──

function _hexFromSeed(val, length) {
  let hex = ''
  let h = (val >>> 0) || 1
  while (hex.length < length) {
    h = Math.imul(h, 0x5bd1e995) ^ (h >>> 15)
    hex += (h >>> 0).toString(16).padStart(8, '0')
  }
  return hex.slice(0, length)
}

function _seededRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function fnv1a(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// ── Constants ──

const CHAINS = [421614, 84532, 51, 97, 80002, 11155111]

const CHAIN_TOKENS = {
  421614: [
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'ARB', name: 'Arbitrum' },
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'LINK', name: 'Chainlink' },
  ],
  84532: [
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'USDC', name: 'USD Coin' },
    { symbol: 'DAI', name: 'Dai' },
    { symbol: 'cbETH', name: 'Coinbase ETH' },
  ],
  51: [
    { symbol: 'TXDC', name: 'XDC Network' },
    { symbol: 'SRX', name: 'StorX' },
    { symbol: 'PLI', name: 'Plugin' },
  ],
  97: [
    { symbol: 'BNB', name: 'BNB' },
    { symbol: 'CAKE', name: 'PancakeSwap' },
    { symbol: 'BUSD', name: 'Binance USD' },
    { symbol: 'XVS', name: 'Venus' },
  ],
  80002: [
    { symbol: 'MATIC', name: 'Polygon' },
    { symbol: 'USDT', name: 'Tether' },
    { symbol: 'AAVE', name: 'Aave' },
    { symbol: 'WETH', name: 'Wrapped ETH' },
  ],
  11155111: [
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'WBTC', name: 'Wrapped BTC' },
    { symbol: 'UNI', name: 'Uniswap' },
    { symbol: 'USDC', name: 'USD Coin' },
  ],
}

const ALIASES = [
  'ghost_trader', 'neon_viper', 'shadow_minter', 'cipher_whale', 'dark_relay',
  'frost_bridge', 'byte_runner', 'pulse_swapper', 'hex_phantom', 'void_signer',
  'chain_wraith', 'pixel_fox', 'nova_staker', 'drift_node', 'black_oracle',
  'zero_vault', 'flash_proxy', 'grim_deployer', 'silk_router', 'iron_mixer',
  'storm_yield', 'ruby_mev', 'onyx_burner', 'delta_wash', 'echo_forger',
]

const TAG_POOL = [
  'high-freq', 'cross-chain', 'bridge-user', 'mixer', 'deployer',
  'flash-loan', 'multi-sig', 'new-account', 'high-value', 'fee-recipient',
  'nft-trader', 'dao-voter', 'yield-farmer', 'mev-bot', 'whale',
]

const NFT_COLLECTIONS = [
  { collection: 'CryptoPunks', prefix: 'CryptoPunk' },
  { collection: 'BAYC', prefix: 'Bored Ape' },
  { collection: 'Azuki', prefix: 'Azuki' },
  { collection: 'Moonbirds', prefix: 'Moonbird' },
  { collection: 'Doodles', prefix: 'Doodle' },
  { collection: 'CloneX', prefix: 'Clone' },
]

// ── Generate 25 wallets ──

function generateWallet(id) {
  const address = '0x' + _hexFromSeed(id * 0x9e3779b9, 40)
  const rng = _seededRng(id * 7919 + 31)

  // tags: 1-3 tags
  const tagCount = 1 + Math.floor(rng() * 3)
  const tags = []
  const usedTags = new Set()
  for (let t = 0; t < tagCount; t++) {
    const idx = Math.floor(rng() * TAG_POOL.length)
    if (!usedTags.has(idx)) {
      usedTags.add(idx)
      tags.push(TAG_POOL[idx])
    }
  }

  // assets: 2-4 chains, 1-3 tokens per chain
  const chainCount = 2 + Math.floor(rng() * 3) // 2-4
  const shuffledChains = [...CHAINS].sort(() => rng() - 0.5)
  const selectedChains = shuffledChains.slice(0, chainCount)
  const assets = {}

  for (const chainId of selectedChains) {
    const tokens = CHAIN_TOKENS[chainId]
    const tokenCount = 1 + Math.floor(rng() * Math.min(3, tokens.length))
    const shuffledTokens = [...tokens].sort(() => rng() - 0.5)
    assets[chainId] = shuffledTokens.slice(0, tokenCount).map((tok) => ({
      symbol: tok.symbol,
      name: tok.name,
      amount: Math.round((rng() * 5000 + 0.01) * 100) / 100,
    }))
  }

  // nfts: most wallets have 0, some have 1-2
  const nftRoll = rng()
  const nftCount = nftRoll < 0.6 ? 0 : nftRoll < 0.85 ? 1 : 2
  const nfts = []
  for (let n = 0; n < nftCount; n++) {
    const col = NFT_COLLECTIONS[Math.floor(rng() * NFT_COLLECTIONS.length)]
    const tokenId = String(Math.floor(rng() * 9999) + 1)
    const chainId = CHAINS[Math.floor(rng() * CHAINS.length)]
    const stolen = rng() < 0.03
    const nft = {
      name: `${col.prefix} #${tokenId}`,
      collection: col.collection,
      tokenId,
      chainId,
      stolen,
    }
    if (stolen) {
      const stolenFrom = '0x' + _hexFromSeed(id * 997 + n * 43, 40)
      nft.stolenNote = `Reported stolen from ${stolenFrom.slice(0, 8)}...${stolenFrom.slice(-4)}`
    }
    nfts.push(nft)
  }

  return { id, address, alias: ALIASES[id], tags, assets, nfts }
}

export const WALLET_POOL = Array.from({ length: 25 }, (_, i) => generateWallet(i))

// ── Lookup maps ──

export const WALLET_BY_ADDRESS = new Map(WALLET_POOL.map((w) => [w.address.toLowerCase(), w]))

// ── Selection functions ──

export function getCarmenWalletIndex(missionId) {
  return fnv1a(missionId) % 25
}

export function getCarmenWallet(missionId) {
  return WALLET_POOL[getCarmenWalletIndex(missionId)]
}

export function getCarmenLocationIdx(missionId, numLocations) {
  const h = fnv1a(`carmen-loc-${missionId}`)
  return h % numLocations
}

export function getWalletByAddress(address) {
  if (!address) return null
  return WALLET_BY_ADDRESS.get(String(address).toLowerCase()) || null
}

/**
 * Pick 2 wallet indices for from/to of a normal transaction.
 * Excludes the Carmen wallet index to avoid accidental Carmen appearances.
 */
export function pickTxWallets(seed, excludeIndex) {
  const rng = _seededRng(seed)
  const candidates = []
  for (let i = 0; i < 25; i++) {
    if (i !== excludeIndex) candidates.push(i)
  }

  const fromIdx = Math.floor(rng() * candidates.length)
  const fromWalletIdx = candidates[fromIdx]
  candidates.splice(fromIdx, 1)

  const toIdx = Math.floor(rng() * candidates.length)
  const toWalletIdx = candidates[toIdx]

  return [WALLET_POOL[fromWalletIdx], WALLET_POOL[toWalletIdx]]
}
