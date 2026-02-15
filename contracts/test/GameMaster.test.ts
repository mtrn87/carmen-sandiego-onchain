import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster, CityNode } from "../typechain-types";
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

  describe("Pausable", function () {
    it("should allow owner to pause", async function () {
      await expect(gameMaster.connect(owner).pause())
        .to.emit(gameMaster, "Paused")
        .withArgs(owner.address);
    });

    it("should allow owner to unpause", async function () {
      await gameMaster.connect(owner).pause();
      await expect(gameMaster.connect(owner).unpause())
        .to.emit(gameMaster, "Unpaused")
        .withArgs(owner.address);
    });

    it("should reject pause from non-owner", async function () {
      await expect(
        gameMaster.connect(player).pause()
      ).to.be.revertedWith("Only callable by owner");
    });

    it("should reject unpause from non-owner", async function () {
      await gameMaster.connect(owner).pause();
      await expect(
        gameMaster.connect(player).unpause()
      ).to.be.revertedWith("Only callable by owner");
    });

    it("should revert startMission when paused", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(owner).pause();
      await expect(
        gameMaster.connect(player).startMission()
      ).to.be.revertedWithCustomError(gameMaster, "EnforcedPause");
    });

    it("should revert submitInvestigation when paused", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(owner).pause();
      await expect(
        gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA)
      ).to.be.revertedWithCustomError(gameMaster, "EnforcedPause");
    });

    it("should allow receiveClue when paused (CRE callback)", async function () {
      // Deploy with real VRF mock for full mission flow
      const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
        } catch { return false; }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics], data: subCreatedEvent!.data
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = await GMFactory.deploy(
        await vrfCoordinator.getAddress(), subId, VRF_KEY_HASH, validChainIds, creOracle.address
      ) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(missionId, await gm.getAddress(), [42]);

      // Pause
      await gm.connect(owner).pause();

      // CRE should still be able to deliver clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
      await expect(
        gm.connect(creOracle).receiveClue(missionId, 0, contentHash, "ipfs://Qm...")
      ).to.emit(gm, "ClueReceived");
    });

    it("should allow resolveCapture when paused (CRE callback)", async function () {
      // Deploy with real VRF mock for full mission flow
      const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return vrfCoordinator.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "SubscriptionCreated";
        } catch { return false; }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics], data: subCreatedEvent!.data
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = await GMFactory.deploy(
        await vrfCoordinator.getAddress(), subId, VRF_KEY_HASH, validChainIds, creOracle.address
      ) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      const vrfWord = 42;
      await vrfCoordinator.fulfillRandomWordsWithOverride(missionId, await gm.getAddress(), [vrfWord]);

      // Deliver 3 clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm.connect(creOracle).receiveClue(Number(missionId), 0, contentHash, "ipfs://Qm...");
      }

      // Find revealed chainId
      const mission = await gm.getMission(missionId);
      const salt = await gm.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]));
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      // Pause
      await gm.connect(owner).pause();

      // CRE should still be able to resolve captures
      await expect(
        gm.connect(creOracle).resolveCapture(missionId, revealedChainId, salt)
      ).to.emit(gm, "CarmenCaptured");
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

  // ============================================================
  //          CITYNODE INTEGRATION
  // ============================================================

  describe("CityNode Integration", function () {
    let cityNode: CityNode;
    const gmAddress = () => gameMaster.getAddress();

    const sampleLocations = [
      {
        name: "Shibuya",
        descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("shibuya")),
        category: 1,
        fakeLevel: 0,
        riskLevel: 3,
      },
      {
        name: "Akihabara",
        descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("akihabara")),
        category: 2,
        fakeLevel: 1,
        riskLevel: 2,
      },
      {
        name: "Tsukiji",
        descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("tsukiji")),
        category: 3,
        fakeLevel: 0,
        riskLevel: 1,
      },
    ] as [CityNode.LocationInfoStruct, CityNode.LocationInfoStruct, CityNode.LocationInfoStruct];

    beforeEach(async function () {
      // deploy CityNode with gameMaster as its GM
      const CityNodeFactory = await ethers.getContractFactory("CityNode");
      cityNode = (await CityNodeFactory.deploy(
        "Tokyo", "JP", ARBITRUM_SEPOLIA, 1, await gmAddress()
      )) as CityNode;

      // setup locations so players can interact
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef({
        refId: 1,
        txHashLike: ethers.keccak256(ethers.toUtf8Bytes("tx-1")),
        from: player.address,
        to: otherUser.address,
        methodSigLike: "0xa9059cbb",
        blockLike: 1000,
        valueLike: 1000000n,
        anomalyType: 0,
      });
    });

    describe("resolveClueOnCity", function () {
      beforeEach(async function () {
        // player does: inspect -> scan -> requestClue on CityNode
        await cityNode.connect(player).inspectLocation(0);
        await cityNode.connect(player).scanAnomalies(0);
        await cityNode.connect(player).requestClue(0, 0); // creates request ID 1
      });

      it("should resolve clue on CityNode via GameMaster", async function () {
        const clueHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
        const anomalyRef = ethers.keccak256(ethers.toUtf8Bytes("anomaly"));

        await expect(
          gameMaster.connect(creOracle).resolveClueOnCity(
            await cityNode.getAddress(), 1, 0, clueHash, anomalyRef
          )
        )
          .to.emit(gameMaster, "ClueResolvedOnCity")
          .withArgs(await cityNode.getAddress(), 1, 0, clueHash);

        // verify CityNode state updated
        const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
        expect(cluesFound).to.equal(1);
      });

      it("should reject non-CRE caller", async function () {
        const clueHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
        await expect(
          gameMaster.connect(player).resolveClueOnCity(
            await cityNode.getAddress(), 1, 0, clueHash, ethers.ZeroHash
          )
        ).to.be.revertedWith("Not CRE oracle");
      });

      it("should reject zero address city node", async function () {
        const clueHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
        await expect(
          gameMaster.connect(creOracle).resolveClueOnCity(
            ethers.ZeroAddress, 1, 0, clueHash, ethers.ZeroHash
          )
        ).to.be.revertedWith("Invalid city node");
      });
    });

    describe("resolveDossierOnCity", function () {
      beforeEach(async function () {
        await cityNode.connect(player).requestDossier(); // creates request ID 1
      });

      it("should resolve dossier on CityNode via GameMaster", async function () {
        const dossierHash = ethers.keccak256(ethers.toUtf8Bytes("dossier"));
        const hintHash = ethers.keccak256(ethers.toUtf8Bytes("hint"));

        await expect(
          gameMaster.connect(creOracle).resolveDossierOnCity(
            await cityNode.getAddress(), 1, dossierHash, 80, hintHash
          )
        )
          .to.emit(gameMaster, "DossierResolvedOnCity")
          .withArgs(await cityNode.getAddress(), 1, dossierHash, 80);
      });

      it("should reject non-CRE caller", async function () {
        await expect(
          gameMaster.connect(player).resolveDossierOnCity(
            await cityNode.getAddress(), 1, ethers.ZeroHash, 50, ethers.ZeroHash
          )
        ).to.be.revertedWith("Not CRE oracle");
      });
    });

    describe("resolveCaptureOnCity", function () {
      let suspectWallet: string;

      beforeEach(async function () {
        suspectWallet = ethers.Wallet.createRandom().address;
        const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
        await cityNode.connect(player).requestCapture(suspectWallet, evidenceHash);
      });

      it("should resolve capture on CityNode via GameMaster", async function () {
        const gmNote = ethers.keccak256(ethers.toUtf8Bytes("captured"));

        await expect(
          gameMaster.connect(creOracle).resolveCaptureOnCity(
            await cityNode.getAddress(), 1, true, 0, gmNote
          )
        )
          .to.emit(gameMaster, "CaptureResolvedOnCity")
          .withArgs(await cityNode.getAddress(), 1, true, 0);
      });

      it("should store capture request city", async function () {
        const gmNote = ethers.keccak256(ethers.toUtf8Bytes("captured"));
        await gameMaster.connect(creOracle).resolveCaptureOnCity(
          await cityNode.getAddress(), 1, true, 0, gmNote
        );

        expect(await gameMaster.captureRequestCity(1)).to.equal(await cityNode.getAddress());
      });

      it("should reject non-CRE caller", async function () {
        await expect(
          gameMaster.connect(player).resolveCaptureOnCity(
            await cityNode.getAddress(), 1, true, 0, ethers.ZeroHash
          )
        ).to.be.revertedWith("Not CRE oracle");
      });
    });

    describe("trackPlayerClue", function () {
      it("should track clue count per city", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));

        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, ethers.ZeroHash);
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const count = await gameMaster.getPlayerCityClueCount(player.address, cityId);
        expect(count).to.equal(2);
      });

      it("should increment cities visited on first clue", async function () {
        const city1 = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        const city2 = ethers.keccak256(ethers.toUtf8Bytes("paris"));

        await gameMaster.connect(creOracle).trackPlayerClue(player.address, city1, ethers.ZeroHash);
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, city2, ethers.ZeroHash);

        const [citiesVisited] = await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(2);
      });

      it("should NOT double-count cities visited", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));

        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, ethers.ZeroHash);
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const [citiesVisited] = await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(1);
      });

      it("should store identity commits when provided", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        const commit = ethers.keccak256(ethers.toUtf8Bytes("identity-commit"));

        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, commit);

        const commits = await gameMaster.getPlayerIdentityCommits(player.address);
        expect(commits.length).to.equal(1);
        expect(commits[0]).to.equal(commit);
      });

      it("should NOT store zero-hash identity commits", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const commits = await gameMaster.getPlayerIdentityCommits(player.address);
        expect(commits.length).to.equal(0);
      });

      it("should reject non-CRE caller", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await expect(
          gameMaster.connect(player).trackPlayerClue(player.address, cityId, ethers.ZeroHash)
        ).to.be.revertedWith("Not CRE oracle");
      });
    });

    describe("getPlayerGlobalProgress", function () {
      it("should return zeros for new player", async function () {
        const [citiesVisited, totalClues, identityCommits] =
          await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(0);
        expect(totalClues).to.equal(0);
        expect(identityCommits).to.equal(0);
      });

      it("should return correct progress after tracking", async function () {
        const city1 = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        const city2 = ethers.keccak256(ethers.toUtf8Bytes("paris"));
        const commit1 = ethers.keccak256(ethers.toUtf8Bytes("commit-1"));
        const commit2 = ethers.keccak256(ethers.toUtf8Bytes("commit-2"));

        await gameMaster.connect(creOracle).trackPlayerClue(player.address, city1, commit1);
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, city2, commit2);
        await gameMaster.connect(creOracle).trackPlayerClue(player.address, city1, ethers.ZeroHash);

        const [citiesVisited, totalClues, identityCommits] =
          await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(2);
        expect(totalClues).to.equal(2);      // 2 identity commits
        expect(identityCommits).to.equal(2);
      });
    });

    describe("Full Integration Flow", function () {
      it("should support GameMaster resolving requests on CityNode end-to-end", async function () {
        // player interacts with CityNode
        await cityNode.connect(player).inspectLocation(0);
        await cityNode.connect(player).scanAnomalies(0);
        await cityNode.connect(player).requestClue(0, 0);

        // CRE resolves via GameMaster
        const clueHash = ethers.keccak256(ethers.toUtf8Bytes("important clue"));
        await gameMaster.connect(creOracle).resolveClueOnCity(
          await cityNode.getAddress(), 1, 0, clueHash, ethers.ZeroHash
        );

        // track the clue globally
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await gameMaster.connect(creOracle).trackPlayerClue(
          player.address, cityId, clueHash
        );

        // verify both local and global state
        const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
        expect(cluesFound).to.equal(1);

        const [citiesVisited, totalClues] = await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(1);
        expect(totalClues).to.equal(1);
      });
    });
  });
});
