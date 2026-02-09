# Cenarios de Jogo Detalhados

Tres cenarios que cobrem o ciclo completo do jogo.

## Cenario 1: Registro e Inicio da Cacada

### Jornada do Jogador

1. **Acesso**: Jogador acessa o frontend, tela de boas-vindas da ACME Detective Agency
2. **Conexao**: Conecta carteira Web3 (MetaMask), sistema reconhece endereco on-chain
3. **Chaves**: Frontend gera par de chaves criptograficas localmente
   - Privada: armazenada no navegador (IndexedDB)
   - Publica: enviada para registro on-chain
4. **Registro**: Transacao para `PlayerRegistry.sol` -> confirmacao on-chain
5. **Primeira Missao**: Carmen avistada em protocolo DeFi na testnet Sepolia

### Interacoes Tecnicas

- **Frontend**: conexao de carteira + geracao de chaves + interacao com `PlayerRegistry.sol`
- **PlayerRegistry.sol**: armazena `playerAddress` + `publicKey`, emite `PlayerRegistered`

---

## Cenario 2: Captura Bem-Sucedida e Promocao

### Jornada do Jogador

1. **Investiga** protocolo DeFi na Sepolia -> clica "Investigar"
2. **Recebe pista criptografada** -> decriptografa audio localmente
3. **Analisa pista**: usa block explorer para encontrar transacao anomala (flash loan de valor baixo)
4. **Identifica proximo local**: transacao aponta para marketplace NFT na Polygon Amoy
5. **Tenta captura**: navega para o local correto e clica "Prender"
6. **Vitoria**: Carmen capturada -> promocao de rank

```
   Sepolia (DeFi)          Polygon Amoy (NFT)
   ┌────────────┐          ┌─────────────────┐
   │ Investiga  │─────────>│  Tenta Prender  │
   │ Recebe     │  pista   │  SUCESSO!       │
   │ pista      │  aponta  │  Rank UP        │
   └────────────┘          └─────────────────┘
```

### Interacoes Tecnicas

| Componente | Acao |
|------------|------|
| Frontend | `investigate` -> decripta audio -> `attemptArrest` |
| Game.sol | emite `InvestigationRequested` -> verifica loc -> `CarmenCaptured` |
| CRE (GenerateClueWorkflow) | IA pista -> TTS -> cripto -> IPFS -> on-chain |
| PlayerRegistry.sol | `promotePlayer()` -> `PlayerPromoted` |

---

## Cenario 3: Perda e Rebaixamento

### Jornada do Jogador

1. **Investiga** local -> recebe pista de audio criptografada
2. **Ma interpretacao**: jogador apressado assume destino errado sem verificar detalhes
3. **Tenta captura no local errado**: clica "Prender" em contrato incorreto
4. **Derrota**: Carmen escapa -> rebaixamento de rank

```
   Local Correto              Local Escolhido (ERRADO)
   ┌─────────────┐            ┌──────────────────┐
   │ Carmen esta │            │  Jogador tenta   │
   │ AQUI        │     X      │  prender AQUI    │
   │             │            │  FALHA! Rank DOWN│
   └─────────────┘            └──────────────────┘
```

### Interacoes Tecnicas

| Componente | Acao |
|------------|------|
| Frontend | `investigate` -> decripta audio -> `attemptArrest` (locId errado) |
| Game.sol | verifica loc (diferente!) -> `ArrestFailed` -> `demotePlayer` |
| CRE (GenerateClueWorkflow) | funciona normalmente na geracao de pista |
| PlayerRegistry.sol | `demotePlayer()` -> `PlayerDemoted` |

## Resumo dos Cenarios

| Cenario | Resultado | Rank |
|---------|-----------|------|
| Registro | Detetive Novato | 0 |
| Captura OK | Promocao | +1 |
| Captura Falha | Rebaixamento | -1 |
