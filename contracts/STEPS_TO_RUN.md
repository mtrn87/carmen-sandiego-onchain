# Steps to Run - Carmen Sandiego Onchain Contracts

## 📋 Pré-requisitos

Antes de começar, certifique-se de que você tem instalado:

- **Node.js** v22+ (recomendado v22.0.0 ou superior)
- **npm** v10+ ou **yarn**
- **Git**
- Arquivo `.env` na raiz do projeto com as variáveis de ambiente configuradas

## 🔧 Instalação

### 1. Navegar para a pasta contracts
```bash
cd contracts
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Variáveis de ambiente

O arquivo `.env` já deve estar configurado na raiz do projeto com as seguintes variáveis:

```env
# RPC URLs das redes de testes (obtenha em Alchemy, Infura, etc)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_API_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_API_KEY
BNB_TESTNET_RPC_URL=https://bnb-testnet.g.alchemy.com/v2/YOUR_API_KEY
XDC_APOTHEM_RPC_URL=https://erpc.apothem.network
WORLDCHAIN_SEPOLIA_RPC_URL=https://worldchain-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Chave privada da carteira (NUNCA compartilhe!)
PRIVATE_KEY=your_private_key_here

# Chainlink VRF v2.5 (Sepolia)
VRF_SUBSCRIPTION_ID=your_subscription_id
VRF_COORDINATOR_SEPOLIA=0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B
VRF_KEY_HASH_SEPOLIA=0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae

# Chainlink CRE (KeystoneForwarder)
KEYSTONE_FORWARDER_SEPOLIA=0x15fC6ae953E024d975e77382eEeC56A9101f9F88
```

⚠️ **Nota**: Os endereços de contratos (0x...) são públicos e podem ser compartilhados. A chave privada (`PRIVATE_KEY`) é sensível e **NUNCA** deve ser compartilhada ou commitada no repositório.

## 🚀 Executar Scripts

### Compilar contratos

```bash
npm run compile
```

Compila todos os contratos Solidity.

### Deploy em Sepolia

```bash
npm run deploy:sepolia
```

Este script:
- Compila os contratos
- Faz deploy do GameMaster em Sepolia
- Salva o endereço do contrato em `deployments/sepolia.json`

### Deploy em Arbitrum Sepolia

```bash
npm run deploy:arbitrum-sepolia
```

Faz deploy do CityNode em Arbitrum Sepolia.

### Deploy em Base Sepolia

```bash
npm run deploy:base-sepolia
```

Faz deploy do CityNode em Base Sepolia.

### Deploy em Todas as Redes

```bash
npm run deploy:all
```

Executa o deploy em Sepolia, Arbitrum Sepolia e Base Sepolia sequencialmente.

## 🧪 Testes

### Rodar todos os testes

```bash
npm test
```

### Rodar testes específicos

```bash
npm test -- GameMaster.test.ts
```

### Rodar testes com cobertura

```bash
npm run test:coverage
```

## 📊 Scripts Disponíveis

### Verificar transação

```bash
npm run check-tx -- --hash 0x... --network sepolia
```

Verifica o status de uma transação em uma rede específica.

### Simular jogo

```bash
npm run simulate:game
```

Simula uma partida completa do jogo, testando:
- Inicialização do jogo
- Movimentação de Carmen
- Investigações
- Conclusão do jogo

### Disparar investigação

```bash
npm run trigger:investigation -- --gameId 1 --location "Paris"
```

Dispara uma investigação em um jogo específico.

## 📁 Estrutura de Diretórios

```
.
├── src/
│   ├── GameMaster.sol          # Contrato principal do jogo
│   └── ...                      # Outros contratos
├── test/
│   ├── GameMaster.test.ts       # Testes do GameMaster
│   ├── GameMaster.e2e.test.ts   # Testes end-to-end
│   └── ...                      # Outros testes
├── scripts/
│   ├── deploy-all.ts            # Deploy em todas as redes
│   ├── check-tx.ts              # Verificar transação
│   ├── simulate-game.ts         # Simular jogo
│   ├── trigger-investigation.ts # Disparar investigação
│   └── ...                      # Outros scripts
├── deployments/
│   ├── sepolia.json             # Endereços em Sepolia
│   ├── polygon-amoy.json        # Endereços em Polygon Amoy
│   └── arbitrum-sepolia.json    # Endereços em Arbitrum Sepolia
├── hardhat.config.ts            # Configuração Hardhat
├── package.json                 # Dependências
├── package-lock.json            # Lock file
├── tsconfig.json                # Configuração TypeScript
└── STEPS_TO_RUN.md              # Este arquivo
```

## 🔐 Segurança

### ⚠️ IMPORTANTE

- **NUNCA** compartilhe sua chave privada
- **NUNCA** faça commit do arquivo `.env`
- Use variáveis de ambiente para dados sensíveis
- Sempre teste em redes de testes antes de produção

### Usar Hardhat Network (local)

Para testes locais sem gastar gas:

```bash
npx hardhat node
```

Em outro terminal:

```bash
npm run deploy:local
```

## 🐛 Troubleshooting

### Erro: "RPC URL not configured"

**Solução**: Verifique se as variáveis de ambiente estão configuradas corretamente no `.env`

### Erro: "Insufficient funds"

**Solução**: Certifique-se de que a carteira tem fundos de teste. Obtenha faucet em:
- Sepolia: https://sepoliafaucet.com
- Polygon Amoy: https://faucet.polygon.technology/
- Arbitrum Sepolia: https://faucet.arbitrum.io

### Erro: "Contract already deployed"

**Solução**: Verifique o arquivo de deployment correspondente em `deployments/` e remova se necessário

### Erro: "Gas estimation failed"

**Solução**: Aumente o gas limit ou verifique se o contrato tem lógica infinita

## 📚 Documentação Adicional

- [Hardhat Documentation](https://hardhat.org/)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Chainlink Documentation](https://docs.chain.link/)

## 🤝 Contribuindo

Para contribuir com melhorias nos contracts:

1. Crie uma branch: `git checkout -b feature/sua-feature`
2. Faça suas mudanças e testes
3. Commit: `git commit -m "Add: sua feature"`
4. Push: `git push origin feature/sua-feature`
5. Abra um Pull Request

## 📞 Suporte

Se encontrar problemas:

1. Verifique a seção Troubleshooting
2. Consulte a documentação oficial
3. Abra uma issue no GitHub
4. Entre em contato com o time de desenvolvimento

---

**Última atualização**: Fevereiro 2026
**Versão**: 1.0.0
