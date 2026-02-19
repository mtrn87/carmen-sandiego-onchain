<p align="center">
  <img src="./.github/assets/logo.png" alt="Where in the Web3 World is Carmen Sandiego?" width="500"/>
</p>

<h1 align="center">Where in the Web3 World is Carmen Sandiego?</h1>

<h3 align="center">🎮 A Fully Decentralized AI-Powered Mystery Game on Blockchain</h3>

<p align="center">
  <a href="https://chain.link/hackathon"><img src="https://img.shields.io/badge/Chainlink-Convergence%20Hackathon-375BD2?style=for-the-badge&logo=chainlink&logoColor=white" alt="Chainlink Convergence"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Powered%20by-Chainlink%20CRE-375BD2?style=for-the-badge&logo=chainlink&logoColor=white" alt="Chainlink CRE"/></a>
  <a href="#"><img src="https://img.shields.io/badge/VRF-v2.5-9B59B6?style=for-the-badge" alt="VRF v2.5"/></a>
  <a href="#"><img src="https://img.shields.io/badge/Multi--Chain-Sepolia%20%7C%20Arbitrum%20%7C%20Base-FF6B6B?style=for-the-badge" alt="Multi-Chain"/></a>
</p>

<p align="center">
  <strong>🚀 The first blockchain game where an AI-powered Game Master lives entirely on Chainlink Runtime Environment (CRE)</strong>
</p>

<p align="center">
  <em>Provably fair • AI-driven gameplay • Cross-chain orchestration • Gasless registration</em>
</p>

<p align="center">
  <a href="https://instagram.com/carmenweb3"><img src="https://img.shields.io/badge/Instagram-@carmenweb3-E4405F?style=flat-square&logo=instagram&logoColor=white" alt="Instagram"/></a>
</p>

---

## The Mission

Carmen Sandiego stole a priceless NFT and is fleeing across blockchains. As an ACME detective, you must track her down using AI-generated clues -- text briefings and audio witnesses -- before she escapes for good.

Every mission is **unique**. Every clue is **generated in real-time by AI**. Every move is **provably fair**.

## How It Works

```
  YOU                    BLOCKCHAIN                   CRE + AI
  ===                    ==========                   ========

  Connect Wallet
       |
       +---> startMission() -----> VRF picks Carmen's
       |                           hiding chain
       |                                |
       |                           CRE generates
       |                           AI briefing
       |                                |
       +<---- Briefing (text/audio) <---+
       |
  Investigate a city
       |
       +---> submitInvestigation() --> VRF: true clue
       |                               or false lead?
       |                                |
       |                           CRE calls OpenAI
       |                           + ElevenLabs
       |                                |
       +<---- Clue (text or audio) <----+
       |
  Found her!
       |
       +---> captureCarmen() -------> Rewards based
                                      on blocks used
                                      Gold / Silver / Bronze
```

## 🔗 Chainlink Integration: The Heart of the Game

This project is built entirely on **Chainlink's cutting-edge infrastructure**. Without Chainlink, this game would be impossible:

### Why Chainlink CRE is Essential

Smart contracts alone **cannot** call AI APIs, generate audio, or orchestrate complex workflows. **Chainlink Runtime Environment (CRE)** is the breakthrough that makes this possible:

| Capability                          | Traditional Approach | With Chainlink CRE     |
| ----------------------------------- | -------------------- | ---------------------- |
| Call OpenAI for dynamic clues       | Impossible           | Native HTTP Fetch      |
| Generate witness audio (TTS)        | Impossible           | ElevenLabs integration |
| Orchestrate multi-step AI workflows | Complex oracle setup | Single workflow        |
| Read/write across multiple chains   | Requires bridges     | Native EVM Read/Write  |
| Gas cost for game logic             | Prohibitive          | Off-chain = $0         |

### Chainlink Services Used

| Service           | Purpose                                                                           | Implementation                                  |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| **CRE**           | Game Master Brain - Orchestrates AI, generates content, manages cross-chain state | 4 TypeScript workflows for complete game logic  |
| **VRF v2.5**      | Provably fair randomness for Carmen's location, clue types, and veracity          | Integrated in GameMaster.sol                    |
| **Automation**    | Cron-based Carmen movement across chains                                         | Scheduled workflow execution                    |

### CRE Workflows Architecture

| Workflow           | Trigger                      | AI Services Used                                | Output                                    |
| ------------------ | ---------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `generateBriefing` | MissionStarted event         | OpenAI GPT-4o-mini + ElevenLabs TTS             | Text briefing + audio narration            |
| `generateClue`     | InvestigationSubmitted event | OpenAI GPT-4o-mini + ElevenLabs TTS             | Dynamic clue + audio witness              |
| `carmenMoves`      | Cron schedule / conditions   | VRF for chain selection                         | Carmen relocates to random chain          |
| `generateFinale`   | CarmenCaptured event         | OpenAI GPT-4o-mini + ElevenLabs TTS             | Personalized ending based on gameplay     |

### Key Chainlink Features Leveraged

✅ **Decentralized Execution** - Game logic runs on Chainlink nodes, not centralized servers  
✅ **Cross-Chain Orchestration** - Single workflow manages state across Sepolia, Arbitrum, and Base  
✅ **Provable Fairness** - VRF ensures Carmen's location and clues are cryptographically random  
✅ **Real-time AI Integration** - Direct API calls to OpenAI and ElevenLabs from on-chain workflows  
✅ **Gasless User Experience** - Off-chain computation means zero gas for game logic

## Architecture

```
                          Ethereum Sepolia
                         ┌─────────────────┐
                         │  GameMaster.sol  │
                         │  (HQ Central)    │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │                           │
          Arbitrum Sepolia              Base Sepolia
         ┌──────────────┐            ┌──────────────┐
         │ CityNode.sol │            │ CityNode.sol │
         │   "Tokyo"    │            │   "Paris"    │
         └──────────────┘            └──────────────┘

Each blockchain = A city where Carmen might be hiding
```

## Tech Stack

| Layer           | Technology                                    |
| --------------- | --------------------------------------------- |
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin        |
| Chainlink       | CRE SDK, VRF v2.5                             |
| AI Services     | OpenAI GPT-4o-mini (text), ElevenLabs (audio) |
| Storage         | IPFS via Pinata                               |
| Frontend        | React, wagmi, viem, RainbowKit                |

## Project Structure

```
carmen-sandiego-onchain/
├── contracts/                # Solidity smart contracts (Hardhat)
│   ├── src/
│   │   ├── GameMaster.sol    # Main game contract (Sepolia)
│   │   ├── CityNode.sol      # Per-city contract (Arbitrum/Base)
│   │   └── interfaces/
│   ├── test/                 # 20 passing tests
│   └── scripts/              # Multi-chain deploy scripts
├── cre-workflows/            # CRE TypeScript workflows
├── frontend/                 # React game interface
└── docs/                     # Architecture & flow documentation
```

## Quick Start

### Prerequisites

- Node.js v20+
- Testnet ETH on Sepolia, Arbitrum Sepolia, Base Sepolia
- API keys: OpenAI, ElevenLabs, Alchemy/Infura

### Setup

```bash
# Clone
git clone https://github.com/mtrn87/carmen-sandiego-onchain.git
cd carmen-sandiego-onchain

# Install & compile contracts
cd contracts
npm install
npx hardhat compile

# Run tests
npx hardhat test

# Deploy (configure .env first - see .env.example)
npx hardhat run scripts/deploy-gamemaster.ts --network sepolia
npx hardhat run scripts/deploy-citynode.ts --network arbitrumSepolia
npx hardhat run scripts/deploy-citynode.ts --network baseSepolia
```

## Reward System

Performance is measured by blocks elapsed since mission start:

| Blocks Used | Rating | Reward     |
| ----------- | ------ | ---------- |
| 0-20        | Gold   | 100 points |
| 21-35       | Silver | 75 points  |
| 36-50       | Bronze | 50 points  |
| 51+         | Failed | 0          |

## 📚 Documentation

**👉 [Complete Documentation Index](docs/INDEX.md)** - Start here for organized navigation

### 🎯 For Hackathon Evaluators
Start here to understand the innovation and technical depth:

- **[Technical Overview](docs/TECHNICAL_OVERVIEW.md)** - Complete technical breakdown of Chainlink integration
- **[System Diagrams](docs/SYSTEM_DIAGRAMS.md)** - Visual architecture and flow diagrams (Mermaid)
- **[Innovation](docs/INNOVATION.md)** - Why this project is innovative and unique
- **[System Flows](docs/SYSTEM_FLOWS.md)** - Detailed step-by-step flows for all major interactions

### 👨‍💻 For Developers
Complete guides for setup, deployment, and development:

- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Complete setup and deployment instructions
- **[Architecture](docs/ARCHITECTURE.md)** - System architecture and contract design
- **[On-Chain Flow](docs/onchain-flow.md)** - Complete technical flow of all on-chain interactions

### 🔧 Component-Specific Setup
Each component has its own README with detailed setup instructions:

- **[Contracts](contracts/README.md)** - Smart contracts (Hardhat + Solidity)
- **[Frontend](frontend/README.md)** - React game interface
- **[CRE Workflows](cre-workflows/README.md)** - Chainlink CRE workflows
- **[Relayer](chainlink-functions/README.md)** - Gasless registration relayer

### 🚀 Quick Start
1. **Local Development:** See [Deployment Guide - Local Setup](docs/DEPLOYMENT_GUIDE.md#local-development-setup)
2. **Testnet Deployment:** See [Deployment Guide - Testnet](docs/DEPLOYMENT_GUIDE.md#testnet-deployment)
3. **Understanding the System:** Start with [Technical Overview](docs/TECHNICAL_OVERVIEW.md)
4. **Full Documentation:** See [Documentation Index](docs/INDEX.md)

## Team

Built for the **Chainlink Convergence Hackathon** -- where CRE meets AI meets Gaming.

---

<p align="center">
  <sub>Where in the Web3 World is Carmen Sandiego?</sub><br/>
  <sub>A provably-fair, AI-driven, multi-chain mystery game</sub>
</p>
