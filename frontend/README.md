# Frontend

Interface do jogo Carmen Sandiego On-Chain. React 18 + Vite + Zustand + Privy Auth.

## Prerequisites

- Node.js 20+ (22 recommended)
- Contratos deployados (enderecos configurados no `.env`)

## Setup

```bash
npm install
```

### Variaveis de ambiente

Crie um arquivo `.env` neste diretorio com as variaveis `VITE_`-prefixed:

```env
# Contract addresses (preenchidos apos deploy)
VITE_GAME_MASTER_ADDRESS=0x...
VITE_GAME_MASTER_PROXY_ADDRESS=0x...
VITE_MISSION_NFT_ADDRESS=0x...

# RPC URLs
VITE_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
VITE_ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
VITE_BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Auth
VITE_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
```

## Rodando o Dev Server

```bash
npm run dev
```

Acesse http://localhost:5173. O Vite faz hot-reload automatico.

## Testes

```bash
# Watch mode (re-roda ao salvar)
npm run test

# Single run (para CI)
npm run test:run
```

Testes usam Vitest + Testing Library (jsdom). Ficam co-localizados em pastas `__tests__/` ao lado dos componentes.

## Lint

```bash
npm run lint
```

ESLint com flat config (`eslint.config.js`).

## Build de Producao

```bash
# Gerar bundle otimizado
npm run build

# Preview local do build
npm run preview
```

O bundle e gerado em `dist/`.

## Estrutura

```
frontend/
  src/
    main.jsx                # Entry point
    App.jsx                 # Router e providers (Privy, React Query)
    pages/
      LoginPage.jsx         # Tela de login (Privy wallet + social)
      GamePage.jsx          # Tela principal do jogo
    components/
      InteractiveMap.jsx    # Mapa interativo com cidades
      CityView.jsx          # Vista de uma cidade (locais, pistas)
      MissionBriefing.jsx   # Briefing da missao
      CaptureMode.jsx       # Modo captura de Carmen
      WalletEvidence.jsx    # Fragmentos de wallet evidence
      EvidencePanel.jsx     # Painel de evidencias coletadas
      ClueModal.jsx         # Modal de pista decriptada
      TerminalSidebar.jsx   # Terminal lateral com logs on-chain
      ContractExplorer.jsx  # Explorer de contratos
      ...
    services/
      contractService.js    # Wrapper ethers.js v6 (calls + event listeners)
    store/
      gameStore.js          # Zustand store (auth, mission, player state)
    utils/
      ecies.js              # ECIES encryption/decryption (@noble/curves)
      authPersistence.js    # Persistencia de sessao
    data/
      cityRegistry.js       # Registry de cidades e chain IDs
      contractData.js       # ABIs e enderecos
  vite.config.js            # Config Vite + Web3 polyfills
```
