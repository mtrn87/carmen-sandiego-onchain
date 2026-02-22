# Carmen Sandiego On-Chain - Remaining Work Items

> Audit completo do projeto realizado em 22/02/2026.
> Cada item abaixo representa uma unidade de trabalho que pode ser convertida em GitHub Issue.

---

## 1. INFRAESTRUTURA & BACKEND

### 1.1 [HIGH] Pipeline CI/CD
**Prioridade:** Alta | **Tipo:** DevOps | **Camada:** Infraestrutura

Nao existem pipelines de CI/CD no repositorio.

**O que falta:**
- GitHub Actions workflow para rodar testes de smart contracts (`npx hardhat test`)
- GitHub Actions workflow para build do frontend (`npm run build`)
- Lint checks (Solidity + JavaScript)
- Verificacao automatica de contratos no Etherscan
- Deploy automatizado (opcional)

**Criar:** `.github/workflows/ci.yml`

---

### 1.2 [MEDIUM] Dockerizacao
**Prioridade:** Media | **Tipo:** DevOps | **Camada:** Infraestrutura

Nao existe Dockerfile ou docker-compose para facilitar setup local.

**O que falta:**
- `Dockerfile` para frontend (Vite build + serve)
- `Dockerfile` para relayer server (quando implementado)
- `docker-compose.yml` orquestrando ambos servicos
- Documentacao de setup com Docker

---

## 2. SMART CONTRACTS

### 2.1 [HIGH] Deploy dos CityNode Contracts nas 3 Chains
**Prioridade:** Alta | **Tipo:** Deployment | **Camada:** Smart Contracts

Os contratos CityNode estao implementados mas **nao estao deployados**. Os enderecos no frontend estao como placeholders (`0xYOUR_...ADDRESS_HERE`).

**O que falta:**
- Deploy `CityNode.sol` em Arbitrum Sepolia (Tokyo)
- Deploy `CityNode.sol` em Base Sepolia (Paris)
- Deploy `CityNode.sol` em XDC Apothem (London) — ou chain alternativa
- Chamar `setupLocations()` com dados de cada cidade
- Chamar `addAnomalyTxRef()` para popular transacoes suspeitas
- Chamar `addSuspectWallet()` para popular wallets suspeitas
- Chamar `setSuspicionIndex()` para nivel de suspeicao inicial
- Chamar `setHint()` para dicas de cada localizacao
- Chamar `setClueSchema()` para tipos de pistas
- Chamar `setGameMaster()` com endereco do GameMaster em Sepolia
- Atualizar `.env` com enderecos deployados
- Atualizar `frontend/.env` com enderecos VITE_CITYNODE_*

**Scripts existentes:** `contracts/scripts/deploy-citynode.ts`

---

### 2.2 [HIGH] Script de Seed/Setup para CityNode Data
**Prioridade:** Alta | **Tipo:** Tooling | **Camada:** Smart Contracts

Apos deploy dos CityNodes, e necessario popular os dados de jogo (localizacoes, transacoes, wallets, dicas). O script `seed-case.ts` existe mas precisa ser validado/expandido.

**O que falta:**
- Validar que `seed-case.ts` popula todos os dados necessarios para as 3 cidades
- Criar dados de jogo para cada cidade (3 localizacoes x 3 pistas cada)
- Criar transacoes anomalas realistas por cidade
- Criar suspect wallets com metadata relevante
- Garantir consistencia entre dados on-chain e `scenarios.json`

---

### 2.3 [MEDIUM] Testes de Smart Contracts - Gaps de Cobertura
**Prioridade:** Media | **Tipo:** Testing | **Camada:** Smart Contracts

Existem ~170 testes, mas ha lacunas importantes.

**GameMaster - testes faltando:**
- Cenarios de multi-mission failure complexos
- Edge cases de reward calculation no limite (exatamente 50 blocks)
- Atingir MAX_INVESTIGATIONS=10
- Exaustao de MAX_BLOCKS=50
- Missoes concorrentes (edge cases)

**CityNode - testes faltando:**
- Boundary conditions de energy regeneration
- Tamanhos maximos de arrays para paginacao
- Cenarios de exaustao profunda de energia
- Handling de requests concorrentes

**GameMasterProxy - testes faltando:**
- `ACTION_RECEIVE_WALLET_FRAGMENT` (action 4) nao testada
- `ACTION_RESOLVE_WALLET_CAPTURE` (action 5) nao testada
- Validacao de workflow ID/author/name
- Edge cases de metadata parsing
- Reports malformados

---

### 2.4 [LOW] Rate Limiting em Submissions de Investigacao
**Prioridade:** Baixa | **Tipo:** Security | **Camada:** Smart Contracts

Nao ha rate limiting em `submitInvestigation()`. Um jogador pode submeter investigacoes rapidamente em sequencia.

**O que falta:**
- Considerar cooldown entre investigacoes
- Ou aceitar como design decision e documentar

---

## 3. CRE WORKFLOWS

### 3.1 [HIGH] Integracao com AI (OpenAI) para Geracao de Conteudo
**Prioridade:** Alta | **Tipo:** Feature | **Camada:** CRE Workflows

As 3 workflows de geracao de conteudo tem TODOs para AI que estao bloqueados pela limitacao do CRE v1 (handlers sincronos).

**Arquivos afetados:**
- `cre-workflows/mission-start/main.ts:389` — AI clue generation
- `cre-workflows/generate-briefing/main.ts:444` — AI briefing generation
- `cre-workflows/generate-finale/main.ts:522` — AI narrative generation

**Status atual:** Fallback para templates enriched de `scenarios.json`

**O que falta:**
- Monitorar release do CRE v2 com suporte a async handlers
- Quando disponivel: habilitar chamadas a OpenAI GPT-4o-mini
- Implementar prompts para briefings, pistas e narrativas de final
- Integrar ElevenLabs TTS para audio narration (tambem bloqueado por async)
- Integrar Pinata IPFS para storage de conteudo gerado

**Alternativa:** Se CRE v2 demorar, considerar um servico off-chain separado que escuta eventos e publica conteudo AI diretamente.

---

### 3.2 [MEDIUM] Integracao IPFS/Pinata para Storage de Conteudo
**Prioridade:** Media | **Tipo:** Feature | **Camada:** CRE Workflows

As credenciais PINATA_API_KEY e PINATA_SECRET_KEY estao no `.env.example`, mas o upload para IPFS nao esta implementado nas workflows (depende de async).

**O que falta:**
- Upload de pistas encriptadas para IPFS
- Upload de briefings para IPFS
- Upload de audio narration para IPFS
- Frontend decryption + fetch do IPFS

---

### 3.3 [MEDIUM] Integracao ElevenLabs TTS
**Prioridade:** Media | **Tipo:** Feature | **Camada:** CRE Workflows

Audio narration via ElevenLabs esta planejada mas nao implementada (depende de async no CRE).

**O que falta:**
- Chamadas a ElevenLabs API para TTS
- Upload de audio para IPFS
- Frontend playback de audio clues
- Audio briefings e finales

---

### 3.4 [LOW] Validacao Cross-Chain para CityNode Resolution
**Prioridade:** Baixa | **Tipo:** Feature | **Camada:** CRE Workflows

As funcoes `resolveClueOnCity`, `resolveDossierOnCity`, `resolveCaptureOnCity` no GameMaster existem para resolver requests de CityNodes em outras chains. Porem, **nao existe CRE workflow** que escute eventos dos CityNodes e chame essas funcoes.

**O que falta:**
- CRE workflow que escuta `ClueRequested` em CityNodes (Arbitrum/Base)
- Gera ou busca dados de pista
- Chama `resolveClueOnCity()` no GameMaster (Sepolia)
- Mesmo para `DossierRequested` → `resolveDossierOnCity()`
- Mesmo para `CaptureRequested` → `resolveCaptureOnCity()`

**Impacto:** Sem isso, requests async no CityNode (requestClue, requestDossier, requestCapture) ficam pendentes indefinidamente. O frontend contorna isso com timeouts e mock data fallback.

---

## 4. FRONTEND - INTEGRACAO COM CONTRATOS

### 4.1 [HIGH] Event Listeners Faltando no GameMaster
**Prioridade:** Alta | **Tipo:** Bug | **Camada:** Frontend

O frontend escuta apenas 8 de 16 eventos do GameMaster (50% cobertura).

**Eventos nao monitorados:**
- `PlayerRegistered` — confirmar registro com sucesso (feedback ao usuario)
- `MissionStarted` — trigger de atualizacao de UI pos-VRF
- `CarmenLocationCommitted` — informacional (commit hash)
- `MissionNFTSet` — notificar jogador que NFT foi mintado
- `TokenURISet` — metadata do NFT pronta
- `ClueResolvedOnCity` — feedback de pista resolvida cross-chain
- `DossierResolvedOnCity` — feedback de dossier resolvido
- `CaptureResolvedOnCity` — feedback de captura cross-chain

**Arquivo:** `frontend/src/services/contractService.js`

---

### 4.2 [HIGH] Evento TxFlagged do CityNode Nao Monitorado
**Prioridade:** Alta | **Tipo:** Bug | **Camada:** Frontend

O evento `TxFlagged` do CityNode nao possui listener. O jogador nao recebe feedback apos flaggar uma transacao.

**Arquivo:** `frontend/src/services/contractService.js`

---

### 4.3 [HIGH] View Functions do GameMaster Nao Utilizadas
**Prioridade:** Alta | **Tipo:** Enhancement | **Camada:** Frontend

3 funcoes view uteis para tracking de progresso nunca sao chamadas:

- `getPlayerGlobalProgress(player)` — cidades visitadas, total de pistas, identity commits
- `getPlayerIdentityCommits(player)` — tracking de evidencia
- `getPlayerCityClueCount(player, cityId)` — progresso de pistas por cidade

**Uso sugerido:** Alimentar tela de perfil/estatisticas do jogador e barra de progresso global.

---

### 4.4 [MEDIUM] Integracao de MissionNFT no Frontend
**Prioridade:** Media | **Tipo:** Feature | **Camada:** Frontend

O MissionOutcome menciona "MissionNFT minted" (store `gameStore.js`) mas nao ha interacao real com o contrato MissionNFT no frontend.

**O que falta:**
- Ler `MissionNFT.getMissionRecord(tokenId)` para dados do trofel
- Ler `MissionNFT.tokenURI(tokenId)` para metadata/imagem SVG
- Exibir NFT trophy na tela de resultado
- Galeria de NFTs do jogador (missoes passadas)
- Link para visualizar no OpenSea/Etherscan

---

### 4.5 [MEDIUM] Energy System Incompleto no Frontend
**Prioridade:** Media | **Tipo:** Bug | **Camada:** Frontend

O componente `EnergyDisplay` existe e lê `energy.current`/`energy.max` do store, mas:

**O que falta:**
- Logica de regeneracao de energia no gameStore (1 energy a cada 15 min)
- Polling periodico de `getCityNodeEnergy()` para atualizar
- Feedback visual quando energia e insuficiente para acao
- Animacao de regeneracao
- Timer mostrando proximo ponto de energia

---

### 4.6 [MEDIUM] Remover/Ajustar Mock Fallbacks para Producao
**Prioridade:** Media | **Tipo:** Tech Debt | **Camada:** Frontend

O `contractService.js` tem extensos fallbacks com mock data que sao uteis para dev mas devem ser controlados em producao.

**Mock functions encontradas:**
- `_mockClueResult()` (line 851)
- `_mockCityInfo()` (line 907)
- `_mockAnomalyTxRefs()` (line 1164)
- `_mockSuspectWallets()` (line 1206)
- 6+ console.log com "MOCK" (lines 1289, 1327, 1366, 1453, 1476, 1549)
- 6+ console.warn com fallback messages (lines 947, 986, 1027, 1201, 1396, 1441)

**O que falta:**
- Feature flag `VITE_MOCK_MODE=true/false` para controlar mocks
- Em producao: erros ao inves de fallback silencioso
- Ou manter mocks mas com logging claro de que esta em modo demo

---

## 5. FRONTEND - FEATURES

### 5.1 [HIGH] Leaderboard
**Prioridade:** Alta | **Tipo:** Feature | **Camada:** Frontend

O leaderboard e um placeholder (alert hardcoded).

**Evidencia:**
- `frontend/src/pages/LoginPage.jsx:308` — `alert(LEADERBOARD_MSG)`
- `frontend/src/components/TerminalSidebar.jsx` — comando `/LEADERBOARD` e placeholder

**O que falta:**
- Pagina/modal de leaderboard
- Leitura de dados on-chain (MissionNFT records, reward tiers)
- Ranking por: total rewards, missions completed, average blocks, best time
- Top 10/50/100 jogadores
- Filtro por periodo (all-time, semanal, diario)

---

### 5.2 [HIGH] Pagina de Perfil/Estatisticas do Jogador
**Prioridade:** Alta | **Tipo:** Feature | **Camada:** Frontend

Nao existe pagina de perfil. O rank aparece no jogo mas sem detalhes.

**O que falta:**
- Rota `/profile` ou `/profile/:address`
- Historico de missoes (MissionNFT tokens)
- Estatisticas: missions completed, gold/silver/bronze, total blocks, average time
- Galeria de NFT trophies com SVG gerado
- Progress bars (cidades visitadas, pistas encontradas)
- Usar `getPlayerGlobalProgress()` e `getMissionRecord()`

---

### 5.3 [MEDIUM] Multiplos Cenarios de Missao
**Prioridade:** Media | **Tipo:** Content | **Camada:** Frontend + CRE

Apenas 1 cenario existe em `scenarios.json` ("Heist of the Lost CryptoPunk").

**O que falta:**
- Criar pelo menos 5-10 cenarios adicionais com:
  - Titulo e briefing unicos
  - Pistas verdadeiras e falsas por cidade
  - Contexto narrativo diferente
- Atualizar selecao por missionId no frontend e CRE workflows
- Garantir variedade para replayability

**Arquivos:**
- `frontend/src/data/scenarios.json`
- `cre-workflows/data/scenarios.json`

---

### 5.4 [MEDIUM] Suporte a Audio/Image Clues no Frontend
**Prioridade:** Media | **Tipo:** Feature | **Camada:** Frontend

O `ClueModal` referencia tipos audio/image mas apenas Text esta implementado na UI.

**O que falta:**
- Player de audio integrado no ClueModal para pistas tipo Audio
- Visualizacao de imagem para pistas tipo Image
- Integracao com IPFS para fetch de audio/imagens
- Decryptacao ECIES de conteudo multimedia
- TerminalSidebar ja tem playback parcial (line 71) — expandir

---

### 5.5 [MEDIUM] Error Boundary Components
**Prioridade:** Media | **Tipo:** Enhancement | **Camada:** Frontend

Nao existem React Error Boundaries no app.

**O que falta:**
- Error boundary generico no App.jsx
- Error boundary especifico para GamePage
- Fallback UI para quando componentes crasham
- Logging de erros para debugging

---

### 5.6 [LOW] Rotas Adicionais
**Prioridade:** Baixa | **Tipo:** Feature | **Camada:** Frontend

Rotas planejadas mas nao implementadas:
- `/leaderboard` — Rankings (ver item 5.1)
- `/profile/:address` — Perfil (ver item 5.2)
- `/help` — Guia de como jogar
- `/settings` — Configuracoes do jogador

---

### 5.7 [LOW] Code Splitting e Lazy Loading
**Prioridade:** Baixa | **Tipo:** Performance | **Camada:** Frontend

Nao ha code splitting — todos os 18 componentes carregam no bundle principal.

**O que falta:**
- `React.lazy()` para GamePage e sub-componentes
- Lazy loading de imagens
- Otimizar leitura de IndexedDB (ECIES keys) — nao precisa ser a cada load

---

### 5.8 [LOW] Persistencia de Progresso Cross-Session
**Prioridade:** Baixa | **Tipo:** Enhancement | **Camada:** Frontend

Parcialmente implementado com localStorage. Sessoes novas podem nao restaurar completamente o estado.

**O que falta:**
- Validar que `loadMissionState()` restaura 100% do estado apos refresh
- Garantir que city discovery state persiste entre sessoes
- Testar cenario: fechar browser → reabrir → continuar missao

---

## 6. SEGURANCA

### 6.1 [HIGH] Validacao de Assinatura no Registro
**Prioridade:** Alta | **Tipo:** Security | **Camada:** Smart Contracts + Backend

O registro atual nao valida assinaturas. Qualquer pessoa pode registrar qualquer endereco.

**O que falta (se relayer for implementado):**
- Frontend assina mensagem: `keccak256(address, nickname, nonce, contractAddr)`
- Relayer valida assinatura via ECDSA recovery
- Protecao contra replay com nonce incrementing
- Rate limiting por IP/address

---

### 6.2 [MEDIUM] Audit de Seguranca dos Smart Contracts
**Prioridade:** Media | **Tipo:** Security | **Camada:** Smart Contracts

Nenhuma auditoria formal foi realizada.

**Pontos de atencao:**
- Single point of failure: CRE oracle controla toda logica
- Loops sem gas limit em `_isValidChainId()` (unbounded)
- Multiplos identity commits para mesma cidade permitidos
- Sem whitelist para criacao de CityNodes

---

## 7. DOCUMENTACAO

### 7.1 [MEDIUM] Atualizar Documentacao com Estado Real
**Prioridade:** Media | **Tipo:** Docs | **Camada:** Geral

A documentacao descreve features que nao existem ou divergem da implementacao.

**Divergencias encontradas:**
- Docs mencionam `PlayerRegistry.sol` como contrato separado — nao existe
- Docs mencionam relayer server (porta 3001) — nao existe
- Docs mencionam AI-generated briefings/clues — sao template-based atualmente
- Docs mencionam ElevenLabs TTS — nao implementado
- Docs mencionam IPFS storage de pistas — nao implementado
- Docs mencionam "Sepolia (HQ), Arbitrum Sepolia (Tokyo), Base Sepolia (Paris)" como 3 cidades — CityNode tambem inclui XDC Apothem

---

### 7.2 [LOW] Guia de Setup para Desenvolvedores
**Prioridade:** Baixa | **Tipo:** Docs | **Camada:** Geral

**O que falta:**
- README com passo-a-passo claro para setup local
- Lista de todas as env vars necessarias com descricao
- Instrucoes para deploy de contratos em testnet
- Instrucoes para setup e deploy de CRE workflows
- Troubleshooting guide

---

## 8. TESTES END-TO-END

### 8.1 [HIGH] Teste E2E do Fluxo Completo do Jogo
**Prioridade:** Alta | **Tipo:** Testing | **Camada:** Full Stack

**O que falta:**
- Teste que simula: registro → start mission → VRF callback → investigacao → CRE clue delivery → captura → NFT mint
- Pode ser feito com Hardhat fork + mock CRE
- Validar que frontend event listeners recebem todos os eventos
- Validar que estado do gameStore reflete corretamente o on-chain

---

### 8.2 [MEDIUM] Testes de Frontend (Cypress/Playwright)
**Prioridade:** Media | **Tipo:** Testing | **Camada:** Frontend

Existem unit tests com Vitest mas nao ha testes E2E de UI.

**O que falta:**
- Setup Cypress ou Playwright
- Teste de fluxo de login (Privy mock)
- Teste de navegacao no mapa
- Teste de investigacao de cidade
- Teste de captura de Carmen

---

## 9. GAMEPLAY & CONTEUDO

### 9.1 [MEDIUM] Terceira Cidade Operacional (XDC Apothem)
**Prioridade:** Media | **Tipo:** Feature | **Camada:** Full Stack

O frontend referencia XDC Apothem (chain 51) como terceira chain, mas a docs original menciona apenas Sepolia/Arbitrum/Base.

**Decisao necessaria:**
- Confirmar se XDC Apothem sera usada ou substituida
- Se mantida: deploy CityNode, configurar RPC, testar chain switching
- Se nao: remover referencias e ajustar city pool

---

### 9.2 [LOW] Pool de Cidades Expandido
**Prioridade:** Baixa | **Tipo:** Content | **Camada:** Frontend

O `cityRegistry.js` define 16 cidades em 6 blockchains, mas apenas 3 chains tem CityNodes deployaveis.

**O que falta:**
- Decidir quantas cidades/chains serao suportadas na v1
- Remover cidades de chains sem CityNode ou marcar como "coming soon"
- Ou implementar CityNodes em mais chains (Polygon Amoy, BNB Testnet)

---

### 9.3 [LOW] Balanceamento de Gameplay
**Prioridade:** Baixa | **Tipo:** Gameplay | **Camada:** Design

**O que falta validar:**
- Timing do cron do carmen-moves (3 min) vs tempo medio de investigacao
- Energy costs vs regeneration rate (1/15min com max 10)
- Reward tiers (Gold: 0-20 blocks, Silver: 21-35, Bronze: 36-50) vs tempo real de jogo
- Probabilidade de pistas verdadeiras (70%) vs falsas (30%)
- Numero de pistas necessarias para captura (3+)

---

## RESUMO POR PRIORIDADE

### CRITICAL (Bloqueantes para v1)
| # | Item | Tipo |
|---|------|------|
| 2.1 | Deploy CityNode nas 3 Chains | Deployment |

### HIGH (Importantes para experiencia completa)
| # | Item | Tipo |
|---|------|------|
| 1.3 | Pipeline CI/CD | DevOps |
| 2.2 | Script de Seed/Setup para CityNodes | Tooling |
| 3.1 | Integracao AI (OpenAI) | CRE Workflows |
| 3.4 | CRE Workflow para Resolver CityNode Requests | CRE Workflows |
| 4.1 | Event Listeners Faltando (GameMaster) | Frontend |
| 4.2 | Event Listener TxFlagged (CityNode) | Frontend |
| 4.3 | View Functions Nao Utilizadas | Frontend |
| 5.1 | Leaderboard | Frontend Feature |
| 5.2 | Perfil/Estatisticas do Jogador | Frontend Feature |
| 6.1 | Validacao de Assinatura no Registro | Security |
| 8.1 | Teste E2E Fluxo Completo | Testing |

### MEDIUM (Qualidade e polish)
| # | Item | Tipo |
|---|------|------|
| 1.4 | Dockerizacao | DevOps |
| 2.3 | Gaps de Cobertura de Testes | Testing |
| 3.2 | Integracao IPFS/Pinata | CRE Workflows |
| 3.3 | Integracao ElevenLabs TTS | CRE Workflows |
| 4.4 | Integracao MissionNFT no Frontend | Frontend |
| 4.5 | Energy System Completo | Frontend |
| 4.6 | Feature Flag para Mock Mode | Frontend |
| 5.3 | Multiplos Cenarios de Missao | Content |
| 5.4 | Suporte Audio/Image Clues | Frontend |
| 5.5 | Error Boundary Components | Frontend |
| 6.2 | Audit de Seguranca | Security |
| 7.1 | Atualizar Documentacao | Docs |
| 8.2 | Testes E2E de UI | Testing |
| 9.1 | Terceira Cidade (XDC) | Gameplay |

### LOW (Nice to have)
| # | Item | Tipo |
|---|------|------|
| 2.4 | Rate Limiting em Investigacoes | Security |
| 2.5 | Mecanismo de Appeal | Feature |
| 5.6 | Rotas Adicionais | Frontend |
| 5.7 | Code Splitting / Lazy Loading | Performance |
| 5.8 | Persistencia Cross-Session | Enhancement |
| 7.2 | Guia de Setup para Devs | Docs |
| 9.2 | Pool de Cidades Expandido | Content |
| 9.3 | Balanceamento de Gameplay | Design |

---

**Total de itens: 33**
- Critical: 3
- High: 11
- Medium: 14
- Low: 8
