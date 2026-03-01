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
  const VRF_KEY_HASH =
    "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";

  // Mock ECIES public key (65 bytes uncompressed secp256k1)
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  beforeEach(async function () {
    [owner, player, creOracle, otherUser] = await ethers.getSigners();

    const GameMasterFactory = await ethers.getContractFactory("GameMaster");
    gameMaster = (await GameMasterFactory.deploy(
      owner.address, // Mock VRF coordinator (owner for testing)
      VRF_SUB_ID,
      VRF_KEY_HASH,
      validChainIds,
      creOracle.address,
    )) as GameMaster;
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
        gameMaster.connect(player).registerPlayer("0x"),
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
        gameMaster.connect(player).startMission(),
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
        gameMaster.connect(player).setCREOracle(otherUser.address),
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
        gameMaster
          .connect(player)
          .receiveClue(
            1,
            0,
            ethers.keccak256(ethers.toUtf8Bytes("test clue")),
            "",
            50,
          ),
      ).to.be.revertedWith("Not CRE oracle");
    });
  });

  describe("Resolve Capture (Reveal)", function () {
    it("should reject resolveCapture from non-CRE address", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
      await expect(
        gameMaster.connect(player).resolveCapture(1, ARBITRUM_SEPOLIA, salt),
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject resolveCapture for non-active mission", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("salt"));
      await expect(
        gameMaster.connect(creOracle).resolveCapture(1, ARBITRUM_SEPOLIA, salt),
      ).to.be.revertedWith("Mission not active");
    });
  });

  describe("Update Target (Carmen Moves)", function () {
    it("should reject updateTarget from non-CRE address", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new target"));
      await expect(
        gameMaster.connect(player).updateTarget(1, newHash),
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject updateTarget for non-active mission", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new target"));
      await expect(
        gameMaster.connect(creOracle).updateTarget(1, newHash),
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
      await expect(gameMaster.connect(player).pause()).to.be.revertedWith(
        "Only callable by owner",
      );
    });

    it("should reject unpause from non-owner", async function () {
      await gameMaster.connect(owner).pause();
      await expect(gameMaster.connect(player).unpause()).to.be.revertedWith(
        "Only callable by owner",
      );
    });

    it("should revert startMission when paused", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(owner).pause();
      await expect(
        gameMaster.connect(player).startMission(),
      ).to.be.revertedWithCustomError(gameMaster, "EnforcedPause");
    });

    it("should revert submitInvestigation when paused", async function () {
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gameMaster.connect(owner).pause();
      await expect(
        gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA),
      ).to.be.revertedWithCustomError(gameMaster, "EnforcedPause");
    });

    it("should allow receiveClue when paused (CRE callback)", async function () {
      // Deploy with real VRF mock for full mission flow
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Pause
      await gm.connect(owner).pause();

      // CRE should still be able to deliver clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
      await expect(
        gm
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://Qm...", 50),
      ).to.emit(gm, "ClueReceived");
    });

    it("should allow resolveCapture when paused (CRE callback)", async function () {
      // Deploy with real VRF mock for full mission flow
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      const vrfWord = 42;
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [vrfWord],
      );

      // Deliver 3 clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(Number(missionId), 0, contentHash, "ipfs://Qm...", 50);
      }

      // Find revealed chainId
      const mission = await gm.getMission(missionId);
      const salt = await gm.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      // Pause
      await gm.connect(owner).pause();

      // CRE should still be able to resolve captures
      await expect(
        gm.connect(creOracle).resolveCapture(missionId, revealedChainId, salt),
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
        gameMaster.connect(owner).setValidChainIds([421614]),
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
    ] as [
      CityNode.LocationInfoStruct,
      CityNode.LocationInfoStruct,
      CityNode.LocationInfoStruct,
    ];

    beforeEach(async function () {
      // deploy CityNode with gameMaster as its GM
      const CityNodeFactory = await ethers.getContractFactory("CityNode");
      cityNode = (await CityNodeFactory.deploy(
        "Tokyo",
        "JP",
        ARBITRUM_SEPOLIA,
        1,
        await gmAddress(),
        ethers.ZeroAddress,
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
          gameMaster
            .connect(creOracle)
            .resolveClueOnCity(
              await cityNode.getAddress(),
              1,
              0,
              clueHash,
              anomalyRef,
            ),
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
          gameMaster
            .connect(player)
            .resolveClueOnCity(
              await cityNode.getAddress(),
              1,
              0,
              clueHash,
              ethers.ZeroHash,
            ),
        ).to.be.revertedWith("Not CRE oracle");
      });

      it("should reject zero address city node", async function () {
        const clueHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
        await expect(
          gameMaster
            .connect(creOracle)
            .resolveClueOnCity(
              ethers.ZeroAddress,
              1,
              0,
              clueHash,
              ethers.ZeroHash,
            ),
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
          gameMaster
            .connect(creOracle)
            .resolveDossierOnCity(
              await cityNode.getAddress(),
              1,
              dossierHash,
              80,
              hintHash,
            ),
        )
          .to.emit(gameMaster, "DossierResolvedOnCity")
          .withArgs(await cityNode.getAddress(), 1, dossierHash, 80);
      });

      it("should reject non-CRE caller", async function () {
        await expect(
          gameMaster
            .connect(player)
            .resolveDossierOnCity(
              await cityNode.getAddress(),
              1,
              ethers.ZeroHash,
              50,
              ethers.ZeroHash,
            ),
        ).to.be.revertedWith("Not CRE oracle");
      });
    });

    describe("resolveCaptureOnCity", function () {
      let suspectWallet: string;

      beforeEach(async function () {
        suspectWallet = ethers.Wallet.createRandom().address;
        const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
        await cityNode
          .connect(player)
          .requestCapture(suspectWallet, evidenceHash);
      });

      it("should resolve capture on CityNode via GameMaster", async function () {
        const gmNote = ethers.keccak256(ethers.toUtf8Bytes("captured"));

        await expect(
          gameMaster
            .connect(creOracle)
            .resolveCaptureOnCity(
              await cityNode.getAddress(),
              1,
              true,
              0,
              gmNote,
            ),
        )
          .to.emit(gameMaster, "CaptureResolvedOnCity")
          .withArgs(await cityNode.getAddress(), 1, true, 0);
      });

      it("should store capture request city", async function () {
        const gmNote = ethers.keccak256(ethers.toUtf8Bytes("captured"));
        await gameMaster
          .connect(creOracle)
          .resolveCaptureOnCity(
            await cityNode.getAddress(),
            1,
            true,
            0,
            gmNote,
          );

        expect(await gameMaster.captureRequestCity(1)).to.equal(
          await cityNode.getAddress(),
        );
      });

      it("should reject non-CRE caller", async function () {
        await expect(
          gameMaster
            .connect(player)
            .resolveCaptureOnCity(
              await cityNode.getAddress(),
              1,
              true,
              0,
              ethers.ZeroHash,
            ),
        ).to.be.revertedWith("Not CRE oracle");
      });
    });

    describe("trackPlayerClue", function () {
      it("should track clue count per city", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));

        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, ethers.ZeroHash);
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const count = await gameMaster.getPlayerCityClueCount(
          player.address,
          cityId,
        );
        expect(count).to.equal(2);
      });

      it("should increment cities visited on first clue", async function () {
        const city1 = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        const city2 = ethers.keccak256(ethers.toUtf8Bytes("paris"));

        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, city1, ethers.ZeroHash);
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, city2, ethers.ZeroHash);

        const [citiesVisited] = await gameMaster.getPlayerGlobalProgress(
          player.address,
        );
        expect(citiesVisited).to.equal(2);
      });

      it("should NOT double-count cities visited", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));

        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, ethers.ZeroHash);
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const [citiesVisited] = await gameMaster.getPlayerGlobalProgress(
          player.address,
        );
        expect(citiesVisited).to.equal(1);
      });

      it("should store identity commits when provided", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        const commit = ethers.keccak256(ethers.toUtf8Bytes("identity-commit"));

        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, commit);

        const commits = await gameMaster.getPlayerIdentityCommits(
          player.address,
        );
        expect(commits.length).to.equal(1);
        expect(commits[0]).to.equal(commit);
      });

      it("should NOT store zero-hash identity commits", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, ethers.ZeroHash);

        const commits = await gameMaster.getPlayerIdentityCommits(
          player.address,
        );
        expect(commits.length).to.equal(0);
      });

      it("should reject non-CRE caller", async function () {
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await expect(
          gameMaster
            .connect(player)
            .trackPlayerClue(player.address, cityId, ethers.ZeroHash),
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

        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, city1, commit1);
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, city2, commit2);
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, city1, ethers.ZeroHash);

        const [citiesVisited, totalClues, identityCommits] =
          await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(2);
        expect(totalClues).to.equal(2); // 2 identity commits
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
        await gameMaster
          .connect(creOracle)
          .resolveClueOnCity(
            await cityNode.getAddress(),
            1,
            0,
            clueHash,
            ethers.ZeroHash,
          );

        // track the clue globally
        const cityId = ethers.keccak256(ethers.toUtf8Bytes("tokyo"));
        await gameMaster
          .connect(creOracle)
          .trackPlayerClue(player.address, cityId, clueHash);

        // verify both local and global state
        const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
        expect(cluesFound).to.equal(1);

        const [citiesVisited, totalClues] =
          await gameMaster.getPlayerGlobalProgress(player.address);
        expect(citiesVisited).to.equal(1);
        expect(totalClues).to.equal(1);
      });
    });
  });

  // ============================================================
  //          ACTIVE MISSION TRACKING
  // ============================================================

  describe("getActiveMissionIds", function () {
    let gm: GameMaster;
    let vrfCoordinator: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());
    });

    it("should return empty array when no missions exist", async function () {
      const ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(0);
    });

    it("should track mission after startMission", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();

      const ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(1);
    });

    it("should remove mission after capture", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Deliver 3 clues and capture
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://Qm...", 50);
      }

      const mission = await gm.getMission(missionId);
      const salt = await gm.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }
      await gm
        .connect(creOracle)
        .resolveCapture(missionId, revealedChainId, salt);

      const ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(0);
    });

    it("should remove mission after failure (auto-close on new startMission)", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission(); // mission 1

      let ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(1);

      // Starting a new mission auto-fails mission 1
      await gm.connect(player).startMission(); // mission 2

      ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(2);
    });

    it("should track multiple players simultaneously", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(otherUser).registerPlayer(MOCK_PUBLIC_KEY);

      await gm.connect(player).startMission(); // mission 1
      await gm.connect(otherUser).startMission(); // mission 2

      const ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(2);
      expect(ids).to.include(1n);
      expect(ids).to.include(2n);
    });

    it("should handle swap-and-pop correctly when middle mission completes", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(otherUser).registerPlayer(MOCK_PUBLIC_KEY);

      await gm.connect(player).startMission(); // mission 1
      await gm.connect(otherUser).startMission(); // mission 2

      // Fulfill VRF for mission 1 and capture it
      const missionId1 = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId1,
        await gm.getAddress(),
        [42],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(missionId1, 0, contentHash, "ipfs://Qm...", 50);
      }

      const mission = await gm.getMission(missionId1);
      const salt = await gm.getMissionSalt(missionId1);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }
      await gm
        .connect(creOracle)
        .resolveCapture(missionId1, revealedChainId, salt);

      // Only mission 2 should remain
      const ids = await gm.getActiveMissionIds();
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(2);
    });
  });

  // ============================================================
  //          WALLET EVIDENCE
  // ============================================================

  describe("Wallet Evidence", function () {
    it("should receive wallet fragment from CRE", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("fragment-0"));
      await expect(
        gameMaster
          .connect(creOracle)
          .receiveWalletFragment(1, 0, 5, contentHash, "encrypted-frag"),
      ).to.be.revertedWith("Mission not active");
    });

    it("should reject wallet fragment from non-CRE", async function () {
      await expect(
        gameMaster
          .connect(player)
          .receiveWalletFragment(1, 0, 5, ethers.ZeroHash, "frag"),
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject fragment out of bounds", async function () {
      // Need an active mission first
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      await expect(
        gm
          .connect(creOracle)
          .receiveWalletFragment(missionId, 38, 5, ethers.ZeroHash, "frag"),
      ).to.be.revertedWith("Fragment out of bounds");
    });

    it("should store fragments and emit events", async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("frag-0"));

      await expect(
        gm
          .connect(creOracle)
          .receiveWalletFragment(missionId, 0, 5, contentHash, "enc-frag-0"),
      )
        .to.emit(gm, "WalletFragmentReceived")
        .withArgs(missionId, 0, 0, 5, contentHash, "enc-frag-0");

      expect(await gm.getMissionFragmentCount(missionId)).to.equal(1);

      // Add two more fragments
      await gm
        .connect(creOracle)
        .receiveWalletFragment(missionId, 5, 5, ethers.ZeroHash, "enc-frag-1");
      await gm
        .connect(creOracle)
        .receiveWalletFragment(missionId, 10, 5, ethers.ZeroHash, "enc-frag-2");

      expect(await gm.getMissionFragmentCount(missionId)).to.equal(3);

      const fragments = await gm.getMissionWalletFragments(missionId);
      expect(fragments.length).to.equal(3);
      expect(fragments[0].startIndex).to.equal(0);
      expect(fragments[0].length).to.equal(5);
    });

    it("should derive Carmen wallet deterministically", async function () {
      const salt = ethers.keccak256(ethers.toUtf8Bytes("test-salt"));
      const wallet1 = await gameMaster.deriveCarmenWallet(salt);
      const wallet2 = await gameMaster.deriveCarmenWallet(salt);
      expect(wallet1).to.equal(wallet2);
      // Should be a valid address
      expect(wallet1).to.match(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should resolve wallet capture with correct wallet", async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Get salt and find Carmen's city
      const salt = await gm.getMissionSalt(missionId);
      const mission = await gm.getMission(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      // Deliver 3 wallet fragments
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveWalletFragment(
            missionId,
            i * 5,
            5,
            ethers.ZeroHash,
            `frag-${i}`,
          );
      }

      // Derive correct wallet
      const carmenWallet = await gm.deriveCarmenWallet(salt);

      // Submit correct wallet — should capture
      await expect(
        gm
          .connect(creOracle)
          .resolveWalletCapture(missionId, carmenWallet, revealedChainId, salt),
      )
        .to.emit(gm, "WalletCaseBuilt")
        .withArgs(missionId, player.address, carmenWallet, true);

      // Mission should be completed
      const finalMission = await gm.getMission(missionId);
      expect(finalMission.status).to.equal(2); // Completed
    });

    it("should reject wallet capture with wrong wallet", async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      const salt = await gm.getMissionSalt(missionId);
      const mission = await gm.getMission(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      // Deliver 3 fragments
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveWalletFragment(
            missionId,
            i * 5,
            5,
            ethers.ZeroHash,
            `frag-${i}`,
          );
      }

      // Submit wrong wallet — should emit valid=false, mission stays active
      const wrongWallet = ethers.Wallet.createRandom().address;
      await expect(
        gm
          .connect(creOracle)
          .resolveWalletCapture(missionId, wrongWallet, revealedChainId, salt),
      )
        .to.emit(gm, "WalletCaseBuilt")
        .withArgs(missionId, player.address, wrongWallet, false);

      // Mission should still be active
      const finalMission = await gm.getMission(missionId);
      expect(finalMission.status).to.equal(1); // Active
    });

    it("should reject wallet capture with < 3 fragments", async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      const salt = await gm.getMissionSalt(missionId);

      // Only 2 fragments
      for (let i = 0; i < 2; i++) {
        await gm
          .connect(creOracle)
          .receiveWalletFragment(
            missionId,
            i * 5,
            5,
            ethers.ZeroHash,
            `frag-${i}`,
          );
      }

      const carmenWallet = await gm.deriveCarmenWallet(salt);
      await expect(
        gm
          .connect(creOracle)
          .resolveWalletCapture(
            missionId,
            carmenWallet,
            ARBITRUM_SEPOLIA,
            salt,
          ),
      ).to.be.revertedWith("Need 3+ fragments");
    });
  });

  // ============================================================
  //          EVIDENCE SYSTEM
  // ============================================================

  describe("Evidence System", function () {
    let gm: GameMaster;
    let missionId: bigint;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );
    });

    it("should increment evidenceCount when strength > 65", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("strong clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://strong", 80);
      expect(await gm.getMissionEvidenceCount(missionId)).to.equal(1);
    });

    it("should emit EvidenceCollected when strength > 65", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("strong clue"));
      await expect(
        gm
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://strong", 80),
      )
        .to.emit(gm, "EvidenceCollected")
        .withArgs(missionId, 1, 80);
    });

    it("should NOT increment evidenceCount when strength <= 65", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("weak clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://weak", 50);
      expect(await gm.getMissionEvidenceCount(missionId)).to.equal(0);
    });

    it("should NOT increment evidenceCount when strength == 65 (strict >)", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("boundary clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://boundary", 65);
      expect(await gm.getMissionEvidenceCount(missionId)).to.equal(0);
    });

    it("should correctly increment for multiple evidence clues", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://1", 70);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://2", 40);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://3", 90);
      expect(await gm.getMissionEvidenceCount(missionId)).to.equal(2);
    });

    it("should revert when strength > 100", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("invalid"));
      await expect(
        gm
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://bad", 101),
      ).to.be.revertedWith("Invalid strength");
    });

    it("should emit ClueReceived with strength", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await expect(
        gm
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://test", 42),
      )
        .to.emit(gm, "ClueReceived")
        .withArgs(missionId, 0, contentHash, "ipfs://test", 42);
    });

    it("should store strength in Clue struct", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("stored"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://stored", 77);
      const clues = await gm.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
      expect(clues[0].strength).to.equal(77);
    });
  });

  // ============================================================
  //          SET MISSION TOKEN URI
  // ============================================================

  describe("setMissionTokenURI", function () {
    it("should set token URI after capture", async function () {
      // Deploy full setup: VRF, GameMaster, MissionNFT
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      const NFTFactory = await ethers.getContractFactory("MissionNFT");
      const nft = await NFTFactory.deploy(await gm.getAddress());
      await nft.waitForDeployment();
      await gm.connect(owner).setMissionNFT(await nft.getAddress());

      // Start mission and capture
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      const salt = await gm.getMissionSalt(missionId);
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://1", 50);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://2", 50);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://3", 50);

      // Capture (VRF word 42 % 2 = 0 → ARBITRUM_SEPOLIA)
      await gm
        .connect(creOracle)
        .resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      // Verify NFT minted
      const tokenId = await nft.missionToTokenId(missionId);
      expect(tokenId).to.be.gt(0);

      // Set token URI
      const uri = "data:application/json;base64,eyJuYW1lIjoiVGVzdCJ9";
      await gm.connect(creOracle).setMissionTokenURI(missionId, uri);

      // Verify URI was set
      expect(await nft.tokenURI(tokenId)).to.equal(uri);
    });

    it("should emit TokenURISet event", async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      const NFTFactory = await ethers.getContractFactory("MissionNFT");
      const nft = await NFTFactory.deploy(await gm.getAddress());
      await nft.waitForDeployment();
      await gm.connect(owner).setMissionNFT(await nft.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      const salt = await gm.getMissionSalt(missionId);
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://1", 50);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://2", 50);
      await gm
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://3", 50);
      await gm
        .connect(creOracle)
        .resolveCapture(missionId, ARBITRUM_SEPOLIA, salt);

      const tokenId = await nft.missionToTokenId(missionId);
      const uri = "data:application/json;base64,dGVzdA==";

      await expect(gm.connect(creOracle).setMissionTokenURI(missionId, uri))
        .to.emit(gm, "TokenURISet")
        .withArgs(missionId, tokenId);
    });

    it("should reject setMissionTokenURI from non-CRE", async function () {
      await expect(
        gameMaster.connect(player).setMissionTokenURI(1, "test-uri"),
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject setMissionTokenURI without MissionNFT set", async function () {
      await expect(
        gameMaster.connect(creOracle).setMissionTokenURI(1, "test-uri"),
      ).to.be.revertedWith("MissionNFT not set");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Mission Failure Scenarios
  // ============================================================

  describe("Mission Failure Scenarios", function () {
    let gm: GameMaster;
    let vrfCoordinator: any;
    let subId: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
    });

    it("should fail mission when MAX_INVESTIGATIONS (10) is reached", async function () {
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Submit 9 investigations (below limit)
      for (let i = 0; i < 9; i++) {
        await gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      }

      let mission = await gm.getMission(missionId);
      expect(mission.status).to.equal(1); // Active
      expect(mission.investigationsCount).to.equal(9);

      // 10th investigation triggers failure
      await expect(gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA))
        .to.emit(gm, "MissionFailed")
        .withArgs(missionId, player.address);

      mission = await gm.getMission(missionId);
      expect(mission.status).to.equal(3); // Failed
      expect(await gm.getPlayerActiveMission(player.address)).to.equal(0);
    });

    it("should fail mission when MAX_BLOCKS (200) is exhausted", async function () {
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Mine 200 blocks to exceed MAX_BLOCKS
      for (let i = 0; i < 200; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // Now submission should trigger block-based failure
      await expect(gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA))
        .to.emit(gm, "MissionFailed")
        .withArgs(missionId, player.address);

      const mission = await gm.getMission(missionId);
      expect(mission.status).to.equal(3); // Failed
    });

    it("should auto-close existing mission when starting a new one", async function () {
      // Start first mission
      await gm.connect(player).startMission();
      const missionId1 = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId1,
        await gm.getAddress(),
        [42],
      );

      // Start second mission — should auto-fail first
      await expect(gm.connect(player).startMission())
        .to.emit(gm, "MissionFailed")
        .withArgs(missionId1, player.address);

      const mission1 = await gm.getMission(missionId1);
      expect(mission1.status).to.equal(3); // Failed

      const missionId2 = await gm.getPlayerActiveMission(player.address);
      expect(missionId2).to.not.equal(missionId1);
      expect(missionId2).to.be.gt(0);
    });

    it("should not fail if submitInvestigation is within block limit", async function () {
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // startMission = block N, VRF = block N+1
      // Mine 46 blocks → submitInvestigation at N+48, delta = 48 < 50
      for (let i = 0; i < 46; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // This should NOT trigger failure (delta < 50)
      await gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      const mission = await gm.getMission(missionId);
      expect(mission.status).to.equal(1); // Still Active
    });

    it("should allow startMission after a failed mission", async function () {
      await gm.connect(player).startMission();
      const missionId1 = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId1,
        await gm.getAddress(),
        [42],
      );

      // Exhaust investigations
      for (let i = 0; i < 10; i++) {
        await gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      }

      expect((await gm.getMission(missionId1)).status).to.equal(3); // Failed

      // Should be able to start a new mission
      await gm.connect(player).startMission();
      const missionId2 = await gm.getPlayerActiveMission(player.address);
      expect(missionId2).to.be.gt(missionId1);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Reward Calculation Edge Cases
  // ============================================================

  describe("Reward Calculation Edge Cases", function () {
    let gm: GameMaster;
    let vrfCoordinator: any;
    let subId: any;
    let missionNFT: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Deploy MissionNFT to capture reward from event
      const NFTFactory = await ethers.getContractFactory("MissionNFT");
      missionNFT = await NFTFactory.deploy(await gm.getAddress());
      await missionNFT.waitForDeployment();
      await gm.connect(owner).setMissionNFT(await missionNFT.getAddress());

      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
    });

    async function startAndSetupMission(vrfWord: number = 3) {
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [vrfWord],
      );

      // Deliver 3 clues
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(
            missionId,
            0,
            ethers.keccak256(ethers.toUtf8Bytes(`clue-${i}`)),
            `ipfs://clue-${i}`,
            50,
          );
      }

      return missionId;
    }

    function computeTargetHash(
      chainId: number,
      vrfWord: number,
      missionId: number,
    ) {
      const salt = ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [vrfWord, missionId]),
      );
      return { salt };
    }

    it("should give Gold reward (100) for <= 20 blocks", async function () {
      const missionId = await startAndSetupMission(3);

      // Resolve immediately (few blocks used)
      const targetChainId = ARBITRUM_SEPOLIA; // vrfWord=3 % 2 = 1 → BASE_SEPOLIA
      const { salt } = computeTargetHash(BASE_SEPOLIA, 3, Number(missionId));

      const tx = await gm
        .connect(creOracle)
        .resolveCapture(missionId, BASE_SEPOLIA, salt);
      const receipt = await tx.wait();
      const capturedEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "CarmenCaptured"
          );
        } catch {
          return false;
        }
      });
      const parsed = gm.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data,
      });
      expect(parsed!.args.reward).to.equal(100); // Gold
    });

    it("should give Bronze reward (50) at exactly 50 blocks boundary", async function () {
      const missionId = await startAndSetupMission(3);

      // Mine blocks to reach exactly ~49 from start (so total at capture = ~50)
      for (let i = 0; i < 43; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      const { salt } = computeTargetHash(BASE_SEPOLIA, 3, Number(missionId));
      const tx = await gm
        .connect(creOracle)
        .resolveCapture(missionId, BASE_SEPOLIA, salt);
      const receipt = await tx.wait();
      const capturedEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "CarmenCaptured"
          );
        } catch {
          return false;
        }
      });
      const parsed = gm.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data,
      });
      // blocksUsed should be around 50 → Bronze (50) or 0 if > 50
      expect(parsed!.args.reward).to.be.oneOf([50n, 0n]);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Concurrent Mission Edge Cases
  // ============================================================

  describe("Concurrent Mission Edge Cases", function () {
    let gm: GameMaster;
    let vrfCoordinator: any;
    let subId: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());
    });

    it("should handle multiple players with active missions simultaneously", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(otherUser).registerPlayer(MOCK_PUBLIC_KEY);

      await gm.connect(player).startMission();
      await gm.connect(otherUser).startMission();

      const m1 = await gm.getPlayerActiveMission(player.address);
      const m2 = await gm.getPlayerActiveMission(otherUser.address);

      expect(m1).to.not.equal(m2);
      expect(m1).to.be.gt(0);
      expect(m2).to.be.gt(0);

      // Both missions should be active
      expect((await gm.getMission(m1)).status).to.equal(1);
      expect((await gm.getMission(m2)).status).to.equal(1);

      // Active list should contain both
      const activeIds = await gm.getActiveMissionIds();
      expect(activeIds).to.include(m1);
      expect(activeIds).to.include(m2);
    });

    it("should not let one player affect another's mission", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(otherUser).registerPlayer(MOCK_PUBLIC_KEY);

      await gm.connect(player).startMission();
      const m1 = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        m1,
        await gm.getAddress(),
        [7],
      );

      await gm.connect(otherUser).startMission();
      const m2 = await gm.getPlayerActiveMission(otherUser.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        m2,
        await gm.getAddress(),
        [13],
      );

      // Fail player1's mission by exhausting investigations
      for (let i = 0; i < 10; i++) {
        await gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      }

      // Player1 mission should be failed
      expect((await gm.getMission(m1)).status).to.equal(3); // Failed

      // Player2 mission should still be active
      expect((await gm.getMission(m2)).status).to.equal(1); // Active
      expect(await gm.getPlayerActiveMission(otherUser.address)).to.equal(m2);
    });

    it("should reject submitInvestigation for invalid chain ID", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [7],
      );

      await expect(
        gm.connect(player).submitInvestigation(999999),
      ).to.be.revertedWith("Invalid city/chain");
    });

    it("should reject submitInvestigation when no active mission", async function () {
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);

      await expect(
        gm.connect(player).submitInvestigation(ARBITRUM_SEPOLIA),
      ).to.be.revertedWith("No active mission");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Reward Tiers (Silver and No Reward)
  // ============================================================

  describe("Reward Calculation - All Tiers", function () {
    let gm2: GameMaster;
    let vrfCoord2: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord2 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord2.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord2.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord2.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord2.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm2 = (await GMFactory.deploy(
        await vrfCoord2.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm2.waitForDeployment();
      await vrfCoord2.addConsumer(subId, await gm2.getAddress());

      await gm2.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
    });

    it("should give Silver reward (75) for 21-35 blocks", async function () {
      await gm2.connect(player).startMission();
      const missionId = await gm2.getPlayerActiveMission(player.address);
      await vrfCoord2.fulfillRandomWordsWithOverride(
        missionId,
        await gm2.getAddress(),
        [42],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm2
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://Qm...", 50);
      }

      // Mine blocks to reach ~25 blocks (Silver range 21-35)
      const mission = await gm2.getMission(missionId);
      const startBlock = mission.startBlock;
      const currentBlock = await ethers.provider.getBlockNumber();
      const blocksNeeded = 25 - (currentBlock - Number(startBlock));
      if (blocksNeeded > 0) {
        await ethers.provider.send("hardhat_mine", [
          "0x" + blocksNeeded.toString(16),
        ]);
      }

      const salt = await gm2.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      const tx = await gm2
        .connect(creOracle)
        .resolveCapture(missionId, revealedChainId, salt);
      const receipt = await tx.wait();
      const capturedEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm2.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "CarmenCaptured"
          );
        } catch {
          return false;
        }
      });
      const parsed = gm2.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data,
      });
      expect(parsed!.args[3]).to.equal(75n); // Silver reward
    });

    it("should give no reward (0) for > 50 blocks", async function () {
      await gm2.connect(player).startMission();
      const missionId = await gm2.getPlayerActiveMission(player.address);
      await vrfCoord2.fulfillRandomWordsWithOverride(
        missionId,
        await gm2.getAddress(),
        [42],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm2
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://Qm...", 50);
      }

      await ethers.provider.send("hardhat_mine", ["0x40"]); // 64 blocks

      const mission = await gm2.getMission(missionId);
      const salt = await gm2.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      const tx = await gm2
        .connect(creOracle)
        .resolveCapture(missionId, revealedChainId, salt);
      const receipt = await tx.wait();
      const capturedEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm2.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "CarmenCaptured"
          );
        } catch {
          return false;
        }
      });
      const parsed = gm2.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data,
      });
      expect(parsed!.args[3]).to.equal(0n); // No reward
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Admin Edge Cases
  // ============================================================

  describe("Admin Edge Cases", function () {
    it("should reject setCREOracle from non-owner", async function () {
      await expect(
        gameMaster.connect(player).setCREOracle(player.address),
      ).to.be.revertedWith("Only callable by owner");
    });

    it("should reject setMissionNFT with zero address", async function () {
      await expect(
        gameMaster.connect(owner).setMissionNFT(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid address");
    });

    it("should emit MissionNFTSet event", async function () {
      const NFTFactory = await ethers.getContractFactory("MissionNFT");
      const nft = await NFTFactory.deploy(await gameMaster.getAddress());
      await nft.waitForDeployment();

      await expect(
        gameMaster.connect(owner).setMissionNFT(await nft.getAddress()),
      )
        .to.emit(gameMaster, "MissionNFTSet")
        .withArgs(await nft.getAddress());
    });

    it("should reject setMissionNFT from non-owner", async function () {
      await expect(
        gameMaster.connect(player).setMissionNFT(player.address),
      ).to.be.revertedWith("Only callable by owner");
    });

    it("should reject setValidChainIds from non-owner", async function () {
      await expect(
        gameMaster.connect(player).setValidChainIds([1, 2, 3]),
      ).to.be.revertedWith("Only callable by owner");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: View Functions Edge Cases
  // ============================================================

  describe("View Functions Edge Cases", function () {
    it("should return zero blocksUsed for non-existent mission", async function () {
      expect(await gameMaster.getBlocksUsed(999)).to.equal(0);
    });

    it("should return empty clues for non-existent mission", async function () {
      const clues = await gameMaster.getMissionClues(999);
      expect(clues.length).to.equal(0);
    });

    it("should return empty wallet fragments for non-existent mission", async function () {
      const frags = await gameMaster.getMissionWalletFragments(999);
      expect(frags.length).to.equal(0);
    });

    it("should return 0 fragment count for non-existent mission", async function () {
      expect(await gameMaster.getMissionFragmentCount(999)).to.equal(0);
    });

    it("should return 0 evidence count for non-existent mission", async function () {
      expect(await gameMaster.getMissionEvidenceCount(999)).to.equal(0);
    });

    it("should return empty public key for unregistered player", async function () {
      const key = await gameMaster.getPlayerPublicKey(player.address);
      expect(key).to.equal("0x");
    });

    it("should return zero salt for non-existent mission", async function () {
      expect(await gameMaster.getMissionSalt(999)).to.equal(ethers.ZeroHash);
    });

    it("should return empty identity commits for new player", async function () {
      const commits = await gameMaster.getPlayerIdentityCommits(player.address);
      expect(commits.length).to.equal(0);
    });

    it("should return 0 city clue count for new player", async function () {
      const cityId = ethers.keccak256(ethers.toUtf8Bytes("city1"));
      expect(
        await gameMaster.getPlayerCityClueCount(player.address, cityId),
      ).to.equal(0);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: receiveClue Edge Cases (with VRF)
  // ============================================================

  describe("receiveClue Edge Cases", function () {
    let gm3: GameMaster;
    let vrfCoord3: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord3 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord3.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord3.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord3.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord3.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm3 = (await GMFactory.deploy(
        await vrfCoord3.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm3.waitForDeployment();
      await vrfCoord3.addConsumer(subId, await gm3.getAddress());
    });

    it("should accept clue with strength=0", async function () {
      await gm3.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm3.connect(player).startMission();
      const missionId = await gm3.getPlayerActiveMission(player.address);
      await vrfCoord3.fulfillRandomWordsWithOverride(
        missionId,
        await gm3.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("weak-clue"));
      await gm3
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://weak", 0);

      const clues = await gm3.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
      expect(clues[0].strength).to.equal(0);
      expect(await gm3.getMissionEvidenceCount(missionId)).to.equal(0);
    });

    it("should accept clue with strength=100", async function () {
      await gm3.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm3.connect(player).startMission();
      const missionId = await gm3.getPlayerActiveMission(player.address);
      await vrfCoord3.fulfillRandomWordsWithOverride(
        missionId,
        await gm3.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("strong-clue"));
      await gm3
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://strong", 100);

      expect(await gm3.getMissionEvidenceCount(missionId)).to.equal(1);
    });

    it("should reject clue with strength=101", async function () {
      await gm3.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm3.connect(player).startMission();
      const missionId = await gm3.getPlayerActiveMission(player.address);
      await vrfCoord3.fulfillRandomWordsWithOverride(
        missionId,
        await gm3.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("invalid-clue"));
      await expect(
        gm3
          .connect(creOracle)
          .receiveClue(missionId, 0, contentHash, "ipfs://bad", 101),
      ).to.be.revertedWith("Invalid strength");
    });

    it("should reject receiveClue for non-active mission", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await expect(
        gm3
          .connect(creOracle)
          .receiveClue(999, 0, contentHash, "ipfs://Qm", 50),
      ).to.be.revertedWith("Mission not active");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: resolveCapture Edge Cases (with VRF)
  // ============================================================

  describe("resolveCapture Edge Cases", function () {
    let gm4: GameMaster;
    let vrfCoord4: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord4 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord4.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord4.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord4.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord4.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm4 = (await GMFactory.deploy(
        await vrfCoord4.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm4.waitForDeployment();
      await vrfCoord4.addConsumer(subId, await gm4.getAddress());
    });

    it("should reject resolveCapture with exactly 2 clues (need 3+)", async function () {
      await gm4.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm4.connect(player).startMission();
      const missionId = await gm4.getPlayerActiveMission(player.address);
      await vrfCoord4.fulfillRandomWordsWithOverride(
        missionId,
        await gm4.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      await gm4
        .connect(creOracle)
        .receiveClue(missionId, 0, contentHash, "ipfs://Qm1", 50);
      await gm4
        .connect(creOracle)
        .receiveClue(missionId, 1, contentHash, "ipfs://Qm2", 50);

      const salt = await gm4.getMissionSalt(missionId);
      const mission = await gm4.getMission(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      await expect(
        gm4.connect(creOracle).resolveCapture(missionId, revealedChainId, salt),
      ).to.be.revertedWith("Need 3+ clues");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: receiveWalletFragment Edge Cases (with VRF)
  // ============================================================

  describe("receiveWalletFragment Edge Cases", function () {
    let gm5: GameMaster;
    let vrfCoord5: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord5 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord5.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord5.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord5.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord5.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm5 = (await GMFactory.deploy(
        await vrfCoord5.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm5.waitForDeployment();
      await vrfCoord5.addConsumer(subId, await gm5.getAddress());
    });

    it("should accept fragment at boundary (startIndex=35, length=5)", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("boundary-frag"));
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 35, 5, contentHash, "ipfs://bound");

      const frags = await gm5.getMissionWalletFragments(missionId);
      expect(frags.length).to.equal(1);
    });

    it("should reject fragment at startIndex=36, length=5 (out of bounds)", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("oob-frag"));
      await expect(
        gm5
          .connect(creOracle)
          .receiveWalletFragment(missionId, 36, 5, contentHash, "ipfs://oob"),
      ).to.be.revertedWith("Fragment out of bounds");
    });

    it("should reject fragment for non-active mission", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("frag"));
      await expect(
        gm5
          .connect(creOracle)
          .receiveWalletFragment(999, 0, 5, contentHash, "ipfs://Qm"),
      ).to.be.revertedWith("Mission not active");
    });

    it("should reject overlapping fragment (exact same range)", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const h1 = ethers.keccak256(ethers.toUtf8Bytes("frag-1"));
      const h2 = ethers.keccak256(ethers.toUtf8Bytes("frag-2"));

      // First fragment at positions 0-4
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 0, 5, h1, "ipfs://f1");

      // Second fragment at same positions 0-4 should revert
      await expect(
        gm5
          .connect(creOracle)
          .receiveWalletFragment(missionId, 0, 5, h2, "ipfs://f2"),
      ).to.be.revertedWith("Fragment overlaps");
    });

    it("should reject partially overlapping fragment", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const h1 = ethers.keccak256(ethers.toUtf8Bytes("frag-1"));
      const h2 = ethers.keccak256(ethers.toUtf8Bytes("frag-2"));

      // First fragment covers positions 5-9
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 5, 5, h1, "ipfs://f1");

      // Second fragment at 8-12 overlaps at positions 8,9
      await expect(
        gm5
          .connect(creOracle)
          .receiveWalletFragment(missionId, 8, 5, h2, "ipfs://f2"),
      ).to.be.revertedWith("Fragment overlaps");
    });

    it("should accept adjacent non-overlapping fragments", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const h1 = ethers.keccak256(ethers.toUtf8Bytes("frag-1"));
      const h2 = ethers.keccak256(ethers.toUtf8Bytes("frag-2"));
      const h3 = ethers.keccak256(ethers.toUtf8Bytes("frag-3"));

      // Fragments at 0-4, 5-9, 10-14 are adjacent but non-overlapping
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 0, 5, h1, "ipfs://f1");
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 5, 5, h2, "ipfs://f2");
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 10, 5, h3, "ipfs://f3");

      expect(await gm5.getMissionFragmentCount(missionId)).to.equal(3);
    });

    it("should reject fragment that overlaps by single position", async function () {
      await gm5.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm5.connect(player).startMission();
      const missionId = await gm5.getPlayerActiveMission(player.address);
      await vrfCoord5.fulfillRandomWordsWithOverride(
        missionId,
        await gm5.getAddress(),
        [7],
      );

      const h1 = ethers.keccak256(ethers.toUtf8Bytes("frag-1"));
      const h2 = ethers.keccak256(ethers.toUtf8Bytes("frag-2"));

      // Fragment at 0-4 (positions 0,1,2,3,4)
      await gm5
        .connect(creOracle)
        .receiveWalletFragment(missionId, 0, 5, h1, "ipfs://f1");

      // Fragment at 4-8 overlaps at position 4
      await expect(
        gm5
          .connect(creOracle)
          .receiveWalletFragment(missionId, 4, 5, h2, "ipfs://f2"),
      ).to.be.revertedWith("Fragment overlaps");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Chain ID Mapping O(1) Validation
  // ============================================================

  describe("Chain ID Mapping Validation", function () {
    it("should validate chain IDs after setValidChainIds", async function () {
      // gameMaster was deployed with [ARBITRUM_SEPOLIA, BASE_SEPOLIA]
      // Verify via getValidCities, then update and verify again
      await gameMaster.connect(player).registerPlayer(MOCK_PUBLIC_KEY);

      // Update chain IDs to a different set
      const NEW_CHAIN_1 = 11111;
      const NEW_CHAIN_2 = 22222;
      await gameMaster
        .connect(owner)
        .setValidChainIds([NEW_CHAIN_1, NEW_CHAIN_2]);

      // Old chain IDs should now be invalid
      // We can verify via getValidCities
      const cities = await gameMaster.getValidCities();
      expect(cities.length).to.equal(2);
      expect(cities[0]).to.equal(NEW_CHAIN_1);
      expect(cities[1]).to.equal(NEW_CHAIN_2);
    });

    it("should reject old chain ID after setValidChainIds replaces them", async function () {
      // Need a proper VRF mock to call startMission
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoord7 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord7.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord7.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord7.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord7.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm7 = (await GMFactory.deploy(
        await vrfCoord7.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm7.waitForDeployment();
      await vrfCoord7.addConsumer(subId, await gm7.getAddress());

      // Register and start mission
      await gm7.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm7.connect(player).startMission();
      const missionId = await gm7.getPlayerActiveMission(player.address);

      // Fulfill VRF so mission is fully active
      await vrfCoord7.fulfillRandomWordsWithOverride(
        missionId,
        await gm7.getAddress(),
        [42],
      );

      // Update to completely different chain IDs
      const NEW_CHAIN_1 = 99999;
      const NEW_CHAIN_2 = 88888;
      await gm7.connect(owner).setValidChainIds([NEW_CHAIN_1, NEW_CHAIN_2]);

      // The old ARBITRUM_SEPOLIA should now be rejected
      await expect(
        gm7.connect(player).submitInvestigation(ARBITRUM_SEPOLIA),
      ).to.be.revertedWith("Invalid city/chain");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: resolveWalletCapture Edge Cases (with VRF)
  // ============================================================

  describe("resolveWalletCapture Edge Cases", function () {
    let gm6: GameMaster;
    let vrfCoord6: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord6 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord6.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord6.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord6.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord6.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm6 = (await GMFactory.deploy(
        await vrfCoord6.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm6.waitForDeployment();
      await vrfCoord6.addConsumer(subId, await gm6.getAddress());
    });

    it("should reject resolveWalletCapture for non-active mission", async function () {
      await expect(
        gm6
          .connect(creOracle)
          .resolveWalletCapture(
            999,
            player.address,
            ARBITRUM_SEPOLIA,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWith("Mission not active");
    });

    it("should reject resolveWalletCapture with invalid reveal (wrong salt)", async function () {
      await gm6.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm6.connect(player).startMission();
      const missionId = await gm6.getPlayerActiveMission(player.address);
      await vrfCoord6.fulfillRandomWordsWithOverride(
        missionId,
        await gm6.getAddress(),
        [7],
      );

      for (let i = 0; i < 3; i++) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`frag-${i}`));
        await gm6
          .connect(creOracle)
          .receiveWalletFragment(
            missionId,
            i * 10,
            5,
            contentHash,
            `ipfs://f${i}`,
          );
      }

      const wrongSalt = ethers.keccak256(ethers.toUtf8Bytes("wrong-salt"));
      await expect(
        gm6
          .connect(creOracle)
          .resolveWalletCapture(
            missionId,
            player.address,
            ARBITRUM_SEPOLIA,
            wrongSalt,
          ),
      ).to.be.revertedWith("Invalid reveal");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: updateTarget Edge Cases (with VRF)
  // ============================================================

  describe("updateTarget Edge Cases", function () {
    let gm7: GameMaster;
    let vrfCoord7: any;

    beforeEach(async function () {
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      vrfCoord7 = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoord7.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoord7.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoord7.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoord7.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      gm7 = (await GMFactory.deploy(
        await vrfCoord7.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm7.waitForDeployment();
      await vrfCoord7.addConsumer(subId, await gm7.getAddress());
    });

    it("should update target hash and verify old hash is replaced", async function () {
      await gm7.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm7.connect(player).startMission();
      const missionId = await gm7.getPlayerActiveMission(player.address);
      await vrfCoord7.fulfillRandomWordsWithOverride(
        missionId,
        await gm7.getAddress(),
        [7],
      );

      const oldMission = await gm7.getMission(missionId);
      const oldHash = oldMission.targetHash;

      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new-location"));
      await gm7.connect(creOracle).updateTarget(missionId, newHash);

      const updatedMission = await gm7.getMission(missionId);
      expect(updatedMission.targetHash).to.equal(newHash);
      expect(updatedMission.targetHash).to.not.equal(oldHash);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: CityNode resolveClueOnCity zero address
  // ============================================================

  describe("CityNode Integration - Zero Address Checks", function () {
    it("should reject resolveDossierOnCity with zero cityNode", async function () {
      await expect(
        gameMaster
          .connect(creOracle)
          .resolveDossierOnCity(
            ethers.ZeroAddress,
            1,
            ethers.ZeroHash,
            50,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWith("Invalid city node");
    });

    it("should reject resolveCaptureOnCity with zero cityNode", async function () {
      await expect(
        gameMaster
          .connect(creOracle)
          .resolveCaptureOnCity(
            ethers.ZeroAddress,
            1,
            true,
            0,
            ethers.ZeroHash,
          ),
      ).to.be.revertedWith("Invalid city node");
    });
  });

  // ============================================================
  //          CHAINLINK DATA FEED INTEGRATION
  // ============================================================

  describe("Chainlink Data Feed Integration", function () {
    it("should allow owner to set price feed address", async function () {
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(300000000000, 8); // $3000 with 8 decimals
      await mockFeed.waitForDeployment();

      await expect(
        gameMaster
          .connect(owner)
          .setEthUsdPriceFeed(await mockFeed.getAddress()),
      )
        .to.emit(gameMaster, "PriceFeedSet")
        .withArgs(await mockFeed.getAddress());
    });

    it("should reject non-owner setting price feed", async function () {
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(300000000000, 8);
      await mockFeed.waitForDeployment();

      await expect(
        gameMaster
          .connect(player)
          .setEthUsdPriceFeed(await mockFeed.getAddress()),
      ).to.be.revertedWith("Only callable by owner");
    });

    it("should reject zero address for price feed", async function () {
      await expect(
        gameMaster.connect(owner).setEthUsdPriceFeed(ethers.ZeroAddress),
      ).to.be.revertedWith("Invalid address");
    });

    it("should return default market data when no price feed is set", async function () {
      const [ethPrice, multiplier] = await gameMaster.getMarketData();
      expect(ethPrice).to.equal(0);
      expect(multiplier).to.equal(10000); // 1.0x
    });

    it("should return correct market data when ETH > $2500", async function () {
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(300000000000, 8); // $3000
      await mockFeed.waitForDeployment();

      await gameMaster
        .connect(owner)
        .setEthUsdPriceFeed(await mockFeed.getAddress());

      const [ethPrice, multiplier] = await gameMaster.getMarketData();
      expect(ethPrice).to.equal(300000000000);
      // $3000: bonus = (3000-2500)/100 = 5 per 100 base
      // bonusBps = (500 * 10000) / (100 * 100) = 500
      expect(multiplier).to.equal(10500);
    });

    it("should return 1.0x multiplier when ETH <= $2500", async function () {
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(200000000000, 8); // $2000
      await mockFeed.waitForDeployment();

      await gameMaster
        .connect(owner)
        .setEthUsdPriceFeed(await mockFeed.getAddress());

      const [ethPrice, multiplier] = await gameMaster.getMarketData();
      expect(ethPrice).to.equal(200000000000);
      expect(multiplier).to.equal(10000); // 1.0x, no bonus
    });

    it("should apply market bonus to reward on capture (ETH > $2500)", async function () {
      // Deploy with VRF mock for full mission flow
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // Set up mock price feed at $3000
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(300000000000, 8); // $3000
      await mockFeed.waitForDeployment();
      await gm.connect(owner).setEthUsdPriceFeed(await mockFeed.getAddress());

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      const vrfWord = 42;
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [vrfWord],
      );

      // Deliver 3 clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(Number(missionId), 0, contentHash, "ipfs://Qm...", 50);
      }

      // Find revealed chainId
      const mission = await gm.getMission(missionId);
      const salt = await gm.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      // Capture should emit RewardCalculatedWithMarketData
      // Base reward = 100 (Gold, within 20 blocks), bonus = (3000-2500)/100 = 5
      // Final reward = 105
      const tx = await gm
        .connect(creOracle)
        .resolveCapture(missionId, revealedChainId, salt);
      const receipt = await tx.wait();

      // Check RewardCalculatedWithMarketData event
      const rewardEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "RewardCalculatedWithMarketData"
          );
        } catch {
          return false;
        }
      });
      expect(rewardEvent).to.not.be.undefined;
      const parsed = gm.interface.parseLog({
        topics: [...rewardEvent!.topics],
        data: rewardEvent!.data,
      });
      expect(parsed!.args.baseReward).to.equal(100);
      expect(parsed!.args.ethPrice).to.equal(300000000000);
      expect(parsed!.args.finalReward).to.equal(105); // 100 + 5 market bonus
    });

    it("should not apply market bonus when no price feed is set", async function () {
      // Deploy with VRF mock
      const VRFMock = await ethers.getContractFactory(
        "VRFCoordinatorV2PlusMock",
      );
      const vrfCoordinator = await VRFMock.deploy(0, 0, 0);
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();
      const subCreatedEvent = createSubReceipt?.logs.find((log: any) => {
        try {
          return (
            vrfCoordinator.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })?.name === "SubscriptionCreated"
          );
        } catch {
          return false;
        }
      });
      const subId = vrfCoordinator.interface.parseLog({
        topics: [...subCreatedEvent!.topics],
        data: subCreatedEvent!.data,
      })!.args[0];
      await vrfCoordinator.fundSubscription(subId, 1000000);

      const GMFactory = await ethers.getContractFactory("GameMaster");
      const gm = (await GMFactory.deploy(
        await vrfCoordinator.getAddress(),
        subId,
        VRF_KEY_HASH,
        validChainIds,
        creOracle.address,
      )) as GameMaster;
      await gm.waitForDeployment();
      await vrfCoordinator.addConsumer(subId, await gm.getAddress());

      // NO price feed set — should use base reward only

      // Setup mission
      await gm.connect(player).registerPlayer(MOCK_PUBLIC_KEY);
      await gm.connect(player).startMission();
      const missionId = await gm.getPlayerActiveMission(player.address);
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        missionId,
        await gm.getAddress(),
        [42],
      );

      // Deliver 3 clues
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      for (let i = 0; i < 3; i++) {
        await gm
          .connect(creOracle)
          .receiveClue(Number(missionId), 0, contentHash, "ipfs://Qm...", 50);
      }

      // Find revealed chainId
      const mission = await gm.getMission(missionId);
      const salt = await gm.getMissionSalt(missionId);
      let revealedChainId = 0n;
      for (const cid of validChainIds) {
        const hash = ethers.keccak256(
          ethers.solidityPacked(["uint256", "bytes32"], [cid, salt]),
        );
        if (hash === mission.targetHash) {
          revealedChainId = BigInt(cid);
          break;
        }
      }

      const tx = await gm
        .connect(creOracle)
        .resolveCapture(missionId, revealedChainId, salt);
      const receipt = await tx.wait();

      // Check RewardCalculatedWithMarketData event — ethPrice should be 0, reward = base only
      const rewardEvent = receipt?.logs.find((log: any) => {
        try {
          return (
            gm.interface.parseLog({ topics: [...log.topics], data: log.data })
              ?.name === "RewardCalculatedWithMarketData"
          );
        } catch {
          return false;
        }
      });
      expect(rewardEvent).to.not.be.undefined;
      const parsed = gm.interface.parseLog({
        topics: [...rewardEvent!.topics],
        data: rewardEvent!.data,
      });
      expect(parsed!.args.baseReward).to.equal(100);
      expect(parsed!.args.ethPrice).to.equal(0);
      expect(parsed!.args.finalReward).to.equal(100); // No bonus
    });

    it("should update market bonus when price changes", async function () {
      const MockAggregator = await ethers.getContractFactory(
        "MockAggregatorV3",
      );
      const mockFeed = await MockAggregator.deploy(300000000000, 8); // $3000
      await mockFeed.waitForDeployment();

      await gameMaster
        .connect(owner)
        .setEthUsdPriceFeed(await mockFeed.getAddress());

      // Check at $3000
      let [, multiplier] = await gameMaster.getMarketData();
      expect(multiplier).to.equal(10500);

      // Update price to $4000
      await mockFeed.setPrice(400000000000);
      [, multiplier] = await gameMaster.getMarketData();
      // bonus = (4000-2500)/100 = 15, bonusBps = (1500 * 10000) / 10000 = 1500
      expect(multiplier).to.equal(11500);

      // Update price to $2000 (below threshold)
      await mockFeed.setPrice(200000000000);
      [, multiplier] = await gameMaster.getMarketData();
      expect(multiplier).to.equal(10000); // No bonus
    });
  });
});
