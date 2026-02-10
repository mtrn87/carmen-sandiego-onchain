import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster, GameMasterProxy } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GameMasterProxy", function () {
  let gameMaster: GameMaster;
  let proxy: GameMasterProxy;
  let vrfCoordinator: any;

  let owner: SignerWithAddress;
  let forwarder: SignerWithAddress;
  let player: SignerWithAddress;
  let nonForwarder: SignerWithAddress;

  const ARBITRUM_SEPOLIA = 421614;
  const BASE_SEPOLIA = 84532;
  const XDC_APOTHEM = 51;
  const validChainIds = [ARBITRUM_SEPOLIA, BASE_SEPOLIA, XDC_APOTHEM];
  const VRF_KEY_HASH = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const MOCK_PUBLIC_KEY = "0x04" + "ab".repeat(64);

  function computeTargetHash(chainId: number, vrfWord: number, missionId: number) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["uint256", "uint256"], [vrfWord, missionId])
    );
    const hash = ethers.keccak256(
      ethers.solidityPacked(["uint256", "bytes32"], [chainId, salt])
    );
    return { hash, salt };
  }

  async function setupMission(p: SignerWithAddress, vrfWord: number = 3) {
    await gameMaster.connect(p).registerPlayer(MOCK_PUBLIC_KEY);
    await gameMaster.connect(p).startMission();
    const gmAddr = await gameMaster.getAddress();
    const missionId = await gameMaster.getPlayerActiveMission(p.address);
    await vrfCoordinator.fulfillRandomWordsWithOverride(missionId, gmAddr, [vrfWord]);
    return missionId;
  }

  async function deliverClueViaProxy(missionId: number | bigint, clueType: number = 0) {
    const clueText = `clue-${missionId}-${clueType}`;
    const contentHash = ethers.keccak256(ethers.toUtf8Bytes(clueText));
    const ipfs = "QmTestClue";

    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint8", "bytes32", "string"],
      [missionId, clueType, contentHash, ipfs]
    );
    const report = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "bytes"],
      [1, data] // ACTION_RECEIVE_CLUE = 1
    );

    // Simulate forwarder calling onReport with empty metadata
    const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes10", "address"],
      [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
    );

    await proxy.connect(forwarder).onReport(metadata, report);
  }

  beforeEach(async function () {
    [owner, forwarder, player, nonForwarder] = await ethers.getSigners();

    // Deploy VRF Mock
    const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2PlusMock");
    vrfCoordinator = await VRFMock.deploy(0, 0, 0);
    await vrfCoordinator.waitForDeployment();

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
    await vrfCoordinator.fundSubscription(subId, 1000000);

    // Deploy GameMaster with a placeholder CRE oracle (will be set to proxy)
    const GameMasterFactory = await ethers.getContractFactory("GameMaster");
    gameMaster = await GameMasterFactory.deploy(
      await vrfCoordinator.getAddress(),
      subId, VRF_KEY_HASH, validChainIds, owner.address // temp CRE oracle
    ) as GameMaster;
    await gameMaster.waitForDeployment();
    await vrfCoordinator.addConsumer(subId, await gameMaster.getAddress());

    // Deploy GameMasterProxy
    const ProxyFactory = await ethers.getContractFactory("GameMasterProxy");
    proxy = await ProxyFactory.deploy(
      forwarder.address,
      await gameMaster.getAddress()
    ) as GameMasterProxy;
    await proxy.waitForDeployment();

    // Set proxy as CRE oracle on GameMaster
    await gameMaster.connect(owner).setCREOracle(await proxy.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct gameMaster address", async function () {
      expect(await proxy.gameMaster()).to.equal(await gameMaster.getAddress());
    });

    it("should set correct forwarder address", async function () {
      expect(await proxy.getForwarderAddress()).to.equal(forwarder.address);
    });

    it("should revert with zero forwarder address", async function () {
      const ProxyFactory = await ethers.getContractFactory("GameMasterProxy");
      await expect(
        ProxyFactory.deploy(ethers.ZeroAddress, await gameMaster.getAddress())
      ).to.be.revertedWithCustomError(proxy, "InvalidForwarderAddress");
    });
  });

  describe("Access Control", function () {
    it("should reject onReport from non-forwarder", async function () {
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "string"],
        [1, 0, ethers.ZeroHash, ""]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [1, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(nonForwarder).onReport(metadata, report)
      ).to.be.revertedWithCustomError(proxy, "InvalidSender");
    });
  });

  describe("ACTION_RECEIVE_CLUE (1)", function () {
    it("should forward clue to GameMaster", async function () {
      const missionId = await setupMission(player, 3);
      await deliverClueViaProxy(missionId, 0);

      const clues = await gameMaster.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
      expect(clues[0].clueType).to.equal(0);
    });

    it("should emit ActionForwarded event", async function () {
      const missionId = await setupMission(player, 3);

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "string"],
        [missionId, 0, contentHash, "QmTest"]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [1, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(proxy, "ActionForwarded")
        .withArgs(1, missionId);
    });
  });

  describe("ACTION_RESOLVE_CAPTURE (2)", function () {
    it("should forward capture to GameMaster via proxy", async function () {
      const missionId = await setupMission(player, 3);

      // Deliver 3 clues via proxy
      await deliverClueViaProxy(missionId, 0);
      await deliverClueViaProxy(missionId, 1);
      await deliverClueViaProxy(missionId, 2);

      // Resolve capture via proxy
      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [missionId, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [2, data] // ACTION_RESOLVE_CAPTURE = 2
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await proxy.connect(forwarder).onReport(metadata, report);

      const mission = await gameMaster.getMission(missionId);
      expect(mission.status).to.equal(2); // Completed
    });
  });

  describe("ACTION_UPDATE_TARGET (3)", function () {
    it("should forward updateTarget to GameMaster via proxy", async function () {
      const missionId = await setupMission(player, 3);

      const newHash = ethers.keccak256(ethers.toUtf8Bytes("new-target"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"],
        [missionId, newHash]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [3, data] // ACTION_UPDATE_TARGET = 3
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await proxy.connect(forwarder).onReport(metadata, report);

      const mission = await gameMaster.getMission(missionId);
      expect(mission.targetHash).to.equal(newHash);
    });
  });

  describe("Unknown Action", function () {
    it("should revert on unknown action code", async function () {
      const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [99, data] // Unknown action
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWithCustomError(proxy, "UnknownAction");
    });
  });

  describe("Full Flow via Proxy", function () {
    it("should complete entire game flow through proxy", async function () {
      const missionId = await setupMission(player, 3); // Tokyo

      // Investigate
      await gameMaster.connect(player).submitInvestigation(ARBITRUM_SEPOLIA);

      // 3 clues via proxy
      await deliverClueViaProxy(missionId, 0);
      await deliverClueViaProxy(missionId, 1);
      await deliverClueViaProxy(missionId, 2);

      // Capture via proxy
      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [missionId, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [2, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await proxy.connect(forwarder).onReport(metadata, report);

      expect((await gameMaster.getMission(missionId)).status).to.equal(2);
      expect(await gameMaster.getPlayerActiveMission(player.address)).to.equal(0);
    });
  });
});
