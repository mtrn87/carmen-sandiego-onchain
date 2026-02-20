# Deployment Guide — Carmen Sandiego On-Chain

Complete guide to deploy the entire system locally and to testnet.

---

## Prerequisites

### System Requirements
- Node.js v18+ (LTS recommended)
- npm v9+ or yarn v3+
- Git
- 4GB RAM minimum
- 2GB disk space

### Accounts & API Keys
- **Privy Account** - https://privy.io (for authentication)
- **Alchemy Account** - https://www.alchemy.com (for RPC)
- **OpenAI Account** - https://openai.com (for AI clues)
- **ElevenLabs Account** - https://elevenlabs.io (for audio)
- **Pinata Account** - https://pinata.cloud (for IPFS)
- **Testnet ETH** - ~2 ETH on Sepolia (for deployment + gas)

### Testnet Faucets
- **Sepolia ETH** - https://sepoliafaucet.com
- **Arbitrum Sepolia ETH** - https://faucet.arbitrum.io
- **Base Sepolia ETH** - https://faucet.base.org

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/mtrn87/carmen-sandiego-onchain.git
cd carmen-sandiego-onchain
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# Or install per module
cd contracts && npm install
cd ../frontend && npm install
cd ../chainlink-functions && npm install
cd ../cre-workflows && npm install
```

### 3. Configure Environment Variables

#### Contracts (.env)

```bash
cd contracts
cp .env.example .env
```

Edit `contracts/.env`:
```
# Network RPC URLs
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ARBITRUM_SEPOLIA_RPC_URL=https://arbitrum-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Deployment wallet (must have testnet ETH)
PRIVATE_KEY=your_private_key_here

# Chainlink VRF
VRF_SUBSCRIPTION_ID=your_vrf_subscription_id
VRF_COORDINATOR_ADDRESS=0x9DdfaCa8183c41ad55329BdFFbaFa1D1CFA8cDA3

# Keystone
KEYSTONE_ROUTER_ADDRESS=0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3
```

#### Frontend (.env)

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:
```
VITE_PRIVY_APP_ID=your_privy_app_id
VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
VITE_ALCHEMY_RPC_URL_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
VITE_CHAINLINK_FUNCTIONS_URL=http://localhost:3001/relay
VITE_OPENAI_API_KEY=your_openai_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
```

#### Chainlink Functions Relayer (.env)

```bash
cd chainlink-functions
cp .env.example .env
```

Edit `chainlink-functions/.env`:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your_relayer_private_key
PORT=3001
```

#### CRE Workflows (.env)

```bash
cd cre-workflows
cp .env.example .env
```

Edit `cre-workflows/.env`:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ARBITRUM_SEPOLIA_RPC_URL=https://arbitrum-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
GAMEMASTER_ADDRESS=0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB
KEYSTONE_ROUTER_ADDRESS=0xc0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d3
OPENAI_API_KEY=your_openai_key
ELEVENLABS_API_KEY=your_elevenlabs_key
PINATA_API_KEY=your_pinata_key
PINATA_API_SECRET=your_pinata_secret
```

### 4. Compile Smart Contracts

```bash
cd contracts
npx hardhat compile
```

Expected output:
```
Compiled 8 Solidity files successfully
```

### 5. Run Tests

```bash
cd contracts
npx hardhat test
```

Expected output:
```
  GameMaster
    ✓ Should register player
    ✓ Should start mission
    ✓ Should submit investigation
    ✓ Should capture Carmen
    ...
  20 passing (2s)
```

### 6. Start Local Services

#### Terminal 1: Chainlink Functions Relayer

```bash
cd chainlink-functions
npm start
```

Expected output:
```
=== Chainlink Functions Relayer Server ===
✓ Server running on http://localhost:3001
✓ POST /relay - Relay registration requests
✓ GET /health - Health check

Waiting for requests...
```

#### Terminal 2: Frontend Development Server

```bash
cd frontend
npm run dev
```

Expected output:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

#### Terminal 3: CRE Workflows (Optional)

```bash
cd cre-workflows
npm run dev
```

### 7. Verify Local Setup

```bash
# Check relayer health
curl http://localhost:3001/health

# Expected response:
# {
#   "status": "ok",
#   "signer": "0xb19eE81581AE385F56D702d412D92d70fb65b9F7",
#   "balance": "0.45765073837728901",
#   "playerRegistry": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
# }
```

---

## Testnet Deployment

### 1. Deploy Smart Contracts

#### Deploy GameMaster to Sepolia

```bash
cd contracts
npx hardhat run scripts/deploy-gamemaster.ts --network sepolia
```

Expected output:
```
Deploying GameMaster...
✓ GameMaster deployed to: 0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB
✓ GameMasterProxy deployed to: 0x1Ced414A8eb7bbfc7d070259741Ee291a6c61fcb
✓ MissionNFT deployed to: 0xEaa76403a4d1448Df21946e886Cd4583a8bD580b
```

#### Deploy CityNode to Arbitrum Sepolia

```bash
npx hardhat run scripts/deploy-citynode.ts --network arbitrumSepolia
```

Expected output:
```
Deploying CityNode (Tokyo)...
✓ CityNode deployed to: 0x...
```

#### Deploy CityNode to Base Sepolia

```bash
npx hardhat run scripts/deploy-citynode.ts --network baseSepolia
```

#### Deploy PlayerRegistry to Sepolia

```bash
npx hardhat run scripts/deploy-playerregistry.ts --network sepolia
```

### 2. Configure VRF Subscription

1. Go to https://vrf.chain.link/sepolia
2. Create new subscription
3. Fund with testnet LINK
4. Add GameMaster contract as consumer
5. Update `VRF_SUBSCRIPTION_ID` in `.env`

### 3. Set GameMaster Role

```bash
cd contracts
npx hardhat run scripts/setGameMaster.js --network sepolia
```

This sets the relayer wallet as GameMaster so it can call `registerPlayer()`.

### 4. Deploy Frontend

#### Option A: Vercel (Recommended)

```bash
cd frontend
npm install -g vercel
vercel
```

Follow prompts to deploy.

#### Option B: Manual Deployment

```bash
cd frontend
npm run build
# Upload dist/ folder to your hosting provider
```

### 5. Deploy CRE Workflows

```bash
cd cre-workflows
npm run deploy
```

Follow CRE CLI prompts to deploy workflows.

### 6. Verify Testnet Deployment

```bash
# Check contract deployment
npx hardhat verify --network sepolia 0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB

# Check relayer
curl http://localhost:3001/health

# Check frontend
open https://your-deployed-url.vercel.app
```

---

## Production Deployment

### 1. Mainnet Preparation

- [ ] Audit smart contracts
- [ ] Test on mainnet fork
- [ ] Increase VRF subscription funding
- [ ] Set up monitoring & alerts
- [ ] Create incident response plan

### 2. Mainnet Deployment

```bash
cd contracts

# Deploy to Ethereum mainnet
npx hardhat run scripts/deploy-gamemaster.ts --network mainnet

# Deploy to Arbitrum mainnet
npx hardhat run scripts/deploy-citynode.ts --network arbitrum

# Deploy to Base mainnet
npx hardhat run scripts/deploy-citynode.ts --network base
```

### 3. Production Environment Variables

Update all `.env` files with mainnet addresses and keys.

### 4. Monitoring

Set up monitoring for:
- Contract events
- VRF callbacks
- CRE workflow execution
- Relayer health
- Gas costs

---

## Troubleshooting

### "No wallet detected"

**Cause:** Privy not configured or `window.ethereum` blocked

**Solution:**
```bash
# Check VITE_PRIVY_APP_ID is set
echo $VITE_PRIVY_APP_ID

# Verify Privy config in main.jsx
```

### "Chainlink Functions error: Internal Server Error"

**Cause:** Relayer error or contract revert

**Solution:**
```bash
# Check relayer logs
tail -f chainlink-functions.log

# Verify GameMaster is set
npx hardhat run scripts/setGameMaster.js --network sepolia

# Check relayer wallet has ETH
curl http://localhost:3001/health
```

### "VRF not fulfilled"

**Cause:** VRF subscription not funded or not configured

**Solution:**
```bash
# Check VRF subscription at https://vrf.chain.link/sepolia
# Fund with LINK tokens
# Add GameMaster as consumer
```

### "IPFS upload failed"

**Cause:** Pinata API key invalid or quota exceeded

**Solution:**
```bash
# Check Pinata credentials
echo $PINATA_API_KEY

# Verify Pinata account has quota
# https://pinata.cloud/dashboard
```

### "OpenAI API error"

**Cause:** API key invalid or quota exceeded

**Solution:**
```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Verify account has credits
# https://platform.openai.com/account/billing/overview
```

### "Contract not found at address"

**Cause:** Contract deployed to different address or network

**Solution:**
```bash
# Verify contract address
npx hardhat run scripts/verify-deployment.ts --network sepolia

# Update .env with correct address
```

---

## Health Checks

### 1. Relayer Health

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "signer": "0xb19eE81581AE385F56D702d412D92d70fb65b9F7",
  "balance": "0.5",
  "playerRegistry": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
}
```

### 2. Contract Health

```bash
npx hardhat run scripts/health-check.ts --network sepolia
```

Checks:
- [ ] GameMaster deployed
- [ ] VRF subscription funded
- [ ] Keystone configured
- [ ] CityNodes deployed
- [ ] PlayerRegistry deployed

### 3. Frontend Health

```bash
# Check if frontend loads
curl https://your-frontend-url.com

# Check console for errors
# Open DevTools → Console
```

### 4. CRE Workflow Health

```bash
# Check workflow status
cre-cli workflows list

# Check recent executions
cre-cli workflows logs
```

---

## Maintenance

### Regular Tasks

- [ ] Monitor gas costs
- [ ] Check VRF subscription balance
- [ ] Review error logs
- [ ] Update dependencies
- [ ] Backup databases
- [ ] Rotate API keys

### Scaling

As user base grows:
1. Increase VRF subscription funding
2. Optimize gas costs
3. Scale CRE workflows
4. Add more relayer instances
5. Implement caching layer

---

## Support

For deployment issues:
1. Check logs: `tail -f *.log`
2. Verify environment variables: `env | grep VITE`
3. Check contract addresses: `npx hardhat run scripts/verify-deployment.ts`
4. Review error messages in console
5. Open issue on GitHub with logs

---

**Last Updated:** February 2026
