import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { ethers } from 'ethers'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// ============================================================
// CORS Configuration for IPFS
// ============================================================
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
    'https://ipfs.io',
    'https://cloudflare-ipfs.com',
    'https://gateway.pinata.cloud',
    'https://w3s.link',
    /https:\/\/.*\.ipfs\..*/, // Wildcard for IPFS subdomains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
app.use(express.json())

// ============================================================
// Contract Setup
// ============================================================
const RPC_URL = process.env.ALCHEMY_RPC_URL_SEPOLIA
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY
const PLAYER_REGISTRY_ADDRESS = process.env.PLAYER_REGISTRY_ADDRESS
const GAME_MASTER_ADDRESS = process.env.GAME_MASTER_ADDRESS

const provider = new ethers.JsonRpcProvider(RPC_URL)
const signer = new ethers.Wallet(PRIVATE_KEY, provider)

// PlayerRegistry ABI (minimal)
const PLAYER_REGISTRY_ABI = [
  'function registerPlayer(address playerAddress, string calldata nickname) external',
  'function getPlayerData(address playerAddress) external view returns (tuple(address wallet, string nickname, uint256 nonce, uint256 rank, bool registered))',
]

const playerRegistry = new ethers.Contract(
  PLAYER_REGISTRY_ADDRESS,
  PLAYER_REGISTRY_ABI,
  signer
)

// ============================================================
// Routes
// ============================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: 'sepolia',
    relayerAddress: signer.address,
  })
})

/**
 * Register player (gasless)
 * POST /relay
 * Body: { playerAddress, nickname, signature, nonce }
 */
app.post('/relay', async (req, res) => {
  try {
    const { playerAddress, nickname, signature, nonce } = req.body

    // Validate input
    if (!playerAddress || !nickname || !signature || nonce === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: playerAddress, nickname, signature, nonce',
      })
    }

    console.log(`[/relay] Registering player: ${playerAddress} with nickname: ${nickname}`)

    // Verify signature
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'string', 'uint256'],
      [playerAddress, nickname, nonce]
    )
    const recoveredAddress = ethers.recoverAddress(messageHash, signature)

    if (recoveredAddress.toLowerCase() !== playerAddress.toLowerCase()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid signature',
      })
    }

    console.log(`[/relay] Signature verified for ${playerAddress}`)

    // Call registerPlayer
    const tx = await playerRegistry.registerPlayer(playerAddress, nickname)
    const receipt = await tx.wait()

    console.log(`[/relay] Registration successful. Tx: ${receipt.hash}`)

    return res.json({
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      playerAddress,
      nickname,
    })
  } catch (error) {
    console.error('[/relay] Error:', error.message)
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get player data
 * GET /player/:address
 */
app.get('/player/:address', async (req, res) => {
  try {
    const { address } = req.params

    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address',
      })
    }

    const playerData = await playerRegistry.getPlayerData(address)

    return res.json({
      success: true,
      data: {
        wallet: playerData.wallet,
        nickname: playerData.nickname,
        nonce: playerData.nonce.toString(),
        rank: playerData.rank.toString(),
        registered: playerData.registered,
      },
    })
  } catch (error) {
    console.error('[/player] Error:', error.message)
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * Get relayer info
 * GET /info
 */
app.get('/info', (req, res) => {
  res.json({
    relayerAddress: signer.address,
    network: 'sepolia',
    playerRegistry: PLAYER_REGISTRY_ADDRESS,
    gameMaster: GAME_MASTER_ADDRESS,
    version: '1.0.0',
    ipfsCompatible: true,
  })
})

// ============================================================
// Error Handling
// ============================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  })
})

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Carmen Sandiego On-Chain — Chainlink Functions Relayer   ║
║  IPFS-Compatible Gasless Registration Server              ║
╚════════════════════════════════════════════════════════════╝

✅ Server running on port ${PORT}
🔗 Relayer address: ${signer.address}
📡 Network: Sepolia
🌐 IPFS compatible: Yes
📋 CORS enabled for IPFS gateways

Endpoints:
  GET  /health                    - Health check
  GET  /info                      - Relayer info
  POST /relay                     - Register player (gasless)
  GET  /player/:address           - Get player data

CORS Origins:
  - http://localhost:5173
  - http://localhost:3000
  - https://ipfs.io
  - https://cloudflare-ipfs.com
  - https://gateway.pinata.cloud
  - https://w3s.link
  - *.ipfs.* (wildcard)
`)
})
