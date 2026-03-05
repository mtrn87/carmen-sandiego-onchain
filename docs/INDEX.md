# Carmen Sandiego On-Chain — Documentation Index

## Overview

**Carmen Sandiego On-Chain** is the first blockchain game where the entire game brain — including AI content generation — runs decentralized inside Chainlink CRE. This documentation covers all aspects of the project: CRE workflows, smart contracts, Chainlink integrations, and deployment.

---

## Quick Start

1. **[README](../README.md)** — Project overview, on-chain evidence, tech stack
2. **[Game Flow](../GAME_FLOW.md)** — Complete gameplay mechanics (9 phases)
3. **[Setup Guide](../SETUP.md)** — Installation and local development

---

## CRE Workflows (Core)

**[CRE Workflows README](../cre-workflows/README.md)**

The heart of the project — 7 TypeScript workflows compiled to WASM and executed inside the Chainlink DON. Covers:
- Architecture diagram and data flow
- All 7 workflows with detailed descriptions
- CRE capabilities used (EVMClient, HTTPClient, writeReport, CronCapability, LogTrigger)
- Determinism for DON consensus
- Simulation commands with real Sepolia TX hashes
- CRE gotchas and lessons learned (~10 undocumented issues)
- ~3,578 lines of CRE workflow code

---

## Chainlink Technical Documentation

### Problem-Solution Analysis
**[Problems & Solutions](PROBLEMS_AND_SOLUTIONS.md)**

How each Chainlink service solves specific decentralized gaming challenges — VRF for fair randomness, CRE for decentralized game logic, Data Feeds for dynamic economics, CCIP for cross-chain, Automation for persistent worlds.

### Technical Deep Dive
**[Chainlink Technical Deep Dive](CHAINLINK_TECHNICAL_DEEP_DIVE.md)**

Comprehensive technical analysis of all Chainlink services with code examples, architecture diagrams, and integration patterns.

### Security Analysis
**[Security Audit](SECURITY_AUDIT.md)**

Smart contract security analysis covering GameMaster, GameMasterProxy, MissionNFT, CityNode, PlayerRegistry, and ReceiverTemplate.

### System Architecture
**[System Diagrams](SYSTEM_DIAGRAMS.md)**

Visual architecture diagrams and flow charts (Mermaid) showing the full system: frontend, CRE DON, smart contracts, cross-chain messaging.

---

## Deployment & Operations

- **[Setup Guide](../SETUP.md)** — Full local setup and configuration
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** — Multi-chain deployment to testnets
- **[E2E Test Guide](../E2E_TEST_GUIDE.md)** — End-to-end testing procedures

---

## Chainlink Services Used

| Service | Purpose | Documentation |
|---------|---------|---------------|
| **CRE** | Decentralized game engine (7 WASM workflows) | [CRE Workflows](../cre-workflows/README.md) |
| **VRF v2.5** | Provably fair randomness for Carmen's location | [Technical Deep Dive](CHAINLINK_TECHNICAL_DEEP_DIVE.md) |
| **Data Feeds** | Live ETH/USD pricing inside CRE WASM | [Technical Deep Dive](CHAINLINK_TECHNICAL_DEEP_DIVE.md) |
| **CCIP** | Cross-chain Carmen movement notifications | [Technical Deep Dive](CHAINLINK_TECHNICAL_DEEP_DIVE.md) |
| **Automation** | CronCapability for autonomous Carmen relocation | [CRE Workflows](../cre-workflows/README.md) |

---

## Key Innovations

- **AI inside CRE WASM** — Groq LLaMA 3.3-70b with temperature=0 for DON consensus
- **ECIES encryption inside CRE** — End-to-end clue privacy using secp256k1
- **Commit-reveal with VRF** — Contract never knows Carmen's location in plaintext
- **Deterministic ECIES** — Ephemeral key derived from VRF salt (no randomness in WASM)
- **Gasless onboarding** — Players never spend a single wei
- **On-chain NFT trophies** — SVG + ERC-721 metadata as data URIs (no IPFS)
- **Autonomous game world** — Carmen moves every 3 min via CronCapability, even if developer is offline

---

## Project Metrics

| Metric | Value |
|--------|-------|
| CRE Workflows | 7 (all compile + simulate) |
| CRE Code | ~3,578 lines of TypeScript |
| Smart Contract Tests | 65 passing |
| Frontend Tests | 59 passing |
| Simulation Batch Runs | 10 consecutive, all green |
| Networks | 4 testnets (Sepolia, Arbitrum Sepolia, Base Sepolia, XDC Apothem) |
| E2E Demo Time | 4m 2s on live Sepolia |

---

<p align="center">
  <strong>Built for the Convergence | Chainlink Hackathon</strong>
</p>
