# Contracts

Smart contracts for Carmen Sandiego On-Chain. Hardhat + Solidity 0.8.24.

## Prerequisites

- Node.js 20+ (22 recommended)
- Root `.env` configured (copy `../.env.example` and fill in values)

## Setup

```bash
npm install
```

## Running Locally (Tests)

Testes rodam em uma rede Hardhat local in-memory. Nenhuma configuracao de `.env` e necessaria.

```bash
# Rodar todos os testes
npm run test

# Rodar um arquivo de teste especifico
npx hardhat test test/GameMaster.test.ts
npx hardhat test test/GameMaster.e2e.test.ts
npx hardhat test test/GameMasterProxy.test.ts

# Relatorio de cobertura
npm run test:coverage
```

## Compilacao

```bash
npm run compile
```

Artifacts sao gerados em `artifacts/`. O source Solidity fica em `src/` (nao `contracts/`).

## Deploy em Testnets

Requer no root `.env`:
- `PRIVATE_KEY` — chave privada com fundos nas testnets
- `SEPOLIA_RPC_URL`, `ARBITRUM_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL` — RPC endpoints
- `VRF_SUBSCRIPTION_ID`, `VRF_COORDINATOR_SEPOLIA`, `VRF_KEY_HASH_SEPOLIA` — config VRF Chainlink
- `KEYSTONE_FORWARDER_SEPOLIA` — endereco do KeystoneForwarder (CRE)

```bash
# Deploy completo (GameMaster no Sepolia + CityNodes nas outras chains)
npm run deploy:all

# Deploy individual por rede
npm run deploy:sepolia             # GameMaster, MissionNFT, GameMasterProxy
npm run deploy:arbitrum-sepolia    # CityNode (Tokyo)
npm run deploy:base-sepolia        # CityNode (Paris)
```

Os enderecos deployados sao gravados automaticamente no root `.env` pelo script `deploy-all.ts`.

## Verificacao no Etherscan

Requer `ETHERSCAN_API_KEY`, `ARBISCAN_API_KEY`, `BASESCAN_API_KEY` no root `.env`.

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

## Scripts Utilitarios

| Script | Descricao |
|--------|-----------|
| `scripts/deploy-all.ts` | Deploy completo multi-chain |
| `scripts/deploy-citynode.ts` | Deploy de um CityNode individual |
| `scripts/simulate-game.ts` | Simula um jogo completo com NFT trophy |
| `scripts/export-abi.ts` | Exporta ABIs para o frontend |
| `scripts/seed-case.ts` | Popula dados de caso para testes |
| `scripts/setup-wallets.ts` | Configura wallets de teste |
| `scripts/trigger-investigation.ts` | Dispara investigacao manual |
| `scripts/check-balances.ts` | Verifica saldos nas testnets |
| `scripts/check-tx.ts` | Inspeciona uma transacao |

## Estrutura

```
contracts/
  src/                    # Solidity source
    GameMaster.sol        # Contrato principal (VRF, commit-reveal, CRE callbacks)
    MissionNFT.sol        # ERC-721 trophy NFT
    GameMasterProxy.sol   # Proxy para CRE KeystoneForwarder
    CityNode.sol          # Contrato por cidade/chain
    interfaces/           # Interfaces (IGameMaster, IMissionNFT, ICityNode)
  test/                   # Testes Hardhat (Chai + Ethers)
  scripts/                # Deploy e utilitarios
  hardhat.config.ts       # Configuracao Hardhat
```
