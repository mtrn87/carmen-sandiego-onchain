import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster, CityNode } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * End-to-end test simulating the full Carmen Sandiego game flow
 * using VRFCoordinatorV2_5Mock for local simulation.
 *
 * Flow: startMission → VRF callback → investigate (wrong) → clue →
 *       investigate (correct) → capture → rewards
 */
describe("Carmen Sandiego - Full Game E2E", function () {
  let gameMaster: GameMaster;
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
  beforeEach(async function () {
    [owner, creOracle, player] = await ethers.getSigners();

    // 1. Deploy VRF Mock (params: baseFee, gasPrice, weiPerUnitLink - not used in mock)
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
      subId,
      VRF_KEY_HASH,
      validChainIds,
      creOracle.address
    ) as GameMaster;
    await gameMaster.waitForDeployment();

    // 5. Add GameMaster as VRF consumer
    await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());

    // 6. Deploy CityNode contracts (simulating different chains locally)
    const CityNodeFactory = await ethers.getContractFactory("CityNode");

    cityTokyo = await CityNodeFactory.deploy("Tokyo", ARBITRUM_SEPOLIA, creOracle.address) as CityNode;
    cityParis = await CityNodeFactory.deploy("Paris", BASE_SEPOLIA, creOracle.address) as CityNode;
    cityLondon = await CityNodeFactory.deploy("London", XDC_APOTHEM, creOracle.address) as CityNode;
  });

  // ============================================================
  //  FULL GAME: Happy Path - Player finds Carmen
  // ============================================================
  describe("Happy Path: Player captures Carmen", function () {
    it("should complete a full game from start to capture", async function () {
      // --- STEP 1: Player starts a mission ---
      const startTx = await gameMaster.connect(player).startMission();
      const startReceipt = await startTx.wait();

      // Verify MissionStarted event
      const missionStartedEvent = startReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "MissionStarted";
        } catch { return false; }
      });
      expect(missionStartedEvent).to.not.be.undefined;

      const missionId = gameMaster.interface.parseLog({
        topics: [...missionStartedEvent!.topics],
        data: missionStartedEvent!.data
      })!.args[0];
      expect(missionId).to.equal(1);

      // Verify mission state
      let mission = await gameMaster.getMission(missionId);
      expect(mission.player).to.equal(player.address);
      expect(mission.status).to.equal(1); // MissionStatus.Active
      expect(mission.targetChainId).to.equal(0); // Not yet set (waiting for VRF)

      // --- STEP 2: VRF callback sets Carmen's location ---
      // We use fulfillRandomWordsWithOverride to control which city Carmen hides in
      // Random word that makes: word % 3 = 0 → Tokyo (index 0 = ARBITRUM_SEPOLIA)
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(
        1, // requestId (first request)
        gameMasterAddress,
        [3] // 3 % 3 = 0 → validChainIds[0] = ARBITRUM_SEPOLIA (Tokyo)
      );

      // Verify Carmen's location was set
      mission = await gameMaster.getMission(missionId);
      expect(mission.targetChainId).to.equal(ARBITRUM_SEPOLIA); // Tokyo!

      // --- STEP 3: CRE updates Carmen's presence on CityNode (Tokyo) ---
      await cityTokyo.connect(creOracle).updateCarmenPresence(missionId, true);
      expect(await cityTokyo.getCarmenStatus(missionId)).to.equal(true);
      expect(await cityParis.getCarmenStatus(missionId)).to.equal(false);
      expect(await cityLondon.getCarmenStatus(missionId)).to.equal(false);

      // --- STEP 4: Player investigates Paris (wrong!) ---
      const investigateTx = await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);
      const investigateReceipt = await investigateTx.wait();

      // Should emit InvestigationSubmitted (wrong city)
      const investigationEvent = investigateReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "InvestigationSubmitted";
        } catch { return false; }
      });
      expect(investigationEvent).to.not.be.undefined;

      mission = await gameMaster.getMission(missionId);
      expect(mission.investigationsCount).to.equal(1);

      // --- STEP 5: CRE delivers a false clue (player went to wrong city) ---
      const clueHash = ethers.keccak256(ethers.toUtf8Bytes("A witness saw Carmen boarding a flight..."));
      await gameMaster.connect(creOracle).receiveClue(
        missionId,
        0, // ClueType.Text
        clueHash,
        "", // no IPFS pointer for text
        "A witness saw someone in red near the Eiffel Tower, heading east...",
        false // false clue (misleading)
      );

      let clues = await gameMaster.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
      expect(clues[0].isTrue).to.equal(false);

      // --- STEP 6: Player investigates London (wrong again!) ---
      await gameMaster.connect(player).submitInvestigation(XDC_APOTHEM);

      mission = await gameMaster.getMission(missionId);
      expect(mission.investigationsCount).to.equal(2);

      // --- STEP 7: CRE delivers a true clue (hints toward Tokyo) ---
      const audioClueHash = ethers.keccak256(ethers.toUtf8Bytes("audio-clue-tokyo"));
      await gameMaster.connect(creOracle).receiveClue(
        missionId,
        1, // ClueType.Audio
        audioClueHash,
        "QmXyZ123audioIPFShash", // IPFS pointer for audio
        "",
        true // true clue (points to real location)
      );

      clues = await gameMaster.getMissionClues(missionId);
      expect(clues.length).to.equal(2);
      expect(clues[1].clueType).to.equal(1); // Audio
      expect(clues[1].isTrue).to.equal(true);
      expect(clues[1].ipfsPointer).to.equal("QmXyZ123audioIPFShash");

      // --- STEP 8: Player investigates Tokyo (CORRECT!) ---
      const captureTx = await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      const captureReceipt = await captureTx.wait();

      // Should emit CarmenCaptured
      const capturedEvent = captureReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "CarmenCaptured";
        } catch { return false; }
      });
      expect(capturedEvent).to.not.be.undefined;

      const capturedArgs = gameMaster.interface.parseLog({
        topics: [...capturedEvent!.topics],
        data: capturedEvent!.data
      })!.args;

      expect(capturedArgs[0]).to.equal(missionId); // missionId
      expect(capturedArgs[1]).to.equal(player.address); // player
      // capturedArgs[2] = blocksUsed
      // capturedArgs[3] = reward

      // --- STEP 9: Verify final state ---
      mission = await gameMaster.getMission(missionId);
      expect(mission.status).to.equal(2); // MissionStatus.Completed
      expect(mission.investigationsCount).to.equal(3);

      // Player can start a new mission
      expect(await gameMaster.getPlayerActiveMission(player.address)).to.equal(0);
    });
  });

  // ============================================================
  //  GAME OVER: Player fails the mission
  // ============================================================
  describe("Failure Path: Player runs out of attempts", function () {
    it("should fail mission after MAX_INVESTIGATIONS wrong guesses", async function () {
      // Start mission
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();

      // VRF sets Carmen in Tokyo
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);

      // Player guesses wrong 9 times (alternating between Paris and London)
      for (let i = 0; i < 9; i++) {
        const wrongCity = i % 2 === 0 ? BASE_SEPOLIA : XDC_APOTHEM;
        await gameMaster.connect(player).submitInvestigation(wrongCity);
      }

      let mission = await gameMaster.getMission(1);
      expect(mission.investigationsCount).to.equal(9);
      expect(mission.status).to.equal(1); // Still active

      // 10th wrong guess → mission fails
      const failTx = await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);
      const failReceipt = await failTx.wait();

      const failedEvent = failReceipt?.logs.find((log: any) => {
        try {
          return gameMaster.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "MissionFailed";
        } catch { return false; }
      });
      expect(failedEvent).to.not.be.undefined;

      mission = await gameMaster.getMission(1);
      expect(mission.status).to.equal(3); // MissionStatus.Failed
      expect(await gameMaster.getPlayerActiveMission(player.address)).to.equal(0);
    });
  });

  // ============================================================
  //  REWARD TIERS
  // ============================================================
  describe("Reward System", function () {
    it("should emit correct reward based on blocks used", async function () {
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);

      // Capture immediately → Gold (very few blocks)
      const captureTx = await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
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

      // First guess correct → very few blocks → Gold (100 points)
      expect(args[3]).to.equal(100);
    });
  });

  // ============================================================
  //  EDGE CASES
  // ============================================================
  describe("Edge Cases", function () {
    it("should not allow starting two missions at once", async function () {
      await gameMaster.connect(player).startMission();
      await expect(
        gameMaster.connect(player).startMission()
      ).to.be.revertedWith("Already on a mission");
    });

    it("should allow new mission after completing previous one", async function () {
      // Mission 1: start and capture
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);
      await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);

      // Mission 2: should work
      await gameMaster.connect(player).startMission();
      const mission2 = await gameMaster.getMission(2);
      expect(mission2.player).to.equal(player.address);
      expect(mission2.status).to.equal(1); // Active
    });

    it("should reject investigation on invalid chain", async function () {
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);

      await expect(
        gameMaster.connect(player).submitInvestigation(999999)
      ).to.be.revertedWith("Invalid city/chain");
    });

    it("should allow new mission after failed one", async function () {
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);

      // Fail the mission (10 wrong guesses)
      for (let i = 0; i < 10; i++) {
        await gameMaster.connect(player).submitInvestigation(BASE_SEPOLIA);
      }

      // Should be able to start again
      await gameMaster.connect(player).startMission();
      const mission2 = await gameMaster.getMission(2);
      expect(mission2.status).to.equal(1);
    });
  });

  // ============================================================
  //  MULTI-PLAYER
  // ============================================================
  describe("Multi-Player", function () {
    it("should support multiple players simultaneously", async function () {
      const [, , , player2] = await ethers.getSigners();

      // Both players start missions
      await gameMaster.connect(player).startMission();
      await gameMaster.connect(player2).startMission();

      const gameMasterAddress = await gameMaster.getAddress();

      // VRF: Player 1 → Tokyo, Player 2 → Paris
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]); // 3%3=0 → Tokyo
      await vrfCoordinator.fulfillRandomWordsWithOverride(2, gameMasterAddress, [4]); // 4%3=1 → Paris

      const mission1 = await gameMaster.getMission(1);
      const mission2 = await gameMaster.getMission(2);

      expect(mission1.targetChainId).to.equal(ARBITRUM_SEPOLIA); // Tokyo
      expect(mission2.targetChainId).to.equal(BASE_SEPOLIA); // Paris

      // Player 1 captures in Tokyo
      await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);
      // Player 2 captures in Paris
      await gameMaster.connect(player2).submitInvestigation(BASE_SEPOLIA);

      expect((await gameMaster.getMission(1)).status).to.equal(2); // Completed
      expect((await gameMaster.getMission(2)).status).to.equal(2); // Completed
    });
  });

  // ============================================================
  //  CITYNODE INTEGRATION
  // ============================================================
  describe("CityNode Integration", function () {
    it("should track Carmen moving between cities", async function () {
      await gameMaster.connect(player).startMission();
      const gameMasterAddress = await gameMaster.getAddress();
      await vrfCoordinator.fulfillRandomWordsWithOverride(1, gameMasterAddress, [3]);

      // CRE places Carmen in Tokyo
      await cityTokyo.connect(creOracle).updateCarmenPresence(1, true);
      expect(await cityTokyo.getCarmenStatus(1)).to.equal(true);

      // Carmen moves from Tokyo to London
      await cityTokyo.connect(creOracle).updateCarmenPresence(1, false);
      await cityLondon.connect(creOracle).updateCarmenPresence(1, true);

      expect(await cityTokyo.getCarmenStatus(1)).to.equal(false);
      expect(await cityLondon.getCarmenStatus(1)).to.equal(true);
    });
  });
});