#!/usr/bin/env node

// Simple test runner para PlayerRegistry
// Roda com: node test-simple.mjs

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Iniciando testes do PlayerRegistry...\n');

const hardhat = spawn('npx', ['hardhat', 'test', 'test/PlayerRegistry.manual.test.ts', '--network', 'hardhat'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

hardhat.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Testes concluídos com sucesso!');
  } else {
    console.log('\n❌ Testes falharam com código:', code);
  }
  process.exit(code);
});
