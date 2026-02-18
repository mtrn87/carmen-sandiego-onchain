#!/bin/bash

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Carmen Sandiego On-Chain — Local IPFS Test               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check if IPFS daemon is running
echo -e "${BLUE}🔍 Checking IPFS daemon...${NC}"
if ! ipfs id &> /dev/null; then
    echo -e "${RED}❌ IPFS daemon is not running${NC}"
    echo -e "${YELLOW}Start it with: ipfs daemon${NC}"
    exit 1
fi
echo -e "${GREEN}✅ IPFS daemon is running${NC}"
echo ""

# Step 1: Build frontend
echo -e "${BLUE}📦 Building frontend...${NC}"
cd frontend
npm run build
echo -e "${GREEN}✅ Frontend built${NC}"
echo ""

# Step 2: Add to IPFS
echo -e "${BLUE}📤 Adding to IPFS...${NC}"
cd dist
IPFS_HASH=$(ipfs add -r . -q | tail -1)
cd ..
echo -e "${GREEN}✅ Added to IPFS${NC}"
echo -e "${BLUE}IPFS Hash: ${YELLOW}$IPFS_HASH${NC}"
echo ""

# Step 3: Test with http-server
echo -e "${BLUE}🧪 Testing with local HTTP server...${NC}"
echo -e "${YELLOW}Starting http-server on port 8080...${NC}"
npx http-server dist -p 8080 -c-1 &
HTTP_SERVER_PID=$!
sleep 2

echo -e "${GREEN}✅ HTTP server started (PID: $HTTP_SERVER_PID)${NC}"
echo -e "${BLUE}Test URL: http://localhost:8080${NC}"
echo ""

# Step 4: Test IPFS gateway
echo -e "${BLUE}🌐 Testing IPFS gateways...${NC}"
echo ""

test_gateway() {
    local gateway=$1
    local url="$gateway/ipfs/$IPFS_HASH/"
    echo -n "  Testing $gateway... "
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${YELLOW}⚠️  Timeout or error${NC}"
    fi
}

test_gateway "https://ipfs.io"
test_gateway "https://cloudflare-ipfs.com"
test_gateway "https://gateway.pinata.cloud"

echo ""
echo -e "${BLUE}📋 Access URLs:${NC}"
echo -e "  Local:              http://localhost:8080"
echo -e "  IPFS (ipfs.io):     https://ipfs.io/ipfs/$IPFS_HASH/"
echo -e "  IPFS (Cloudflare):  https://cloudflare-ipfs.com/ipfs/$IPFS_HASH/"
echo ""

echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
wait $HTTP_SERVER_PID
