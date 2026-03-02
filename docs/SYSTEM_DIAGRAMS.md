# System Diagrams — Carmen Sandiego On-Chain

Visual representations of system architecture, data flows, and gameplay mechanics.

---

## 1. System Architecture Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (React)"]
        UI["React UI<br/>Zustand Store<br/>Privy Auth"]
        Wallet["Embedded Wallet<br/>Google OAuth<br/>ECIES Encryption"]
    end

    subgraph Relayer["Relayer Server (3001)"]
        Validate["Validate Signature<br/>ECDSA Recovery"]
        Register["Call registerPlayer()<br/>Pay Gas"]
    end

    subgraph Sepolia["Sepolia (HQ)"]
        GameMaster["GameMaster.sol<br/>VRF Consumer<br/>Commit-Reveal State"]
        Registry["PlayerRegistry.sol<br/>Player Data<br/>Nonce Tracking"]
        Proxy["GameMasterProxy<br/>CRE Report Router<br/>Keystone Validator"]
        NFT["MissionNFT.sol<br/>ERC-721 Trophy"]
        CCIPRouter["CCIP Router<br/>Cross-Chain Messaging"]
    end

    subgraph VRF["Chainlink VRF v2.5"]
        Random["Randomness<br/>Coordinator"]
    end

    subgraph DataFeeds["Chainlink Data Feeds"]
        PriceFeed["ETH/USD<br/>AggregatorV3"]
    end

    subgraph CRE["CRE Workflows"]
        MissionStartWF["mission-start<br/>Brute-force hash + ECIES encrypt"]
        BriefingWF["generate-briefing<br/>Mission narrative"]
        FinaleWF["generate-finale<br/>Personalized ending"]
        CarmenWF["carmen-moves<br/>Cron every 3 min"]
        PlayerRegWF["player-registration<br/>Gasless registration"]
        PlayerCheckWF["player-check<br/>Player state validation"]
        CityResolverWF["citynode-resolver<br/>Clue/Dossier/Capture routing"]
    end

    subgraph Keystone["Keystone Router"]
        Sign["Sign Reports<br/>Validate Signatures"]
    end

    subgraph Cities["City Chains"]
        Tokyo["CityNode (Arbitrum Sepolia)<br/>Tokyo"]
        Paris["CityNode (Base Sepolia)<br/>Paris"]
        Sydney["CityNode (XDC Apothem)<br/>Sydney"]
    end

    subgraph AI["AI Services"]
        OpenAI["OpenAI GPT-4o-mini<br/>(coded, CRE v2 ready)"]
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

    CRE -->|"HTTP Fetch"| OpenAI

    CRE -->|"Sign Report"| Keystone
    Keystone -->|"Validate & Route"| Proxy
    Proxy -->|"receiveClue()"| GameMaster

    GameMaster -->|"broadcastCarmenMove()"| CCIPRouter
    CCIPRouter -->|"CCIP _ccipReceive()"| Tokyo
    CCIPRouter -->|"CCIP _ccipReceive()"| Paris
    CCIPRouter -->|"CCIP _ccipReceive()"| Sydney

    GameMaster -->|"Mint NFT"| NFT
    GameMaster -->|"Read ETH/USD"| PriceFeed

    style Frontend fill:#e1f5ff
    style Relayer fill:#fff3e0
    style Sepolia fill:#f3e5f5
    style VRF fill:#e8f5e9
    style DataFeeds fill:#e8f5e9
    style CRE fill:#fce4ec
    style Keystone fill:#f1f8e9
    style Cities fill:#ede7f6
    style AI fill:#fff9c4
```

---

## 2. Gasless Registration Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Privy as Privy
    participant Relayer as Relayer (3001)
    participant Contract as PlayerRegistry
    participant Storage as localStorage

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
        Contract-->>Relayer: txHash
        Relayer-->>Frontend: {success: true, txHash, blockNumber}

        Frontend->>Storage: Save player_registered_address
        Frontend->>Storage: Save player_nickname
        Frontend->>User: Registration Complete!
        Frontend->>Frontend: Navigate to /game
    else Signature Invalid
        Relayer-->>Frontend: {success: false, error: "Invalid signature"}
        Frontend->>User: Registration Failed
    end
```

---

## 3. Gameplay Flow

```mermaid
sequenceDiagram
    participant Player as Player
    participant Frontend as Frontend
    participant GameMaster as GameMaster
    participant VRF as VRF
    participant CRE as CRE
    participant AI as OpenAI (coded, CRE v2 ready)
    participant Keystone as Keystone
    participant CCIP as CCIP Router
    participant CityNode as CityNodes

    Player->>Frontend: Click "Start Mission"
    Frontend->>GameMaster: startMission()
    GameMaster->>GameMaster: Create Mission Struct
    GameMaster->>VRF: requestRandomWords()
    GameMaster-->>Frontend: Mission Created

    VRF->>VRF: Generate Random Number
    VRF->>GameMaster: fulfillRandomWords(randomWords)
    GameMaster->>GameMaster: salt = keccak256(vrfWord, missionId)
    GameMaster->>GameMaster: targetHash = keccak256(chainId, salt)
    GameMaster->>GameMaster: Store targetHash on-chain (commit-reveal)
    GameMaster->>GameMaster: Emit MissionStarted Event

    Note over CRE: generate-briefing workflow<br/>LogTrigger: MissionStarted

    CRE->>GameMaster: Read getMissionSalt(), getPlayerPubKey()
    CRE->>CRE: Select scenario-based template narrative
    CRE->>CRE: ECIES encrypt briefing with player pubKey
    CRE->>Keystone: Sign Report
    Keystone->>GameMaster: Keystone Forwarder -> GameMasterProxy -> receiveClue()
    GameMaster->>GameMaster: Emit ClueReceived Event

    Frontend->>GameMaster: Listen for ClueReceived event
    Frontend->>Frontend: Read encrypted data from on-chain event
    Frontend->>Frontend: ECIES decrypt with player privKey (IndexedDB)
    Frontend->>Player: Display Mission Briefing

    Player->>Frontend: Click City to Investigate
    Frontend->>GameMaster: submitInvestigation(chainId)
    GameMaster->>GameMaster: Emit InvestigationSubmitted Event

    Note over CRE: mission-start workflow<br/>LogTrigger: InvestigationSubmitted

    CRE->>GameMaster: Read getMissionSalt(), getPlayerPubKey()
    CRE->>CRE: Brute-force 3 chain IDs -> find Carmen city
    CRE->>CRE: Decide true/false clue (CRE as trusted arbiter)
    CRE->>CRE: Select scenario-based template clue
    CRE->>CRE: ECIES encrypt clue with player pubKey
    CRE->>Keystone: Sign Report
    Keystone->>GameMaster: Keystone Forwarder -> GameMasterProxy -> receiveClue()
    GameMaster->>GameMaster: Emit ClueReceived Event

    Frontend->>GameMaster: Listen for ClueReceived event
    Frontend->>Frontend: Read encrypted clue from on-chain event
    Frontend->>Frontend: ECIES decrypt with player privKey
    Frontend->>Player: Display Investigation Clue

    Player->>Frontend: Click "Capture Carmen"
    Frontend->>GameMaster: captureCarmen(missionId)
    GameMaster->>GameMaster: Verify against targetHash (reveal phase)
    alt Carmen Found
        GameMaster->>GameMaster: Calculate Reward (blocks used)
        GameMaster->>GameMaster: Mint NFT Trophy
        GameMaster->>GameMaster: Emit CarmenCaptured

        Note over CRE: generate-finale workflow<br/>LogTrigger: CarmenCaptured

        CRE->>CRE: Generate personalized ending
        CRE->>Keystone: Sign Report
        Keystone->>GameMaster: Deliver finale on-chain

        Frontend->>Player: Mission Complete! Display Trophy + Reward
    else Wrong Location
        GameMaster-->>Frontend: Carmen Not Here
        Frontend->>Player: Try Another City
    end
```

---

## 4. CRE Workflow Orchestration

```mermaid
graph TB
    subgraph Events["On-Chain Events / Triggers"]
        E1["InvestigationSubmitted<br/>(LogTrigger)"]
        E2["MissionStarted<br/>(LogTrigger)"]
        E3["CarmenCaptured<br/>(LogTrigger)"]
        E4["Cron 3min<br/>(CronCapability)"]
        E5["RegistrationRequested<br/>(LogTrigger)"]
        E6["PlayerCheckRequested<br/>(LogTrigger)"]
        E7["ClueRequested /<br/>DossierRequested /<br/>CaptureRequested<br/>(LogTrigger)"]
    end

    subgraph Workflows["CRE Workflows"]
        W1["mission-start<br/>Brute-force hash<br/>Select clue<br/>ECIES encrypt"]
        W2["generate-briefing<br/>Scenario-based narrative<br/>ECIES encrypt"]
        W3["generate-finale<br/>Personalized ending<br/>ECIES encrypt"]
        W4["carmen-moves<br/>Pick random city<br/>Trigger broadcastCarmenMove()<br/>CCIP to CityNodes"]
        W5["player-registration<br/>Gasless registration<br/>Validate + register"]
        W6["player-check<br/>Player state validation<br/>Read on-chain data"]
        W7["citynode-resolver<br/>Route clue/dossier/capture<br/>Cross-chain resolution"]
    end

    subgraph ExternalAPIs["External APIs"]
        API1["OpenAI GPT-4o-mini<br/>(coded, CRE v2 ready)"]
        API4["Alchemy / Public RPCs<br/>Cross-chain reads"]
    end

    subgraph OnChainWrites["On-Chain Writes"]
        Write1["receiveClue()<br/>via Keystone Forwarder<br/>-> GameMasterProxy<br/>-> GameMaster"]
        Write2["broadcastCarmenMove()<br/>-> CCIP Router<br/>-> CityNode._ccipReceive()"]
        Write3["registerPlayer()<br/>via Keystone"]
    end

    E1 -->|"Trigger"| W1
    E2 -->|"Trigger"| W2
    E3 -->|"Trigger"| W3
    E4 -->|"Trigger"| W4
    E5 -->|"Trigger"| W5
    E6 -->|"Trigger"| W6
    E7 -->|"Trigger"| W7

    W1 -->|"Read contract state"| API4
    W1 -->|"Sign & Send"| Write1

    W2 -->|"Read contract state"| API4
    W2 -->|"Sign & Send"| Write1

    W3 -->|"HTTP Fetch (coded, v2)"| API1
    W3 -->|"Sign & Send"| Write1

    W4 -->|"Read State"| API4
    W4 -->|"Sign & Send"| Write2

    W5 -->|"Sign & Send"| Write3

    W6 -->|"Read State"| API4

    W7 -->|"Read State"| API4
    W7 -->|"Sign & Send"| Write1

    style Events fill:#e3f2fd
    style Workflows fill:#f3e5f5
    style ExternalAPIs fill:#fff9c4
    style OnChainWrites fill:#e8f5e9
```

---

## 5. Multi-Chain Interaction

```mermaid
graph TB
    subgraph Sepolia["Sepolia (HQ)"]
        GM["GameMaster.sol<br/>Commit-Reveal State<br/>targetHash on-chain"]
        Proxy["GameMasterProxy<br/>CRE Report Router"]
        Router["CCIP Router<br/>Cross-Chain Messaging"]
    end

    subgraph Arbitrum["Arbitrum Sepolia (Tokyo)"]
        Tokyo["CityNode.sol<br/>Carmen Presence<br/>Investigation Results"]
    end

    subgraph Base["Base Sepolia (Paris)"]
        Paris["CityNode.sol<br/>Carmen Presence<br/>Investigation Results"]
    end

    subgraph XDC["XDC Apothem (Sydney)"]
        Sydney["CityNode.sol<br/>Carmen Presence<br/>Investigation Results"]
    end

    subgraph CRE["CRE Workflows"]
        CarmenMoves["carmen-moves<br/>CronCapability: Every 3 min<br/>Pick random city<br/>Trigger broadcastCarmenMove()"]
    end

    subgraph Keystone["Keystone Router"]
        Sign["Sign Cross-Chain<br/>Call Report"]
    end

    GM -->|"Read: getMission()"| CarmenMoves
    GM -->|"Read: getValidCities()"| CarmenMoves

    CarmenMoves -->|"Determine new city"| CarmenMoves
    CarmenMoves -->|"Sign Report"| Sign

    Sign -->|"Keystone -> GameMaster"| GM
    GM -->|"broadcastCarmenMove()"| Router

    Router -->|"CCIP _ccipReceive()"| Tokyo
    Router -->|"CCIP _ccipReceive()"| Paris
    Router -->|"CCIP _ccipReceive()"| Sydney

    Tokyo -->|"Player investigates"| Tokyo
    Paris -->|"Player investigates"| Paris
    Sydney -->|"Player investigates"| Sydney

    style Sepolia fill:#f3e5f5
    style Arbitrum fill:#e8f5e9
    style Base fill:#c8e6c9
    style XDC fill:#b2dfdb
    style CRE fill:#fce4ec
    style Keystone fill:#f1f8e9
```

---

## 6. Data Encryption Flow

```mermaid
sequenceDiagram
    participant Player as Player
    participant Frontend as Frontend
    participant Contract as GameMaster (on-chain)
    participant CRE as CRE Workflow
    participant Keystone as Keystone Forwarder
    participant Proxy as GameMasterProxy

    Player->>Frontend: Register (generate ECIES keypair)
    Frontend->>Frontend: Generate secp256k1 ECIES keypair
    Frontend->>Frontend: Store privKey in IndexedDB
    Frontend->>Contract: setPlayerPubKey(pubKey)

    Note over CRE: Triggered by InvestigationSubmitted or MissionStarted

    CRE->>Contract: Read getPlayerPubKey(address)
    Contract-->>CRE: pubKey = 0x04...

    CRE->>CRE: Generate clue / briefing content
    CRE->>CRE: ECIES encrypt with player pubKey (secp256k1)

    CRE->>Keystone: Sign Report with encrypted payload
    Keystone->>Proxy: Forward signed report
    Proxy->>Contract: receiveClue(missionId, encryptedData)
    Contract->>Contract: Emit ClueReceived(missionId, encryptedData)

    Frontend->>Contract: Listen for ClueReceived event
    Contract-->>Frontend: Event with encrypted data (on-chain)

    Frontend->>Frontend: ECIES decrypt with privKey (IndexedDB)
    Frontend->>Player: Display decrypted clue

    Note over Frontend,CRE: Only the player can decrypt -- privKey never leaves the browser
```

---

## 7. VRF Randomness Flow

```mermaid
graph TB
    subgraph Player["Player"]
        Action["Call startMission()"]
    end

    subgraph GameMaster["GameMaster.sol"]
        Request["requestRandomWords()<br/>VRF v2.5 request"]
        Callback["fulfillRandomWords()<br/>Receive randomWords"]
        GenSalt["Generate Salt<br/>salt = keccak256(vrfWord, missionId)"]
        ComputeHash["Compute Target Hash<br/>targetHash = keccak256(chainId, salt)"]
        StoreHash["Store targetHash on-chain<br/>(commit phase)"]
        EmitEvent["Emit MissionStarted Event"]
    end

    subgraph VRF["Chainlink VRF v2.5"]
        Coordinator["VRF Coordinator"]
        Generate["Generate Random<br/>Cryptographically Secure"]
        Verify["Verify Proof<br/>On-Chain"]
    end

    subgraph CREResolve["CRE Off-Chain Resolution"]
        ReadSalt["Read getMissionSalt()"]
        BruteForce["Brute-force 3 chain IDs<br/>keccak256(chainId, salt) == targetHash"]
        FindCity["Determine Carmen city"]
    end

    Player -->|"tx"| Action
    Action -->|"Call"| Request
    Request -->|"Request ID"| Coordinator

    Coordinator -->|"Off-chain"| Generate
    Generate -->|"Proof + Output"| Verify
    Verify -->|"Valid?"| Callback

    Callback -->|"randomWords"| GenSalt
    GenSalt -->|"salt"| ComputeHash
    ComputeHash -->|"targetHash"| StoreHash
    StoreHash --> EmitEvent

    EmitEvent -->|"Trigger CRE"| ReadSalt
    ReadSalt --> BruteForce
    BruteForce --> FindCity

    style Player fill:#e1f5ff
    style GameMaster fill:#f3e5f5
    style VRF fill:#e8f5e9
    style CREResolve fill:#fce4ec
```

---

## 8. Reward System Flow

```mermaid
graph TB
    subgraph Mission["Mission"]
        Start["Mission Starts<br/>Block N"]
        Capture["Carmen Captured<br/>Block N+X"]
    end

    subgraph Calculation["Reward Calculation"]
        BlocksUsed["Blocks Used = N+X - N"]
        Tier["Determine Tier<br/>Based on Blocks"]
    end

    subgraph DataFeed["Chainlink Data Feeds"]
        PriceFeed["ETH/USD AggregatorV3<br/>Read latest price"]
        MarketBonus["_applyMarketBonus()<br/>If ETH > $2500<br/>Apply bonus multiplier"]
    end

    subgraph Rewards["Rewards"]
        Gold["Gold: 0-20 blocks<br/>100 points<br/>Rare NFT"]
        Silver["Silver: 21-35 blocks<br/>75 points<br/>Uncommon NFT"]
        Bronze["Bronze: 36-50 blocks<br/>50 points<br/>Common NFT"]
        Copper["Copper: 51-200 blocks<br/>25 points<br/>Basic NFT"]
        Failed["Failed: 200+ blocks<br/>0 points<br/>No NFT"]
    end

    subgraph NFT["NFT Mint"]
        Mint["Mint MissionNFT<br/>ERC-721 Trophy<br/>Metadata: Blocks Used<br/>Metadata: Tier"]
        Store["Store in Player<br/>Wallet"]
    end

    Start -->|"Record Block"| BlocksUsed
    Capture -->|"Record Block"| BlocksUsed

    BlocksUsed -->|"Calculate"| Tier

    Tier -->|"0-20"| Gold
    Tier -->|"21-35"| Silver
    Tier -->|"36-50"| Bronze
    Tier -->|"51-200"| Copper
    Tier -->|"200+"| Failed

    Gold -->|"Check Price"| PriceFeed
    Silver -->|"Check Price"| PriceFeed
    Bronze -->|"Check Price"| PriceFeed
    Copper -->|"Check Price"| PriceFeed
    Failed -->|"No Mint"| Failed

    PriceFeed --> MarketBonus
    MarketBonus -->|"Final Points"| Mint

    Mint -->|"Transfer"| Store

    style Mission fill:#e1f5ff
    style Calculation fill:#fff9c4
    style DataFeed fill:#e8f5e9
    style Rewards fill:#f3e5f5
    style NFT fill:#e8f5e9
```

---

**Last Updated:** March 2026
