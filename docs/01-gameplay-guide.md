# Guia de Gameplay - "Onde na Web3 esta Carmen Sandiego?"

Jogo de misterio descentralizado onde jogadores sao detetives da ACME Detective Agency, rastreando Carmen Sandiego atraves de protocolos Web3. Integra **Chainlink Runtime Environment (CRE)** para logica off-chain, geracao de pistas por IA, audio criptografado e interoperabilidade multi-chain.

## Arquitetura do Fluxo de Jogo

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────>│ Smart        │────>│  CRE Workflows   │
│  (MetaMask)  │     │ Contracts    │     │  (Off-chain)     │
│              │<────│              │<────│                  │
└──────────────┘     └──────────────┘     └──────────────────┘
       │                    │                      │
       │                    │                      │
       ▼                    ▼                      ▼
  Decriptografia     Eventos EVM            IA (Gemini API)
  de Audio Local     On-chain               TTS + Criptografia
                                            IPFS Upload
```

## Cenario 1: Jornada de Sucesso (Captura + Promocao)

**Estado Inicial:** Detetive Novato (Rank 0) | Carmen em: Protocolo DeFi (Aave) - Sepolia Testnet

### Etapa 1 - Registro

1. Jogador conecta carteira MetaMask em `web3carmen.dapp`
2. Frontend gera par de chaves ECDSA (privada local, publica on-chain)
3. Transacao: `PlayerRegistry.sol.registerPlayer(playerAddress, publicKey)`
4. Evento emitido: `PlayerRegistered(playerAddress, publicKey)`
5. `Game.sol` inicializa estado do jogo (rank + localizacao oculta da Carmen)

### Etapa 2 - Investigacao (Sepolia)

1. Jogador clica "Investigar Local" no Protocolo DeFi
2. Transacao: `Game.sol.investigate(locationId: 1)`
3. Evento: `InvestigationRequested(playerAddress, locationId, currentCarmenLocation)`
4. **CRE GenerateClueWorkflow** e disparado:
   - EVM Log Trigger detecta o evento
   - HTTP Fetch para Gemini API (gera pista textual)
   - Text-to-Speech (converte em audio)
   - Criptografa audio com publicKey do jogador
   - Upload para IPFS -> obtem `clueURI`
   - EVM Write: `ClueStorage.sol.recordClue(playerAddress, clueHash, clueURI)`
5. Frontend monitora `ClueRecorded`, baixa do IPFS, decriptografa, reproduz audio
6. Jogador analisa pista no block explorer -> descobre proximo destino: **Polygon Amoy**

### Etapa 3 - Mudanca de Rede (Polygon Amoy)

1. Jogador muda MetaMask para Polygon Amoy
2. Investiga "Marketplace de NFT" -> mesma mecanica de pistas via CRE
3. **MoveCarmenWorkflow** (Cron Trigger): atualiza localizacao da Carmen periodicamente
4. Pista aponta para: **Arbitrum Sepolia** (contrato de staking)

### Etapa 4 - Captura

1. Jogador muda para Arbitrum Sepolia
2. Transacao: `Game.sol.attemptArrest(locationId: 3)`
3. `guessedLocationId == currentCarmenLocation` -> **SUCESSO**
4. Eventos: `CarmenCaptured` + `PlayerPromoted`
5. `PlayerRegistry.sol.promotePlayer()` -> Rank sobe (Novato -> Senior)
6. Carmen reseta para novo local oculto

```
Jogador          Game.sol              PlayerRegistry.sol
  │                  │                        │
  │─attemptArrest()─>│                        │
  │                  │──verificacao OK──┐     │
  │                  │                  │     │
  │                  │<─────────────────┘     │
  │                  │──promotePlayer()──────>│
  │                  │                        │──PlayerPromoted
  │<─CarmenCaptured──│                        │
  │                  │──reset location──┐     │
  │                  │<─────────────────┘     │
```

---

## Cenario 2: Jornada de Fracasso (Fuga + Rebaixamento)

**Estado Inicial:** Detetive Novato (Rank 0) | Carmen em: Protocolo DeFi (Compound) - Polygon Amoy

### Fluxo de Erro

1. Registro identico ao cenario 1
2. Investigacao na Polygon Amoy -> recebe pista sobre doacao em pool de liquidez
3. **Erro do jogador**: nao verifica valor da doacao corretamente (100 USDC em vez do valor real)
4. Conclui erroneamente que Carmen esta em Arbitrum Sepolia (yield farming)
5. Transacao: `Game.sol.attemptArrest(locationId: 3)` na Arbitrum Sepolia
6. `guessedLocationId != currentCarmenLocation` -> **FALHA**

### Consequencias

- Evento: `ArrestFailed(playerAddress, guessedLocationId)`
- `PlayerRegistry.sol.demotePlayer()` -> Rank desce
- Evento: `PlayerDemoted(playerAddress, newRank)`
- Carmen se move para novo local desconhecido via `MoveCarmenWorkflow`

```
Jogador          Game.sol              PlayerRegistry.sol
  │                  │                        │
  │─attemptArrest()─>│                        │
  │                  │──verificacao FAIL─┐    │
  │                  │                   │    │
  │                  │<──────────────────┘    │
  │                  │──demotePlayer()───────>│
  │                  │                        │──PlayerDemoted
  │<─ArrestFailed────│                        │
```

## Smart Contracts

| Contrato | Funcao |
|----------|--------|
| `PlayerRegistry.sol` | Registro de jogadores, chaves publicas, ranks (promote/demote) |
| `Game.sol` | Estado do jogo, localizacao da Carmen, investigate(), attemptArrest() |
| `ClueStorage.sol` | Armazena hashes e URIs das pistas (IPFS) |

## Eventos Principais

| Evento | Quando |
|--------|--------|
| `PlayerRegistered(addr, pubKey)` | Registro concluido |
| `InvestigationRequested(addr, locId, carmenLoc)` | Jogador investiga local |
| `ClueRecorded(addr, hash, uri)` | Pista gerada e armazenada |
| `CarmenMoved(newLocId, newChainId)` | Carmen muda de local |
| `CarmenCaptured(addr, carmenLoc)` | Captura bem-sucedida |
| `ArrestFailed(addr, guessedLocId)` | Captura falhou |
| `PlayerPromoted(addr, newRank)` | Jogador promovido |
| `PlayerDemoted(addr, newRank)` | Jogador rebaixado |
