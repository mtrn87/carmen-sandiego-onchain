# System Diagrams — Carmen Sandiego On-Chain

Visual representations of system architecture, data flows, and gameplay mechanics.

---

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph Frontend["🎮 Frontend (React)"]
        UI["React UI<br/>Zustand Store<br/>Privy Auth"]
        Wallet["Embedded Wallet<br/>Google OAuth<br/>ECIES Encryption"]
    end

    subgraph Relayer["🔗 Relayer Server (3001)"]
        Validate["Validate Signature<br/>ECDSA Recovery"]
        Register["Call registerPlayer()<br/>Pay Gas"]
    end

    subgraph Sepolia["⛓️ Sepolia (HQ)"]
        GameMaster["GameMaster.sol<br/>VRF Consumer<br/>State Manager"]
        Registry["PlayerRegistry.sol<br/>Player Data<br/>Nonce Tracking"]
        Proxy["GameMasterProxy<br/>CRE Report Router<br/>Keystone Validator"]
        NFT["MissionNFT.sol<br/>ERC-721 Trophy"]
    end

    subgraph VRF["🎲 Chainlink VRF v2.5"]
        Random["Randomness<br/>Coordinator"]
    end

    subgraph CRE["🤖 CRE Workflows"]
        BriefingWF["generate-briefing<br/>OpenAI + ElevenLabs"]
        ClueWF["generate-clue<br/>OpenAI + ElevenLabs"]
        CarmenWF["carmen-moves<br/>Cron-based"]
        FinaleWF["generate-finale<br/>Personalized Story"]
    end

    subgraph Keystone["🔐 Keystone Router"]
        Sign["Sign Reports<br/>Validate Signatures"]
    end

    subgraph Cities["🌍 City Chains"]
        Tokyo["CityNode (Arbitrum)<br/>Tokyo"]
        Paris["CityNode (Base)<br/>Paris"]
    end

    subgraph AI["🧠 AI Services"]
        OpenAI["OpenAI GPT-4o-mini<br/>Text Generation"]
        ElevenLabs["ElevenLabs<br/>Audio Generation"]
        IPFS["IPFS/Pinata<br/>Content Storage"]
    end

    Frontend -->|"Google OAuth"| Wallet
    Wallet -->|"Sign Message"| Relayer
    Relayer -->|"POST /relay"| Validate
    Validate -->|"registerPlayer()"| Register
    Register -->|"Call Contract"| Registry
    
    Frontend -->|"startMission()"| GameMaster
    GameMaster -->|"Request VRF"| Random
    Random -->|"Callback"| GameMaster
    
    GameMaster -->|"submitInvestigation()"| GameMaster
    GameMaster -->|"Emit Events"| CRE
    
    CRE -->|"HTTP Fetch"| AI
    AI -->|"Generate Content"| IPFS
    
    CRE -->|"Sign Report"| Keystone
    Keystone -->|"Validate & Route"| Proxy
    Proxy -->|"receiveClue()"| GameMaster
    
    GameMaster -->|"Cross-chain Call"| Cities
    Cities -->|"updateCarmenPresence()"| Cities
    
    GameMaster -->|"Mint NFT"| NFT
    
    style Frontend fill:#e1f5ff
    style Relayer fill:#fff3e0
    style Sepolia fill:#f3e5f5
    style VRF fill:#e8f5e9
    style CRE fill:#fce4ec
    style Keystone fill:#f1f8e9
    style Cities fill:#ede7f6
    style AI fill:#fff9c4
```

---

## 2. Gasless Registration Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Frontend as 🎮 Frontend
    participant Privy as 🔐 Privy
    participant Relayer as 🔗 Relayer (3001)
    participant Contract as ⛓️ PlayerRegistry
    participant Storage as 💾 localStorage

    User->>Frontend: Click "Login with Google"
    Frontend->>Privy: Google OAuth
    Privy-->>Frontend: Embedded Wallet Created
    Frontend->>User: Show Nickname Modal
    
    User->>Frontend: Enter Nickname "detective"
    Frontend->>Frontend: Create messageHash<br/>keccak256(address, nickname, nonce, contractAddr)
    Frontend->>Privy: signMessage(messageHash)
    Privy-->>Frontend: signature = 0x...
    
    Frontend->>Relayer: POST /relay<br/>{address, nickname, signature, nonce}
    
    Relayer->>Relayer: Validate Signature<br/>ECDSA Recovery
    alt Signature Valid
        Relayer->>Contract: registerPlayer(address, nickname)
        Contract->>Contract: Verify Caller is GameMaster
        Contract->>Contract: Create Player Struct
        Contract->>Contract: Store in Mapping
        Contract-->>Relayer: ✓ txHash
        Relayer-->>Frontend: {success: true, txHash, blockNumber}
        
        Frontend->>Storage: Save player_registered_address
        Frontend->>Storage: Save player_nickname
        Frontend->>User: ✓ Registration Complete!
        Frontend->>Frontend: Navigate to /game
    else Signature Invalid
        Relayer-->>Frontend: {success: false, error: "Invalid signature"}
        Frontend->>User: ✗ Registration Failed
    end
```

---

## 3. Gameplay Flow

```mermaid
sequenceDiagram
    participant Player as 👤 Player
    participant Frontend as 🎮 Frontend
    participant GameMaster as ⛓️ GameMaster
    participant VRF as 🎲 VRF
    participant CRE as 🤖 CRE
    participant AI as 🧠 AI Services
    participant Keystone as 🔐 Keystone

    Player->>Frontend: Click "Start Mission"
    Frontend->>GameMaster: startMission()
    GameMaster->>GameMaster: Create Mission Struct
    GameMaster->>VRF: Request Randomness
    GameMaster-->>Frontend: ✓ Mission Started
    
    VRF->>VRF: Generate Random Number
    VRF->>GameMaster: fulfillRandomWords(randomWords)
    GameMaster->>GameMaster: Set Carmen Location<br/>Pick City from randomWords
    GameMaster->>GameMaster: Emit MissionStarted Event
    
    CRE->>CRE: Listen for MissionStarted
    CRE->>GameMaster: Read getMissionSalt(), getPlayerPubKey()
    CRE->>CRE: Brute-force hash → city selection
    CRE->>CRE: Select clue from database
    CRE->>CRE: ECIES encrypt clue with player pubKey
    
    CRE->>AI: Call OpenAI for briefing narrative
    AI-->>CRE: Briefing text
    CRE->>AI: Call ElevenLabs for audio
    AI-->>CRE: Audio file
    
    CRE->>AI: Upload to IPFS
    AI-->>CRE: IPFS hash
    
    CRE->>Keystone: Sign Report<br/>{missionId, clueHash, cluePtr}
    Keystone-->>CRE: Signed Report
    
    CRE->>GameMaster: Send via Keystone Router
    GameMaster->>GameMaster: Verify Keystone Signature
    GameMaster->>GameMaster: receiveClue(missionId, clueHash, cluePtr)
    GameMaster->>GameMaster: Emit ClueReceived Event
    
    Frontend->>GameMaster: Listen for ClueReceived
    Frontend->>Frontend: Fetch clue from IPFS
    Frontend->>Frontend: ECIES decrypt with player privKey
    Frontend->>Player: Display Briefing + Audio
    
    Player->>Frontend: Click City to Investigate
    Frontend->>GameMaster: submitInvestigation(chainId)
    GameMaster->>VRF: Request Randomness (clue type)
    
    VRF->>GameMaster: fulfillRandomWords(randomWords)
    GameMaster->>GameMaster: Determine Clue Type (text/audio)
    GameMaster->>GameMaster: Emit InvestigationSubmitted
    
    CRE->>CRE: Listen for InvestigationSubmitted
    CRE->>AI: Call OpenAI for clue
    AI-->>CRE: Clue text
    CRE->>AI: Call ElevenLabs if audio
    AI-->>CRE: Audio file
    CRE->>AI: Upload to IPFS
    
    CRE->>Keystone: Sign Report
    CRE->>GameMaster: Send Clue via Keystone
    GameMaster->>Frontend: ClueReceived Event
    Frontend->>Player: Display Clue
    
    Player->>Frontend: Click "Capture Carmen"
    Frontend->>GameMaster: captureCarmen(missionId)
    GameMaster->>GameMaster: Verify Carmen Location
    alt Carmen Found
        GameMaster->>GameMaster: Calculate Reward (blocks used)
        GameMaster->>GameMaster: Mint NFT Trophy
        GameMaster->>GameMaster: Emit CarmenCaptured
        
        CRE->>CRE: Listen for CarmenCaptured
        CRE->>AI: Generate personalized ending
        AI-->>CRE: Finale narrative
        CRE->>AI: Upload to IPFS
        
        Frontend->>Player: ✓ Mission Complete!<br/>Display Trophy + Reward
    else Wrong Location
        GameMaster-->>Frontend: ✗ Carmen Not Here
        Frontend->>Player: Try Another City
    end
```

---

## 4. CRE Workflow Orchestration

```mermaid
graph TB
    subgraph Events["📡 On-Chain Events"]
        E1["MissionStarted"]
        E2["InvestigationSubmitted"]
        E3["CarmenCaptured"]
        E4["Cron 3min"]
    end

    subgraph Workflows["🤖 CRE Workflows"]
        W1["mission-start<br/>Brute-force hash<br/>Select clue<br/>ECIES encrypt"]
        W2["generate-briefing<br/>Call OpenAI<br/>Call ElevenLabs<br/>Upload IPFS"]
        W3["generate-clue<br/>Call OpenAI<br/>Call ElevenLabs<br/>Upload IPFS"]
        W4["carmen-moves<br/>Pick random city<br/>Update presence<br/>Write to CityNode"]
        W5["generate-finale<br/>Personalized story<br/>Call OpenAI<br/>Upload IPFS"]
    end

    subgraph ExternalAPIs["🌐 External APIs"]
        API1["OpenAI GPT-4o-mini<br/>Text Generation"]
        API2["ElevenLabs<br/>Audio Generation"]
        API3["IPFS/Pinata<br/>Content Storage"]
        API4["Alchemy RPC<br/>Read Contract State"]
    end

    subgraph OnChainWrites["⛓️ On-Chain Writes"]
        Write1["receiveClue()<br/>via Keystone"]
        Write2["updateTarget()<br/>Carmen moves"]
    end

    E1 -->|"Trigger"| W1
    E1 -->|"Trigger"| W2
    E2 -->|"Trigger"| W3
    E3 -->|"Trigger"| W5
    E4 -->|"Trigger"| W4

    W1 -->|"Encrypt"| W2
    W2 -->|"HTTP Fetch"| API1
    W2 -->|"HTTP Fetch"| API2
    W2 -->|"Upload"| API3
    W2 -->|"Sign & Send"| Write1

    W3 -->|"HTTP Fetch"| API1
    W3 -->|"HTTP Fetch"| API2
    W3 -->|"Upload"| API3
    W3 -->|"Sign & Send"| Write1

    W4 -->|"Read State"| API4
    W4 -->|"Sign & Send"| Write2

    W5 -->|"HTTP Fetch"| API1
    W5 -->|"Upload"| API3

    Write1 -->|"Keystone Router"| OnChainWrites
    Write2 -->|"Keystone Router"| OnChainWrites

    style Events fill:#e3f2fd
    style Workflows fill:#f3e5f5
    style ExternalAPIs fill:#fff9c4
    style OnChainWrites fill:#e8f5e9
```

---

## 5. Multi-Chain Interaction

```mermaid
graph TB
    subgraph Sepolia["⛓️ Sepolia (HQ)"]
        GM["GameMaster.sol<br/>Carmen Location<br/>Mission State"]
        Proxy["GameMasterProxy<br/>CRE Report Router"]
    end

    subgraph Arbitrum["⛓️ Arbitrum Sepolia<br/>(Tokyo)"]
        Tokyo["CityNode.sol<br/>Carmen Presence<br/>Investigation Results"]
    end

    subgraph Base["⛓️ Base Sepolia<br/>(Paris)"]
        Paris["CityNode.sol<br/>Carmen Presence<br/>Investigation Results"]
    end

    subgraph CRE["🤖 CRE Workflows"]
        CarmenMoves["carmen-moves<br/>Cron: Every 3 min<br/>Pick random city<br/>Update presence"]
    end

    subgraph Keystone["🔐 Keystone Router"]
        Sign["Sign Cross-Chain<br/>Call Report"]
    end

    GM -->|"Read: getMission()"| CarmenMoves
    GM -->|"Read: getValidCities()"| CarmenMoves
    
    CarmenMoves -->|"Determine new city"| CarmenMoves
    CarmenMoves -->|"Sign Report"| Sign
    
    Sign -->|"Route to Arbitrum"| Tokyo
    Sign -->|"Route to Base"| Paris
    
    Tokyo -->|"updateCarmenPresence()"| Tokyo
    Paris -->|"updateCarmenPresence()"| Paris
    
    Tokyo -->|"Player queries"| Tokyo
    Paris -->|"Player queries"| Paris
    
    Tokyo -->|"Cross-chain read"| GM
    Paris -->|"Cross-chain read"| GM

    style Sepolia fill:#f3e5f5
    style Arbitrum fill:#e8f5e9
    style Base fill:#c8e6c9
    style CRE fill:#fce4ec
    style Keystone fill:#f1f8e9
```

---

## 6. Data Encryption Flow

```mermaid
sequenceDiagram
    participant Player as 👤 Player
    participant Frontend as 🎮 Frontend
    participant CRE as 🤖 CRE
    participant IPFS as 💾 IPFS

    Player->>Frontend: Register (generate ECIES keypair)
    Frontend->>Frontend: Generate ECIES keypair
    Frontend->>Frontend: Store privKey in IndexedDB
    Frontend->>Frontend: Send pubKey to contract

    CRE->>Frontend: Read getPlayerPubKey(address)
    Frontend-->>CRE: pubKey = 0x...

    CRE->>CRE: Generate clue text
    CRE->>CRE: ECIES encrypt clue
    CRE->>IPFS: Upload encrypted clue
    IPFS-->>CRE: IPFS hash

    CRE->>Frontend: Send clueHash + IPFS pointer

    Frontend->>IPFS: Fetch encrypted clue
    IPFS-->>Frontend: Encrypted data

    Frontend->>Frontend: ECIES decrypt with privKey
    Frontend->>Player: Display decrypted clue

    Note over Frontend,CRE: Only player can decrypt!
```

---

## 7. VRF Randomness Flow

```mermaid
graph TB
    subgraph Player["👤 Player"]
        Action["Call startMission()<br/>or submitInvestigation()"]
    end

    subgraph GameMaster["⛓️ GameMaster.sol"]
        Request["Request VRF<br/>requestRandomWords()"]
        Callback["Callback<br/>fulfillRandomWords()"]
        Logic["Determine Outcome<br/>Based on randomWords"]
    end

    subgraph VRF["🎲 Chainlink VRF v2.5"]
        Coordinator["VRF Coordinator"]
        Generate["Generate Random<br/>Cryptographically Secure"]
        Verify["Verify Proof<br/>On-Chain"]
    end

    Player -->|"tx"| Action
    Action -->|"Call"| Request
    Request -->|"Request ID"| Coordinator
    
    Coordinator -->|"Off-chain"| Generate
    Generate -->|"Proof + Output"| Verify
    Verify -->|"Valid?"| Callback
    
    Callback -->|"randomWords"| Logic
    Logic -->|"Carmen Location"| Logic
    Logic -->|"Clue Type"| Logic
    Logic -->|"Clue Veracity"| Logic
    
    Logic -->|"Emit Event"| Player

    style Player fill:#e1f5ff
    style GameMaster fill:#f3e5f5
    style VRF fill:#e8f5e9
```

---

## 8. Reward System Flow

```mermaid
graph TB
    subgraph Mission["🎮 Mission"]
        Start["Mission Starts<br/>Block N"]
        Capture["Carmen Captured<br/>Block N+X"]
    end

    subgraph Calculation["📊 Reward Calculation"]
        BlocksUsed["Blocks Used = N+X - N"]
        Tier["Determine Tier<br/>Based on Blocks"]
    end

    subgraph Rewards["🏆 Rewards"]
        Gold["Gold: 0-20 blocks<br/>100 points<br/>Rare NFT"]
        Silver["Silver: 21-35 blocks<br/>75 points<br/>Uncommon NFT"]
        Bronze["Bronze: 36-50 blocks<br/>50 points<br/>Common NFT"]
        Failed["Failed: 51+ blocks<br/>0 points<br/>No NFT"]
    end

    subgraph NFT["🎁 NFT Mint"]
        Mint["Mint MissionNFT<br/>ERC-721 Trophy<br/>Metadata: Blocks Used<br/>Metadata: Tier"]
        Store["Store in Player<br/>Wallet"]
    end

    Start -->|"Record Block"| BlocksUsed
    Capture -->|"Record Block"| BlocksUsed
    
    BlocksUsed -->|"Calculate"| Tier
    
    Tier -->|"0-20"| Gold
    Tier -->|"21-35"| Silver
    Tier -->|"36-50"| Bronze
    Tier -->|"51+"| Failed
    
    Gold -->|"Mint"| Mint
    Silver -->|"Mint"| Mint
    Bronze -->|"Mint"| Mint
    Failed -->|"No Mint"| Failed
    
    Mint -->|"Transfer"| Store

    style Mission fill:#e1f5ff
    style Calculation fill:#fff9c4
    style Rewards fill:#f3e5f5
    style NFT fill:#e8f5e9
```

---

**Last Updated:** February 2026
