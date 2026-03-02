# 🎮 Carmen Sandiego On-Chain - Setup Gasless Registration

Guia completo para configurar e rodar o fluxo de registro gasless com Privy e Chainlink Functions.

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn
- Carteira com ETH em Sepolia (para pagar gas do servidor)
- Conta Privy (https://privy.io)

## 🚀 Instalação Rápida

### 1. Clonar e instalar dependências

```bash
git clone <repo>
cd carmen-sandiego-onchain

# Frontend
cd frontend
npm install

# Servidor Chainlink Functions
cd ../chainlink-functions
npm install

# Contratos (opcional, apenas se for fazer deploy)
cd ../contracts
npm install
```

### 2. Configurar variáveis de ambiente

#### Frontend (`.env`)

```bash
cd frontend
cp .env.example .env
```

Edite `frontend/.env`:
```
VITE_PRIVY_APP_ID=your_privy_app_id
VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
VITE_ALCHEMY_RPC_URL_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
VITE_CHAINLINK_FUNCTIONS_URL=http://localhost:3001/relay
```

#### Servidor Chainlink Functions (`.env`)

```bash
cd chainlink-functions
cp .env.example .env
```

Edite `chainlink-functions/.env`:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your_private_key_here
PORT=3001
```

**⚠️ IMPORTANTE:** 
- A carteira com `CHAINLINK_FUNCTIONS_PRIVATE_KEY` deve ter ETH em Sepolia
- Nunca commitar `.env` com chaves privadas
- Use uma carteira dedicada para o servidor (não use sua carteira principal)

### 3. Obter chaves necessárias

#### Privy App ID
1. Acesse https://dashboard.privy.io
2. Crie um novo projeto
3. Copie o App ID
4. Configure em `frontend/.env` como `VITE_PRIVY_APP_ID`

#### Alchemy API Key
1. Acesse https://www.alchemy.com
2. Crie uma app para Sepolia
3. Copie a URL RPC
4. Configure em `frontend/.env` e `chainlink-functions/.env`

#### Private Key do Servidor
1. Use uma carteira dedicada (ex: criar nova com MetaMask)
2. Copie a private key
3. Configure em `chainlink-functions/.env`
4. **Envie ETH para essa carteira em Sepolia** (~0.5 ETH é suficiente)

## ▶️ Rodando a Aplicação

### Terminal 1: Servidor Chainlink Functions

```bash
cd chainlink-functions
npm start
```

Você verá:
```
=== Chainlink Functions Relayer Server ===
✓ Server running on http://localhost:3001
✓ POST /relay - Relay registration requests
✓ GET /health - Health check

Waiting for requests...
```

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

Você verá:
```
  ➜  Local:   http://localhost:5173/
```

### Terminal 3 (Opcional): Verificar saúde do servidor

```bash
curl http://localhost:3001/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "signer": "0xb19eE81581AE385F56D702d412D92d70fb65b9F7",
  "balance": "0.45765073837728901",
  "playerRegistry": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
}
```

## 🔄 Fluxo de Teste

### Primeiro Login (Registro)

1. Abra http://localhost:5173
2. Clique em "Login with Google"
3. Faça login com sua conta Google
4. Será criada uma embedded wallet automaticamente
5. Modal de nickname aparecerá
6. Insira um nickname (3-20 caracteres, alfanumérico + _ -)
7. Clique "Register"
8. Aguarde a confirmação (transação no servidor)
9. Será redirecionado para `/game`

**Logs esperados no console:**
```
[LoginPage] Syncing Privy user...
[LoginPage] Wallet address: 0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067
[creService] Reading player data for: 0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067
[creService] Player does not exist (wallet is zero address)
[NicknameModal] Registering player with nickname: seu_nickname
[creService] Message signed with Privy wallet: 0x...
[creService] Calling Chainlink Functions...
[NicknameModal] Registration successful!
```

**Logs esperados no servidor (3001):**
```
=== Registration Relay Request ===
Player: 0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067
Nickname: seu_nickname
Nonce: 0
Validating signature...
✓ Signature valid
Calling registerPlayer...
✓ Transaction sent: 0x...
✓ Transaction confirmed: 0x...
✓ Block: 10281041
```

### Segundo Login (Retorno)

1. Abra http://localhost:5173
2. Clique em "Login with Google"
3. Faça login com a mesma conta Google
4. **Não mostrará modal de nickname**
5. Será redirecionado direto para `/game`

**Logs esperados:**
```
[LoginPage] Checking if player exists...
[creService] Reading player data for: 0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067
[creService] Raw player data: Proxy(_Result) {0: '0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067', 1: 'seu_nickname', ...}
[LoginPage] Player exists! Navigating to game...
```

## 🔐 Como Funciona a Segurança

### Assinatura de Mensagem

1. **Frontend** cria um hash da mensagem:
   ```
   messageHash = keccak256(playerAddress, nickname, nonce, contractAddress)
   ```

2. **Frontend** assina com Privy:
   ```
   signature = privySignMessage(messageHash)
   ```

3. **Servidor** valida a assinatura:
   ```
   recoveredAddress = ecdsaRecover(messageHash, signature)
   assert(recoveredAddress == playerAddress)
   ```

4. **Servidor** chama contrato:
   ```
   registerPlayer(playerAddress, nickname)
   ```

### Proteção contra Replay Attacks

- Cada jogador tem um `nonce` que incrementa a cada registro
- Assinatura inclui o `nonce`
- Servidor valida que o `nonce` está correto

## 🧪 Testes Manuais

### Testar Health Check

```bash
curl http://localhost:3001/health
```

### Testar Relay (com dados reais)

```bash
curl -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d '{
    "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
    "nickname": "teste",
    "signature": "0x3acead92cb235904e69d7281e2fb0e188d780400665414972698ced7ab5f53637968744a77299f9c5b11fa5ea7729ccf2f9ca399c8da34e3b9a08e3e0e447c131c",
    "nonce": "7",
    "contractAddress": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
  }'
```

## 🐛 Troubleshooting

### Erro: "No wallet detected"
- Verifique se `VITE_ALCHEMY_RPC_URL_SEPOLIA` está configurado
- Verifique se a URL é válida

### Erro: "Chainlink Functions error: Internal Server Error"
- Verifique se o servidor 3001 está rodando
- Verifique os logs do servidor para mais detalhes
- Verifique se a carteira tem ETH suficiente

### Erro: "Only GameMaster"
- O servidor não é o GameMaster do contrato
- Execute: `npx hardhat run scripts/setGameMaster.js --network sepolia`
- Certifique-se de usar a carteira correta

### Erro: "Invalid signature"
- A assinatura não corresponde ao playerAddress
- Verifique se o messageHash está correto
- Verifique se a assinatura foi feita com a chave correta

### Modal de nickname aparece no segundo login
- Verifique se `player_registered_address` está em localStorage
- Verifique se o contrato tem os dados do jogador
- Verifique os logs do `getPlayerData()`

## 📊 Arquitetura

```
Frontend (5173)
    ↓
    ├─ Privy (Google OAuth + Embedded Wallet)
    ├─ Alchemy RPC (Leituras do contrato)
    └─ Servidor Chainlink Functions (3001)
         ↓
         ├─ Valida assinatura
         └─ Chama PlayerRegistry (Sepolia)
              ↓
              └─ Armazena dados do jogador
```

## 📝 Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `VITE_PRIVY_APP_ID` | ID da app Privy | `clxx...` |
| `VITE_PLAYER_REGISTRY_ADDRESS_SEPOLIA` | Endereço do contrato | `0x40cfae...` |
| `VITE_ALCHEMY_RPC_URL_SEPOLIA` | URL RPC da Alchemy | `https://eth-sepolia.g.alchemy.com/v2/...` |
| `VITE_CHAINLINK_FUNCTIONS_URL` | URL do servidor relayer | `http://localhost:3001/relay` |
| `SEPOLIA_RPC_URL` | RPC para servidor | `https://eth-sepolia.g.alchemy.com/v2/...` |
| `PLAYER_REGISTRY_ADDRESS` | Endereço do contrato | `0x40cfae...` |
| `CHAINLINK_FUNCTIONS_PRIVATE_KEY` | Private key do servidor | `your_private_key...` |
| `PORT` | Porta do servidor | `3001` |

## 🚀 Deploy em Produção

Para produção, você precisará:

1. **Usar Chainlink Functions real** (não servidor local)
2. **Configurar CRE Workflow** para processar eventos
3. **Usar RPC pago** (Alchemy, Infura, etc)
4. **Aumentar segurança** (rate limiting, validação extra)
5. **Monitorar custos** (gas fees)

Veja `cre-workflows/` para mais detalhes sobre CRE.

## 📚 Referências

- [Privy Docs](https://docs.privy.io)
- [Chainlink Functions](https://docs.chain.link/chainlink-functions)
- [Sepolia Testnet](https://sepolia.etherscan.io)
- [Alchemy](https://www.alchemy.com)

## 💬 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do frontend e servidor
2. Verifique as variáveis de ambiente
3. Verifique se a carteira tem ETH
4. Abra uma issue no repositório

---

**Última atualização:** Fevereiro 2026
