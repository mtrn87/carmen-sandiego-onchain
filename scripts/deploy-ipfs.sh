#!/bin/bash

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Carmen Sandiego On-Chain — IPFS Deployment Script        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Pinata CLI is installed
if ! command -v pinata &> /dev/null; then
    echo -e "${YELLOW}⚠️  Pinata CLI not found. Installing...${NC}"
    npm install -g @pinata/cli
fi

# Step 1: Build frontend
echo -e "${BLUE}📦 Step 1: Building frontend...${NC}"
cd frontend
npm run build
echo -e "${GREEN}✅ Frontend built successfully${NC}"
echo ""

# Step 2: Check build size
echo -e "${BLUE}📊 Build size:${NC}"
du -sh dist
echo ""

# Step 3: Upload to IPFS via Pinata
echo -e "${BLUE}📤 Step 2: Uploading to IPFS via Pinata...${NC}"
IPFS_HASH=$(pinata upload dist --name "Carmen Sandiego On-Chain" 2>&1 | grep -oP '"IpfsHash":"?\K[^"]*' | head -1)

if [ -z "$IPFS_HASH" ]; then
    echo -e "${YELLOW}⚠️  Pinata upload failed. Trying local IPFS daemon...${NC}"
    
    # Check if IPFS daemon is running
    if ! ipfs id &> /dev/null; then
        echo -e "${YELLOW}⚠️  IPFS daemon not running. Start it with: ipfs daemon${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📤 Uploading to local IPFS...${NC}"
    IPFS_HASH=$(ipfs add -r dist -q | tail -1)
fi

echo -e "${GREEN}✅ Uploaded to IPFS${NC}"
echo -e "${BLUE}IPFS Hash: ${YELLOW}$IPFS_HASH${NC}"
echo ""

# Step 4: Display access URLs
echo -e "${BLUE}🌐 Step 3: Access URLs:${NC}"
echo -e "  ${GREEN}ipfs.io:${NC}           https://ipfs.io/ipfs/$IPFS_HASH/"
echo -e "  ${GREEN}Cloudflare:${NC}        https://cloudflare-ipfs.com/ipfs/$IPFS_HASH/"
echo -e "  ${GREEN}Pinata:${NC}            https://gateway.pinata.cloud/ipfs/$IPFS_HASH/"
echo -e "  ${GREEN}Web3.Storage:${NC}      https://w3s.link/ipfs/$IPFS_HASH/"
echo ""

# Step 5: Update smart contract (optional)
echo -e "${BLUE}📝 Step 4: Update smart contract (optional)?${NC}"
read -p "Do you want to update the GameMaster contract with the new IPFS hash? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd ../contracts
    IPFS_HASH=$IPFS_HASH npx hardhat run scripts/setAppIpfsHash.ts --network sepolia
    echo -e "${GREEN}✅ Smart contract updated${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping smart contract update${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  🎉 Deployment Complete!                                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Your app is now live on IPFS and accessible from multiple gateways!"
echo -e "Share any of the URLs above to let others access your decentralized app."
echo ""
