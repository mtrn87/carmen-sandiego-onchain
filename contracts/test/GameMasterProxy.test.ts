import { expect } from "chai";
import { ethers } from "hardhat";
import { GameMaster, GameMasterProxy, MissionNFT } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("GameMasterProxy", function () {
  let gameMaster: GameMaster;
  let proxy: GameMasterProxy;
  let missionNFT: MissionNFT;
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
      ["uint256", "uint8", "bytes32", "string", "uint8"],
      [missionId, clueType, contentHash, ipfs, 50]
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

    // Deploy MissionNFT and link to GameMaster
    const NFTFactory = await ethers.getContractFactory("MissionNFT");
    missionNFT = await NFTFactory.deploy(await gameMaster.getAddress()) as MissionNFT;
    await missionNFT.waitForDeployment();
    await gameMaster.connect(owner).setMissionNFT(await missionNFT.getAddress());

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
        ["uint256", "uint8", "bytes32", "string", "uint8"],
        [missionId, 0, contentHash, "QmTest", 50]
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

  describe("ACTION_SET_TOKEN_URI (6)", function () {
    async function captureViaMission(p: SignerWithAddress, vrfWord: number = 3) {
      const missionId = await setupMission(p, vrfWord);
      await deliverClueViaProxy(missionId, 0);
      await deliverClueViaProxy(missionId, 1);
      await deliverClueViaProxy(missionId, 2);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, vrfWord, Number(missionId));
      const captureData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [missionId, ARBITRUM_SEPOLIA, salt]
      );
      const captureReport = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [2, captureData]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );
      await proxy.connect(forwarder).onReport(metadata, captureReport);
      return missionId;
    }

    it("should set token URI via proxy after capture", async function () {
      const missionId = await captureViaMission(player);

      const tokenId = await missionNFT.missionToTokenId(missionId);
      expect(tokenId).to.be.gt(0);

      const uri = "data:application/json;base64,eyJ0ZXN0IjoiZGF0YSJ9";
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "string"],
        [missionId, uri]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [6, data] // ACTION_SET_TOKEN_URI = 6
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await proxy.connect(forwarder).onReport(metadata, report);

      const storedURI = await missionNFT.tokenURI(tokenId);
      expect(storedURI).to.equal(uri);
    });

    it("should emit ActionForwarded for token URI", async function () {
      const missionId = await captureViaMission(player);
      const uri = "data:application/json;base64,dGVzdA==";
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "string"],
        [missionId, uri]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [6, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(proxy, "ActionForwarded")
        .withArgs(6, missionId);
    });

    it("should emit TokenURISet event on GameMaster", async function () {
      const missionId = await captureViaMission(player);
      const tokenId = await missionNFT.missionToTokenId(missionId);
      const uri = "data:application/json;base64,dGVzdA==";
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "string"],
        [missionId, uri]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [6, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(gameMaster, "TokenURISet")
        .withArgs(missionId, tokenId);
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

  // ============================================================
  //    COVERAGE GAPS: ACTION_RECEIVE_WALLET_FRAGMENT (4)
  // ============================================================

  describe("ACTION_RECEIVE_WALLET_FRAGMENT (4)", function () {
    it("should forward wallet fragment to GameMaster via proxy", async function () {
      const missionId = await setupMission(player, 3);

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("fragment-0"));
      const ipfs = "QmTestFragment";

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "uint8", "bytes32", "string"],
        [missionId, 0, 5, contentHash, ipfs] // startIndex=0, length=5
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [4, data] // ACTION_RECEIVE_WALLET_FRAGMENT = 4
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(proxy, "ActionForwarded")
        .withArgs(4, missionId);

      // Verify fragment was stored
      const fragments = await gameMaster.getMissionWalletFragments(missionId);
      expect(fragments.length).to.equal(1);
      expect(fragments[0].startIndex).to.equal(0);
      expect(fragments[0].length).to.equal(5);
      expect(fragments[0].contentHash).to.equal(contentHash);
    });

    it("should forward multiple fragments via proxy", async function () {
      const missionId = await setupMission(player, 3);

      for (let i = 0; i < 3; i++) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`fragment-${i}`));
        const data = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint8", "uint8", "bytes32", "string"],
          [missionId, i * 10, 5, contentHash, `QmFrag${i}`]
        );
        const report = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint8", "bytes"],
          [4, data]
        );
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes10", "address"],
          [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
        );

        await proxy.connect(forwarder).onReport(metadata, report);
      }

      expect(await gameMaster.getMissionFragmentCount(missionId)).to.equal(3);
    });

    it("should reject fragment out of bounds via proxy", async function () {
      const missionId = await setupMission(player, 3);

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "uint8", "bytes32", "string"],
        [missionId, 38, 5, ethers.ZeroHash, "QmBad"] // 38+5=43 > 40
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [4, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWith("Fragment out of bounds");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: ACTION_RESOLVE_WALLET_CAPTURE (5)
  // ============================================================

  describe("ACTION_RESOLVE_WALLET_CAPTURE (5)", function () {
    async function setupMissionWithFragments(p: SignerWithAddress, vrfWord: number = 3) {
      const missionId = await setupMission(p, vrfWord);

      // Deliver 3 wallet fragments via proxy
      for (let i = 0; i < 3; i++) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`frag-${i}`));
        const data = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint8", "uint8", "bytes32", "string"],
          [missionId, i * 10, 5, contentHash, `QmFrag${i}`]
        );
        const report = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint8", "bytes"],
          [4, data]
        );
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes10", "address"],
          [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
        );
        await proxy.connect(forwarder).onReport(metadata, report);
      }

      return missionId;
    }

    it("should resolve wallet capture with correct wallet via proxy", async function () {
      const missionId = await setupMissionWithFragments(player, 3);

      // Compute expected values
      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const carmenWallet = await gameMaster.deriveCarmenWallet(salt);

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [missionId, carmenWallet, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [5, data] // ACTION_RESOLVE_WALLET_CAPTURE = 5
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(proxy, "ActionForwarded")
        .withArgs(5, missionId);

      // Mission should be completed
      const mission = await gameMaster.getMission(missionId);
      expect(mission.status).to.equal(2); // Completed
    });

    it("should emit WalletCaseBuilt on valid wallet capture", async function () {
      const missionId = await setupMissionWithFragments(player, 3);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const carmenWallet = await gameMaster.deriveCarmenWallet(salt);

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [missionId, carmenWallet, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [5, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(proxy.connect(forwarder).onReport(metadata, report))
        .to.emit(gameMaster, "WalletCaseBuilt")
        .withArgs(missionId, player.address, carmenWallet, true);
    });

    it("should reject wallet capture with wrong wallet via proxy", async function () {
      const missionId = await setupMissionWithFragments(player, 3);

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const wrongWallet = ethers.Wallet.createRandom().address;

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [missionId, wrongWallet, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [5, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      // Should NOT revert, but mission stays active (wrong wallet)
      await proxy.connect(forwarder).onReport(metadata, report);

      const mission = await gameMaster.getMission(missionId);
      expect(mission.status).to.equal(1); // Still Active
    });

    it("should reject wallet capture with insufficient fragments", async function () {
      const missionId = await setupMission(player, 3);

      // Only deliver 2 fragments (need 3)
      for (let i = 0; i < 2; i++) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(`frag-${i}`));
        const data = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint8", "uint8", "bytes32", "string"],
          [missionId, i * 10, 5, contentHash, `QmFrag${i}`]
        );
        const report = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint8", "bytes"],
          [4, data]
        );
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes10", "address"],
          [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
        );
        await proxy.connect(forwarder).onReport(metadata, report);
      }

      const { salt } = computeTargetHash(ARBITRUM_SEPOLIA, 3, Number(missionId));
      const carmenWallet = await gameMaster.deriveCarmenWallet(salt);

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [missionId, carmenWallet, ARBITRUM_SEPOLIA, salt]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [5, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWith("Need 3+ fragments");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Metadata and Report Edge Cases
  // ============================================================

  describe("Metadata and Report Edge Cases", function () {
    it("should handle report with various metadata values", async function () {
      const missionId = await setupMission(player, 3);

      // Use non-zero metadata values
      const workflowId = ethers.keccak256(ethers.toUtf8Bytes("workflow-123"));
      const workflowName = "0x" + Buffer.from("carmen-cre").toString("hex").padEnd(20, "0");
      const workflowOwner = ethers.Wallet.createRandom().address;

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue-meta-test"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "string", "uint8"],
        [missionId, 0, contentHash, "QmMetaTest", 50]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [1, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [workflowId, workflowName, workflowOwner]
      );

      // Should succeed regardless of metadata values
      await proxy.connect(forwarder).onReport(metadata, report);
      const clues = await gameMaster.getMissionClues(missionId);
      expect(clues.length).to.equal(1);
    });

    it("should reject unknown action codes (0, 12, 255)", async function () {
      const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      for (const actionCode of [0, 12, 255]) {
        const report = ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint8", "bytes"],
          [actionCode, data]
        );

        await expect(
          proxy.connect(forwarder).onReport(metadata, report)
        ).to.be.revertedWithCustomError(proxy, "UnknownAction");
      }
    });
  });

  // ============================================================
  //    COVERAGE GAPS: CityNode operations access control
  // ============================================================

  describe("CityNode Operations Access Control", function () {
    it("should reject resolveClueOnCity with zero cityNode address via CRE", async function () {
      // The proxy is set as CRE oracle. Impersonate it to test CRE-only functions.
      const proxyAddr = await proxy.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [proxyAddr]);
      await ethers.provider.send("hardhat_setBalance", [proxyAddr, "0xDE0B6B3A7640000"]); // 1 ETH

      const proxySigner = await ethers.getSigner(proxyAddr);

      await expect(
        gameMaster.connect(proxySigner).resolveClueOnCity(
          ethers.ZeroAddress, 1, 0, ethers.ZeroHash, ethers.ZeroHash
        )
      ).to.be.revertedWith("Invalid city node");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [proxyAddr]);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Proxy to non-active mission
  // ============================================================

  describe("Proxy Actions on Non-Active Missions", function () {
    it("should reject ACTION_RECEIVE_CLUE for non-active mission via proxy", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("clue"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "string", "uint8"],
        [999, 0, contentHash, "QmTest", 50]
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
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWith("Mission not active");
    });

    it("should reject ACTION_UPDATE_TARGET for non-active mission via proxy", async function () {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("target"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"],
        [999, newHash]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [3, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWith("Mission not active");
    });

    it("should reject ACTION_RECEIVE_WALLET_FRAGMENT for non-active mission via proxy", async function () {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("frag"));
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "uint8", "bytes32", "string"],
        [999, 0, 5, contentHash, "QmFrag"]
      );
      const report = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [4, data]
      );
      const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes10", "address"],
        [ethers.ZeroHash, "0x00000000000000000000", ethers.ZeroAddress]
      );

      await expect(
        proxy.connect(forwarder).onReport(metadata, report)
      ).to.be.revertedWith("Mission not active");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: ReceiverTemplate admin functions
  // ============================================================

  describe("ReceiverTemplate Admin Functions", function () {
    it("should allow owner to update forwarder address", async function () {
      const newForwarder = ethers.Wallet.createRandom().address;
      await expect(proxy.connect(owner).setForwarderAddress(newForwarder))
        .to.emit(proxy, "ForwarderAddressUpdated")
        .withArgs(forwarder.address, newForwarder);

      expect(await proxy.getForwarderAddress()).to.equal(newForwarder);
    });

    it("should emit SecurityWarning when setting zero forwarder", async function () {
      await expect(proxy.connect(owner).setForwarderAddress(ethers.ZeroAddress))
        .to.emit(proxy, "SecurityWarning");
    });

    it("should reject setForwarderAddress from non-owner", async function () {
      await expect(
        proxy.connect(nonForwarder).setForwarderAddress(nonForwarder.address)
      ).to.be.revertedWithCustomError(proxy, "OwnableUnauthorizedAccount");
    });

    it("should support ERC165 interface check", async function () {
      // IReceiver interfaceId
      const iReceiverSelector = "0x01ffc9a7"; // IERC165
      expect(await proxy.supportsInterface(iReceiverSelector)).to.equal(true);
    });
  });
});
