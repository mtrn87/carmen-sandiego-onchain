# System Flows — Carmen Sandiego On-Chain

Detailed step-by-step flows for all major system interactions.

---

## 1. Gasless Registration Flow

### Overview
Players register without paying gas. Frontend signs a message, relayer validates and pays.

### Step-by-Step

**Phase 1: User Authentication**
1. User clicks "Login with Google"
2. Frontend redirects to Privy OAuth
3. User authenticates with Google account
4. Privy creates embedded wallet (secp256k1)
5. Wallet address returned to frontend
6. Frontend stores address in Zustand store

**Phase 2: Nickname Modal**
1. Frontend checks if player exists via `getPlayerData(address)`
2. If player doesn't exist (wallet = zero address):
   - Show nickname modal
   - User enters nickname (3-20 chars, alphanumeric + _ -)
3. If player exists:
   - Skip modal
   - Navigate to `/game`

**Phase 3: Message Creation & Signing**
1. Frontend reads current nonce from contract: `nonces(address)`
2. Frontend creates message hash:
   ```
   messageHash = keccak256(
     abi.encodePacked(
       playerAddress,
       nickname,
       nonce,
       contractAddress
     )
   )
   ```
3. Frontend calls `Privy.signMessage(messageHash)`
4. Privy signs with embedded wallet private key
5. Frontend receives signature (65 bytes: r + s + v)

**Phase 4: Relayer Call**
1. Frontend sends POST request to `http://localhost:3001/relay`:
   ```json
   {
     "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
     "nickname": "detective",
     "signature": "0x...",
     "nonce": "7",
     "contractAddress": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
   }
   ```

**Phase 5: Relayer Validation**
1. Relayer receives request
2. Relayer validates input:
   - Check playerAddress is valid Ethereum address
   - Check nickname is not empty
   - Check signature is not empty
   - Check nonce is defined
3. Relayer recreates message hash:
   ```javascript
   const messageHash = ethers.keccak256(
     ethers.solidityPacked(
       ["address", "string", "uint256", "address"],
       [playerAddress, nickname, nonceNum, contractAddress]
     )
   )
   ```
4. Relayer recovers signer address from signature:
   ```javascript
   const ethSignedMessageHash = ethers.hashMessage(
     ethers.getBytes(messageHash)
   )
   const recoveredAddress = ethers.recoverAddress(
     ethSignedMessageHash,
     signature
   )
   ```
5. Relayer verifies recovered address matches playerAddress
6. If invalid: Return error 400 "Invalid signature"

**Phase 6: On-Chain Registration**
1. Relayer calls `PlayerRegistry.registerPlayer(playerAddress, nickname)`
2. Contract verifies caller is GameMaster
3. Contract creates Player struct:
   ```solidity
   players[playerAddress] = Player({
     wallet: playerAddress,
     nickname: nickname,
     registeredAt: block.timestamp,
     ...
   })
   ```
4. Contract increments nonce: `nonces[playerAddress]++`
5. Contract emits `PlayerRegistered(playerAddress, nickname)`
6. Transaction confirmed on-chain

**Phase 7: Relayer Response**
1. Relayer waits for transaction confirmation
2. Relayer returns success response:
   ```json
   {
     "success": true,
     "txHash": "0x...",
     "blockNumber": 10281041,
     "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
     "nickname": "detective"
   }
   ```

**Phase 8: Frontend Persistence**
1. Frontend receives success response
2. Frontend saves to localStorage:
   - `player_registered_address = "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067"`
   - `player_nickname = "detective"`
3. Frontend saves to Zustand store
4. Frontend navigates to `/game`

**Phase 9: Returning Player**
1. User logs in again with Google
2. Frontend loads `player_registered_address` from localStorage
3. Frontend calls `getPlayerData(player_registered_address)`
4. Contract returns Player struct (wallet != zero address)
5. Frontend recognizes player exists
6. Frontend skips nickname modal
7. Frontend navigates directly to `/game`

### Security Guarantees

- ✅ **Signature Validation**: Only the player's wallet can sign
- ✅ **Nonce Protection**: Each registration increments nonce, prevents replay
- ✅ **Gasless**: User pays $0, server pays ~$0.50
- ✅ **Session Persistence**: localStorage enables returning players
- ✅ **ECDSA Recovery**: Cryptographically verified signer

### Error Handling

| Error | Cause | Resolution |
|-------|-------|-----------|
| "Invalid signature" | Signature doesn't match playerAddress | Re-sign message |
| "Missing required fields" | playerAddress, nickname, signature, or nonce missing | Check request payload |
| "Invalid player address" | playerAddress is not valid Ethereum address | Use correct address |
| "Internal Server Error" | Server error or contract revert | Check server logs |
| "Only GameMaster" | Relayer is not GameMaster | Run setGameMaster.js script |

---

## 2. Mission Start Flow

### Overview
Player initiates a mission. VRF picks Carmen's location. CRE generates briefing.

### Step-by-Step

**Phase 1: Player Action**
1. Player clicks "Start Mission" button
2. Frontend calls `GameMaster.startMission()`
3. Transaction sent to Sepolia

**Phase 2: On-Chain Mission Creation**
1. GameMaster receives `startMission()` call
2. GameMaster verifies caller is registered player
3. GameMaster creates Mission struct:
   ```solidity
   missions[missionId] = Mission({
     player: msg.sender,
     startBlock: block.number,
     carmenLocation: 0, // TBD by VRF
     status: ACTIVE,
     ...
   })
   ```
4. GameMaster requests VRF randomness:
   ```solidity
   requestId = vrfCoordinator.requestRandomWords(
     keyHash,
     subscriptionId,
     requestConfirmations,
     callbackGasLimit,
     numWords: 1
   )
   ```
5. GameMaster stores mapping: `vrfRequests[requestId] = missionId`
6. GameMaster emits `MissionStarted(missionId, player)`
7. Transaction confirmed

**Phase 3: VRF Randomness Generation**
1. VRF Coordinator receives request
2. VRF generates random number off-chain
3. VRF creates proof of randomness
4. VRF submits proof to blockchain
5. VRF Coordinator verifies proof on-chain
6. VRF Coordinator calls `GameMaster.fulfillRandomWords(requestId, randomWords)`

**Phase 4: VRF Callback**
1. GameMaster receives `fulfillRandomWords(requestId, randomWords)`
2. GameMaster retrieves missionId from mapping
3. GameMaster extracts random value: `randomValue = randomWords[0]`
4. GameMaster determines Carmen's location:
   ```solidity
   validCities = [SEPOLIA, ARBITRUM, BASE]
   carmenLocation = validCities[randomValue % validCities.length]
   ```
5. GameMaster updates mission:
   ```solidity
   missions[missionId].carmenLocation = carmenLocation
   ```
6. GameMaster emits `CarmenLocationSet(missionId, carmenLocation)`

**Phase 5: CRE Workflow Trigger**
1. CRE listens for `MissionStarted` event
2. CRE reads mission data:
   - `getMissionSalt(missionId)` → salt for hash
   - `getPlayerPubKey(player)` → for ECIES encryption
   - `getValidCities()` → list of cities
   - `getMission(missionId)` → mission details
3. CRE brute-forces hash to find city:
   ```
   for each city in validCities:
     hash = keccak256(salt + city)
     if hash matches mission hash:
       selectedCity = city
       break
   ```
4. CRE selects clue from database based on city
5. CRE encrypts clue with player's public key (ECIES)

**Phase 6: AI Content Generation**
1. CRE calls OpenAI API:
   ```
   prompt = "Generate a briefing for detective in {city}..."
   response = openai.createCompletion(prompt)
   briefingText = response.text
   ```
2. CRE calls ElevenLabs API:
   ```
   audio = elevenLabs.textToSpeech(briefingText)
   ```
3. CRE uploads to IPFS:
   ```
   ipfsHash = pinata.upload({
     briefing: briefingText,
     audio: audio,
     clue: encryptedClue
   })
   ```

**Phase 7: Keystone Report**
1. CRE creates report:
   ```json
   {
     "missionId": 1,
     "clueHash": "0x...",
     "cluePtr": "ipfs://QmXxxx",
     "timestamp": 1708123456
   }
   ```
2. CRE signs report with Keystone private key
3. CRE sends signed report to Keystone Router

**Phase 8: On-Chain Write**
1. Keystone Router receives signed report
2. Keystone Router validates signature
3. Keystone Router routes to GameMasterProxy on Sepolia
4. GameMasterProxy verifies Keystone signature
5. GameMasterProxy calls `GameMaster.receiveClue(missionId, clueHash, cluePtr)`
6. GameMaster stores clue:
   ```solidity
   missions[missionId].clue = Clue({
     hash: clueHash,
     ptr: cluePtr,
     receivedAt: block.timestamp
   })
   ```
7. GameMaster emits `ClueReceived(missionId, clueHash)`

**Phase 9: Frontend Update**
1. Frontend listens for `ClueReceived` event
2. Frontend fetches clue from IPFS using cluePtr
3. Frontend decrypts clue with player's private key (ECIES)
4. Frontend displays briefing + audio
5. Player sees mission briefing and can start investigating

### Latency Breakdown

| Phase | Time | Notes |
|-------|------|-------|
| Player clicks → tx sent | <1s | Frontend |
| tx in mempool | 1-5s | Network |
| tx confirmed | 15-30s | 1-2 blocks |
| VRF request → callback | 10-30s | Depends on VRF queue |
| CRE workflow | 10-30s | Depends on AI service |
| Keystone report | 5-10s | Network |
| Frontend update | <1s | Client-side |
| **Total** | **1-2 minutes** | Typical |

---

## 3. Investigation Flow

### Overview
Player investigates a city. VRF determines clue type. CRE generates clue.

### Step-by-Step

**Phase 1: Player Investigation**
1. Player selects a city to investigate
2. Frontend calls `GameMaster.submitInvestigation(chainId)`
3. Transaction sent to Sepolia

**Phase 2: Investigation Recording**
1. GameMaster receives `submitInvestigation(chainId)`
2. GameMaster verifies player has active mission
3. GameMaster records investigation:
   ```solidity
   investigations[missionId].push({
     chainId: chainId,
     timestamp: block.timestamp,
     status: PENDING
   })
   ```
4. GameMaster requests VRF randomness (for clue type)
5. GameMaster emits `InvestigationSubmitted(missionId, chainId)`

**Phase 3: VRF Callback (Clue Type)**
1. VRF generates random number
2. VRF calls `GameMaster.fulfillRandomWords(requestId, randomWords)`
3. GameMaster determines clue type:
   ```solidity
   randomValue = randomWords[0]
   if randomValue % 100 < 60:
     clueType = TEXT
   else:
     clueType = AUDIO
   ```
4. GameMaster also determines veracity:
   ```solidity
   if randomValue % 100 < 70:
     veracity = TRUE
   else:
     veracity = FALSE
   ```
5. GameMaster emits `ClueTypeSet(missionId, clueType, veracity)`

**Phase 4: CRE Workflow**
1. CRE listens for `InvestigationSubmitted` event
2. CRE reads investigation data:
   - `getMissionSalt(missionId)`
   - `getPlayerPubKey(player)`
   - `getMission(missionId)` → Carmen's location
   - `getInvestigation(missionId)` → investigated cities
3. CRE selects clue based on:
   - Investigated city
   - Carmen's actual location (true/false)
   - Clue type (text/audio)
4. CRE encrypts clue with player's public key

**Phase 5: AI Content Generation**
1. CRE calls OpenAI:
   ```
   prompt = "Generate a clue for {city}. Carmen is {here/not_here}..."
   clueText = openai.createCompletion(prompt)
   ```
2. If audio clue:
   - CRE calls ElevenLabs: `audio = elevenLabs.textToSpeech(clueText)`
3. CRE uploads to IPFS:
   ```
   ipfsHash = pinata.upload({
     clue: encryptedClue,
     audio: audio (if applicable)
   })
   ```

**Phase 6: Keystone Report**
1. CRE creates report with clue data
2. CRE signs with Keystone
3. CRE sends to Keystone Router

**Phase 7: On-Chain Write**
1. Keystone Router validates and routes
2. GameMasterProxy calls `GameMaster.receiveClue(missionId, clueHash, cluePtr)`
3. GameMaster stores clue
4. GameMaster emits `ClueReceived(missionId, clueHash)`

**Phase 8: Frontend Display**
1. Frontend fetches clue from IPFS
2. Frontend decrypts with player's private key
3. Frontend displays clue (text or audio)
4. Player reads/listens to clue
5. Player decides next investigation or capture attempt

### Clue Selection Logic

```
if investigated_city == carmen_location:
  if veracity == TRUE:
    clue = "Carmen is here!"
  else:
    clue = "No sign of Carmen here" (false lead)
else:
  if veracity == TRUE:
    clue = "Carmen was seen heading to {other_city}"
  else:
    clue = "Witness saw Carmen in {wrong_city}" (false lead)
```

---

## 4. Carmen Capture Flow

### Overview
Player captures Carmen. NFT minted. Finale generated.

### Step-by-Step

**Phase 1: Capture Attempt**
1. Player clicks "Capture Carmen" in city where Carmen is
2. Frontend calls `GameMaster.captureCarmen(missionId)`
3. Transaction sent to Sepolia

**Phase 2: Capture Verification**
1. GameMaster receives `captureCarmen(missionId)`
2. GameMaster verifies:
   - Mission exists and is active
   - Caller is mission player
   - Carmen is in the city player is in
3. If verification fails: Revert with "Carmen not here"
4. If verification passes: Continue

**Phase 3: Reward Calculation**
1. GameMaster calculates blocks used:
   ```solidity
   blocksUsed = block.number - missions[missionId].startBlock
   ```
2. GameMaster determines reward tier:
   ```solidity
   if blocksUsed <= 20:
     tier = GOLD
     points = 100
   else if blocksUsed <= 35:
     tier = SILVER
     points = 75
   else if blocksUsed <= 50:
     tier = BRONZE
     points = 50
   else:
     tier = FAILED
     points = 0
   ```
3. GameMaster updates player stats:
   ```solidity
   playerStats[player].totalPoints += points
   playerStats[player].missionsCompleted++
   ```

**Phase 4: NFT Minting**
1. GameMaster calls `MissionNFT.mint(player, missionId, tier)`
2. MissionNFT creates token metadata:
   ```json
   {
     "name": "Carmen Captured - Gold",
     "description": "Captured Carmen in 15 blocks",
     "attributes": [
       {"trait_type": "Tier", "value": "Gold"},
       {"trait_type": "Blocks Used", "value": "15"},
       {"trait_type": "Points", "value": "100"}
     ]
   }
   ```
3. MissionNFT mints ERC-721 token
4. MissionNFT transfers to player wallet
5. GameMaster emits `CarmenCaptured(missionId, player, tier, points)`

**Phase 5: CRE Finale Generation**
1. CRE listens for `CarmenCaptured` event
2. CRE reads mission data:
   - `getMission(missionId)` → mission details
   - `getPlayerStats(player)` → player stats
   - `blocksUsed` → from event
   - `tier` → from event
3. CRE generates personalized finale:
   ```
   prompt = "Generate a personalized ending for detective who captured Carmen in {tier} tier with {blocksUsed} blocks..."
   finaleText = openai.createCompletion(prompt)
   ```
4. CRE calls ElevenLabs for audio:
   ```
   audio = elevenLabs.textToSpeech(finaleText)
   ```
5. CRE uploads to IPFS:
   ```
   ipfsHash = pinata.upload({
     finale: finaleText,
     audio: audio
   })
   ```

**Phase 6: Frontend Display**
1. Frontend listens for `CarmenCaptured` event
2. Frontend fetches finale from IPFS
3. Frontend displays:
   - "Mission Complete!" message
   - Tier badge (Gold/Silver/Bronze)
   - Points earned
   - NFT trophy
   - Personalized ending narrative
   - Audio playback
4. Frontend shows "Play Again" button
5. Player can start new mission

### Reward Tiers

| Tier | Blocks | Points | NFT Rarity | Bonus |
|------|--------|--------|-----------|-------|
| Gold | 0-20 | 100 | Legendary | 2x multiplier |
| Silver | 21-35 | 75 | Rare | 1.5x multiplier |
| Bronze | 36-50 | 50 | Uncommon | 1x multiplier |
| Failed | 51+ | 0 | None | No NFT |

---

## 5. Carmen Moves Flow

### Overview
CRE cron job moves Carmen to a new city every 3 minutes.

### Step-by-Step

**Phase 1: Cron Trigger**
1. CRE scheduler triggers `carmen-moves` workflow every 3 minutes
2. CRE reads all active missions:
   ```
   activeMissions = getAllActiveMissions()
   ```

**Phase 2: Location Update**
1. For each active mission:
   - Read current Carmen location
   - Read valid cities list
   - Pick random new city (different from current)
   ```
   currentLocation = getMission(missionId).carmenLocation
   validCities = getValidCities()
   newLocation = randomCity(validCities, exclude=currentLocation)
   ```

**Phase 3: Cross-Chain Write**
1. CRE creates report for each city:
   ```json
   {
     "missionId": 1,
     "newLocation": "BASE",
     "timestamp": 1708123456
   }
   ```
2. CRE signs report with Keystone
3. CRE sends to Keystone Router

**Phase 4: City Node Update**
1. Keystone Router routes to CityNode on each chain
2. CityNode receives `updateCarmenPresence(missionId, newLocation)`
3. CityNode updates presence:
   ```solidity
   carmenPresence[missionId] = newLocation
   ```
4. CityNode emits `CarmenMoved(missionId, newLocation)`

**Phase 5: Player Awareness**
1. Frontend listens for `CarmenMoved` event
2. Frontend updates game map:
   - Show Carmen's new location
   - Update city status
3. Player sees Carmen has moved
4. Player can continue investigation in new city

### Carmen Movement Pattern

```
Time 0:00 → Carmen in Tokyo (Arbitrum)
Time 3:00 → Carmen moves to Paris (Base)
Time 6:00 → Carmen moves to London (XDC)
Time 9:00 → Carmen moves back to Tokyo
...
```

**Note:** Carmen can't stay in same city twice in a row.

---

## 6. Error Handling & Recovery

### Common Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| "Player not registered" | User not registered | Show registration modal |
| "Mission not found" | Invalid missionId | Refresh page |
| "Carmen not here" | Wrong city | Try another city |
| "VRF not fulfilled" | VRF callback pending | Wait 30 seconds |
| "Clue not received" | CRE workflow failed | Retry investigation |
| "Network error" | Connection issue | Retry transaction |
| "Insufficient gas" | Server out of funds | Contact admin |

### Retry Logic

```javascript
// Frontend retry for failed transactions
async function submitInvestigationWithRetry(chainId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tx = await gamemaster.submitInvestigation(chainId)
      return tx
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(2000 * attempt) // Exponential backoff
        continue
      }
      throw error
    }
  }
}
```

---

**Last Updated:** February 2026
