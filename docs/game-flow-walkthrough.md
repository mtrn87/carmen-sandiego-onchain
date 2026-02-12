# Fluxo Completo do Jogo — Do Login à Captura

Guia passo a passo para devs novos no projeto, cobrindo desde a autenticação com Privy até o final do game.

---

## FASE 0: Inicialização do App

**Arquivo:** `frontend/src/main.jsx`

1. O React monta o `<PrivyProvider>` com `appId` hardcoded e métodos de login `['google', 'wallet']`
2. Dentro dele, `<BrowserRouter>` + `<App>` são renderizados
3. `App.jsx` tenta restaurar uma sessão anterior do `localStorage` via `loadAuthSession()` — se existir, popula o Zustand store com `walletAddress`, `userInfo`, etc., sem precisar de novo login

**Rotas:**
- `/` → `LoginPage` (autenticação)
- `/game` → `GamePage` (o jogo em si)

---

## FASE 1: Autenticação com Privy

**Arquivo:** `frontend/src/pages/LoginPage.jsx`

1. O jogador vê uma **boot sequence animada** (linhas de terminal aparecendo uma a uma: "CONNECTING TO DECENTRALIZED NETWORK...", etc.)
2. Após a boot sequence, aparece o logo + botão **"Connect"**
3. Ao clicar Connect, chama `login()` do Privy → abre modal com opções **Google** ou **MetaMask**

### Se logou com MetaMask (tem wallet):

4. O `useEffect` detecta `user` do Privy e inicia sincronização:
   - Extrai o endereço via `getEthereumAddressFromPrivy(user)`
   - Obtém o `window.ethereum` provider
   - Verifica se o endereço do MetaMask (signer real) bate com o do Privy — se não, **corrige no store**
   - Garante que a rede é **Sepolia** (`ensureSepoliaNetwork()` — se estiver em outra chain, pede para trocar)
   - **Gera par de chaves ECIES** via `getOrCreateKeyPair()` — chave privada vai pro IndexedDB, nunca sai do browser
   - **Verifica registro on-chain**: chama `getPlayerPublicKey(address)` no contrato. Se retorna vazio, chama `registerPlayer(publicKeyHex)` — transação on-chain que armazena a chave pública ECIES do jogador no GameMaster
   - Chama `initGame()` para carregar estado on-chain (missão ativa, pistas, etc.)

### Se logou com Google (sem wallet):

4. Apenas salva `userInfo`, mas sem endereço ETH → o jogador não consegue interagir com contratos (precisa de MetaMask conectada)

5. Abre o modal de **nickname** → jogador escolhe seu codinome de detetive
6. Ao confirmar, salva no `localStorage` e navega para `/game`

---

## FASE 2: Tela do Jogo + Mission Briefing

**Arquivo:** `frontend/src/pages/GamePage.jsx`

1. Se não está conectado, redireciona para `/`
2. Chama `initGame()` de novo (caso refresh da página)
3. Se `briefingDone === false`, mostra o overlay **`<MissionBriefing>`** — uma tela cinematic

**Arquivo:** `frontend/src/components/MissionBriefing.jsx`

4. Ao interagir com o briefing, chama `completeBriefing()` do gameStore

---

## FASE 3: completeBriefing — Registro + Início da Missão

**Arquivo:** `frontend/src/store/gameStore.js` → `completeBriefing()`

Dois cenários:

### A) Já tem missão ativa (voltou ao jogo):

- Detecta `existingMissionId` carregado pelo `initGame()`
- Pula registro e VRF
- Configura event listeners e marca `briefingDone = true`
- Jogador continua de onde parou

### B) Nova missão:

1. **Registro** (se necessário): gera chave ECIES, envia TX `registerPlayer(publicKey)` ao GameMaster
2. **startMission()**: envia TX ao GameMaster que:
   - Auto-fecha missão anterior (se existir)
   - Cria nova `Mission` com `status = Active` e `targetHash = 0x0` (ainda vazio)
   - Pede randomness ao **Chainlink VRF v2.5** (`requestRandomWords`)
   - Emite evento `MissionStarted(missionId, player, startBlock)`
3. **VRF Callback** (acontece em ~3 blocos, automático):
   - `fulfillRandomWords()` é chamada pelo VRF Coordinator
   - Seleciona cidade aleatória: `randomWords[0] % validChainIds.length` → ex: Tokyo (421614)
   - Gera salt: `keccak256(randomWords[0], missionId)`
   - **COMMIT**: armazena `targetHash = keccak256(chainId, salt)` — a cidade da Carmen **nunca** fica em plaintext on-chain
   - Armazena `salt` em `missionSalts[missionId]` (para CRE ler depois)
   - Emite `CarmenLocationCommitted(missionId, targetHash)`
4. Frontend busca o `activeMissionId`, carrega dados da missão, configura event listeners para `ClueReceived`, `CarmenCaptured` e `MissionFailed`
5. Marca `briefingDone = true` → esconde o overlay, mostra o mapa

---

## FASE 4: Investigação — O Loop Principal

**Tela:** `InteractiveMap` (mapa mundi com 3 cidades) + `TerminalSidebar` (terminal estilo hacker) + `ContractExplorer`

### Jogador escolhe uma cidade para investigar:

1. **Frontend** (`gameStore.investigate(chainId)`):
   - Garante Sepolia
   - Envia TX `submitInvestigation(chainId)` ao GameMaster
   - GameMaster verifica: chainId válido? Dentro do limite de 10 investigações? Dentro de 50 blocos?
   - Se ultrapassar limites → `_failMission()` + emite `MissionFailed`
   - Se OK → emite **`InvestigationSubmitted(missionId, player, chainId)`**

2. **CRE Workflow `mission-start`** (off-chain, TypeScript rodando no Chainlink Runtime):

   **Arquivo:** `cre-workflows/mission-start/main.ts`

   O workflow escuta o evento `InvestigationSubmitted` e executa:

   a. **EVMRead** x 4: lê `getMissionSalt`, `getValidCities`, `getMission` (targetHash, cluesReceived), `getPlayerPublicKey`

   b. **Brute-force do hash**: testa `keccak256(city, salt)` para cada uma das 3 cidades até encontrar qual bate com `targetHash` → descobre onde a Carmen está

   c. **Decide se é pista verdadeira ou falsa**: compara `investigatedChainId === carmenCity`

   d. **Seleciona texto da pista** do `scenarios.json` (pool de pistas verdadeiras ou falsas)

   e. **Encripta a pista com ECIES**: usa a chave pública do jogador (lida on-chain) para encriptar o texto. Formato: `ephemeralPubKey(65) || iv(12) || ciphertext || tag(16)`

   f. **Envia report para o Proxy** → `ACTION=1` → `GameMasterProxy._processReport()` → `GameMaster.receiveClue(missionId, clueType, contentHash, encryptedClue)`

   g. **Se a cidade estava correta E o jogador já tem >= 3 pistas**: envia segundo report → `ACTION=2` → `resolveCapture(missionId, chainId, salt)` (fase REVEAL)

3. **On-chain — receiveClue()**:
   - Armazena a pista (tipo, hash do conteúdo, texto encriptado) no array `missionClues`
   - Incrementa `cluesReceived`
   - Emite `ClueReceived(missionId, clueType, contentHash, ipfsPointer)`

4. **Frontend — Event Listener** (configurado em `_setupEventListeners`):
   - Captura `ClueReceived`
   - Chama `decryptClue(ciphertextHex)` → **ECIES decrypt** usando a chave privada do IndexedDB:
     - ECDH: `sharedSecret = privateKey x ephemeralPubKey`
     - HKDF com label `"carmen-ecies"` → deriva chave AES-256
     - AES-256-GCM decrypt → texto limpo
   - Mostra a pista decifrada no modal + terminal

---

## FASE 5: Carmen se Movimenta (Cron)

**Arquivo:** `cre-workflows/carmen-moves/main.ts`

- Roda a cada **3 minutos** (cron `0 */3 * * * *`)
- Lê missão ativa, brute-force da cidade atual
- Escolhe nova cidade (diferente da atual)
- Calcula novo `targetHash = keccak256(newCity, salt)`
- Envia report → `ACTION=3` → `GameMaster.updateTarget(missionId, newTargetHash)`
- Emite `CarmenMoved(missionId, newTargetHash)`
- O jogador vê no terminal que Carmen se mudou!

---

## FASE 6: Captura da Carmen (Vitória)

Acontece automaticamente quando o CRE detecta:
- O jogador investigou a cidade **correta** (onde Carmen está)
- O jogador já recebeu **>= 3 pistas**

O CRE envia `resolveCapture(missionId, revealedChainId, salt)`:

1. **On-chain REVEAL**: o contrato verifica `keccak256(revealedChainId, salt) == targetHash` — prova que o CRE não está mentindo
2. Calcula reward baseado em blocos usados:
   - 0-20 blocos → Gold (100 pts)
   - 21-35 blocos → Silver (75 pts)
   - 36-50 blocos → Bronze (50 pts)
3. `activePlayerMission[player] = 0` (limpa missão)
4. Emite `CarmenCaptured(missionId, player, blocksUsed, reward)`
5. (Futuramente: MissionNFT é mintado como troféu ERC-721)

**Frontend**: o listener de `CarmenCaptured` mostra no terminal a mensagem de captura, blocos usados e promoção de rank.

---

## FASE 7: Falha da Missão (Derrota)

Duas formas de falhar:
- **Mais de 50 blocos** desde o início → `_failMission()` + `MissionFailed`
- **Mais de 10 investigações** sem capturar → `_failMission()` + `MissionFailed`

Frontend mostra "MISSION FAILED — Carmen escaped!" e o jogador pode iniciar nova missão.

---

## Resumo Visual do Fluxo

```
LoginPage           GamePage              Blockchain              CRE (off-chain)
---------           --------              ----------              ---------------
Privy login
  |
MetaMask connect
  |
ensureSepoliaNetwork
  |
ECIES keygen
  |
registerPlayer(pubKey) --> GameMaster.registerPlayer()
  |
Navigate /game
                    MissionBriefing
                      |
                    completeBriefing()
                      |
                    startMission() ------> GameMaster.startMission()
                                            |
                                          VRF request
                                            |
                                          fulfillRandomWords()
                                          COMMIT: targetHash stored
                                            |
                    <--- mission loaded ---<
                      |
                    [LOOP] Jogador clica cidade
                      |
                    investigate(chainId) -> submitInvestigation()
                                            | emit InvestigationSubmitted
                                                                    |
                                                              mission-start:
                                                              brute-force hash
                                                              encrypt clue
                                                              |
                                          receiveClue() <-- report ACTION=1
                                            | emit ClueReceived
                    <-- decrypt + show ---<
                      |
                    [Se correto + 3 pistas]
                                          resolveCapture() <-- report ACTION=2
                                            | REVEAL + verify hash
                                            | emit CarmenCaptured
                    <-- VITORIA! ---------<

                    [Em paralelo, a cada 3 min]
                                                              carmen-moves:
                                                              brute-force + pick new city
                                                              |
                                          updateTarget() <-- report ACTION=3
                                            | emit CarmenMoved
```

---

## Arquivos-chave para cada camada

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| Auth | `frontend/src/main.jsx` | PrivyProvider config |
| Auth | `frontend/src/pages/LoginPage.jsx` | Login flow completo |
| Auth | `frontend/src/utils/privyProvider.js` | Helpers Privy → ethers |
| Crypto | `frontend/src/utils/ecies.js` | Keygen + decrypt (IndexedDB) |
| Crypto | `cre-workflows/mission-start/ecies.ts` | Encrypt (CRE side) |
| State | `frontend/src/store/gameStore.js` | Zustand — toda lógica de estado |
| Blockchain | `frontend/src/services/contractService.js` | ethers v6 wrapper |
| Contract | `contracts/src/GameMaster.sol` | Engine principal |
| Contract | `contracts/src/GameMasterProxy.sol` | Recebe reports CRE |
| CRE | `cre-workflows/mission-start/main.ts` | Processa investigações |
| CRE | `cre-workflows/carmen-moves/main.ts` | Move Carmen (cron) |
