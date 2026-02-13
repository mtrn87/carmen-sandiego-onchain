# Carmen Sandiego On-Chain — Game Finalization Plan

> Documento gerado em 2026-02-13 com analise completa do estado do projeto e tarefas pendentes para finalizar o jogo.

---

## Fluxo Completo do Jogo (Passo a Passo)

### Fase 1: Login & Registro

1. Jogador acessa o app → **LoginPage** com animacao terminal (6 linhas, 350ms cada)
2. Conecta via **Privy** (Google/Email ou MetaMask)
3. Frontend gera **par de chaves ECIES** (secp256k1) e guarda a chave privada no IndexedDB (`carmen-sandiego` → `keys` → `ecies-keypair`)
4. Chama `registerPlayer(publicKey)` no **GameMaster** (Sepolia) — registra a chave publica on-chain
5. Jogador escolhe um **nickname** (salvo apenas no localStorage)

### Fase 2: Briefing da Missao

6. Jogador entra no GamePage → **MissionBriefing** com efeito typewriter + audio
7. Ao pressionar ENTER 2x → chama `startMission()` no GameMaster
8. GameMaster requisita **VRF v2.5** da Chainlink → recebe numero aleatorio
9. VRF callback:
   - Seleciona cidade aleatoria dos `validChainIds`
   - Gera salt: `keccak256(randomWord, missionId)`
   - Armazena `targetHash = keccak256(chainId, salt)` — **nunca revela a cidade em plaintext**
10. Emite evento `MissionStarted` → **CRE generate-briefing** escuta, gera briefing criptografado com ECIES, envia como 1a pista via `receiveClue()`

### Fase 3: Investigacao (Loop Principal)

11. Jogador ve o **mapa interativo** com 3 cidades:

| Chain ID | Cidade | Network          |
|----------|--------|------------------|
| 421614   | Tokyo  | Arbitrum Sepolia |
| 84532    | Paris  | Base Sepolia     |
| 51       | London | XDC Apothem      |

12. Clica numa cidade → `submitInvestigation(chainId)` on-chain
13. Emite evento `InvestigationSubmitted` → **CRE mission-start** escuta:
    - Le o salt do GameMaster via `getMissionSalt(missionId)`
    - **Brute-force**: testa `keccak256(city, salt)` para cada cidade ate achar a correta
    - Se o jogador acertou a cidade → seleciona pista **verdadeira** do cenario
    - Se errou → seleciona pista **falsa** (misdirection)
    - Criptografa a pista com ECIES usando a chave publica do jogador
    - Envia via `receiveClue()` no GameMasterProxy
14. Frontend recebe evento `ClueReceived` → **descriptografa localmente** com chave privada do IndexedDB → mostra modal com a pista
15. A cada **3 minutos**, **CRE carmen-moves** muda Carmen de cidade → `updateTarget(newHash)` → frontend recebe alerta `CarmenMoved`

### Fase 4: Captura ou Falha

16. **Captura**: Se o jogador investigou a cidade correta E ja tem 3+ pistas → CRE chama `resolveCapture(missionId, chainId, salt)` → contrato verifica o hash → `CarmenCaptured` emitido
    - Recompensa baseada em blocos usados:
      - **GOLD** (<=20 blocos): 100 pontos
      - **SILVER** (<=35 blocos): 75 pontos
      - **BRONZE** (<=50 blocos): 50 pontos
17. **Falha**: Se >10 investigacoes OU >50 blocos → `MissionFailed`
18. Jogador pode iniciar nova missao

---

## Estado Atual — O Que Funciona

| Componente | Status | Detalhes |
|---|---|---|
| GameMaster.sol | OK | Commit-reveal, VRF, investigacoes, captura, reward tiers |
| GameMasterProxy.sol | OK | Recebe reports do CRE, roteia para GameMaster |
| CityNode.sol | OK | Tracking de presenca da Carmen por chain |
| MissionNFT.sol | OK (isolado) | Contrato existe mas NAO integrado ao fluxo |
| ReceiverTemplate.sol | OK | Base para recepcao segura de reports CRE |
| Testes de contrato | OK | 65+ testes, cobertura ~95% no GameMaster |
| CRE mission-start | OK | Brute-force + ECIES + clue delivery |
| CRE generate-briefing | OK (parcial) | Briefing via template (AI desabilitado) |
| CRE carmen-moves | OK (limitado) | Funciona para 1 missao hardcoded |
| Frontend login/registro | OK | Privy + ECIES keygen + registerPlayer on-chain |
| Frontend investigacao | OK | submitInvestigation + event listeners reais |
| Frontend decryption | OK | ECIES decrypt com @noble/* v1.x |
| 10 cenarios de missao | OK | scenarios.json com pistas true/false |
| Deploy scripts | OK (parcial) | GameMaster + Proxy + NFT. CityNode manual |

---

## Lacunas e Tarefas

### Sprint 1 — Core Game Loop

> Issues no GitHub: separadas por stack (contracts, frontend, cre-workflows, devops).

#### Contracts

- [ ] **[#17](https://github.com/mtrn87/carmen-sandiego-onchain/issues/17) Integrar MissionNFT na captura (mintMissionComplete)**
  - `contracts/src/GameMaster.sol` → `_captureCarmen()` deve chamar `missionNFT.mintMissionComplete()`
  - Adicionar referencia ao MissionNFT no GameMaster + gerar metadata URI

- [ ] **[#18](https://github.com/mtrn87/carmen-sandiego-onchain/issues/18) Adicionar Pausable ao GameMaster**
  - Herdar `Pausable` do OpenZeppelin, `whenNotPaused` em `startMission()` e `submitInvestigation()`

- [ ] **[#19](https://github.com/mtrn87/carmen-sandiego-onchain/issues/19) Habilitar workflow validation no ReceiverTemplate**
  - Setar `expectedWorkflowId`, `expectedAuthor` apos deploy dos CRE workflows

#### Frontend

- [ ] **[#20](https://github.com/mtrn87/carmen-sandiego-onchain/issues/20) Error recovery: retry de TX e feedback de timeout CRE**
  - Botao retry em `completeBriefing()` e `investigate()`, loading states distintos

- [ ] **[#21](https://github.com/mtrn87/carmen-sandiego-onchain/issues/21) Limpar dados mock do ContractExplorer**
  - Remover `CASE_DATA` mockado, substituir por estado vazio ou tutorial

#### CRE Workflows

- [ ] **[#22](https://github.com/mtrn87/carmen-sandiego-onchain/issues/22) carmen-moves: suporte a multiplas missoes simultaneas**
  - Remover `activeMissionId` hardcoded, iterar sobre missoes ativas

#### DevOps

- [ ] **[#23](https://github.com/mtrn87/carmen-sandiego-onchain/issues/23) Mover enderecos de contrato para variaveis de ambiente**
  - `VITE_GAME_MASTER_ADDRESS` no frontend, parametrizar configs CRE

#### Validacao

- [ ] **[#24](https://github.com/mtrn87/carmen-sandiego-onchain/issues/24) Teste end-to-end completo em testnet (Sepolia)**
  - Validar fluxo completo: deploy → registro → missao → investigacao → captura → NFT

---

### Sprint 2 — Features de Hackathon (Futuro)

> Issues a serem criadas apos Sprint 1 concluido.

- [ ] **Leaderboard**
  - `frontend/src/pages/LoginPage.jsx` (botao mostra `alert("coming soon")`)
  - Opcoes: Firebase/Supabase, on-chain mapping, ou The Graph

- [ ] **Historico de missoes**
  - Indexar eventos on-chain para exibir missoes passadas

- [ ] **Renderizar pistas de audio/imagem**
  - `frontend/src/components/InteractiveMap.jsx` — frontend so renderiza texto
  - Requer: Player de audio inline, visualizador de imagem no modal de pista

- [ ] **Persistir nickname on-chain**
  - Nickname so existe no localStorage. Opcao: mapping no GameMaster ou profile contract

- [ ] **Habilitar AI briefings quando CRE suportar async**
  - `cre-workflows/generate-briefing/main.ts` — `generateAIBriefing()` pronto, bloqueado por CRE WASM

---

### Sprint 3 — Polish & UX (Futuro)

> Issues a serem criadas apos Sprint 2 concluido.

- [ ] **Remover gas counter fake** — "-30 GAS" eh visual e confuso
- [ ] **Mobile responsive** — mapa canvas nao testado em mobile
- [ ] **Accessibility (WCAG)** — sem alt text, sem focus management
- [ ] **Tutorial/Tour persistente** — tour reseta no refresh
- [ ] **Testes de integracao no frontend** — cobertura atual ~35-40%

---

## Arquitetura de Referencia

```
                        JOGADOR (Browser)
                            |
                    [Privy Auth + ECIES Keys]
                            |
                      Frontend (React/Vite)
                     /        |        \
            InteractiveMap  ContractExplorer  TerminalSidebar
                     \        |        /
                      gameStore (Zustand)
                            |
                    contractService (ethers v6)
                            |
                +-----------+-----------+
                |                       |
          GameMaster (Sepolia)    CityNode (per-chain)
           /    |    \              - Arbitrum Sepolia (Tokyo)
          /     |     \             - Base Sepolia (Paris)
        VRF   Proxy   MissionNFT   - XDC Apothem (London)
               |
        KeystoneForwarder
               |
    +----------+----------+
    |          |          |
 mission-   generate-  carmen-
 start      briefing   moves
    |          |          |
    +--- CRE Workflows ---+
         (Bun/TypeScript)
```

## Contratos Deployados

| Contrato | Chain | Endereco |
|---|---|---|
| GameMaster | Sepolia (11155111) | `0x19281fB23Fa8C423c22A8856DD168c1eb0e9a8aD` |
| GameMasterProxy | Sepolia (11155111) | `0xe3A6369E02A5e9CB34732C9ae2E2BC5Ae92BD56E` |
| MissionNFT | Sepolia (11155111) | *(deploy-all.ts gera)* |
| CityNode Tokyo | Arbitrum Sepolia (421614) | *(deploy-citynode.ts gera)* |
| CityNode Paris | Base Sepolia (84532) | *(deploy-citynode.ts gera)* |
| CityNode London | XDC Apothem (51) | *(deploy-citynode.ts gera)* |

## Dependencias Criticas

- **@noble/curves@1.8.2, @noble/ciphers@1.2.1, @noble/hashes@1.7.2** — v2.x QUEBRA CRE WASM
- **ethers v6** — Frontend usa BrowserProvider
- **@chainlink/cre-sdk@1.0.7** — Runtime dos workflows
- **Solidity 0.8.24** — Contratos com optimization (200 runs)
- **Privy** — App ID: `cmlh3u02l00fnl50cr0btgldc`

---

## Resumo de Progresso

| Area | Pronto | Pendente | % Completo |
|---|---|---|---|
| Smart Contracts (core) | 5/5 contratos | NFT integration, Pausable | ~90% |
| CRE Workflows | 3/3 workflows | Multi-mission, AI async | ~80% |
| Frontend (game flow) | Login, missao, investigacao | Leaderboard, historico, error recovery | ~70% |
| Testes (contratos) | 65+ testes | NFT integration tests | ~90% |
| Testes (frontend) | 6 arquivos | Integracao, E2E | ~35% |
| Deploy | Scripts basicos | Orquestracao completa, CityNode | ~60% |
| **TOTAL ESTIMADO** | | | **~70%** |
