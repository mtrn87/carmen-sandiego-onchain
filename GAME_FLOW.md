# Carmen Sandiego On-Chain — Game Flow

Complete technical breakdown of the game mechanics, on-chain interactions, CRE workflows, and cross-chain communication.

---

## FASE 1 — Login & Registro

```
Player → Privy (Google/Wallet) → Frontend
  ├─ Gera keypair ECIES (secp256k1) → salva no IndexedDB
  ├─ Chama GameMaster.registerPlayer(publicKey) → armazena on-chain
  └─ initGame() → verifica se tem missão ativa pendente
```

O jogador autentica via Privy (embedded wallet ou MetaMask). A chave pública ECIES é registrada on-chain para que o CRE possa encriptar pistas que só aquele jogador decodifica.

---

## FASE 2 — Start Mission (VRF)

```
Player → GameMaster.startMission()
  ├─ Cria Mission struct (status=Active, startBlock)
  ├─ Pede VRF v2.5 → requestRandomWords()
  └─ VRF callback (fulfillRandomWords):
       ├─ cityIndex = randomWord % validChainIds.length
       ├─ salt = keccak256(randomWord, missionId)
       ├─ targetHash = keccak256(targetChainId, salt)  ← COMMIT
       ├─ Salva salt on-chain (para CRE ler)
       └─ emit CarmenLocationCommitted(missionId, targetHash)
```

**Ponto crucial**: o contrato **nunca** sabe onde Carmen está em texto claro. Só guarda o hash. Isso é o **commit** do padrão commit-reveal.

---

## FASE 3 — Briefing

```
CRE Workflow: generate-briefing
  ├─ Trigger: evento MissionStarted
  ├─ Lê: publicKey do player, cidades válidas, mission data
  ├─ Gera: briefing narrativo do cenário (scenarios.json)
  └─ (Futuro: chamar Gemini/OpenAI para texto dinâmico)
```

O frontend mostra o briefing (tela `MissionBriefing`) e abre o mapa interativo.

---

## FASE 4 — Investigação (Loop Principal)

Este é o coração do jogo. O jogador viaja entre cidades e investiga.

### 4a. No CityNode (por cidade)

```
Player entra numa cidade → Frontend carrega CityNode contract daquela chain
  ├─ 3 locations por cidade (ex: mercado, porto, banco)
  ├─ inspectLocation(idx)      → gasta 1 energia → marca inspecionado
  ├─ scanAnomalies(idx)        → gasta 6 energia → revela txs suspeitas
  ├─ requestClue(idx, clueIdx) → gasta 2 energia → async (CRE resolve)
  ├─ flagTx(refId)             → gasta 1 energia → marca tx suspeita
  ├─ requestDossier()          → gasta 1 energia → async (CRE resolve)
  └─ requestCapture(wallet, evidence) → gasta 3 energia → async
```

**Energia**: 20 max, regenera 1 a cada 15 min. Força o jogador a escolher ações com cuidado.

### 4b. Submit Investigation (GameMaster)

```
Player → GameMaster.submitInvestigation(chainId)
  ├─ Verifica cooldown, max investigações (10), max blocos (200)
  ├─ emit InvestigationSubmitted(missionId, player, chainId)
  └─ Se excedeu limites → _failMission()
```

### 4c. CRE Workflow: mission-start (responde à investigação)

```
CRE detecta InvestigationSubmitted via LogTrigger
  ├─ Lê on-chain: salt, validCities, mission, playerPublicKey
  ├─ Brute-force: testa keccak256(city, salt) para cada cidade
  │   └─ Encontra a cidade onde Carmen está (sem o contrato saber)
  ├─ Compara: chainId investigado == cidade de Carmen?
  │   ├─ SIM → seleciona "true clue" do scenarios.json
  │   └─ NÃO → seleciona "false clue" (pista falsa)
  ├─ Calcula strength score (determinístico, baseado no salt)
  ├─ ECIES encrypt(clue, playerPublicKey)
  ├─ Se acertou + já tem 3+ clues:
  │   └─ Envia ACTION_RESOLVE_CAPTURE (revela chainId + salt)
  └─ Senão:
      └─ Envia ACTION_RECEIVE_CLUE (clue encriptada)
```

O CRE é o **árbitro cego** — ele sabe onde Carmen está (brute-force do hash) mas o contrato não. O contrato recebe pistas encriptadas sem saber se são verdadeiras ou falsas.

### 4d. Frontend recebe a pista

```
Event listener: ClueReceived
  ├─ Recebe ipfsPointer (hex da pista encriptada)
  ├─ decryptClue() com private key do IndexedDB
  ├─ Mostra ClueModal (texto, áudio ou imagem)
  └─ Atualiza estado: clues[], evidence[], terminalLines
```

---

## FASE 5 — Carmen se Move (Automação)

```
CRE Workflow: carmen-moves (Cron: a cada 3 min)
  ├─ Lê getActiveMissionIds() → todas as missões ativas
  ├─ Para cada missão:
  │   ├─ Brute-force cidade atual pelo targetHash
  │   ├─ Escolhe nova cidade (determinístico, evita repetir)
  │   ├─ newTargetHash = keccak256(newCity, salt)
  │   └─ Envia ACTION_UPDATE_TARGET
  └─ GameMaster.updateTarget() → atualiza hash
      └─ emit CarmenMoved → frontend mostra alerta vermelho
```

Isso cria **pressão de tempo**: se o jogador demora, Carmen muda de cidade e as pistas anteriores ficam obsoletas.

---

## FASE 6 — Wallet Fragments (Evidência)

Quando o jogador acerta a cidade, além da pista recebe **fragmentos da wallet** de Carmen:

```
CRE → GameMaster.receiveWalletFragment(missionId, startIndex, length, ...)
  ├─ Revela pedaços do endereço hex (ex: posições 5-10 de 40 chars)
  ├─ Bitmap previne overlap
  └─ Com 3+ fragmentos → player pode tentar submitWalletCapture(address)
```

O jogador reconstrói o endereço da wallet de Carmen a partir dos fragmentos e submete para captura.

---

## FASE 7 — Captura

Há dois caminhos de captura:

### 7a. Captura automática (3+ clues + acertou cidade)

```
mission-start workflow detecta:
  cluesReceived >= 3 AND investigação correta
  └─ Envia ACTION_RESOLVE_CAPTURE(missionId, revealedChainId, salt)
```

### 7b. Captura por wallet (3+ fragmentos)

```
Player → submitWalletCapture(reconstructedAddress)
  └─ CRE → resolveWalletCapture(missionId, wallet, chainId, salt)
```

Ambos chegam ao **REVEAL**:

```
GameMaster.resolveCapture():
  ├─ VERIFY: keccak256(revealedChainId, salt) == targetHash ← REVEAL
  ├─ Se válido → _captureCarmen():
  │   ├─ mission.status = Completed
  │   ├─ Calcula reward baseado em blocos usados
  │   ├─ Consulta ETH/USD price feed (Chainlink Data Feed)
  │   ├─ Mint MissionNFT (ERC-721 trophy)
  │   └─ emit CarmenCaptured(missionId, player, blocksUsed, reward)
  └─ Se hash não bate → revert "Invalid reveal"
```

---

## FASE 8 — NFT Trophy (Finale)

```
CRE Workflow: generate-finale
  ├─ Trigger: evento CarmenCaptured
  ├─ Lê: mission data, clues, evidence, salt
  ├─ Brute-force → nome da cidade de captura
  ├─ Calcula tier: Gold/Silver/Bronze/Copper
  ├─ Gera SVG trophy + metadata JSON (on-chain data URI)
  └─ Envia ACTION_SET_TOKEN_URI → MissionNFT.setTokenURI()
```

O NFT é 100% on-chain (SVG + JSON como data URI), sem IPFS.

---

## FASE 9 — Cross-Chain (CCIP)

```
GameMaster.broadcastCarmenMoveToAll(locationHash)
  ├─ Envia via CCIP Router para cada CityNode em chains diferentes
  └─ CityNode._ccipReceive() → atualiza ccipCarmenLocationHash
```

Sincroniza o estado do jogo entre Sepolia ↔ Arbitrum ↔ Base ↔ XDC.

---

## Diagrama Resumido

```
PLAYER                 CONTRACTS (Sepolia)         CRE (DON)              CROSS-CHAIN
  │                         │                         │                      │
  ├─ register ────────────► registerPlayer()          │                      │
  ├─ start mission ───────► startMission()            │                      │
  │                         ├─ VRF request ──────►    │                      │
  │                         ◄─ VRF callback ──────    │                      │
  │                         │  (commit hash)          │                      │
  │                         │                    generate-briefing           │
  │                         │                         │                      │
  ├─ investigate city ────► submitInvestigation()      │                      │
  │                         │  emit event ───────► mission-start             │
  │                         │                    ├─ brute-force hash         │
  │                         │                    ├─ true/false clue          │
  │                         │                    ├─ ECIES encrypt            │
  │                         ◄─ receiveClue() ────┘                          │
  ◄─ decrypt clue ──────────┤                                               │
  │                         │                    carmen-moves (cron 3min)    │
  │                         ◄─ updateTarget() ───┘                          │
  │                         ├─ CCIP broadcast ──────────────────────────► CityNodes
  │                         │                                               │
  ├─ (3+ clues + correct) ─┤                    mission-start               │
  │                         ◄─ resolveCapture()──┘  (REVEAL)                │
  │                         ├─ verify hash                                  │
  │                         ├─ mint NFT                                     │
  │                         │  emit CarmenCaptured                          │
  │                         │                    generate-finale             │
  │                         ◄─ setTokenURI() ───┘  (SVG + metadata)        │
  ◄─ MISSION COMPLETE! ────┘                                               │
```

---

## Chainlink Services Used

| Service | Where | Purpose |
|---------|-------|---------|
| **VRF v2.5** | `startMission()` | Verifiable randomness for Carmen's initial location |
| **CRE/Keystone** | 5 workflows | Decentralized game logic (clues, moves, finale) |
| **Automation (Cron)** | `carmen-moves` | Periodic Carmen relocation every 3 min |
| **Data Feeds** | `resolveCapture()` | ETH/USD price for reward calculation |
| **CCIP** | `broadcastCarmenMoveToAll()` | Cross-chain state sync to CityNodes |
| **Functions** | `registerPlayer` relay | Gasless player registration |

---

## Contracts

| Contract | Chain | Role |
|----------|-------|------|
| **GameMaster** | Sepolia | Main game engine, commit-reveal, VRF, CCIP sender |
| **GameMasterProxy** | Sepolia | CRE report receiver, routes 11 action types |
| **MissionNFT** | Sepolia | ERC-721 trophy NFTs with on-chain SVG metadata |
| **PlayerRegistry** | Sepolia | Signature-based player registration |
| **CityNode** | Arbitrum / Base / XDC | Per-city investigation gameplay, energy system, CCIP receiver |

---

## What's Left to Ship

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 1 | Deploy contracts to testnets | Blocks everything | ~2h |
| 2 | Deploy CRE workflows | No clues without this | Blocked by early access |
| 3 | Funding (testnet ETH + LINK) | Blocks VRF + CCIP | ~30min |
| 4 | Centralize addresses post-deploy | Maintenance | ~30min |
| 5 | AI clues (Gemini/OpenAI in generate-briefing) | Nice-to-have | ~2h |
| 6 | Full E2E test on testnet | Final validation | ~2h |
| 7 | Pitch deck + demo video | Essential for hackathon | ~3h |
