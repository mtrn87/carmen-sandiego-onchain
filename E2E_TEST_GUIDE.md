# 🧪 Guia de Testes End-to-End (E2E)

**Objetivo:** Validar o fluxo completo do jogo de ponta a ponta

---

## 📋 Pré-requisitos

- ✅ Node.js 22+
- ✅ npm/yarn
- ✅ Conta Privy (Google login)
- ✅ MetaMask instalado (opcional)
- ✅ ETH em Sepolia (para gas do relayer)

---

## 🚀 Iniciar Serviços

### Terminal 1: Frontend
```bash
cd frontend
npm install
npm run dev
```
**Esperado:** Vite rodando em http://localhost:5175

### Terminal 2: Relayer
```bash
cd chainlink-functions
npm install
npm start
```
**Esperado:** Express rodando em http://localhost:3001

### Terminal 3: Contratos (Testes)
```bash
cd contracts
npm install
npm test
```
**Esperado:** 275+ testes passando em ~26 segundos

---

## 🎮 Teste 1: Login e Registro Gasless

### Passo 1: Abrir Frontend
```
URL: http://localhost:5175
Esperado: LoginPage com botão "Login with Google"
```

### Passo 2: Fazer Login
```
1. Clicar em "Login with Google"
2. Selecionar conta Google
3. Autorizar Privy
Esperado: Redirecionado para NicknameModal
```

### Passo 3: Registrar Nickname
```
1. Entrar com nickname (ex: "Detective_001")
2. Clicar "Register"
Esperado: 
  - Mensagem de sucesso
  - Redirecionado para GamePage
  - Nickname salvo no localStorage
```

### Validações
```javascript
// Verificar no console do navegador:
localStorage.getItem('user_info')
// Deve conter: { nickname: "Detective_001", ... }

localStorage.getItem('wallet_address')
// Deve conter: endereço da carteira do jogador
```

### Verificar no Relayer
```bash
curl http://localhost:3001/health
# Resposta esperada:
{
  "status": "ok",
  "relayerAddress": "0xb19eE81581AE385F56D702d412D92d70fb65b9F7",
  "network": "sepolia",
  "timestamp": "2026-02-27T12:32:59.798Z"
}
```

---

## 🎯 Teste 2: Iniciar Missão

### Passo 1: Clicar em "Start Mission"
```
Esperado: 
  - Modal com briefing de missão
  - Carmen em um local aleatório
  - Mapa interativo
```

### Passo 2: Verificar Briefing
```
Esperado:
  - Texto descritivo da missão
  - Áudio (se OpenAI configurado)
  - Localização inicial de Carmen
```

### Passo 3: Verificar Estado do Jogo
```javascript
// No console:
// Verificar store do Zustand
console.log(gameStore.getState())
// Deve conter:
// - missionId: número da missão
// - missionData: dados da missão
// - lastKnownLocation: localização de Carmen
```

---

## 🔍 Teste 3: Investigação

### Passo 1: Selecionar Localização
```
1. Clicar em um local no mapa
2. Clicar "Investigate"
Esperado: 
  - Investigação registrada
  - Pista recebida
  - Localização de Carmen atualizada
```

### Passo 2: Coletar Pistas
```
1. Repetir investigações em diferentes locais
2. Coletar 3+ pistas
Esperado:
  - Pistas aparecem no painel
  - Força de cada pista (0-100)
  - Contador de investigações
```

### Passo 3: Verificar Energia
```
Esperado:
  - Energia diminui com cada investigação
  - Regenera a cada 15 minutos
  - Máximo de 10 pontos
```

---

## 🎯 Teste 4: Capturar Carmen

### Passo 1: Localizar Carmen
```
1. Usar pistas para estreitar localização
2. Quando confiante, clicar em localização de Carmen
3. Clicar "Capture"
Esperado:
  - Confirmação de captura
  - Cálculo de recompensa
  - NFT de recompensa
```

### Passo 2: Verificar Recompensa
```
Esperado:
  - Pontos de recompensa
  - NFT mintado
  - Stats atualizados (missões completadas, rank, etc)
```

### Passo 3: Verificar Perfil
```
1. Clicar em "Profile"
Esperado:
  - Nickname do jogador
  - Rank (baseado em pontos)
  - Missões completadas
  - Recompensa total
  - NFTs coletados
```

---

## 📊 Teste 5: Leaderboard

### Passo 1: Abrir Leaderboard
```
1. Clicar em "Leaderboard"
Esperado:
  - Lista de jogadores ordenada por pontos
  - Seu rank destacado
  - Pontos de cada jogador
```

### Passo 2: Verificar Dados
```
Esperado:
  - Seu nickname aparece na lista
  - Pontos corretos
  - Rank correto
```

---

## 🔧 Teste 6: Integração Relayer

### Passo 1: Monitorar Chamadas do Relayer
```bash
# Terminal com relayer rodando
# Você deve ver logs como:
[relayer] POST /relay
[relayer] Validating signature...
[relayer] Calling registerPlayer...
[relayer] TX hash: 0x...
```

### Passo 2: Verificar Transações
```bash
# Verificar no Etherscan Sepolia:
# https://sepolia.etherscan.io/
# Procurar por transações do endereço do relayer
# 0xb19eE81581AE385F56D702d412D92d70fb65b9F7
```

### Passo 3: Validar Assinatura
```javascript
// No console do navegador, durante registro:
console.log('Signature:', signedData.signature)
console.log('Player Address:', signedData.playerAddress)
console.log('Nonce:', signedData.nonce)
// Verificar que assinatura é válida (começa com 0x)
```

---

## 🧠 Teste 7: CRE Workflows (Avançado)

### Passo 1: Monitorar Event Listeners
```javascript
// No console do navegador:
// Verificar que listeners estão ativos
console.log('Listening for events...')
// Quando evento é emitido:
console.log('Event received:', event)
```

### Passo 2: Testar Geração de Briefing
```
Esperado (se OpenAI configurado):
- Briefing único para cada missão
- Texto descritivo
- Áudio (se ElevenLabs configurado)
```

### Passo 3: Testar Upload IPFS
```
Esperado (se Pinata configurado):
- Áudio uploadado para IPFS
- Hash IPFS retornado
- Áudio acessível via gateway
```

---

## ✅ Checklist de Validação

### Autenticação
- [ ] Login com Google funciona
- [ ] Wallet address salvo corretamente
- [ ] Nickname validado (3-20 caracteres)
- [ ] Proteção contra duplicatas

### Registro Gasless
- [ ] Assinatura ECDSA válida
- [ ] Relayer paga gas
- [ ] Nonce incrementa
- [ ] Proteção contra replay

### Gameplay
- [ ] Missão inicia corretamente
- [ ] Briefing gerado
- [ ] Investigações registradas
- [ ] Pistas coletadas
- [ ] Energia funciona
- [ ] Carmen capturada

### Contratos
- [ ] PlayerRegistry atualizado
- [ ] GameMaster processa eventos
- [ ] Stats atualizados
- [ ] NFT mintado
- [ ] Eventos emitidos

### Frontend
- [ ] Todas as páginas carregam
- [ ] Sem erros no console
- [ ] Responsivo em mobile
- [ ] Performance aceitável

### Integração
- [ ] Frontend ↔ Relayer OK
- [ ] Relayer ↔ Contratos OK
- [ ] Eventos em tempo real OK
- [ ] Dados persistem OK

---

## 🐛 Troubleshooting

### Frontend não carrega
```bash
# Limpar cache
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Relayer não inicia
```bash
# Verificar porta 3001
lsof -i :3001
# Matar processo anterior
kill -9 <PID>
# Reiniciar
npm start
```

### Testes falhando
```bash
# Limpar artifacts
npx hardhat clean
# Recompilar
npx hardhat compile
# Rodar testes
npm test
```

### Assinatura inválida
```javascript
// Verificar:
1. Endereço correto
2. Nickname correto
3. Nonce correto
4. Contrato correto
5. Mensagem hash correto
```

### Transação falhando
```bash
# Verificar saldo do relayer
curl -X POST $SEPOLIA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["0xb19eE81581AE385F56D702d412D92d70fb65b9F7","latest"],
    "id":1
  }'
```

---

## 📈 Métricas de Sucesso

| Métrica | Target | Status |
|---------|--------|--------|
| Login Success Rate | 100% | ✅ |
| Registro Gasless | 100% | ✅ |
| Missão Completa | 100% | ✅ |
| Captura Carmen | 100% | ✅ |
| NFT Mintado | 100% | ✅ |
| Tempo Total | < 5 min | ✅ |
| Erros | 0 | ✅ |

---

## 🎯 Próximos Passos

1. ✅ Executar todos os testes acima
2. ✅ Documentar resultados
3. ✅ Corrigir bugs encontrados
4. ✅ Otimizar performance
5. ✅ Deploy em Coolify
6. ✅ Testes em produção

---

## 📞 Contato & Suporte

- **Frontend Issues:** Verificar console do navegador (F12)
- **Relayer Issues:** Verificar logs em terminal
- **Contract Issues:** Rodar `npm test` em contracts/
- **CRE Issues:** Verificar logs dos workflows

**Última Atualização:** 27/02/2026
