# IPFS Deployment — Carmen Sandiego On-Chain

Quick start guide for deploying the frontend to IPFS.

---

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
chmod +x scripts/deploy-ipfs.sh
./scripts/deploy-ipfs.sh
```

This script will:
1. Build the frontend
2. Upload to IPFS via Pinata
3. Display access URLs
4. Optionally update the smart contract

### Option 2: Manual Deployment

#### Step 1: Build Frontend
```bash
cd frontend
npm run build
```

#### Step 2: Upload to IPFS

**Via Pinata (Recommended):**
```bash
npm install -g @pinata/cli
pinata login
pinata upload frontend/dist --name "Carmen Sandiego On-Chain"
```

**Via Local IPFS Daemon:**
```bash
ipfs daemon  # In another terminal
cd frontend/dist
ipfs add -r .
```

**Via Web3.Storage:**
```bash
npm install -g @web3-storage/w3cli
w3 up frontend/dist
```

#### Step 3: Access Your App

Replace `QmHash` with your IPFS hash:

- https://ipfs.io/ipfs/QmHash/
- https://cloudflare-ipfs.com/ipfs/QmHash/
- https://gateway.pinata.cloud/ipfs/QmHash/
- https://w3s.link/ipfs/QmHash/

---

## 🧪 Testing Locally

### Test with HTTP Server

```bash
chmod +x scripts/test-ipfs-local.sh
./scripts/test-ipfs-local.sh
```

This will:
1. Build the frontend
2. Add to local IPFS
3. Start HTTP server on port 8080
4. Test IPFS gateways

### Manual Testing

```bash
cd frontend/dist
npx http-server -p 8080
# Open http://localhost:8080
```

---

## 🔧 Configuration

### Frontend Environment Variables

**`.env.production`** (already configured):
```env
VITE_GAME_MASTER_ADDRESS=0x...
VITE_PLAYER_REGISTRY_ADDRESS=0x...
VITE_RELAYER_URL=http://localhost:3001
VITE_ALCHEMY_RPC_URL_SEPOLIA=https://...
VITE_PRIVY_APP_ID=...
VITE_IPFS_GATEWAY=https://cloudflare-ipfs.com
VITE_ENABLE_IPFS=true
```

### Relayer CORS Configuration

The relayer (`chainlink-functions/server-ipfs.js`) is configured to accept requests from:
- `http://localhost:5173`
- `http://localhost:3000`
- `https://ipfs.io`
- `https://cloudflare-ipfs.com`
- `https://gateway.pinata.cloud`
- `https://w3s.link`
- `*.ipfs.*` (wildcard)

---

## 📋 Checklist

### Before Deployment
- [ ] Frontend builds without errors: `npm run build`
- [ ] Build size is reasonable: `du -sh frontend/dist` (~500KB-1MB)
- [ ] All environment variables are set
- [ ] Relayer is running: `npm start` in `chainlink-functions/`
- [ ] Smart contracts are deployed

### During Deployment
- [ ] Build frontend
- [ ] Upload to IPFS
- [ ] Copy IPFS hash
- [ ] Test via multiple gateways
- [ ] Verify gameplay works

### After Deployment
- [ ] Test login with Google
- [ ] Test registration (gasless)
- [ ] Test gameplay flow
- [ ] Check browser console for errors
- [ ] Test on mobile
- [ ] Test with different IPFS gateways

---

## 🔍 Troubleshooting

### "Cannot find module" errors

**Cause:** Absolute paths in imports

**Solution:** Use relative paths
```javascript
// ❌ Wrong
import App from '/src/App'

// ✅ Correct
import App from './App'
```

### Routes not working on IPFS

**Cause:** React Router not configured for IPFS paths

**Solution:** Already fixed in `frontend/src/main.jsx` with dynamic `basename`

### CORS errors when calling relayer

**Cause:** IPFS gateway not in CORS whitelist

**Solution:** Already configured in `chainlink-functions/server-ipfs.js`

### Images not loading

**Cause:** Absolute paths to images

**Solution:** Use relative paths
```javascript
// ❌ Wrong
<img src="/images/logo.png" />

// ✅ Correct
<img src="./images/logo.png" />
```

### IPFS gateway timeout

**Cause:** Gateway is slow or overloaded

**Solution:** Try another gateway:
- ipfs.io (IPFS Foundation)
- cloudflare-ipfs.com (Cloudflare)
- gateway.pinata.cloud (Pinata)
- w3s.link (Web3.Storage)

---

## 📊 Performance Tips

1. **Optimize Build Size**
   - Remove unused dependencies
   - Use code splitting (already configured)
   - Minify assets (already configured)

2. **Improve Load Time**
   - Use IPFS pinning service (Pinata recommended)
   - Cache assets locally
   - Use CDN gateways

3. **Monitor Performance**
   - Check bundle size: `npm run build`
   - Use browser DevTools
   - Monitor IPFS gateway latency

---

## 🔐 Security Considerations

1. **CORS Configuration**
   - Only allow trusted origins
   - Already configured for IPFS gateways
   - Update if adding new gateways

2. **Environment Variables**
   - Never commit `.env.production` with secrets
   - Use `.env.example` as template
   - Rotate API keys regularly

3. **Smart Contract**
   - Verify contract address before deployment
   - Use hardware wallet for admin functions
   - Test on testnet first

---

## 📚 Resources

- [IPFS Documentation](https://docs.ipfs.tech/)
- [Pinata Documentation](https://docs.pinata.cloud/)
- [Web3.Storage Documentation](https://web3.storage/docs/)
- [Vite Documentation](https://vitejs.dev/)
- [React Router Documentation](https://reactrouter.com/)

---

## 🎯 Next Steps

1. ✅ Configure frontend for IPFS
2. ✅ Build optimized bundle
3. ⏳ Deploy to IPFS (Pinata or local)
4. ⏳ Test via IPFS gateways
5. ⏳ Update smart contract with IPFS hash
6. ⏳ Share with community

---

## 💡 Tips

- **Pin to Multiple Services:** Use Pinata + Web3.Storage for redundancy
- **Monitor Uptime:** Use IPFS gateway monitoring tools
- **Update Regularly:** Deploy new versions as you add features
- **Share Hash:** The IPFS hash is your app's permanent address

---

**Status:** Ready for deployment
**Last Updated:** February 2026
