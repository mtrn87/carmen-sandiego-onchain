# CRE Workflows

Chainlink CRE (Compute Runtime Environment) workflows para Carmen Sandiego On-Chain. TypeScript compilado para WASM.

**📚 [Back to Documentation Index](../docs/INDEX.md)**

## Prerequisites

- [Bun](https://bun.sh/docs/installation) (gerenciador de pacotes e runtime)
- [CRE CLI](https://docs.chain.link/cre) (`cre` command)
- Root `.env` com `CRE_ETH_PRIVATE_KEY` (chave privada com fundos para simulacao de chain-writes; chave dummy OK se o workflow nao faz writes)

## Workflows

| Workflow | Trigger | O que faz |
|----------|---------|-----------|
| `generate-briefing` | Evento `MissionStarted` | Gera briefing criptografado (ECIES) para nova missao |
| `mission-start` | Evento `MissionStarted` | Inicializa parametros da missao nos CityNodes |
| `carmen-moves` | Periodico / event-driven | Move Carmen entre chains durante a missao |
| `generate-finale` | Evento `CarmenCaptured` | Gera metadata + imagem AI para NFT trophy |

Cada workflow e **independente** — tem seu proprio `package.json`, `main.ts`, `workflow.yaml`, e configs staging/production.

## Setup

Instale as dependencias de cada workflow individualmente:

```bash
cd generate-briefing && bun install
cd ../mission-start && bun install
cd ../carmen-moves && bun install
cd ../generate-finale && bun install
```

## Simulacao Local

Rode a partir do diretorio `cre-workflows/`:

```bash
# Simular um workflow especifico (staging)
cre workflow simulate ./generate-briefing --target=staging-settings
cre workflow simulate ./mission-start --target=staging-settings
cre workflow simulate ./carmen-moves --target=staging-settings
cre workflow simulate ./generate-finale --target=staging-settings
```

A simulacao usa os RPCs configurados em `project.yaml` (nivel projeto) e as configs de cada workflow em `config.staging.json`.

## Deploy

```bash
# Deploy para staging
cre workflow deploy ./generate-briefing --target=staging-settings

# Deploy para production
cre workflow deploy ./generate-briefing --target=production-settings
```

Repita para cada workflow que precisar deployar.

## Configuracao

### `project.yaml` (raiz do cre-workflows)

Define RPCs compartilhados por todos os workflows:

```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
```

### `workflow.yaml` (por workflow)

Define nome do workflow e paths dos artefatos:

```yaml
staging-settings:
  user-workflow:
    workflow-name: "carmen-briefing-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: ""
```

### `config.staging.json` / `config.production.json` (por workflow)

Parametros runtime do workflow (enderecos de contratos, chain IDs, etc).

### `secrets.yaml` (raiz do cre-workflows)

Secrets compartilhados entre workflows (referenciados via `secrets-path` no `workflow.yaml`).

## Limitacoes (CRE v1)

- **Sem async/await** nos handlers WASM — usar funcoes sync como fallback
- **`@noble/*` deve ser v1.x** — v2.x quebra a compilacao WASM
- Cada workflow e self-contained; nao ha imports entre workflows
- Integracoes AI (OpenAI, ElevenLabs) estao codificadas mas atras de barreira async ate CRE v2

## Estrutura

```
cre-workflows/
  project.yaml              # Config RPCs compartilhada
  secrets.yaml               # Secrets compartilhados
  generate-briefing/         # Workflow: gerar briefing
    main.ts                  # Entry point
    ecies.ts                 # ECIES encryption helper
    workflow.yaml            # Config do workflow
    config.staging.json      # Params staging
    config.production.json   # Params production
    package.json
  mission-start/             # Workflow: inicializar missao
    main.ts
    ecies.ts
    workflow.yaml
    config.*.json
    package.json
  carmen-moves/              # Workflow: mover Carmen
    main.ts
    workflow.yaml
    config.*.json
    package.json
  generate-finale/           # Workflow: gerar NFT trophy
    main.ts
    workflow.yaml
    config.*.json
    package.json
  scripts/                   # Scripts auxiliares
  data/                      # Dados compartilhados (pool de clues, etc)
  src/                       # Codigo compartilhado
```
