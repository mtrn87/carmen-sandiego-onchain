# Workflows Tecnicos - Cenarios de Jogo

Detalhamento dos 4 workflows tecnicos que orquestram o jogo.

## 1. Workflow de Registro de Jogador

```
┌──────────┐         ┌───────────────────┐
│ Frontend │         │ PlayerRegistry.sol│
│(MetaMask)│         │                   │
└────┬─────┘         └────────┬──────────┘
     │                        │
     │ 1. Conecta carteira    │
     │ 2. Gera par de chaves  │
     │    ECDSA (local)       │
     │ 3. Armazena privKey    │
     │    em IndexedDB        │
     │                        │
     │──registerPlayer()─────>│
     │   (addr, publicKey)    │
     │                        │──armazena addr + pubKey
     │                        │──emite PlayerRegistered
     │<──confirmacao──────────│
```

**Componentes:**
- **Frontend**: gera chaves ECDSA, armazena privKey localmente (IndexedDB), envia pubKey
- **PlayerRegistry.sol**: armazena `playerAddress` + `publicKey`, emite `PlayerRegistered`

---

## 2. Workflow de Geracao e Entrega de Pistas (GenerateClueWorkflow)

```
Frontend     Game.sol      CRE (Off-chain)           ClueStorage.sol    IPFS
   │            │               │                         │               │
   │─investigate()─>│           │                         │               │
   │            │──emit─────────>                         │               │
   │            │  InvestigationRequested                 │               │
   │            │               │                         │               │
   │            │               │──1. HTTP Fetch          │               │
   │            │               │   Gemini API            │               │
   │            │               │   (gera pista texto)    │               │
   │            │               │                         │               │
   │            │               │──2. Text-to-Speech      │               │
   │            │               │   (gera audio)          │               │
   │            │               │                         │               │
   │            │               │──3. EVM Read            │               │
   │            │               │   PlayerRegistry        │               │
   │            │               │   (busca publicKey)     │               │
   │            │               │                         │               │
   │            │               │──4. Criptografa audio   │               │
   │            │               │   com publicKey         │               │
   │            │               │                         │               │
   │            │               │──5. Upload audio───────────────────────>│
   │            │               │                         │    clueURI    │
   │            │               │──6. EVM Write──────────>│               │
   │            │               │   recordClue(addr,      │               │
   │            │               │   clueHash, clueURI)    │               │
   │            │               │                         │──emit         │
   │            │               │                         │  ClueRecorded │
   │<──monitora ClueRecorded────────────────────────────────             │
   │──baixa audio do IPFS──────────────────────────────────────────────>│
   │──decriptografa com privKey │                         │               │
   │──reproduz audio            │                         │               │
```

**Pipeline CRE (6 etapas):**
1. **Trigger**: EVM Log Trigger detecta `InvestigationRequested`
2. **IA Call**: HTTP Fetch para Gemini API com contexto (locationId + carmenLocation)
3. **TTS**: Converte texto em audio
4. **Criptografia**: Busca publicKey via EVM Read, criptografa audio
5. **IPFS Upload**: Armazena audio criptografado, obtem URI
6. **Registro On-chain**: EVM Write para `ClueStorage.sol.recordClue()`

---

## 3. Workflow de Movimentacao da Carmen (MoveCarmenWorkflow)

```
  Cron Trigger         CRE Workflow              Game.sol          Frontend
      │                     │                       │                 │
      │──dispara a cada     │                       │                 │
      │  X horas───────────>│                       │                 │
      │                     │──seleciona novo       │                 │
      │                     │  locationId + chainId │                 │
      │                     │                       │                 │
      │                     │──EVM Write───────────>│                 │
      │                     │  updateCarmenLocation │                 │
      │                     │  (newLocId, newChainId)                 │
      │                     │                       │──emit           │
      │                     │                       │  CarmenMoved    │
      │                     │                       │────────────────>│
      │                     │                       │                 │──atualiza UI
```

**Caracteristicas:**
- Trigger: **Cron Trigger** (periodico, a cada X horas)
- Pode mover Carmen entre chains diferentes (Sepolia, Polygon Amoy, Arbitrum Sepolia)
- Usa `EVM Write` para atualizar `Game.sol` potencialmente em nova chain

---

## 4. Workflow de Tentativa de Captura e Resultado

```
Frontend        Game.sol              PlayerRegistry.sol
   │               │                        │
   │─attemptArrest()─>│                     │
   │  (addr, guessedLocId)                  │
   │               │                        │
   │               │──compara               │
   │               │  guessedLocId vs       │
   │               │  currentCarmenLocation │
   │               │                        │
   ├───────────────┼── SUCESSO ─────────────┤
   │               │                        │
   │               │──CarmenCaptured───────>│
   │               │──promotePlayer()──────>│
   │               │                        │──PlayerPromoted
   │               │──reset carmenLocation  │
   │               │                        │
   ├───────────────┼── FALHA ───────────────┤
   │               │                        │
   │               │──ArrestFailed─────────>│
   │               │──demotePlayer()───────>│
   │               │                        │──PlayerDemoted
   │               │                        │
   │<──resultado────│                        │
```

**Sucesso** (`guessedLocId == currentCarmenLocation`):
- Emite `CarmenCaptured(addr, currentCarmenLocation)`
- Chama `promotePlayer()` -> incrementa rank
- Reseta `currentCarmenLocation` para novo local

**Falha** (`guessedLocId != currentCarmenLocation`):
- Emite `ArrestFailed(addr, guessedLocId)`
- Chama `demotePlayer()` -> decrementa rank
- Carmen se move para novo local (via MoveCarmenWorkflow)
