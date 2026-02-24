# Chainlink Functions Relayer Server

Servidor que funciona como relayer para registros gasless usando Chainlink Functions.

## 🎯 O que faz

1. **Recebe** dados assinados do frontend (playerAddress, nickname, signature, nonce)
2. **Valida** a assinatura na blockchain
3. **Chama** `requestRegistrationWithSignature()` no contrato PlayerRegistry
4. **Retorna** o hash da transação

**Resultado:** Usuário não paga gas, servidor paga.

## 🚀 Setup

### 1. Instalar dependências

```bash
cd chainlink-functions
npm install
```

### 2. Configurar `.env`

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite `.env`:
```
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your_private_key_here
PORT=3001
```

**⚠️ IMPORTANTE:** A carteira com `CHAINLINK_FUNCTIONS_PRIVATE_KEY` deve ter ETH no Sepolia para pagar gas.

### 3. Iniciar servidor

```bash
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

## 📡 API Endpoints

### POST /relay

Relaia uma solicitação de registro para a blockchain.

**Request:**
```json
{
  "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
  "nickname": "teste",
  "signature": "0x...",
  "nonce": "0",
  "contractAddress": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
}
```

**Response (sucesso):**
```json
{
  "success": true,
  "txHash": "0x...",
  "blockNumber": 12345,
  "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
  "nickname": "teste"
}
```

**Response (erro):**
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

### GET /health

Verifica saúde do servidor.

**Response:**
```json
{
  "status": "ok",
  "signer": "0x...",
  "balance": "0.5",
  "playerRegistry": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
}
```

## 🔄 Fluxo Completo

```
1. Frontend assina mensagem (zero gas)
   ↓
2. Frontend chama POST /relay com dados assinados
   ↓
3. Servidor valida assinatura
   ↓
4. Servidor chama requestRegistrationWithSignature()
   ↓ Servidor paga gas
   ↓
5. Contrato emite RegistrationRequested
   ↓
6. CRE escuta evento e processa
   ↓
7. CRE chama registerPlayer()
   ↓
8. Contrato emite PlayerRegistered
   ↓
9. Frontend recebe evento e vai para /game
```

## 💰 Custos

- **Usuário:** 0 (zero gas)
- **Servidor:** ~50k gas (~$0.50 no Sepolia)

## 🧪 Testar Localmente

```bash
# Terminal 1: Iniciar servidor
npm start

# Terminal 2: Testar health check
curl http://localhost:3001/health

# Terminal 3: Testar relay (com dados reais do frontend)
curl -X POST http://localhost:3001/relay \
  -H "Content-Type: application/json" \
  -d '{
    "playerAddress": "0xabE28095bfcE0Fe12F1BbC8aBe2Fa4149D35B067",
    "nickname": "teste",
    "signature": "0x...",
    "nonce": "0",
    "contractAddress": "0x40cfae50af62D18480bb588b7554b07d6dFE13e7"
  }'
```

## 🔐 Segurança

- ✅ Assinatura validada na blockchain
- ✅ Nonce previne replay attacks
- ✅ Private key em `.env` (nunca commitar)
- ✅ CORS habilitado (configure conforme necessário)

## 📝 Próximos Passos

1. Configurar `.env` com sua private key
2. Garantir que a carteira tem ETH no Sepolia
3. Iniciar servidor
4. Testar fluxo completo no frontend
