import { expect } from "chai";
import { ethers } from "hardhat";
import { PlayerRegistry } from "../typechain-types";

describe("PlayerRegistry - Manual Tests", function () {
  let playerRegistry: PlayerRegistry;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
    playerRegistry = await PlayerRegistry.deploy();
    await playerRegistry.waitForDeployment();
  });

  describe("Caso 1: Jogador NÃO existe", function () {
    it("Should return zero address when player does not exist", async function () {
      const player = await playerRegistry.getPlayer(addr1.address);
      
      console.log("\n=== CASO 1: Jogador NÃO existe ===");
      console.log("Endereço testado:", addr1.address);
      console.log("Resposta do contrato:");
      console.log("  - wallet:", player.wallet);
      console.log("  - nickname:", player.nickname);
      console.log("  - rank:", player.rank.toString());
      console.log("  - isActive:", player.isActive);
      
      expect(player.wallet).to.equal(ethers.ZeroAddress);
      expect(player.nickname).to.equal("");
      expect(player.rank).to.equal(0);
      expect(player.isActive).to.equal(false);
      
      console.log("✓ Confirmado: Jogador NÃO existe\n");
    });
  });

  describe("Caso 2: Jogador EXISTE", function () {
    it("Should return player data when player exists", async function () {
      // Primeiro, registrar o jogador
      const nickname = "TestAgent";
      await playerRegistry.connect(addr1).registerPlayer(nickname);
      
      // Depois, ler os dados
      const player = await playerRegistry.getPlayer(addr1.address);
      
      console.log("\n=== CASO 2: Jogador EXISTE ===");
      console.log("Endereço testado:", addr1.address);
      console.log("Nickname registrado:", nickname);
      console.log("Resposta do contrato:");
      console.log("  - wallet:", player.wallet);
      console.log("  - nickname:", player.nickname);
      console.log("  - rank:", player.rank.toString());
      console.log("  - missionsCompleted:", player.missionsCompleted.toString());
      console.log("  - missionsAttempted:", player.missionsAttempted.toString());
      console.log("  - totalReward:", player.totalReward.toString());
      console.log("  - isActive:", player.isActive);
      console.log("  - registeredAt:", new Date(Number(player.registeredAt) * 1000).toISOString());
      
      expect(player.wallet).to.equal(addr1.address);
      expect(player.nickname).to.equal(nickname);
      expect(player.rank).to.equal(0);
      expect(player.isActive).to.equal(true);
      
      console.log("✓ Confirmado: Jogador EXISTE\n");
    });
  });

  describe("Fluxo Completo: Login", function () {
    it("Should handle complete login flow", async function () {
      console.log("\n=== FLUXO COMPLETO: LOGIN ===\n");
      
      // Step 1: Check if player exists (before registration)
      console.log("Step 1: Verificar se jogador existe (antes do registro)");
      let player = await playerRegistry.getPlayer(addr1.address);
      console.log("  Resultado: wallet =", player.wallet === ethers.ZeroAddress ? "ZERO_ADDRESS (não existe)" : "EXISTE");
      
      if (player.wallet === ethers.ZeroAddress) {
        console.log("  ✓ Jogador NÃO existe → Mostrar NicknameModal\n");
      } else {
        console.log("  ✓ Jogador EXISTE → Ir para /game\n");
        return;
      }
      
      // Step 2: User enters nickname and submits
      console.log("Step 2: Usuário entra com nickname e submete");
      const nickname = "TestAgent_" + Math.random().toString(36).substring(7);
      console.log("  Nickname:", nickname);
      
      // Step 3: Frontend calls registerPlayer (triggers CRE event)
      console.log("Step 3: Frontend chama registerPlayer (emite evento para CRE)");
      const tx = await playerRegistry.connect(addr1).registerPlayer(nickname);
      const receipt = await tx.wait();
      console.log("  TX hash:", tx.hash);
      console.log("  Block:", receipt?.blockNumber);
      console.log("  ✓ Evento RegistrationRequested emitido para CRE\n");
      
      // Step 4: CRE processes (in real scenario, CRE would do funding here)
      console.log("Step 4: CRE processa (funding, etc)");
      console.log("  [CRE faria: validar nickname, enviar funding, emitir PlayerRegistered]\n");
      
      // Step 5: Check if player exists (after registration)
      console.log("Step 5: Verificar se jogador existe (depois do registro)");
      player = await playerRegistry.getPlayer(addr1.address);
      console.log("  Resultado: wallet =", player.wallet === ethers.ZeroAddress ? "ZERO_ADDRESS" : player.wallet);
      console.log("  Nickname:", player.nickname);
      console.log("  isActive:", player.isActive);
      
      expect(player.wallet).to.equal(addr1.address);
      expect(player.nickname).to.equal(nickname);
      expect(player.isActive).to.equal(true);
      console.log("  ✓ Jogador EXISTE → Ir para /game\n");
      
      console.log("=== FLUXO COMPLETO CONCLUÍDO ===\n");
    });
  });
});
