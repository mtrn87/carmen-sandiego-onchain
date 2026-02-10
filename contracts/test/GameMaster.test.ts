import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GameMaster", function () {
  let gameMaster: GameMaster;
  let owner: SignerWithAddress;
  let player: SignerWithAddress;
  let creOracle: SignerWithAddress;
  let otherUser: SignerWithAddress;

  // City chain IDs
  const ARBITRUM_SEPOLIA = 421614;
  const BASE_SEPOLIA = 84532;
  const validChainIds = [ARBITRUM_SEPOLIA, BASE_SEPOLIA];

  // Mock VRF values
  const VRF_SUB_ID = 1;
  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

  // Mock ECIES public key (65 bytes uncompressed secp256k1)
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  beforeEach(async function () {
    [owner, player, creOracle, otherUser] = await ethers.getSigners();

    const GameMasterFactory = await ethers.getContractFactory("GameMaster");
    gameMaster = await GameMasterFactory.deploy(
      owner.address, // Mock VRF coordinator (owner for testing)
      VRF_SUB_ID,
      VRF_KEY_HASH,
      validChainIds,
      creOracle.address
    ) as GameMaster;
  });

  describe("Deployment", function () {
    it("should set correct valid chain IDs", async function () {
      const cities = await gameMaster.getValidCities();
      expect(cities.length).to.equal(2);
      expect(cities[0]).to.equal(ARBITRUM_SEPOLIA);
      expect(cities[1]).to.equal(BASE_SEPOLIA);
    });

    it("should set correct CRE oracle", async function () {
      expect(await gameMaster.creOracle()).to.equal(creOracle.address);
    });

    it("should start mission IDs at 1", async function () {
      expect(await gameMaster.nextMissionId()).to.equal(1);
    });
  });

  describe("Player Registration", function () {
    it("should register player with public key", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      const key = await gameMaster.getPlayerPublicKey(player.address);
      expect(key).to.equal(MOCK_PUBLIC_KEY.toLowerCase());
    });

    it("should emit PlayerRegistered event", async function () {
      await expect(gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY))
        .to.emit(gameMaster, "PlayerRegistered")
        .withArgs(player.address, MOCK_PUBLIC_KEY.toLowerCase());
    });

    it("should reject empty public key", async function () {
      await expect(
        gameMaster.connect(player).registerPlayer("0x")
      ).to.be.revertedWith("Invalid key");
    });

    it("should allow updating public key", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      const newKey = "0x04" + "cd".repeat(64);
      await gameMaster.connect(player).registerPlayer(newKey);
      const key = await gameMaster.getPlayerPublicKey(player.address);
      expect(key).to.equal(newKey.toLowerCase());
    });

    it("should reject startMission without registration", async function () {
      await expect(
        gameMaster.connect(player).startMission()
      ).to.be.revertedWith("Register first");
    });
  });

  describe("CRE Oracle", function () {
    it("should allow owner to update CRE oracle", async function () {
      await gameMaster.connect(owner).setCREOracle(otherUser.address);
      expect(await gameMaster.creOracle()).to.equal(otherUser.address);
    });

    it("should reject non-owner updating CRE oracle", async function () {
      await expect(
        gameMaster.connect(player).setCREOracle(otherUser.address)
      ).to.be.revertedWith("Only callable by owner");
    });
  });

  describe("Commit-Reveal Privacy", function () {
    it("should store targetHash not targetChainId", async function () {
      // Mission struct now has targetHash (bytes32), not targetChainId (uint256)
      // After VRF, the value should be a hash, not a readable chainId
      const mission = await gameMaster.getMission(1);
      // Mission 1 doesn't exist yet, so targetHash should be bytes32(0)
      expect(mission.targetHash).to.equal(ethers.ZeroHash);
    });
  });

  describe("Receive Clue (CRE callback)", function () {
    it("should reject clue from non-CRE address", async function () {
      await expect(
        gameMaster.connect(player).receiveClue(
          1, 0,
          ethers.keccak256(ethers.toUtf8Bytes("test clue")),
          ""
        )
      ).to.be.revertedWith("Not CRE oracle");
    });
  });

  describe("Resolve Capture (Reveal)", function () {
    it("should reject resolveCapture from non-CRE address", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
      await expect(
        gameMaster.connect(player).resolveCapture(1, ARBITRUM_SEPOLIA, salt)
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject resolveCapture for non-active mission", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(1, ARBITRUM_SEPOLIA, salt)
      ).to.be.revertedWith("Mission not active");
    });
  });

  describe("Update Target (Carmen Moves)", function () {
    it("should reject updateTarget from non-CRE address", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new target"));
      await expect(
        gameMaster.connect(player).updateTarget(1, newHash)
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject updateTarget for non-active mission", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new target"));
      await expect(
        gameMaster.connect(creOracle).updateTarget(1, newHash)
      ).to.be.revertedWith("Mission not active");
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to update valid chain IDs", async function () {
      const newChainIds = [421614, 84532, 11155111];
      await gameMaster.connect(owner).setValidChainIds(newChainIds);
      const cities = await gameMaster.getValidCities();
      expect(cities.length).to.equal(3);
    });

    it("should reject fewer than 2 chain IDs", async function () {
      await expect(
        gameMaster.connect(owner).setValidChainIds([421614])
      ).to.be.revertedWith("Need at least 2 cities");
    });
  });
});
