# Documentacao - Onde na Web3 esta Carmen Sandiego?

Documentacao condensada do projeto para o Hackathon Chainlink Convergence (trilha CRE & AI).

## Indice

| # | Documento | Descricao |
|---|-----------|-----------|
| 01 | [Guia de Gameplay](./01-gameplay-guide.md) | Walkthrough completo com cenarios de sucesso e fracasso, eventos e smart contracts |
| 02 | [Workflows Tecnicos](./02-technical-workflows.md) | Diagramas detalhados dos 4 workflows: registro, pistas, movimentacao e captura |
| 03 | [Cenarios de Jogo](./03-game-scenarios.md) | 3 cenarios detalhados: registro, captura com promocao e perda com rebaixamento |
| 04 | [Plano de Acao MVP](./04-mvp-action-plan.md) | Divisao de equipe, cronograma de 5 dias, cenarios visuais e stack tecnologico |

## Visao Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CARMEN SANDIEGO WEB3                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  Frontend   │  │   Smart      │  │   CRE (Chainlink Runtime   │  │
│  │  React/Next │  │   Contracts  │  │   Environment)             │  │
│  │             │  │              │  │                            │  │
│  │ - MetaMask  │─>│ - Game.sol   │─>│ - GenerateClueWorkflow    │  │
│  │ - Crypto    │  │ - Player     │  │ - MoveCarmenWorkflow      │  │
│  │ - Audio     │  │   Registry   │  │ - Gemini API (IA)         │  │
│  │   Decrypt   │  │ - ClueStore  │  │ - TTS + IPFS              │  │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              Testnets Multi-Chain                             │    │
│  │  Sepolia (DeFi)  <-->  Polygon Amoy (NFT)  <-->  Arbitrum   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Fluxo Principal do Jogo

```
Registro ──> Investigar ──> Receber Pista ──> Analisar ──> Prender
    │              │              │                            │
    ▼              ▼              ▼                            ▼
PlayerRegistry  Game.sol    CRE + IA + IPFS             Game.sol
                                                     ┌────────┴────────┐
                                                  SUCESSO           FALHA
                                                  Rank UP          Rank DOWN
                                                  Carmen reset     Carmen foge
```
