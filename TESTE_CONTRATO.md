# 🧪 Guia para Testar PlayerRegistry Isoladamente

## Problema
PowerShell tem execução de scripts desabilitada. Aqui estão as soluções:

---

## ✅ Solução 1: Usar CMD (Mais Simples)

1. Abra o **Command Prompt** (cmd.exe)
2. Navegue para a pasta contracts:
```cmd
cd C:\Users\sales\OneDrive\Desktop\Develop\carmen-sandiego-onchain\contracts
```

3. Rode os testes:
```cmd
npx hardhat test test/PlayerRegistry.manual.test.ts --network hardhat
```

**Vantagem**: Funciona sem configuração adicional

---

## ✅ Solução 2: Habilitar PowerShell (Permanente)

Se você quer usar PowerShell:

1. Abra **PowerShell como Administrador**
2. Execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

3. Confirme digitando `Y` e pressionando Enter

4. Agora você pode rodar os testes normalmente:
```powershell
cd C:\Users\sales\OneDrive\Desktop\Develop\carmen-sandiego-onchain\contracts
npm test -- test/PlayerRegistry.manual.test.ts
```

**Vantagem**: Funciona permanentemente para todos os scripts

---

## ✅ Solução 3: Usar o Script Batch

Criei um arquivo `run-test.bat` na pasta contracts.

1. Abra o **File Explorer**
2. Navegue para: `C:\Users\sales\OneDrive\Desktop\Develop\carmen-sandiego-onchain\contracts`
3. Clique duplo em `run-test.bat`

**Vantagem**: Clica e pronto, sem linha de comando

---

## 📋 O que o teste faz

O arquivo `PlayerRegistry.manual.test.ts` testa:

### **Caso 1: Jogador NÃO existe**
```
getPlayer(address) → wallet = 0x0000... (ZERO_ADDRESS)
                  → nickname = ""
                  → isActive = false
```

### **Caso 2: Jogador EXISTE**
```
registerPlayer("TestAgent")
getPlayer(address) → wallet = 0x1234... (endereço do jogador)
                  → nickname = "TestAgent"
                  → isActive = true
```

### **Fluxo Completo**
Testa o fluxo inteiro de login:
1. Verificar se jogador existe
2. Se não existe → Registrar
3. Verificar novamente se foi registrado

---

## 🎯 Recomendação

**Use a Solução 1 (CMD)** - é a mais rápida:

```cmd
cd C:\Users\sales\OneDrive\Desktop\Develop\carmen-sandiego-onchain\contracts
npx hardhat test test/PlayerRegistry.manual.test.ts --network hardhat
```

Você verá a saída dos testes mostrando os dois casos.

---

## 📝 Próximos Passos Após Testar

1. Verificar se os dois casos retornam os dados corretos
2. Ajustar frontend se necessário
3. Testar o fluxo completo de login no navegador
4. Testar CRE processando o evento RegistrationRequested

