import { expect } from "chai";
import { ethers } from "hardhat";
import { PlayerRegistry } from "../typechain-types";

describe("PlayerRegistry", function () {
  let playerRegistry: PlayerRegistry;
  let owner: any;
  let player1: any;
  let player2: any;
  let gameMaster: any;

  /** Helper: register a player via GameMaster (the only path now). */
  async function registerViaGM(playerAddr: string, nickname: string) {
    return playerRegistry.connect(gameMaster).registerPlayer(playerAddr, nickname);
  }

  beforeEach(async function () {
    [owner, player1, player2, gameMaster] = await ethers.getSigners();

    const PlayerRegistry = await ethers.getContractFactory("PlayerRegistry");
    playerRegistry = await PlayerRegistry.deploy();
    await playerRegistry.waitForDeployment();

    // Set GameMaster
    await playerRegistry.setGameMaster(gameMaster.address);
  });

  describe("Player Registration", function () {
    it("Should register a new player with valid nickname", async function () {
      const nickname = "Detective001";
      await registerViaGM(player1.address, nickname);

      const player = await playerRegistry.getPlayer(player1.address);
      expect(player.nickname).to.equal(nickname);
      expect(player.wallet).to.equal(player1.address);
      expect(player.rank).to.equal(0); // RANK_ROOKIE
      expect(player.isActive).to.be.true;
    });

    it("Should reject duplicate nicknames", async function () {
      const nickname = "Detective001";
      await registerViaGM(player1.address, nickname);

      await expect(
        registerViaGM(player2.address, nickname)
      ).to.be.revertedWith("Nickname taken");
    });

    it("Should reject invalid nicknames (too short)", async function () {
      await expect(
        registerViaGM(player1.address, "ab")
      ).to.be.revertedWith("Invalid nickname");
    });

    it("Should reject invalid nicknames (too long)", async function () {
      const longNickname = "a".repeat(21);
      await expect(
        registerViaGM(player1.address, longNickname)
      ).to.be.revertedWith("Invalid nickname");
    });

    it("Should reject invalid characters in nickname", async function () {
      await expect(
        registerViaGM(player1.address, "Detective@001")
      ).to.be.revertedWith("Invalid nickname");
    });

    it("Should allow valid characters: alphanumeric, underscore, hyphen", async function () {
      const validNicknames = ["Detective_001", "Detective-001", "Detective001"];
      for (let i = 0; i < validNicknames.length; i++) {
        const signer = (await ethers.getSigners())[i + 4]; // Use different signers
        await registerViaGM(signer.address, validNicknames[i]);
        const player = await playerRegistry.getPlayer(signer.address);
        expect(player.nickname).to.equal(validNicknames[i]);
      }
    });

    it("Should reject if player already registered", async function () {
      await registerViaGM(player1.address, "Detective001");
      await expect(
        registerViaGM(player1.address, "Detective002")
      ).to.be.revertedWith("Already registered");
    });

    it("Should check nickname availability", async function () {
      const nickname = "Detective001";
      expect(await playerRegistry.isNicknameAvailable(nickname)).to.be.true;

      await registerViaGM(player1.address, nickname);
      expect(await playerRegistry.isNicknameAvailable(nickname)).to.be.false;
    });

    it("Should reject registerPlayer from non-GameMaster", async function () {
      await expect(
        playerRegistry
          .connect(player1)
          .registerPlayer(player2.address, "Detective001")
      ).to.be.revertedWith("Only GameMaster");
    });

    it("Should reject registerPlayer with invalid address", async function () {
      await expect(
        registerViaGM(ethers.ZeroAddress, "Detective001")
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("CRE Trigger Functions", function () {
    it("Should emit PlayerCheckRequested event", async function () {
      await expect(playerRegistry.checkPlayerExists(player1.address))
        .to.emit(playerRegistry, "PlayerCheckRequested")
        .withArgs(player1.address);
    });

    it("Should emit RegistrationRequested event", async function () {
      const nickname = "Detective001";
      await expect(playerRegistry.connect(player1).requestRegistration(nickname))
        .to.emit(playerRegistry, "RegistrationRequested")
        .withArgs(player1.address, nickname);
    });

    it("Should reject requestRegistration if already registered", async function () {
      await registerViaGM(player1.address, "Detective001");
      await expect(
        playerRegistry.connect(player1).requestRegistration("Detective002")
      ).to.be.revertedWith("Already registered");
    });

    it("Should reject requestRegistration with invalid nickname", async function () {
      await expect(
        playerRegistry.connect(player1).requestRegistration("ab")
      ).to.be.revertedWith("Invalid nickname");
    });

    it("Should reject requestRegistration with taken nickname", async function () {
      await registerViaGM(player1.address, "Detective001");
      await expect(
        playerRegistry.connect(player2).requestRegistration("Detective001")
      ).to.be.revertedWith("Nickname taken");
    });
  });

  describe("CRE Callback Functions", function () {
    it("Should emit PlayerCheckResult event", async function () {
      const nickname = "Detective001";
      const rank = 0;
      await expect(
        playerRegistry
          .connect(gameMaster)
          .recordCheckResult(player1.address, true, nickname, rank)
      )
        .to.emit(playerRegistry, "PlayerCheckResult")
        .withArgs(player1.address, true, nickname, rank);
    });

    it("Should emit RegistrationConfirmed event", async function () {
      const nickname = "Detective001";
      await registerViaGM(player1.address, nickname);

      await expect(
        playerRegistry.connect(gameMaster).confirmRegistration(player1.address, nickname)
      )
        .to.emit(playerRegistry, "RegistrationConfirmed")
        .withArgs(player1.address, nickname, 0); // rank 0 = ROOKIE
    });

    it("Should reject confirmRegistration if player not registered", async function () {
      await expect(
        playerRegistry.connect(gameMaster).confirmRegistration(player1.address, "Detective001")
      ).to.be.revertedWith("Not registered");
    });

    it("Should reject recordCheckResult from non-GameMaster", async function () {
      await expect(
        playerRegistry
          .connect(player1)
          .recordCheckResult(player2.address, false, "", 0)
      ).to.be.revertedWith("Only GameMaster");
    });

    it("Should reject confirmRegistration from non-GameMaster", async function () {
      await registerViaGM(player1.address, "Detective001");
      await expect(
        playerRegistry.connect(player2).confirmRegistration(player1.address, "Detective001")
      ).to.be.revertedWith("Only GameMaster");
    });
  });

  describe("Stats Update", function () {
    beforeEach(async function () {
      await registerViaGM(player1.address, "Detective001");
    });

    it("Should update player stats after mission success", async function () {
      const reward = 100;
      const clues = 3;
      const investigations = 5;
      const blocks = 25;

      await playerRegistry
        .connect(gameMaster)
        .updatePlayerStats(player1.address, reward, clues, investigations, blocks, true);

      const player = await playerRegistry.getPlayer(player1.address);
      expect(player.missionsCompleted).to.equal(1);
      expect(player.missionsAttempted).to.equal(1);
      expect(player.totalReward).to.equal(reward);
      expect(player.totalCluesCollected).to.equal(clues);
      expect(player.totalInvestigations).to.equal(investigations);
    });

    it("Should update player stats after mission failure", async function () {
      const reward = 0;
      const clues = 2;
      const investigations = 5;
      const blocks = 50;

      await playerRegistry
        .connect(gameMaster)
        .updatePlayerStats(player1.address, reward, clues, investigations, blocks, false);

      const player = await playerRegistry.getPlayer(player1.address);
      expect(player.missionsCompleted).to.equal(0); // No completion
      expect(player.missionsAttempted).to.equal(1);
      expect(player.totalReward).to.equal(0);
    });

    it("Should calculate rank based on total reward", async function () {
      // Rookie (0 reward)
      let player = await playerRegistry.getPlayer(player1.address);
      expect(player.rank).to.equal(0);

      // Detective (100 reward)
      await playerRegistry
        .connect(gameMaster)
        .updatePlayerStats(player1.address, 100, 3, 5, 25, true);
      player = await playerRegistry.getPlayer(player1.address);
      expect(player.rank).to.equal(1);

      // Senior Detective (300 reward)
      await playerRegistry
        .connect(gameMaster)
        .updatePlayerStats(player1.address, 200, 3, 5, 25, true);
      player = await playerRegistry.getPlayer(player1.address);
      expect(player.rank).to.equal(2);

      // Inspector (600 reward)
      await playerRegistry
        .connect(gameMaster)
        .updatePlayerStats(player1.address, 300, 3, 5, 25, true);
      player = await playerRegistry.getPlayer(player1.address);
      expect(player.rank).to.equal(3);
    });

    it("Should reject update from non-GameMaster", async function () {
      await expect(
        playerRegistry
          .connect(player2)
          .updatePlayerStats(player1.address, 100, 3, 5, 25, true)
      ).to.be.revertedWith("Only GameMaster");
    });
  });

  describe("Mission Recording", function () {
    beforeEach(async function () {
      await registerViaGM(player1.address, "Detective001");
    });

    it("Should record mission with full details", async function () {
      const missionId = 1;
      const capturedChainId = 421614; // Arbitrum Sepolia
      const clues = 3;
      const investigations = 5;
      const blocks = 25;
      const reward = 100;

      await playerRegistry
        .connect(gameMaster)
        .recordMission(
          player1.address,
          missionId,
          capturedChainId,
          clues,
          investigations,
          blocks,
          reward,
          true
        );

      const missions = await playerRegistry.getPlayerMissions(player1.address);
      expect(missions.length).to.equal(1);
      expect(missions[0].missionId).to.equal(missionId);
      expect(missions[0].capturedChainId).to.equal(capturedChainId);
      expect(missions[0].cluesCollected).to.equal(clues);
      expect(missions[0].success).to.be.true;
    });

    it("Should retrieve specific mission", async function () {
      const missionId = 1;
      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, missionId, 421614, 3, 5, 25, 100, true);

      const mission = await playerRegistry.getMission(player1.address, 0);
      expect(mission.missionId).to.equal(missionId);
      expect(mission.success).to.be.true;
    });

    it("Should get mission count", async function () {
      expect(await playerRegistry.getMissionCount(player1.address)).to.equal(0);

      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, 1, 421614, 3, 5, 25, 100, true);

      expect(await playerRegistry.getMissionCount(player1.address)).to.equal(1);

      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, 2, 84532, 2, 4, 30, 75, true);

      expect(await playerRegistry.getMissionCount(player1.address)).to.equal(2);
    });
  });

  describe("NFT Management", function () {
    beforeEach(async function () {
      await registerViaGM(player1.address, "Detective001");
    });

    it("Should award NFT to player", async function () {
      const nftId = 1;
      await playerRegistry.connect(gameMaster).addPlayerNFT(player1.address, nftId);

      const nfts = await playerRegistry.getPlayerNFTs(player1.address);
      expect(nfts.length).to.equal(1);
      expect(nfts[0]).to.equal(nftId);
    });

    it("Should award multiple NFTs", async function () {
      await playerRegistry.connect(gameMaster).addPlayerNFT(player1.address, 1);
      await playerRegistry.connect(gameMaster).addPlayerNFT(player1.address, 2);
      await playerRegistry.connect(gameMaster).addPlayerNFT(player1.address, 3);

      const nfts = await playerRegistry.getPlayerNFTs(player1.address);
      expect(nfts.length).to.equal(3);
      expect(nfts).to.deep.equal([1n, 2n, 3n]);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await registerViaGM(player1.address, "Detective001");
      // Record some missions
      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, 1, 421614, 3, 5, 20, 100, true);
      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, 2, 84532, 3, 5, 30, 75, true);
      await playerRegistry
        .connect(gameMaster)
        .recordMission(player1.address, 3, 51, 2, 5, 50, 0, false);
    });

    it("Should calculate player score", async function () {
      // Score = (missionsCompleted * 100) + totalReward
      // = (2 * 100) + 175 = 375
      const score = await playerRegistry.getPlayerScore(player1.address);
      expect(score).to.equal(375n);
    });

    it("Should calculate win rate", async function () {
      // 2 wins / 3 attempts = 66%
      const winRate = await playerRegistry.getPlayerWinRate(player1.address);
      expect(winRate).to.equal(66n); // 66%
    });

    it("Should calculate average blocks per mission", async function () {
      // (20 + 30 + 50) / 3 = 33
      const avgBlocks = await playerRegistry.getAverageBlocksPerMission(player1.address);
      expect(avgBlocks).to.equal(33n);
    });

    it("Should return 0 for win rate if no missions", async function () {
      const signers = await ethers.getSigners();
      const newPlayer = signers[5]; // Use a different signer
      await registerViaGM(newPlayer.address, "NewPlayer");

      const winRate = await playerRegistry.getPlayerWinRate(newPlayer.address);
      expect(winRate).to.equal(0n);
    });
  });

  describe("Admin Functions", function () {
    beforeEach(async function () {
      await registerViaGM(player1.address, "Detective001");
    });

    it("Should deactivate player (admin only)", async function () {
      await playerRegistry.deactivatePlayer(player1.address);
      const player = await playerRegistry.getPlayer(player1.address);
      expect(player.isActive).to.be.false;
    });

    it("Should reactivate player (admin only)", async function () {
      await playerRegistry.deactivatePlayer(player1.address);
      await playerRegistry.reactivatePlayer(player1.address);
      const player = await playerRegistry.getPlayer(player1.address);
      expect(player.isActive).to.be.true;
    });

    it("Should reject deactivate from non-owner", async function () {
      await expect(
        playerRegistry.connect(player2).deactivatePlayer(player1.address)
      ).to.be.revertedWith("Only owner");
    });

    it("Should set GameMaster (owner only)", async function () {
      const newGameMaster = player2.address;
      await playerRegistry.setGameMaster(newGameMaster);

      // Verify by calling a GameMaster-only function
      await expect(
        playerRegistry
          .connect(player1)
          .updatePlayerStats(player1.address, 100, 3, 5, 25, true)
      ).to.be.revertedWith("Only GameMaster");

      // Should work with new GameMaster
      await playerRegistry
        .connect(player2)
        .updatePlayerStats(player1.address, 100, 3, 5, 25, true);
    });
  });
});
