# Carmen Sandiego On-Chain - Complete Documentation Index

Welcome to the Carmen Sandiego On-Chain documentation. This index guides you through all resources organized by audience and use case.

---

## Quick Navigation

### For Hackathon Evaluators
Start here to understand the innovation and technical depth:

1. **[Technical Overview](./TECHNICAL_OVERVIEW.md)** - Complete technical breakdown of Chainlink CRE integration
2. **[System Diagrams](./SYSTEM_DIAGRAMS.md)** - Visual architecture and flow diagrams (Mermaid)
3. **[Innovation](./INNOVATION.md)** - Why this project is innovative and unique
4. **[System Flows](./SYSTEM_FLOWS.md)** - Detailed step-by-step flows for all major interactions
5. **[Security Audit](./SECURITY_AUDIT.md)** - Security analysis and threat model

### For Developers - Getting Started
Complete setup and deployment guides:

1. **[Project README](../README.md)** - Project overview and quickstart
2. **[Setup Guide](../SETUP.md)** - Environment setup instructions
3. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
4. **[E2E Test Guide](../E2E_TEST_GUIDE.md)** - End-to-end testing walkthrough

### For Component-Specific Development

#### Smart Contracts
- **[Contracts README](../contracts/README.md)** - Setup, testing, deployment
- **[Contracts API](./contracts-api.md)** - Complete contract API reference

#### Frontend
- **[Frontend README](../frontend/README.md)** - Setup, development, building
- **[Frontend Architecture](./frontend-architecture.md)** - Frontend structure and patterns

#### Chainlink CRE Workflows
- **[CRE Workflows README](../cre-workflows/README.md)** - Setup, simulation, deployment
- **[Mission Start Workflow](../cre-workflows/mission-start/README.md)** - Mission start workflow details
- **[CityNode Resolver Workflow](../cre-workflows/citynode-resolver/README.md)** - CityNode resolver workflow details
- **[CRE Coolify Deploy](../CRE_COOLIFY_DEPLOY.md)** - CRE deployment on Coolify

#### Chainlink Functions Relayer
- **[Relayer README](../chainlink-functions/README.md)** - Setup and deployment

---

## Documentation by Topic

### Game Design & Gameplay
- **[Game Flow](../GAME_FLOW.md)** - Complete game flow walkthrough
- **[Gameplay Balance](./GAMEPLAY_BALANCE.md)** - Game balance mechanics and tuning
- **[System Flows](./SYSTEM_FLOWS.md)** - Detailed step-by-step interaction flows

### Architecture & Design
- **[Technical Overview](./TECHNICAL_OVERVIEW.md)** - Complete technical breakdown
- **[System Diagrams](./SYSTEM_DIAGRAMS.md)** - Visual diagrams (Mermaid)
- **[Frontend Architecture](./frontend-architecture.md)** - Frontend design patterns
- **[Innovation](./INNOVATION.md)** - Innovation highlights

### Security
- **[Security Audit](./SECURITY_AUDIT.md)** - Security analysis and threat model

### Technical Implementation
- **[Contracts API](./contracts-api.md)** - Contract API reference
- **[System Flows](./SYSTEM_FLOWS.md)** - All major interaction flows
- **[CRE Workflows README](../cre-workflows/README.md)** - Workflow setup and simulation

### Deployment & Operations
- **[Setup Guide](../SETUP.md)** - Environment setup
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Testnet deployment
- **[CRE Coolify Deploy](../CRE_COOLIFY_DEPLOY.md)** - CRE deployment on Coolify
- **[E2E Test Guide](../E2E_TEST_GUIDE.md)** - End-to-end testing

---

## Component Setup Links

Each component has its own README with setup instructions:

| Component | README | Purpose |
|-----------|--------|---------|
| **Contracts** | [contracts/README.md](../contracts/README.md) | Smart contracts (Hardhat + Solidity) |
| **Frontend** | [frontend/README.md](../frontend/README.md) | React game interface |
| **CRE Workflows** | [cre-workflows/README.md](../cre-workflows/README.md) | Chainlink CRE workflows (TypeScript) |
| **Relayer** | [chainlink-functions/README.md](../chainlink-functions/README.md) | Gasless registration relayer |

---

## Getting Started (5 Minutes)

### 1. Prerequisites
- Node.js v20+
- Testnet ETH on Sepolia, Arbitrum Sepolia, Base Sepolia
- API keys: Alchemy/Infura, Privy (OpenAI and ElevenLabs planned for CRE v2)

### 2. Clone & Install
```bash
git clone https://github.com/mtrn87/carmen-sandiego-onchain.git
cd carmen-sandiego-onchain
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys and RPC URLs
```

### 4. Run Components
See individual README files for each component:
- **Contracts**: [contracts/README.md](../contracts/README.md)
- **Frontend**: [frontend/README.md](../frontend/README.md)
- **CRE Workflows**: [cre-workflows/README.md](../cre-workflows/README.md)
- **Relayer**: [chainlink-functions/README.md](../chainlink-functions/README.md)

---

## Chainlink Integration

This project is built on six Chainlink services, making it one of the most comprehensive Chainlink integrations in the hackathon:

- **[Chainlink CRE](https://docs.chain.link/cre)** - Compute Runtime Environment for off-chain AI workflow orchestration (briefing generation, clue evaluation, Carmen movement)
- **[Chainlink VRF v2.5](https://docs.chain.link/vrf)** - Provably fair randomness for mission salt generation and scenario selection
- **[Chainlink Functions](https://docs.chain.link/chainlink-functions)** - Serverless compute for the gasless registration relayer
- **[Chainlink Automation](https://docs.chain.link/chainlink-automation)** - Scheduled Carmen movements and time-based game events
- **[Chainlink Data Feeds](https://docs.chain.link/data-feeds)** - Price oracles for reward valuation and in-game economics
- **[Chainlink CCIP](https://docs.chain.link/ccip)** - Cross-chain interoperability for multi-chain gameplay across Sepolia, Arbitrum Sepolia, Base Sepolia, and XDC Apothem

See [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) for detailed Chainlink integration documentation.

---

## Architecture Overview

```
+-------------------------------------------------------------+
|                    Carmen Sandiego On-Chain                  |
+-------------------------------------------------------------+
|                                                             |
|  Frontend (React)  ->  Smart Contracts  ->  Chainlink CRE  |
|                            |                                |
|           Multi-Chain (Sepolia, Arb Sep, Base Sep, XDC)     |
|                            |                                |
|         VRF | Functions | Automation | Data Feeds | CCIP    |
|                                                             |
+-------------------------------------------------------------+
```

See [SYSTEM_DIAGRAMS.md](./SYSTEM_DIAGRAMS.md) for detailed architecture diagrams.

---

## Learning Path

**New to the project?** Follow this learning path:

1. Read [README.md](../README.md) - Project overview
2. Read [Game Flow](../GAME_FLOW.md) - Understand how the game works
3. Read [Technical Overview](./TECHNICAL_OVERVIEW.md) - Technical details
4. View [System Diagrams](./SYSTEM_DIAGRAMS.md) - Visual architecture
5. Read [Innovation](./INNOVATION.md) - What makes this project unique
6. Read [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Setup instructions
7. Explore component READMEs for specific development

---

## Documentation Standards

All documentation follows these standards:

- **Markdown format** with clear headings
- **Links between related documents** for easy navigation
- **Code examples** with language highlighting
- **Diagrams** using Mermaid for complex flows (see [diagrams/](./diagrams/))
- **Table of contents** for long documents
- **Prerequisites** clearly listed at the top

---

## Finding What You Need

### I want to...
- **Understand the game** -> [Game Flow](../GAME_FLOW.md)
- **See gameplay balance** -> [Gameplay Balance](./GAMEPLAY_BALANCE.md)
- **Set up locally** -> [Setup Guide](../SETUP.md)
- **Deploy to testnet** -> [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- **Run end-to-end tests** -> [E2E Test Guide](../E2E_TEST_GUIDE.md)
- **Understand Chainlink integration** -> [Technical Overview](./TECHNICAL_OVERVIEW.md)
- **See visual diagrams** -> [System Diagrams](./SYSTEM_DIAGRAMS.md)
- **Understand workflows** -> [System Flows](./SYSTEM_FLOWS.md)
- **Review security** -> [Security Audit](./SECURITY_AUDIT.md)
- **See the innovation** -> [Innovation](./INNOVATION.md)
- **Deploy CRE on Coolify** -> [CRE Coolify Deploy](../CRE_COOLIFY_DEPLOY.md)

---

## Quick Reference

| Topic | Document |
|-------|----------|
| Project Overview | [README.md](../README.md) |
| Game Flow | [Game Flow](../GAME_FLOW.md) |
| Gameplay Balance | [Gameplay Balance](./GAMEPLAY_BALANCE.md) |
| Smart Contracts | [Contracts API](./contracts-api.md) |
| Frontend | [Frontend Architecture](./frontend-architecture.md) |
| CRE Workflows | [CRE Workflows README](../cre-workflows/README.md) |
| Deployment | [Deployment Guide](./DEPLOYMENT_GUIDE.md) |
| Chainlink | [Technical Overview](./TECHNICAL_OVERVIEW.md) |
| Security | [Security Audit](./SECURITY_AUDIT.md) |
| Innovation | [Innovation](./INNOVATION.md) |

---

## Next Steps

1. **Read the main README**: [README.md](../README.md)
2. **Choose your path**: Evaluator, Developer, or Component-specific
3. **Follow the documentation**: Each section has links to related docs
4. **Set up locally**: Follow [Setup Guide](../SETUP.md) and [Deployment Guide](./DEPLOYMENT_GUIDE.md)
5. **Deploy to testnet**: Follow component READMEs

---

**Last Updated:** March 2026
**Status:** Complete and ready for evaluation
