#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Diagramas a gerar
const diagrams = [
  {
    name: 'system-architecture',
    title: 'System Architecture Diagram'
  },
  {
    name: 'gasless-registration-flow',
    title: 'Gasless Registration Flow'
  },
  {
    name: 'gameplay-flow',
    title: 'Gameplay Flow'
  },
  {
    name: 'cre-workflow-orchestration',
    title: 'CRE Workflow Orchestration'
  },
  {
    name: 'multi-chain-interaction',
    title: 'Multi-Chain Interaction'
  },
  {
    name: 'data-encryption-flow',
    title: 'Data Encryption Flow'
  },
  {
    name: 'vrf-randomness-flow',
    title: 'VRF Randomness Flow'
  },
  {
    name: 'reward-system-flow',
    title: 'Reward System Flow'
  }
];

const docsDir = path.join(__dirname, 'docs');
const diagramsDir = path.join(docsDir, 'diagrams');

// Criar diretório de diagramas se não existir
if (!fs.existsSync(diagramsDir)) {
  fs.mkdirSync(diagramsDir, { recursive: true });
  console.log(`✓ Created diagrams directory: ${diagramsDir}`);
}

// Ler arquivo SYSTEM_DIAGRAMS.md
const systemDiagramsPath = path.join(docsDir, 'SYSTEM_DIAGRAMS.md');
const content = fs.readFileSync(systemDiagramsPath, 'utf-8');

// Extrair cada diagrama
diagrams.forEach((diagram, index) => {
  console.log(`\n[${index + 1}/${diagrams.length}] Processando: ${diagram.title}`);
  
  // Encontrar o diagrama no arquivo
  const startMarker = `## ${index + 1}. ${diagram.title}`;
  const startIdx = content.indexOf(startMarker);
  
  if (startIdx === -1) {
    console.warn(`⚠ Diagrama não encontrado: ${diagram.title}`);
    return;
  }
  
  // Encontrar o próximo diagrama ou fim do arquivo
  const nextMarker = `## ${index + 2}.`;
  let endIdx = content.indexOf(nextMarker, startIdx);
  if (endIdx === -1) {
    endIdx = content.length;
  }
  
  // Extrair conteúdo do diagrama
  const diagramContent = content.substring(startIdx, endIdx);
  
  // Extrair código Mermaid (entre ```mermaid e ```)
  const mermaidStart = diagramContent.indexOf('```mermaid');
  const mermaidEnd = diagramContent.indexOf('```', mermaidStart + 10);
  
  if (mermaidStart === -1 || mermaidEnd === -1) {
    console.warn(`⚠ Código Mermaid não encontrado em: ${diagram.title}`);
    return;
  }
  
  const mermaidCode = diagramContent.substring(
    mermaidStart + 10,
    mermaidEnd
  ).trim();
  
  // Salvar arquivo .mmd
  const mmdPath = path.join(diagramsDir, `${diagram.name}.mmd`);
  fs.writeFileSync(mmdPath, mermaidCode);
  console.log(`  ✓ Arquivo .mmd criado: ${diagram.name}.mmd`);
  
  // Gerar imagem PNG
  const pngPath = path.join(diagramsDir, `${diagram.name}.png`);
  try {
    execSync(`mmdc -i "${mmdPath}" -o "${pngPath}"`, { stdio: 'pipe' });
    console.log(`  ✓ Imagem PNG gerada: ${diagram.name}.png`);
  } catch (error) {
    console.error(`  ✗ Erro ao gerar PNG: ${error.message}`);
  }
  
  // Gerar imagem SVG
  const svgPath = path.join(diagramsDir, `${diagram.name}.svg`);
  try {
    execSync(`mmdc -i "${mmdPath}" -o "${svgPath}" -t default`, { stdio: 'pipe' });
    console.log(`  ✓ Imagem SVG gerada: ${diagram.name}.svg`);
  } catch (error) {
    console.error(`  ✗ Erro ao gerar SVG: ${error.message}`);
  }
});

console.log('\n✅ Geração de diagramas concluída!');
console.log(`\nDiagramas salvos em: ${diagramsDir}`);
console.log('\nPróximos passos:');
console.log('1. Verificar as imagens geradas em docs/diagrams/');
console.log('2. Atualizar SYSTEM_DIAGRAMS.md com referências às imagens');
console.log('3. Fazer commit e push');
