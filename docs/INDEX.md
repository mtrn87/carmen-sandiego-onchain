# 📚 Carmen Sandiego On-Chain - Complete Documentation Index

Welcome to the Carmen Sandiego On-Chain documentation. This index guides you through all resources organized by audience and use case.

---

## 🎯 Quick Navigation

### For Hackathon Evaluators
Start here to understand the innovation and technical depth:

1. **[Technical Overview](./TECHNICAL_OVERVIEW.md)** - Complete technical breakdown of Chainlink CRE integration
2. **[System Diagrams](./SYSTEM_DIAGRAMS.md)** - Visual architecture and flow diagrams (Mermaid)
3. **[Innovation](./INNOVATION.md)** - Why this project is innovative and unique
4. **[System Flows](./SYSTEM_FLOWS.md)** - Detailed step-by-step flows for all major interactions

### For Developers - Getting Started
Complete setup and deployment guides:

1. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Complete setup and deployment instructions
2. **[Architecture](./ARCHITECTURE.md)** - System architecture and contract design
3. **[On-Chain Flow](./onchain-flow.md)** - Complete technical flow of all on-chain interactions

### For Component-Specific Development

#### Smart Contracts
- **[Contracts README](../contracts/README.md)** - Setup, testing, deployment
- **[Contracts API](./contracts-api.md)** - Complete contract API reference
- **[On-Chain Flow](./onchain-flow.md)** - Detailed on-chain interaction flows

#### Frontend
- **[Frontend README](../frontend/README.md)** - Setup, development, building
- **[Frontend Architecture](./frontend-architecture.md)** - Frontend structure and patterns

#### Chainlink CRE Workflows
- **[CRE Workflows README](../cre-workflows/README.md)** - Setup, simulation, deployment
- **[Technical Workflows](./02-technical-workflows.md)** - Detailed workflow diagrams

#### Chainlink Functions Relayer
- **[Relayer README](../chainlink-functions/README.md)** - Setup and deployment
- **[Relayer Deployment](../chainlink-functions/RELAYER_DEPLOY_COOLIFY.md)** - Coolify deployment guide

---

## 📖 Documentation by Topic

### Game Design & Gameplay
- **[Gameplay Guide](./01-gameplay-guide.md)** - Complete gameplay walkthrough
- **[Game Scenarios](./03-game-scenarios.md)** - Detailed game scenarios
- **[Gameplay Loop](./gameplay-loop.md)** - Game loop mechanics
- **[Game Flow Walkthrough](./game-flow-walkthrough.md)** - Step-by-step game flow

### Architecture & Design
- **[Architecture](./ARCHITECTURE.md)** - System architecture overview
- **[Frontend Architecture](./frontend-architecture.md)** - Frontend design patterns
- **[System Diagrams](./SYSTEM_DIAGRAMS.md)** - Visual diagrams (Mermaid)

### Technical Implementation
- **[Technical Overview](./TECHNICAL_OVERVIEW.md)** - Complete technical breakdown
- **[On-Chain Flow](./onchain-flow.md)** - On-chain interaction flows
- **[Contracts API](./contracts-api.md)** - Contract API reference
- **[Technical Workflows](./02-technical-workflows.md)** - Workflow details

### Deployment & Operations
- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Setup and deployment
- **[Relayer Deployment](../chainlink-functions/RELAYER_DEPLOY_COOLIFY.md)** - Relayer deployment

### Project Planning
- **[MVP Action Plan](./04-mvp-action-plan.md)** - Project timeline and tasks
- **[Game Finalization](./GAME_FINALIZATION.md)** - Finalization checklist

---

## 🔗 Component Setup Links

Each component has its own README with setup instructions:

| Component | README | Purpose |
|-----------|--------|---------|
| **Contracts** | [contracts/README.md](../contracts/README.md) | Smart contracts (Hardhat + Solidity) |
| **Frontend** | [frontend/README.md](../frontend/README.md) | React game interface |
| **CRE Workflows** | [cre-workflows/README.md](../cre-workflows/README.md) | Chainlink CRE workflows (TypeScript) |
| **Relayer** | [chainlink-functions/README.md](../chainlink-functions/README.md) | Gasless registration relayer |

---

## 🚀 Getting Started (5 Minutes)

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
- **Contracts**: [contracts/README.md](../contracts/README.md#running-locally-tests)
- **Frontend**: [frontend/README.md](../frontend/README.md#rodando-o-dev-server)
- **CRE Workflows**: [cre-workflows/README.md](../cre-workflows/README.md#simulacao-local)
- **Relayer**: [chainlink-functions/README.md](../chainlink-functions/README.md#quick-start)

---

## 🔗 Chainlink Integration

This project is built entirely on Chainlink infrastructure:

- **[Chainlink CRE](https://docs.chain.link/cre)** - Runtime environment for AI workflows
- **[Chainlink VRF v2.5](https://docs.chain.link/vrf)** - Provably fair randomness
- **[Chainlink Automation](https://docs.chain.link/automation)** - Scheduled Carmen movements

See [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) for detailed Chainlink integration.

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Carmen Sandiego On-Chain                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Frontend (React)  →  Smart Contracts  →  Chainlink CRE     │
│                            ↓                                  │
│                    Multi-Chain (Sepolia, Arbitrum, Base)     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

See [SYSTEM_DIAGRAMS.md](./SYSTEM_DIAGRAMS.md) for detailed architecture diagrams.

---

## 🎓 Learning Path

**New to the project?** Follow this learning path:

1. Read [README.md](../README.md) - Project overview
2. Read [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) - Technical details
3. View [SYSTEM_DIAGRAMS.md](./SYSTEM_DIAGRAMS.md) - Visual architecture
4. Read [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Setup instructions
5. Explore component READMEs for specific development

---

## 📝 Documentation Standards

All documentation follows these standards:

- **Markdown format** with clear headings
- **Links between related documents** for easy navigation
- **Code examples** with language highlighting
- **Diagrams** using Mermaid for complex flows
- **Table of contents** for long documents
- **Prerequisites** clearly listed at the top

---

## 🔍 Finding What You Need

### I want to...
- **Understand the game** → [Gameplay Guide](./01-gameplay-guide.md)
- **Understand the architecture** → [Architecture](./ARCHITECTURE.md)
- **Set up locally** → [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- **Deploy to testnet** → Component READMEs
- **Understand Chainlink integration** → [Technical Overview](./TECHNICAL_OVERVIEW.md)
- **See visual diagrams** → [System Diagrams](./SYSTEM_DIAGRAMS.md)
- **Understand workflows** → [System Flows](./SYSTEM_FLOWS.md)
- **Deploy the relayer** → [Relayer Deployment](../chainlink-functions/RELAYER_DEPLOY_COOLIFY.md)

---

## 📞 Quick Reference

| Topic | Document |
|-------|----------|
| Game Rules | [Gameplay Guide](./01-gameplay-guide.md) |
| Smart Contracts | [Contracts API](./contracts-api.md) |
| Frontend | [Frontend Architecture](./frontend-architecture.md) |
| CRE Workflows | [Technical Workflows](./02-technical-workflows.md) |
| Deployment | [Deployment Guide](./DEPLOYMENT_GUIDE.md) |
| Chainlink | [Technical Overview](./TECHNICAL_OVERVIEW.md) |

---

## 🚀 Next Steps

1. **Read the main README**: [README.md](../README.md)
2. **Choose your path**: Evaluator, Developer, or Component-specific
3. **Follow the documentation**: Each section has links to related docs
4. **Set up locally**: Follow [Deployment Guide](./DEPLOYMENT_GUIDE.md)
5. **Deploy to testnet**: Follow component READMEs

---

**Last Updated:** February 2026  
**Status:** ✅ Complete and ready for evaluation
