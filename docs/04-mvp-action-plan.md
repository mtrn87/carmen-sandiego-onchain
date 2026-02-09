# Plano de Acao MVP - Hackathon Chainlink

**Trilha**: CRE & AI | **Equipe**: 4 membros | **Prazo**: 3-5 dias

## Objetivo

MVP funcional do jogo "Onde na Web3 esta Carmen Sandiego?" para o hackathon Chainlink Convergence. Demonstrar fluxo de jogo completo com CRE, IA e interoperabilidade multi-chain.

## Divisao da Equipe

### Membro 1: Smart Contracts + Orquestracao On-chain

- **Game.sol**: estado do jogo (localizacao Carmen, jogadores, pistas)
- **PlayerRegistry.sol**: registro de jogadores + chaves publicas
- **ClueStorage.sol**: hashes de pistas + URIs IPFS
- Eventos para integracao com CRE (`InvestigationRequested`, etc.)
- Testes unitarios e de integracao em testnets

### Membro 2: Workflows CRE + Integracoes Off-chain

- **GenerateClueWorkflow**: trigger por `InvestigationRequested` -> IA -> crypto -> IPFS
- **MoveCarmenWorkflow**: Cron Trigger -> atualiza localizacao entre chains
- HTTP Fetch para Gemini API (prompt engineering)
- Gerenciamento de Secrets no CRE
- Integracao IPFS/S3 para audio criptografado

### Membro 3: Frontend + UX

- Frontend React/Next.js
  - Pagina de registro (conexao carteira + envio de pubKey)
  - Interface de jogo (mapa, botao investigar, exibicao de pistas)
- Integracao MetaMask
- Consumo de dados on-chain
- Decriptografia de audio no cliente
- Testes de usabilidade

### Membro 4: IA + Multi-chain + QA

- Refinamento de prompts de IA (pistas criativas e desafiadoras)
- Scripts de deploy para 2-3 testnets (Sepolia, Polygon Amoy, Arbitrum Sepolia)
- Testes de interoperabilidade do `MoveCarmenWorkflow`
- QA end-to-end em testnets
- Documentacao para apresentacao final

## Cronograma (5 dias)

```
Dia │ Membro 1 (Contracts)    │ Membro 2 (CRE)           │ Membro 3 (Frontend)
────┼─────────────────────────┼──────────────────────────┼────────────────────────
 1  │ Setup + Game.sol        │ Setup CRE CLI +          │ Setup frontend +
    │                         │ GenerateClueWorkflow     │ conexao de carteira
────┼─────────────────────────┼──────────────────────────┼────────────────────────
 2  │ PlayerRegistry.sol +    │ HTTP Fetch para IA +     │ Interface de jogo
    │ ClueStorage.sol         │ Secrets                  │ (display de estado)
────┼─────────────────────────┼──────────────────────────┼────────────────────────
 3  │ Integracao de eventos   │ Criptografia de audio    │ Exibicao de pistas +
    │ para CRE                │ (off-chain) + IPFS       │ decriptografia
────┼─────────────────────────┼──────────────────────────┼────────────────────────
 4  │ Testes de integracao    │ Testes de workflow CRE   │ Testes UI/UX +
    │ on-chain                │ + otimizacao             │ fluxo completo
────┼─────────────────────────┼──────────────────────────┼────────────────────────
 5  │ Refinamento +           │ Refinamento workflows +  │ Polimento UI +
    │ otimizacao de gas       │ tratamento de erros      │ preparacao demo
```

*Membro 4 atua transversalmente em todos os dias: prompts IA, deploy multi-chain, QA e docs.*

## Cenarios Visuais do MVP

### Cenario 1: Protocolo DeFi (O Cofre Digital)

- **Rede**: Sepolia Testnet
- **Visual**: Interface futurista de protocolo DeFi com graficos e fluxos de dados
- **Mecanica**: Carmen faz transacao incomum (flash loan de valor muito baixo)
- **Fluxo**:
  1. Carmen realiza transacao anomala
  2. EVM Log Trigger detecta e dispara workflow CRE
  3. IA gera pista contextual sobre a transacao
  4. Audio criptografado armazenado no IPFS
  5. Jogador decifra e investiga no block explorer

### Cenario 2: Marketplace de NFT (A Galeria de Arte Digital)

- **Rede**: Polygon Amoy Testnet
- **Visual**: Marketplace vibrante com obras de arte digitais e atmosfera de misterio
- **Mecanica**: Carmen interage com NFT raro (compra de baixo valor em colecao cara)
- **Fluxo**:
  1. Carmen compra/lista NFT com preco anomalo
  2. EVM Log Trigger ou Cron Trigger detecta interacao
  3. IA gera pista sobre a anomalia no marketplace
  4. Audio criptografado -> IPFS -> on-chain
  5. Jogador decifra e investiga o marketplace

## Interoperabilidade Multi-Chain

```
┌─────────────┐     MoveCarmenWorkflow      ┌──────────────────┐
│   Sepolia   │────────────────────────────>│  Polygon Amoy    │
│   (DeFi)    │     Cron Trigger +          │  (NFT Market)    │
│             │     EVM Write               │                  │
└─────────────┘                             └────────┬─────────┘
                                                     │
                                    MoveCarmenWorkflow│
                                                     ▼
                                            ┌──────────────────┐
                                            │ Arbitrum Sepolia │
                                            │ (Staking/Yield)  │
                                            └──────────────────┘
```

O CRE permite que Carmen "viaje" entre blockchains, forcando o jogador a interagir com multiplas redes - demonstrando interoperabilidade como mecanica central do jogo.

## Stack Tecnologico

| Camada | Tecnologia |
|--------|------------|
| Smart Contracts | Solidity (Sepolia, Polygon Amoy, Arbitrum Sepolia) |
| CRE Workflows | TypeScript/Go |
| IA | Gemini API (LLM) via HTTP Fetch |
| Audio | Text-to-Speech (off-chain) |
| Criptografia | ECDSA (par de chaves jogador) |
| Armazenamento | IPFS/S3 |
| Frontend | React/Next.js + MetaMask |
| Testnets | Sepolia, Polygon Amoy, Arbitrum Sepolia |
