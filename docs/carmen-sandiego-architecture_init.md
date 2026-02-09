<div align="center">

# Carmen Sandiego On-Chain
### AI-Powered Cross-Chain Detective Game

[![Chainlink](https://img.shields.io/badge/Powered%20by-Chainlink%20CRE-375BD2?style=for-the-badge&logo=chainlink&logoColor=white)](https://chain.link)

**The first blockchain game where AI is the Game Master**

[CRE Innovation](#-cre-the-autonomous-game-master) • [How It Works](#-how-it-works) • [Tech Stack](#-technology-stack) • [Roadmap](#-48-hour-implementation)

</div>

---

## 🎯 Executive Summary

Carmen Sandiego rouba um NFT e foge entre blockchains. **Chainlink CRE com IA** gera pistas únicas em tempo real - texto, áudio e imagens - enquanto VRF e CCIP garantem gameplay justo e verdadeiramente cross-chain.

**Diferencial**: CRE orquestra tudo - é o "cérebro" que torna cada partida única e imprevisível.

---

## 🧠 CRE: The Autonomous Game Master

### Por que CRE é a Estrela

**Problema**: Smart contracts sozinhos não conseguem:
- ❌ Chamar APIs externas (OpenAI, ElevenLabs)
- ❌ Processar lógica complexa (custa gas demais)
- ❌ Orquestrar múltiplos serviços em um workflow
- ❌ Gerar conteúdo dinâmico e único

**Solução**: **Chainlink Runtime Environment (CRE)**
- ✅ Executa JavaScript off-chain com acesso ilimitado a APIs
- ✅ Orquestra OpenAI + ElevenLabs + DALL-E em um único workflow
- ✅ Processa lógica de jogo complexa sem custo de gas
- ✅ Retorna dados estruturados para o smart contract

### CRE como Orquestrador Central

```
                    ╔═══════════════════════════╗
                    ║   CHAINLINK CRE (Brain)   ║
                    ║  Autonomous Game Master   ║
                    ╚═════════════╦═════════════╝
                                  ║
              ┌───────────────────╬───────────────────┐
              │                   ║                   │
              ▼                   ▼                   ▼
        ┌──────────┐        ┌──────────┐       ┌──────────┐
        │ OpenAI   │        │ElevenLabs│       │  DALL-E  │
        │ GPT-4o   │        │   TTS    │       │    3     │
        ├──────────┤        ├──────────┤       ├──────────┤
        │Briefings │        │  Audio   │       │  Images  │
        │  Clues   │        │ Witnesses│       │ Security │
        │Narratives│        │  Calls   │       │  Footage │
        └──────────┘        └──────────┘       └──────────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
              ┌──────────┐              ┌──────────┐
              │   VRF    │              │   CCIP   │
              │ Randomness│              │Cross-Chain│
              └─────┬────┘              └─────┬────┘
                    │                         │
                    └──────────┬──────────────┘
                               │
                        ┌──────▼──────┐
                        │GameMaster.sol│
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │   Player    │
                        └─────────────┘
```

### 5 CRE Functions = 5 Superpoderes

| Function | O que faz | Por que precisa de CRE |
|----------|-----------|------------------------|
| **🎬 generateBriefing()** | Cria história da missão com IA | Smart contract não pode chamar OpenAI |
| **🔍 generateClue()** | Gera pistas multimodais (texto/audio/imagem) | Precisa orquestrar 3 APIs diferentes |
| **🧩 analyzePattern()** | Detecta se player está perdido | Lógica complexa custaria muito gas |
| **🎭 carmenReacts()** | Carmen responde aos movimentos | IA precisa simular estratégia |
| **🏆 generateFinale()** | Conclusão dramática personalizada | Narrativa única baseada no gameplay |

---

## 🎮 How It Works

### Gameplay Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    1. START MISSION                          │
└─────────────────────────────────────────────────────────────┘

Player paga → VRF sorteia localização → CRE gera briefing com IA
                    ↓
            CCIP move NFT roubado


┌─────────────────────────────────────────────────────────────┐
│                 2. INVESTIGATION LOOP                        │
└─────────────────────────────────────────────────────────────┘

Player escolhe cidade → VRF: verdadeira (70%) ou falsa (30%)?
                    ↓
            CRE gera pista multimodal:
            
    40% → 📝 Texto (testemunha escrita)
    40% → 🎤 Áudio (voz gerada por ElevenLabs)  
    20% → 🖼️ Imagem (DALL-E: câmera de segurança)


┌─────────────────────────────────────────────────────────────┐
│                      3. CAPTURE                              │
└─────────────────────────────────────────────────────────────┘

Cidade certa → Valida blocos gastos → CCIP devolve NFT
                    ↓
            Recompensa baseada em velocidade
```

### Network Map

```
                    ETHEREUM
                   (HQ Central)
                      🏛️
                       ║
        ╔══════════════╬══════════════╗
        ║              ║              ║
    POLYGON        ARBITRUM       OPTIMISM
    Paris🗼        Tokyo🗾        London🎡
        ║              ║              ║
        ╚══════════════╬══════════════╝
                       ║
                     BASE
                    NYC🗽
```

Cada blockchain = Uma cidade | NFT está em UMA delas

---

## 💡 CRE Innovation Deep Dive

### Example: Multi-Modal Clue Generation

**Como funciona um CRE Function gerando pistas:**

```javascript
// CRE Function pseudo-code
async function generateClue(city, isCorrect, clueType) {
    
    // STEP 1: AI decide o conteúdo
    const clue = await OpenAI.generate({
        prompt: isCorrect 
            ? "Pista verdadeira apontando para destino" 
            : "Pista falsa convincente"
    });
    
    // STEP 2: Formata conforme tipo (VRF decidiu)
    if (clueType === "AUDIO") {
        const audio = await ElevenLabs.textToSpeech(clue);
        const url = await IPFS.upload(audio);
        return { type: "audio", url, transcript: clue };
    }
    
    if (clueType === "IMAGE") {
        const image = await DALLE.generate({
            prompt: "Security camera: " + clue
        });
        return { type: "image", url: image };
    }
    
    return { type: "text", content: clue };
}
```

**Resultado**: 
- 📝 Texto: "Pierre viu Carmen comprando passagem para Tokyo..."
- 🎤 Áudio: Voz realista do informante (28s MP3)
- 🖼️ Imagem: Foto CCTV gerada por IA mostrando figura vermelha

### Why This is Impossible Without CRE

| Task | Smart Contract Alone | With CRE |
|------|---------------------|----------|
| Call OpenAI API | ❌ Impossible | ✅ Native HTTP requests |
| Generate audio | ❌ Impossible | ✅ Calls ElevenLabs seamlessly |
| Multi-step workflow | ❌ Complex oracle setup | ✅ Single function |
| Gas cost | ❌ Prohibitive | ✅ Off-chain = $0 gas |
| Development time | ❌ Weeks | ✅ Hours |

---

## ⏱️ Block-Based Timer System

**Inovação**: Usa blocos da blockchain como relógio nativo

| Blocks Used | Performance | Reward | NFT Tier |
|------------|-------------|--------|----------|
| 0-20 | 🏆 Perfect | 100 $CLUE | Gold |
| 21-35 | ⚡ Good | 75 $CLUE | Silver |
| 36-50 | ✓ OK | 50 $CLUE | Bronze |
| 51+ | ❌ Failed | 0 | None |

**Por quê?** Cada chain tem velocidade diferente = estratégia diferente!

---

## 🛠️ Technology Stack

### Chainlink Services (Full Stack Integration)

<table>
<thead>
<tr>
<th>Service</th>
<th>Role</th>
<th>Usage</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>🧠 CRE</strong></td>
<td><strong>Game Master (Brain)</strong></td>
<td>Orchestrates all AI services, generates dynamic content</td>
</tr>
<tr>
<td><strong>🎲 VRF</strong></td>
<td>Randomness Provider</td>
<td>Fair location selection, clue authenticity, clue type</td>
</tr>
<tr>
<td><strong>🌉 CCIP</strong></td>
<td>Cross-Chain Bridge</td>
<td>NFT movement between chains (core mechanic)</td>
</tr>
</tbody>
</table>

### AI Services (via CRE)

| Service | Purpose | Cost/Call |
|---------|---------|-----------|
| OpenAI GPT-4o-mini | Text generation | ~$0.0001 |
| ElevenLabs TTS | Voice synthesis | ~$0.003 |
| DALL-E 3 | Image generation | ~$0.04 |

**Total per game**: ~$0.05 (mix of 3-5 clues)

### Smart Contracts

- **GameMaster.sol** (Ethereum): Coordenação principal (~200 linhas)
- **CityNode.sol** (outras chains): Recebe/guarda NFT (~80 linhas)
- **ClueToken.sol**: ERC20 reward token (~40 linhas)

### Frontend Stack

- React + wagmi + viem
- RainbowKit para wallets
- Audio player para pistas de voz
- Image viewer para evidências visuais

---

## 🚀 48-Hour Implementation

### Day 1: Foundation (Core Functionality)

| Hours | Task | Deliverable |
|-------|------|-------------|
| 0-4h | Smart contracts + VRF + CCIP | Contracts deployed on 3 chains |
| 4-8h | **CRE Function #1: Briefing** | AI briefing generation working |
| 8-12h | **CRE Function #2: Text Clues** | Basic clue generation |
| 12-14h | Testing & fixes | End-to-end flow working |

**Day 1 Goal**: Player can start mission, get AI briefing, receive text clue

### Day 2: Polish & Multimodal

| Hours | Task | Deliverable |
|-------|------|-------------|
| 0-3h | **CRE Audio integration** | ElevenLabs working |
| 3-6h | **CRE Image integration** | DALL-E working |
| 6-9h | Frontend UI | Playable interface |
| 9-12h | Rewards + NFTs | Complete game loop |
| 12-14h | Demo video + polish | Submission ready |

**Day 2 Goal**: Full multimodal experience ready to present

### Priority Matrix

```
MUST HAVE (Day 1):
├─ ✅ CRE generating AI briefings
├─ ✅ CRE generating text clues
├─ ✅ VRF randomization
├─ ✅ CCIP NFT transfer
└─ ✅ Basic frontend

SHOULD HAVE (Day 2):
├─ Audio clues (ElevenLabs)
├─ Image clues (DALL-E)
├─ Reward calculation
└─ Detective NFT badges

NICE TO HAVE:
├─ Advanced CRE functions
├─ Multiple difficulty levels
└─ Leaderboard
```

---

## 🏆 Competitive Advantages

### Why This Wins

| Feature | Traditional Games | Carmen On-Chain |
|---------|------------------|-----------------|
| **Content Generation** | Static/pre-made | CRE + AI = infinite unique content |
| **Cross-Chain** | Fake (same contract) | CCIP = real multi-network gameplay |
| **Randomness** | Server-controlled | VRF = provably fair |
| **Game Master** | Human/scripted | CRE = autonomous AI orchestrator |

### Chainlink Stack Showcase

**This project demonstrates:**

1. **🧠 CRE** - The star: orchestrates entire game logic
2. **🎲 VRF** - Not just for location, also clue types & authenticity  
3. **🌉 CCIP** - NFT is game object, not just reward
4. **Complete Integration** - All 3 services work together seamlessly

### Innovation Highlights

✨ **First game with CRE as autonomous Game Master**
✨ **AI-generated multimodal clues (text + audio + images)**
✨ **Blocks as native timer (no external oracles)**
✨ **True cross-chain gameplay via CCIP**

---

## 📊 Technical Flow (Complete Sequence)

```
Block 1000: startMission()
    ↓
Block 1001: VRF → Carmen localizada em Tokyo (Arbitrum)
    ↓
Block 1002: CRE → OpenAI gera briefing + primeira pista
    ↓
Block 1003: CCIP → NFT enviado para Arbitrum
    ↓
Block 1005: Player investiga Paris (errado)
    ↓
Block 1006: VRF → Pista verdadeira (70% chance)
           VRF → Tipo: Áudio
    ↓
Block 1007: CRE → GPT gera testemunho
           CRE → ElevenLabs converte para voz
           CRE → Upload IPFS
    ↓
Block 1008: Player recebe áudio: "Vi ela no aeroporto..."
    ↓
Block 1012: Player investiga Tokyo (correto!)
    ↓
Block 1013: captureCarmen() ✅
           13 blocos usados → 100% reward
    ↓
Block 1014: CCIP → NFT retorna para Ethereum
           Mint 100 $CLUE + Gold Detective NFT
    ↓
Mission Complete! 🎉
```

---

## 🎯 One-Minute Pitch

**"Carmen Sandiego On-Chain"**

**Problem**: Blockchain games são repetitivos e previsíveis

**Solution**: CRE como Game Master autônomo gerando experiências únicas com IA

**How**:
- **CRE orquestra** OpenAI + ElevenLabs + DALL-E
- **VRF** garante fairness total
- **CCIP** torna cross-chain essencial ao gameplay

**Result**: 
- Cada partida é diferente (IA gera tudo)
- Zero possibilidade de trapaça (VRF on-chain)
- Verdadeiramente multi-chain (NFT viaja de verdade)

**Unique**: Primeiro jogo onde **CRE é o protagonista**, não apenas uma ferramenta auxiliar

---

## 📚 Resources

- **CRE Docs**: https://docs.chain.link/chainlink-functions
- **VRF Docs**: https://docs.chain.link/vrf
- **CCIP Docs**: https://docs.chain.link/ccip
- **OpenAI API**: https://platform.openai.com/docs
- **ElevenLabs API**: https://elevenlabs.io/docs

---

<div align="center">

## 🎮 Built for Chainlink Convergence Hackathon

**Where CRE meets AI meets Gaming**

*Showcasing the full power of Chainlink's technology stack*

[![Chainlink](https://img.shields.io/badge/Powered%20by-Chainlink%20CRE-375BD2?style=for-the-badge&logo=chainlink)](https://chain.link)

</div>
