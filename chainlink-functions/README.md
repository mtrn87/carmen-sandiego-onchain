# Chainlink Functions Relayer

Gasless registration relayer for Carmen Sandiego On-Chain game.

**📚 [Back to Documentation Index](../docs/INDEX.md)** | **[Deployment Guide](./RELAYER_DEPLOY_COOLIFY.md)**

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start relayer
npm start
```

Server will run on `http://localhost:3001`

### Environment Variables

Create a `.env` file:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your-private-key
PORT=3001
```

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "relayerAddress": "0x...",
  "network": "sepolia",
  "timestamp": "2026-02-19T18:30:00.000Z"
}
```

### POST /relay

Register a player (gasless).

**Request:**
```json
{
  "playerAddress": "0x...",
  "nickname": "PlayerName",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "blockNumber": 12345,
  "gasUsed": "150000",
  "message": "Player registered successfully"
}
```

## Deployment

### Docker

```bash
docker build -t relayer .
docker run -p 3001:3001 \
  -e SEPOLIA_RPC_URL=... \
  -e PLAYER_REGISTRY_ADDRESS=... \
  -e CHAINLINK_FUNCTIONS_PRIVATE_KEY=... \
  relayer
```

### Coolify

See [COOLIFY_DEPLOYMENT.md](./COOLIFY_DEPLOYMENT.md) for detailed instructions.

## Features

- ✅ Gasless player registration
- ✅ ECDSA signature validation
- ✅ Health check endpoint
- ✅ CORS enabled
- ✅ Error handling
- ✅ Logging
- ✅ Docker support
- ✅ Graceful shutdown

## Requirements

- Node.js 18+
- Sepolia RPC endpoint
- PlayerRegistry contract deployed
- Private key with funds for gas

## License

MIT
