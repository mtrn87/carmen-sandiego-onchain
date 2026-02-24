# Deploy CRE no Coolify com Docker Compose

**Guia completo para fazer deploy do Chainlink Runtime Environment (CRE) no Coolify usando Docker Compose.**

---

## 📋 O Que Você Precisa

### 1. **Servidor Coolify**
- Instância Coolify rodando (self-hosted ou cloud)
- Acesso SSH ao servidor
- Docker e Docker Compose instalados

### 2. **Variáveis de Ambiente**
```env
# Blockchain
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
GAME_MASTER_ADDRESS=0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB

# Chainlink Functions
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your_private_key_here

# AI Services
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...

# IPFS
PINATA_JWT=...

# Ports
RELAYER_PORT=3001
CRE_PLAYER_REG_PORT=3002
CRE_PLAYER_CHECK_PORT=3003
FRONTEND_PORT=5173
```

### 3. **Arquivos Necessários**
- ✅ `docker-compose.yml` - Configuração de containers
- ✅ `.env` - Variáveis de ambiente
- ✅ `cre-workflows/player-registration/` - Workflow de registro
- ✅ `cre-workflows/player-check/` - Workflow de verificação
- ✅ `chainlink-functions/` - Relayer
- ✅ `frontend/` - Interface React

---

## 🚀 Passo-a-Passo de Deploy

### Passo 1: Preparar o Servidor Coolify

```bash
# SSH no servidor Coolify
ssh user@coolify-server

# Criar diretório do projeto
mkdir -p /opt/carmen-sandiego
cd /opt/carmen-sandiego

# Clonar repositório
git clone https://github.com/mtrn87/carmen-sandiego-onchain.git .
```

### Passo 2: Configurar Variáveis de Ambiente

```bash
# Criar arquivo .env com suas variáveis
cat > .env << EOF
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PLAYER_REGISTRY_ADDRESS=0x40cfae50af62D18480bb588b7554b07d6dFE13e7
GAME_MASTER_ADDRESS=0xB6E2A9DEd3352E1a1B4a501c6F110813883F4cEB
CHAINLINK_FUNCTIONS_PRIVATE_KEY=your_private_key_here
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
PINATA_JWT=...
EOF

# Proteger arquivo .env
chmod 600 .env
```

### Passo 3: Iniciar Docker Compose

```bash
# Puxar imagens e iniciar containers
docker-compose up -d

# Verificar status
docker-compose ps

# Ver logs
docker-compose logs -f relayer
docker-compose logs -f cre-player-registration
docker-compose logs -f frontend
```

### Passo 4: Verificar Saúde dos Serviços

```bash
# Relayer Health Check
curl http://localhost:3001/health

# Resposta esperada:
# {
#   "status": "ok",
#   "relayerAddress": "0xb19eE81581AE385F56D702d412D92d70fb65b9F7",
#   "network": "sepolia",
#   "timestamp": "2026-02-24T22:31:48.083Z"
# }

# Frontend
curl http://localhost:5173

# CRE Player Registration
curl http://localhost:3002/health

# CRE Player Check
curl http://localhost:3003/health
```

---

## 🔗 Integração com Coolify

### Opção 1: Deploy via Docker Compose (Recomendado)

1. **No Coolify Dashboard:**
   - Ir para "Applications" → "New Application"
   - Selecionar "Docker Compose"
   - Colar conteúdo do `docker-compose.yml`
   - Adicionar variáveis de ambiente

2. **Configurar Domínios:**
   - Frontend: `carmen.seu-dominio.com`
   - Relayer: `relayer.seu-dominio.com`
   - CRE Player Reg: `cre-reg.seu-dominio.com`

3. **Deploy:**
   - Clicar "Deploy"
   - Coolify gerencia containers automaticamente

### Opção 2: Deploy via GitHub (CI/CD)

1. **Criar workflow GitHub Actions:**

```yaml
# .github/workflows/deploy-coolify.yml
name: Deploy to Coolify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Coolify
        run: |
          curl -X POST ${{ secrets.COOLIFY_WEBHOOK }} \
            -H "Content-Type: application/json" \
            -d '{"ref":"main"}'
```

2. **Configurar webhook no Coolify:**
   - Ir para Application → Settings → Webhooks
   - Copiar URL do webhook
   - Adicionar como `COOLIFY_WEBHOOK` no GitHub Secrets

---

## 📊 Arquitetura de Deploy

```
┌─────────────────────────────────────────────────────────┐
│                    COOLIFY SERVER                       │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Docker Compose Network                 │  │
│  │                                                  │  │
│  │  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │  Frontend    │  │  Relayer (3001)          │ │  │
│  │  │  (5173)      │  │  - Signature validation  │ │  │
│  │  │  - React UI  │  │  - Gas payment           │ │  │
│  │  │  - Privy     │  │  - Contract calls        │ │  │
│  │  └──────────────┘  └──────────────────────────┘ │  │
│  │                                                  │  │
│  │  ┌──────────────────┐  ┌──────────────────────┐ │  │
│  │  │ CRE Player Reg   │  │ CRE Player Check     │ │  │
│  │  │ (3002)           │  │ (3003)               │ │  │
│  │  │ - Registration   │  │ - Verification       │ │  │
│  │  │ - OpenAI calls   │  │ - Contract reads     │ │  │
│  │  │ - IPFS upload    │  │                      │ │  │
│  │  └──────────────────┘  └──────────────────────┘ │  │
│  │                                                  │  │
│  │  Network: carmen-network (bridge)               │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                             │
│                          ▼                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Nginx Reverse Proxy (Coolify)            │  │
│  │  - carmen.seu-dominio.com → :5173               │  │
│  │  - relayer.seu-dominio.com → :3001              │  │
│  │  - cre-reg.seu-dominio.com → :3002              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────┐
    │  Sepolia RPC    │
    │  (Alchemy)      │
    └─────────────────┘
```

---

## 🔒 Segurança

### 1. **Proteger Variáveis Sensíveis**
```bash
# No Coolify, usar "Secrets" para:
- PRIVATE_KEY
- OPENAI_API_KEY
- ELEVENLABS_API_KEY
- PINATA_JWT
```

### 2. **HTTPS/SSL**
```bash
# Coolify gerencia SSL automaticamente
# Certificados Let's Encrypt renovados automaticamente
```

### 3. **Firewall**
```bash
# Abrir apenas portas necessárias
- 80 (HTTP)
- 443 (HTTPS)
- 22 (SSH, apenas para admin)
```

### 4. **Rate Limiting**
```bash
# No Nginx (Coolify):
limit_req_zone $binary_remote_addr zone=relayer:10m rate=10r/s;
limit_req zone=relayer burst=20 nodelay;
```

---

## 📈 Monitoramento

### Logs em Tempo Real
```bash
# Ver logs de todos os containers
docker-compose logs -f

# Ver logs específicos
docker-compose logs -f relayer
docker-compose logs -f cre-player-registration
```

### Health Checks
```bash
# Verificar saúde de cada serviço
docker-compose ps

# Status esperado: "healthy"
```

### Métricas
```bash
# CPU e memória
docker stats

# Espaço em disco
df -h
```

---

## 🛠️ Troubleshooting

### Porta Já em Uso
```bash
# Encontrar processo usando porta
lsof -i :3001

# Matar processo
kill -9 <PID>
```

### Container Não Inicia
```bash
# Ver logs de erro
docker-compose logs relayer

# Verificar variáveis de ambiente
docker-compose config

# Reconstruir imagem
docker-compose build --no-cache
```

### Conexão com Blockchain Falha
```bash
# Testar RPC URL
curl -X POST $SEPOLIA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Relayer Não Consegue Pagar Gas
```bash
# Verificar saldo da wallet
curl -X POST $SEPOLIA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getBalance",
    "params":["0xb19eE81581AE385F56D702d412D92d70fb65b9F7","latest"],
    "id":1
  }'

# Se saldo baixo, enviar ETH Sepolia para a wallet
```

---

## 📝 Checklist de Deploy

- [ ] Servidor Coolify preparado
- [ ] Variáveis de ambiente configuradas
- [ ] `.env` criado e protegido (chmod 600)
- [ ] `docker-compose.yml` validado
- [ ] Imagens Docker puxadas
- [ ] Containers iniciados com `docker-compose up -d`
- [ ] Health checks passando
- [ ] Domínios configurados no Coolify
- [ ] SSL/HTTPS ativo
- [ ] Logs monitorados
- [ ] Firewall configurado
- [ ] Backups configurados

---

## 🚀 Próximos Passos

1. **Testar Fluxo Completo:**
   - Acessar `carmen.seu-dominio.com`
   - Fazer login com Google
   - Testar registro gasless
   - Verificar logs do relayer

2. **Integrar CRE Workflows:**
   - Configurar event listeners
   - Testar chamadas OpenAI
   - Validar uploads IPFS

3. **Monitoramento Contínuo:**
   - Configurar alertas
   - Monitorar uso de recursos
   - Revisar logs regularmente

---

## 📚 Referências

- [Coolify Docs](https://coolify.io/docs)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Chainlink CRE Docs](https://docs.chain.link/cre)
- [Sepolia Testnet Faucet](https://sepoliafaucet.com)
