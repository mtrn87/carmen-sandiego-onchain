import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster, CityNode, MissionNFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * End-to-end test: Carmen Sandiego with Commit-Reveal privacy + NFT trophies.
 *
 * Key changes from v1:
 *  - Contract stores targetHash, NOT targetChainId (privacy)
 *  - receiveClue has no isTrue param (contract doesn't know)
 *  - Capture via resolveCapture() with REVEAL (CRE proves location)
 *  - NFT minted on capture
 */
describe("Carmen Sandiego - Full Game E2E (Commit-Reveal)", function () {
  let gameMaster: GameMaster;
  let missionNFT: MissionNFT;
  let cityTokyo: CityNode;
  let cityParis: CityNode;
  let cityLondon: CityNode;
  let vrfCoordinator: any;

  let owner: SignerWithAddress;
  let creOracle: SignerWithAddress;
  let player: SignerWithAddress;

  const ARBITRUM_SEPOLIA = 421614;
  const BASE_SEPOLIA = 84532;
  const XDC_APOTHEM = 51;
  const validChainIds = [ARBITRUM_SEPOLIA, BASE_SEPOLIA, XDC_APOTHEM];

  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  // Compute the commit hash the same way the contract does
  function computeTargetHash(chainId: number, vrfWord: number, missionId: number): { hash: string; salt: string } {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["uint256", "uint256"], [vrfWord, missionId])
    );
    const hash = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [chainId, salt])
    );
    return { hash, salt };
  }

  // Helper: register player + start mission + VRF callback
  async function setupMission(p: SignerWithAddress, vrfWord: number = 3) {
    await gameMaster.connect(p).registerPlayer(MOCK_PUBLIC_KEY);
    await gameMaster.connect(p).startMission();
    const gmAddr = await gameMaster.getAddress();
    const missionId = await gameMaster.getPlayerActiveMission(p.address);
    await vrfCoordinator.fulfillRandomWordsWithOverride(
      missionId, gmAddr, [vrfWord]
    );
    return missionId;
  }

  // Helper: deliver clue from CRE (no isTrue — contract doesn't know!)
  async function deliverClue(missionId: number | bigint, clueType: number = 0) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(`clue-${missionId}-${Date.now()}-${Math.random()}`));
    const ipfs = clueType >= 1 ? "QmEncryptedContent" : "";
    await gameMaster.connect(creOracle).receiveClue(missionId, clueType, hash, ipfs, 50);
  }

  beforeEach(async function () {
    [owner, creOracle, player] = await ethers.getSigners();

    // 1. Deploy VRF Mock
    const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
    vrfCoordinator = await VRFMock.deploy(0, 0, 0);
    await vrfCoordinator.waitForDeployment();

    // 2. Create VRF subscription
    const createSubTx = await vrfCoordinator.createSubscription();
    const createSubReceipt = await createSubTx.wait();
    const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
      try {
        return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
      } catch { return false; }
    });
    const subId = vrfCoordinator.interface.parseLog({
      topics: [...subCreatedEvent!.topics],
      data: subCreatedEvent!.data
    })!.args[0];

    // 3. Fund the subscription
    await vrfCoordinator.fundSubscription(subId, 1000000);

    // 4. Deploy GameMaster
    const GameMasterFactory = await ethers.getContractFactory("GameMaster");
    gameMaster = await GameMasterFactory.deploy(
      await vrfCoordinator.getAddress(),
      subId, VRF_KEY_HASH, validChainIds, creOracle.address
    ) as GameMaster;
    await gameMaster.waitForDeployment();

    // 5. Add GameMaster as VRF consumer
    await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());

    // 6. Deploy MissionNFT and connect to GameMaster
    const MissionNFTFactory = await ethers.getContractFactory("MissionNFT");
    missionNFT = await MissionNFTFactory.deploy(await gameMaster.getAddress()) as MissionNFT;
    await missionNFT.waitForDeployment();
    await gameMaster.connect(owner).setMissionNFT(await missionNFT.getAddress());

    // 7. Deploy CityNode contracts
    const CityNodeFactory = await ethers.getContractFactory("CityNode");
    cityTokyo = await CityNodeFactory.deploy("Tokyo", "JP", ARBITRUM_SEPOLIA, 1, creOracle.address, ethers.ZeroAddress) as CityNode;
    cityParis = await CityNodeFactory.deploy("Paris", "FR", BASE_SEPOLIA, 2, creOracle.address, ethers.ZeroAddress) as CityNode;
    cityLondon = await CityNodeFactory.deploy("London", "GB", XDC_APOTHEM, 3, creOracle.address, ethers.ZeroAddress) as CityNode;
  });

  // ============================================================
  //  COMMIT-REVEAL: Privacy verification
  // ============================================================
  describe("Commit-Reveal Privacy", function () {
    it("should NOT expose targetChainId on-chain", async function () {
      const missionId = await setupMission(player, 3); // vrfWord=3, 3%3=0 → Tokyo

      const mission = await gameMaster.getMission(missionId);

      // targetHash should be a hash, NOT a readable chain ID
      expect(mission.targetHash).to.not.equal(0);
      expect(mission.targetHash).to.not.equal(ARBITRUM_SEPOLIA);
      expect(mission.targetHash).to.not.equal(BASE_SEPOLIA);
      expect(mission.targetHash).to.not.equal(XDC_APOTHEM);

      // Verify the hash matches what we compute off-chain
      const { hash } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      expect(mission.targetHash).to.equal(hash);
    });

    it("should store missionSalt for CRE to read", async function () {
      const missionId = await setupMission(player, 3);
      const salt = await gameMaster.getMissionSalt(missionId);
      const expectedSalt = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [3, missionId])
      );
      expect(salt).to.equal(expectedSalt);
    });

    it("should allow CRE to brute-force location from salt", async function () {
      const missionId = await setupMission(player, 3);
      const salt = await gameMaster.getMissionSalt(missionId);
      const cities = await gameMaster.getValidCities();
      const mission = await gameMaster.getMission(missionId);

      // Brute-force: try all cities to find which one matches targetHash
      let foundCity: bigint | undefined;
      for (const city of cities) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [city, salt])
        );
        if (hash === mission.targetHash) {
          foundCity = city;
          break;
        }
      }
      expect(foundCity).to.equal(BigInt(ARBITRUM_SEPOLIA));
    });

    it("should emit CarmenLocationCommitted with hash, not chainId", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(player).startMission();
      const gmAddr = await gameMaster.getAddress();
      const missionId = await gameMaster.getPlayerActiveMission(player.address);

      // Listen for the commit event
      await expect(
        vrfCoordinator.fulfillRandomWordsWithOverride(missionId, gmAddr, [3])
      ).to.emit(gameMaster, "CarmenLocationCommitted");
    });

    it("should NOT have isTrue in clue struct", async function () {
      const missionId = await setupMission(player, 3);

      // Deliver a clue — no isTrue parameter
      await deliverClue(missionId, 0);

      const clues = await gameMaster.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
      // Clue struct: clueType, contentHash, ipfsPointer, timestamp (no isTrue!)
      expect(clues[0].clueType).to.equal(0);
      expect(clues[0].contentHash).to.not.equal(ethers.ZeroHash);
      expect(clues[0].timestamp).to.be.gt(0);
    });
  });

  // ============================================================
  //  FULL GAME: Happy Path with Commit-Reveal
  // ============================================================
  describe("Happy Path: Commit → Investigate → Clues → Reveal → Capture → NFT", function () {
    it("should complete a full game with reveal-based capture", async function () {
      // vrfWord=3, 3%3=0 → validChainIds[0] = ARBITRUM_SEPOLIA (Tokyo)
      const missionId = await setupMission(player, 3);

      const mission = await gameMaster.getMission(missionId);
      // Verify it's a hash, not plaintext
      expect(mission.targetHash).to.not.equal(ARBITRUM_SEPOLIA);

      // --- Investigations (contract just emits events) ---
      await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);   // wrong
      await gameMaster.connect(player).submitInvestigation(XDC_APOTHEM);    // wrong
      await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA); // right, but no capture!

      // Mission is still active — submitInvestigation never captures
      expect((await gameMaster.getMission(missionId)).status).to.equal(1); // Active
      expect((await gameMaster.getMission(missionId)).investigationsCount).to.equal(3);

      // --- CRE delivers 3 clues (contract doesn't know true/false) ---
      await deliverClue(missionId, 0); // Text
      await deliverClue(missionId, 1); // Audio
      await deliverClue(missionId, 2); // Image

      expect((await gameMaster.getMissionClues(missionId)).length).to.equal(3);

      // --- CRE resolves capture (REVEAL) ---
      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const captureTx = await gameMaster.connect(creOracle).resolveCapture(
        missionId, ARBITRUM_SEPOLIA, salt
      );
      const captureReceipt = await captureTx.wait();

      const capturedEvent = captureReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "CarmenCaptured";
        } catch { return false; }
      });
      expect(capturedEvent).to.not.be.undefined;

      // --- Verify final state ---
      const finalMission = await gameMaster.getMission(missionId);
      expect(finalMission.status).to.equal(2); // Completed
      expect(await gameMaster.getPlayerActiveMission(player.address)).to.equal(0);

      // --- Verify NFT minted ---
      const nftBalance = await missionNFT.balanceOf(player.address);
      expect(nftBalance).to.equal(1);

      const record = await missionNFT.getMissionRecord(1);
      expect(record.missionId).to.equal(missionId);
      expect(record.player).to.equal(player.address);
      expect(record.capturedChainId).to.equal(ARBITRUM_SEPOLIA);
      expect(record.cluesCollected).to.equal(3);
      expect(record.reward).to.equal(100); // Gold
    });
  });

  // ============================================================
  //  RESOLVE CAPTURE: Validation
  // ============================================================
  describe("Resolve Capture Validation", function () {
    it("should reject capture with < 3 clues", async function () {
      const missionId = await setupMission(player, 3);

      // Only 2 clues
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt)
      ).to.be.revertedWith("Need 3+ clues");
    });

    it("should reject capture with wrong chainId (invalid reveal)", async function () {
      const missionId = await setupMission(player, 3); // Tokyo

      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      // CRE tries to say Carmen was in Paris — but hash won't match!
      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(missionId, BASE_SEPOLIA, salt)
      ).to.be.revertedWith("Invalid reveal");
    });

    it("should reject capture with wrong salt (tampered reveal)", async function () {
      const missionId = await setupMission(player, 3);

      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const fakeSalt = ethers.keccak256(ethers.toUtf8Bytes("fake-salt"));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, fakeSalt)
      ).to.be.revertedWith("Invalid reveal");
    });

    it("should accept valid reveal with correct chainId and salt", async function () {
      const missionId = await setupMission(player, 3);

      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      expect((await gameMaster.getMission(missionId)).status).to.equal(2); // Completed
    });
  });

  // ============================================================
  //  GAME OVER: Player fails
  // ============================================================
  describe("Failure Path: Player runs out of attempts", function () {
    it("should fail mission after MAX_INVESTIGATIONS", async function () {
      const missionId = await setupMission(player, 3);

      // 9 guesses — still active
      for (let i = 0; i < 9; i++) {
        const wrongCity = i % 2 === 0 ? BASE_SEPOLIA : XDC_APOTHEM;
        await gameMaster.connect(player).submitInvestigation(wrongCity);
      }

      expect((await gameMaster.getMission(missionId)).status).to.equal(1); // Active

      // 10th guess → mission fails
      const failTx = await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);
      const failReceipt = await failTx.wait();

      const failedEvent = failReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "MissionFailed";
        } catch { return false; }
      });
      expect(failedEvent).to.not.be.undefined;

      expect((await gameMaster.getMission(missionId)).status).to.equal(3); // Failed
      expect(await gameMaster.getPlayerActiveMission(player.address)).to.equal(0);
    });
  });

  // ============================================================
  //  REWARD TIERS
  // ============================================================
  describe("Reward System", function () {
    it("should emit Gold reward for fast capture", async function () {
      const missionId = await setupMission(player, 3);

      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const captureTx = await gameMaster.connect(creOracle).resolveCapture(
        missionId, ARBITRUM_SEPOLIA, salt
      );
      const captureReceipt = await captureTx.wait();

      const capturedEvent = captureReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "CarmenCaptured";
        } catch { return false; }
      });

      const args = gameMaster.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data
      })!.args;

      expect(args[3]).to.equal(100); // Gold
    });
  });

  // ============================================================
  //  CARMEN MOVES (updateTarget with hash)
  // ============================================================
  describe("Carmen Moves Mid-Mission", function () {
    it("should allow CRE to move Carmen with new hash", async function () {
      const missionId = await setupMission(player, 3);

      const oldMission = await gameMaster.getMission(missionId);
      const oldHash = oldMission.targetHash;

      // CRE moves Carmen — passes new HASH, not chainId
      const newSalt = ethers.keccak256(ethers.toUtf8Bytes("new-salt"));
      const newHash = ethers.keccak256(
        ethers.solidityPacked(["uint256", "bytes32"], [XDC_APOTHEM, newSalt])
      );
      await gameMaster.connect(creOracle).updateTarget(missionId, newHash);

      const newMission = await gameMaster.getMission(missionId);
      expect(newMission.targetHash).to.equal(newHash);
      expect(newMission.targetHash).to.not.equal(oldHash);

      // Now resolve with NEW location
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      // Old reveal fails
      const { salt: oldSalt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, oldSalt)
      ).to.be.revertedWith("Invalid reveal");

      // New reveal succeeds
      await gameMaster.connect(creOracle).resolveCapture(missionId, XDC_APOTHEM, newSalt);
      expect((await gameMaster.getMission(missionId)).status).to.equal(2); // Completed
    });

    it("should emit CarmenMoved with hash", async function () {
      const missionId = await setupMission(player, 3);
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new-target-hash"));

      await expect(gameMaster.connect(creOracle).updateTarget(missionId, newHash))
        .to.emit(gameMaster, "CarmenMoved")
        .withArgs(missionId, newHash);
    });

    it("should reject updateTarget from non-CRE", async function () {
      const missionId = await setupMission(player, 3);
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("hash"));

      await expect(
        gameMaster.connect(player).updateTarget(missionId, newHash)
      ).to.be.revertedWith("Not CRE oracle");
    });
  });

  // ============================================================
  //  MISSION NFT
  // ============================================================
  describe("MissionNFT", function () {
    it("should only allow GameMaster to mint", async function () {
      await expect(
        missionNFT.connect(player).mintMissionComplete(
          player.address,
          { missionId: 1, player: player.address, capturedChainId: ARBITRUM_SEPOLIA,
            cluesCollected: 3, investigationsUsed: 4, blocksUsed: 10, reward: 100,
            timestamp: Math.floor(Date.now() / 1000) },
          ""
        )
      ).to.be.revertedWith("Not GameMaster");
    });

    it("should set correct gameMaster address", async function () {
      expect(await missionNFT.gameMaster()).to.equal(await gameMaster.getAddress());
    });

    it("should have correct name and symbol", async function () {
      expect(await missionNFT.name()).to.equal("Carmen Sandiego Mission");
      expect(await missionNFT.symbol()).to.equal("CARMEN");
    });

    it("should mint NFT on capture via resolveCapture", async function () {
      const missionId = await setupMission(player, 3);
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      // NFT minted to player
      expect(await missionNFT.balanceOf(player.address)).to.equal(1);
      expect(await missionNFT.ownerOf(1)).to.equal(player.address);

      // Record stored correctly
      const record = await missionNFT.getMissionRecord(1);
      expect(record.missionId).to.equal(missionId);
      expect(record.player).to.equal(player.address);
      expect(record.capturedChainId).to.equal(ARBITRUM_SEPOLIA);
      expect(record.cluesCollected).to.equal(3);
      expect(record.reward).to.equal(100);
    });

    it("should emit MissionNFTMinted event on capture", async function () {
      const missionId = await setupMission(player, 3);
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt)
      ).to.emit(missionNFT, "MissionNFTMinted");
    });

    it("should mint multiple NFTs for multiple captures", async function () {
      const [, , , player2] = await ethers.getSigners();

      // Player 1 captures
      const m1 = await setupMission(player, 3);
      await deliverClue(m1, 0); await deliverClue(m1, 1); await deliverClue(m1, 2);
      const p1 = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(m1));
      await gameMaster.connect(creOracle).resolveCapture(m1, ARBITRUM_SEPOLIA, p1.salt);

      // Player 2 captures
      await gameMaster.connect(player2).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(player2).startMission();
      const gmAddr = await gameMaster.getAddress();
      const m2 = await gameMaster.getPlayerActiveMission(player2.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(m2, gmAddr, [4]); // Paris
      await deliverClue(m2, 0); await deliverClue(m2, 1); await deliverClue(m2, 2);
      const p2 = computeTargetHash(BASE_SEPOLIA, 4, Number(m2));
      await gameMaster.connect(creOracle).resolveCapture(m2, BASE_SEPOLIA, p2.salt);

      expect(await missionNFT.balanceOf(player.address)).to.equal(1);
      expect(await missionNFT.balanceOf(player2.address)).to.equal(1);

      const r1 = await missionNFT.getMissionRecord(1);
      const r2 = await missionNFT.getMissionRecord(2);
      expect(r1.capturedChainId).to.equal(ARBITRUM_SEPOLIA);
      expect(r2.capturedChainId).to.equal(BASE_SEPOLIA);
    });

    it("should set token URI via setMissionTokenURI after capture", async function () {
      const missionId = await setupMission(player, 3);
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      // Verify missionToTokenId mapping
      const tokenId = await missionNFT.missionToTokenId(missionId);
      expect(tokenId).to.equal(1);

      // Set token URI (simulating generate-finale CRE workflow)
      const metadataUri = "data:application/json;base64,eyJuYW1lIjoiQ2FybWVuIFNhbmRpZWdvIE1pc3Npb24gIzEiLCJkZXNjcmlwdGlvbiI6IkdPTEQgUkFOSyJ9";
      await gameMaster.connect(creOracle).setMissionTokenURI(missionId, metadataUri);

      // Verify URI was set on the NFT
      expect(await missionNFT.tokenURI(tokenId)).to.equal(metadataUri);
    });
  });

  // ============================================================
  //  EDGE CASES
  // ============================================================
  describe("Edge Cases", function () {
    it("should reject startMission without registration", async function () {
      await expect(
        gameMaster.connect(player).startMission()
      ).to.be.revertedWith("Register first");
    });

    it("should auto-fail previous mission when starting a new one", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(player).startMission();
      const mission1Id = await gameMaster.getPlayerActiveMission(player.address);

      // Starting a second mission should auto-fail the first
      await expect(
        gameMaster.connect(player).startMission()
      ).to.emit(gameMaster, "MissionFailed").withArgs(mission1Id, player.address);

      // New mission should be active
      const mission2Id = await gameMaster.getPlayerActiveMission(player.address);
      expect(mission2Id).to.not.equal(mission1Id);
      const mission1 = await gameMaster.getMission(mission1Id);
      expect(mission1.status).to.equal(3); // Failed
    });

    it("should allow new mission after completing previous one", async function () {
      const missionId = await setupMission(player, 3);
      await deliverClue(missionId, 0);
      await deliverClue(missionId, 1);
      await deliverClue(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      await gameMaster.connect(creOracle).resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      // Mission 2
      await gameMaster.connect(player).startMission();
      const mission2 = await gameMaster.getMission(2);
      expect(mission2.player).to.equal(player.address);
      expect(mission2.status).to.equal(1);
    });

    it("should reject investigation on invalid chain", async function () {
      await setupMission(player, 3);
      await expect(
        gameMaster.connect(player).submitInvestigation(999999)
      ).to.be.revertedWith("Invalid city/chain");
    });

    it("should allow new mission after failed one", async function () {
      await setupMission(player, 3);
      for (let i = 0; i < 10; i++) {
        await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);
      }
      await gameMaster.connect(player).startMission();
      expect((await gameMaster.getMission(2)).status).to.equal(1);
    });
  });

  // ============================================================
  //  MULTI-PLAYER
  // ============================================================
  describe("Multi-Player", function () {
    it("should support multiple players with private locations", async function () {
      const [, , , player2] = await ethers.getSigners();
      const gmAddr = await gameMaster.getAddress();

      // Register both
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(player2).registerPlayer(MOCK_PUBLIC_KEY);

      // Start missions
      await gameMaster.connect(player).startMission();
      await gameMaster.connect(player2).startMission();

      // VRF: Player 1 → Tokyo (vrfWord=3), Player 2 → Paris (vrfWord=4)
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gmAddr, [3]); // 3%3=0 → Tokyo
      await vrfCoordinator.fulfillRandomWordsWithOverride(2, gmAddr, [4]); // 4%3=1 → Paris

      // Both targetHashes are different
      const mission1 = await gameMaster.getMission(1);
      const mission2 = await gameMaster.getMission(2);
      expect(mission1.targetHash).to.not.equal(mission2.targetHash);

      // Neither hash reveals the actual chainId
      expect(mission1.targetHash).to.not.equal(ARBITRUM_SEPOLIA);
      expect(mission2.targetHash).to.not.equal(BASE_SEPOLIA);

      // Deliver clues for both
      for (const mid of [1, 2]) {
        await deliverClue(mid, 0);
        await deliverClue(mid, 1);
        await deliverClue(mid, 2);
      }

      // CRE resolves Player 1 in Tokyo
      const p1 = computeTargetHash(ARBITRUM_SEPOLIA, 3, 1);
      await gameMaster.connect(creOracle).resolveCapture(1, ARBITRUM_SEPOLIA, p1.salt);

      // CRE resolves Player 2 in Paris
      const p2 = computeTargetHash(BASE_SEPOLIA, 4, 2);
      await gameMaster.connect(creOracle).resolveCapture(2, BASE_SEPOLIA, p2.salt);

      expect((await gameMaster.getMission(1)).status).to.equal(2);
      expect((await gameMaster.getMission(2)).status).to.equal(2);
    });
  });

  // ============================================================
  //  CITYNODE INTEGRATION
  // ============================================================
  describe("CityNode Integration", function () {
    it("should track Carmen moving between cities", async function () {
      const missionId = await setupMission(player, 3);

      // CRE places Carmen in Tokyo (CityNode knows, contract doesn't)
      await cityTokyo.connect(creOracle).updateCarmenPresence(missionId, true);
      expect(await cityTokyo.getCarmenStatus(missionId)).to.equal(true);

      // Carmen moves: CRE updates CityNodes + GameMaster hash
      const newSalt = ethers.keccak256(ethers.toUtf8Bytes("move-salt"));
      const newHash = ethers.keccak256(
        ethers.solidityPacked(["uint256", "bytes32"], [XDC_APOTHEM, newSalt])
      );
      await gameMaster.connect(creOracle).updateTarget(missionId, newHash);
      await cityTokyo.connect(creOracle).updateCarmenPresence(missionId, false);
      await cityLondon.connect(creOracle).updateCarmenPresence(missionId, true);

      expect(await cityTokyo.getCarmenStatus(missionId)).to.equal(false);
      expect(await cityLondon.getCarmenStatus(missionId)).to.equal(true);
    });
  });
});
