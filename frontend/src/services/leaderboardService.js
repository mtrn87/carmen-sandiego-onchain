/**
 * Leaderboard Service — reads MissionNFT on-chain data to build rankings.
 *
 * Queries MissionNFTMinted events and getMissionRecord() to aggregate
 * player stats: total rewards, missions completed, average blocks, best time.
 */

import { ethers } from "ethers"
import MissionNFTArtifact from "../abi/MissionNFT.json"
import PlayerRegistryArtifact from "../abi/PlayerRegistry.json"

const MISSION_NFT_ADDRESS = import.meta.env.VITE_MISSION_NFT_ADDRESS
const PLAYER_REGISTRY_ADDRESS = import.meta.env.VITE_PLAYER_REGISTRY_ADDRESS
const RPC_URL = import.meta.env.VITE_ALCHEMY_RPC_URL_SEPOLIA || "https://rpc.sepolia.org"

/**
 * Fetch all MissionNFTMinted events and build leaderboard entries.
 * Falls back to mock data if contract is not deployed or no events found.
 *
 * @returns {Promise<Array<{address, nickname, missionsCompleted, totalReward, avgBlocks, bestBlocks, lastActive}>>}
 */
export async function fetchLeaderboardData() {
  // Try on-chain first
  if (MISSION_NFT_ADDRESS) {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const nft = new ethers.Contract(MISSION_NFT_ADDRESS, MissionNFTArtifact.abi, provider)

      // Query MissionNFTMinted events (last ~100k blocks to keep it fast)
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, currentBlock - 100000)

      const filter = nft.filters.MissionNFTMinted()
      const events = await nft.queryFilter(filter, fromBlock)

      if (events.length > 0) {
        return aggregateEvents(events, nft)
      }
    } catch (err) {
      console.warn("[LeaderboardService] On-chain query failed, using mock data:", err.message)
    }
  }

  // Return mock data for development / when no events exist
  return getMockLeaderboard()
}

/**
 * Aggregate MissionNFTMinted events into player stats.
 */
async function aggregateEvents(events, nftContract) {
  const playerMap = new Map()

  for (const event of events) {
    const { player, reward } = event.args
    const addr = player.toLowerCase()

    if (!playerMap.has(addr)) {
      playerMap.set(addr, {
        address: addr,
        missionsCompleted: 0,
        totalReward: 0n,
        totalBlocks: 0n,
        bestBlocks: null,
        lastTimestamp: 0,
      })
    }

    const entry = playerMap.get(addr)
    entry.missionsCompleted++
    entry.totalReward += reward

    // Try to get mission record for block details
    try {
      const tokenId = event.args.tokenId
      const record = await nftContract.getMissionRecord(tokenId)
      const blocksUsed = record.blocksUsed
      entry.totalBlocks += blocksUsed
      if (entry.bestBlocks === null || blocksUsed < entry.bestBlocks) {
        entry.bestBlocks = blocksUsed
      }
      if (Number(record.timestamp) > entry.lastTimestamp) {
        entry.lastTimestamp = Number(record.timestamp)
      }
    } catch {
      // record not available, skip block details
    }
  }

  // Enrich with PlayerRegistry nicknames and ranks if available
  const nicknames = await fetchPlayerNicknames(Array.from(playerMap.keys()))

  return Array.from(playerMap.values())
    .map((e) => ({
      address: e.address,
      nickname: nicknames[e.address]?.nickname || shortenAddress(e.address),
      rank: nicknames[e.address]?.rank ?? null,
      rankLabel: nicknames[e.address]?.rankLabel ?? null,
      missionsCompleted: e.missionsCompleted,
      totalReward: Number(e.totalReward),
      avgBlocks: e.missionsCompleted > 0 ? Math.round(Number(e.totalBlocks) / e.missionsCompleted) : 0,
      bestBlocks: e.bestBlocks !== null ? Number(e.bestBlocks) : null,
      lastActive: e.lastTimestamp > 0 ? new Date(e.lastTimestamp * 1000).toLocaleDateString() : "N/A",
    }))
    .sort((a, b) => b.totalReward - a.totalReward)
}

function shortenAddress(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4)
}

const RANK_LABELS = ['Rookie', 'Detective', 'Senior Detective', 'Inspector', 'Chief Inspector', 'Commissioner']

/**
 * Fetch nicknames and ranks from PlayerRegistry for a list of addresses.
 * Returns { [address]: { nickname, rank, rankLabel } }. Gracefully returns {} on failure.
 */
async function fetchPlayerNicknames(addresses) {
  if (!PLAYER_REGISTRY_ADDRESS || addresses.length === 0) return {}
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const registry = new ethers.Contract(PLAYER_REGISTRY_ADDRESS, PlayerRegistryArtifact.abi, provider)
    const results = await Promise.all(
      addresses.map(async (addr) => {
        try {
          const p = await registry.getPlayer(addr)
          if (p.wallet === ethers.ZeroAddress) return [addr, null]
          return [addr, { nickname: p.nickname, rank: Number(p.rank), rankLabel: RANK_LABELS[Number(p.rank)] || 'Unknown' }]
        } catch {
          return [addr, null]
        }
      })
    )
    return Object.fromEntries(results.filter(([, v]) => v !== null))
  } catch {
    return {}
  }
}

/**
 * Mock leaderboard for development when no on-chain data exists.
 */
function getMockLeaderboard() {
  return [
    { address: "0xca43e5a0d1e60000000000000000000000000001", nickname: "AgentZero", missionsCompleted: 12, totalReward: 1100, avgBlocks: 18, bestBlocks: 8, lastActive: "2026-02-24" },
    { address: "0xdec0100000000000000000000000000000000001", nickname: "CryptoHawk", missionsCompleted: 9, totalReward: 825, avgBlocks: 22, bestBlocks: 12, lastActive: "2026-02-23" },
    { address: "0xf00d3e0000000000000000000000000000000001", nickname: "ChainSleuth", missionsCompleted: 7, totalReward: 600, avgBlocks: 25, bestBlocks: 15, lastActive: "2026-02-22" },
    { address: "0xdec0200000000000000000000000000000000002", nickname: "ByteDetective", missionsCompleted: 5, totalReward: 450, avgBlocks: 28, bestBlocks: 19, lastActive: "2026-02-21" },
    { address: "0xdec0300000000000000000000000000000000003", nickname: "NeonTracer", missionsCompleted: 4, totalReward: 350, avgBlocks: 30, bestBlocks: 22, lastActive: "2026-02-20" },
    { address: "0xb41d63c000ace000000000000000000000000001", nickname: "BlockRunner", missionsCompleted: 3, totalReward: 250, avgBlocks: 32, bestBlocks: 25, lastActive: "2026-02-19" },
    { address: "0xcee0000000000000000000000000000000000001", nickname: "HashHunter", missionsCompleted: 2, totalReward: 175, avgBlocks: 35, bestBlocks: 30, lastActive: "2026-02-18" },
    { address: "0xfa415f00d3e00000000000000000000000000001", nickname: "NodeNinja", missionsCompleted: 1, totalReward: 100, avgBlocks: 15, bestBlocks: 15, lastActive: "2026-02-17" },
  ]
}
