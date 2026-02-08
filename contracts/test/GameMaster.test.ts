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

  beforeEach(async function () {
    [owner, player, creOracle, otherUser] = await ethers.getSigners();

    // For local testing, we use the VRFCoordinatorV2_5Mock
    // In a real test, you'd deploy the mock first
    // For now, we test the non-VRF parts by using owner as VRF coordinator
    const GameMasterFactory = await ethers.getContractFactory("GameMaster");

    // Note: For full VRF testing, deploy VRFCoordinatorV2_5Mock first
    // This basic test focuses on game logic
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

  describe("Receive Clue (CRE callback)", function () {
    // We need a mission to exist first, so we simulate one
    // In production, startMission() creates it via VRF

    it("should reject clue from non-CRE address", async function () {
      await expect(
        gameMaster.connect(player).receiveClue(
          1, // missionId
          0, // ClueType.Text
          ethers.keccak256(ethers.toUtf8Bytes("test clue")),
          "",
          "A witness saw Carmen near the airport",
          true
        )
      ).to.be.revertedWith("Not CRE oracle");
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