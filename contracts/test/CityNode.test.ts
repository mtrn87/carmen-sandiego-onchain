import { expect } from "chai";
import { ethers } from "hardhat";
import { CityNode } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CityNode", function () {
  let cityNode: CityNode;
  let owner: SignerWithAddress;
  let gameMaster: SignerWithAddress;
  let player: SignerWithAddress;
  let otherUser: SignerWithAddress;

  const CITY_NAME = "Tokyo";
  const COUNTRY_CODE = "JP";
  const CHAIN_ID = 421614;
  const CITY_ID = 1;

  const sampleLocations: [
    CityNode.LocationInfoStruct,
    CityNode.LocationInfoStruct,
    CityNode.LocationInfoStruct
  ] = [
    {
      name: "Shibuya Crossing",
      descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("busy intersection in tokyo")),
      category: 1,
      fakeLevel: 0,
      riskLevel: 3,
    },
    {
      name: "Akihabara District",
      descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("electronics district")),
      category: 2,
      fakeLevel: 1,
      riskLevel: 2,
    },
    {
      name: "Tsukiji Market",
      descriptionHash: ethers.keccak256(ethers.toUtf8Bytes("famous fish market")),
      category: 3,
      fakeLevel: 0,
      riskLevel: 1,
    },
  ];

  function makeTxRef(refId: number, anomalyType: number = 0): CityNode.TxRefStruct {
    return {
      refId,
      txHashLike: ethers.keccak256(ethers.toUtf8Bytes(`tx-${refId}`)),
      from: ethers.Wallet.createRandom().address,
      to: ethers.Wallet.createRandom().address,
      methodSigLike: "0xa9059cbb",
      blockLike: 1000 + refId,
      valueLike: BigInt(refId) * 1000000n,
      anomalyType,
    };
  }

  function makeSuspectWallet(wallet: string, level: number = 5): CityNode.SuspectWalletStruct {
    return {
      wallet,
      suspicionLevel: level,
      txRefIds: [1, 2],
      tagsBitmap: 7, // 0b111
    };
  }

  beforeEach(async function () {
    [owner, gameMaster, player, otherUser] = await ethers.getSigners();

    const CityNodeFactory = await ethers.getContractFactory("CityNode");
    cityNode = (await CityNodeFactory.deploy(
      CITY_NAME,
      COUNTRY_CODE,
      CHAIN_ID,
      CITY_ID,
      gameMaster.address,
      ethers.ZeroAddress  // CCIP Router (disabled in tests)
    )) as CityNode;
  });

  // ============================================================
  //                     DEPLOYMENT
  // ============================================================

  describe("Deployment", function () {
    it("should set correct city name", async function () {
      expect(await cityNode.cityName()).to.equal(CITY_NAME);
    });

    it("should set correct country code", async function () {
      expect(await cityNode.countryCode()).to.equal(COUNTRY_CODE);
    });

    it("should set correct chain ID", async function () {
      expect(await cityNode.chainId()).to.equal(CHAIN_ID);
    });

    it("should set correct city ID", async function () {
      expect(await cityNode.cityId()).to.equal(CITY_ID);
    });

    it("should set correct GameMaster", async function () {
      expect(await cityNode.gameMaster()).to.equal(gameMaster.address);
    });

    it("should set correct owner", async function () {
      expect(await cityNode.owner()).to.equal(owner.address);
    });

    it("should return correct cityInfo", async function () {
      const [city, countryCode, chain, id] = await cityNode.cityInfo();
      expect(city).to.equal(CITY_NAME);
      expect(countryCode).to.equal(COUNTRY_CODE);
      expect(chain).to.equal(CHAIN_ID);
      expect(id).to.equal(CITY_ID);
    });

    it("should not have locations configured initially", async function () {
      expect(await cityNode.locationsConfigured()).to.equal(false);
    });
  });

  // ============================================================
  //                   SETUP / ADMIN
  // ============================================================

  describe("Setup - Locations", function () {
    it("should allow owner to setup locations", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      expect(await cityNode.locationsConfigured()).to.equal(true);

      const locs = await cityNode.getLocations();
      expect(locs[0].name).to.equal("Shibuya Crossing");
      expect(locs[1].name).to.equal("Akihabara District");
      expect(locs[2].name).to.equal("Tsukiji Market");
    });

    it("should reject non-owner setup", async function () {
      await expect(
        cityNode.connect(player).setupLocations(sampleLocations)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject empty location name", async function () {
      const badLocations = [
        { ...sampleLocations[0], name: "" },
        sampleLocations[1],
        sampleLocations[2],
      ] as [CityNode.LocationInfoStruct, CityNode.LocationInfoStruct, CityNode.LocationInfoStruct];

      await expect(
        cityNode.connect(owner).setupLocations(badLocations)
      ).to.be.revertedWith("Empty location name");
    });

    it("should return location meta by index", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      const loc = await cityNode.getLocationMeta(1);
      expect(loc.name).to.equal("Akihabara District");
      expect(loc.category).to.equal(2);
    });

    it("should reject invalid location index for getLocationMeta", async function () {
      await expect(cityNode.getLocationMeta(3)).to.be.revertedWith("Invalid location index");
    });
  });

  describe("Setup - Anomaly TxRefs", function () {
    it("should allow owner to add anomaly tx refs", async function () {
      const txRef = makeTxRef(1);
      await expect(cityNode.connect(owner).addAnomalyTxRef(txRef))
        .to.emit(cityNode, "AnomalyTxLinked");

      const refs = await cityNode.getAnomalyTxRefs(0, 10);
      expect(refs.length).to.equal(1);
      expect(refs[0].refId).to.equal(1);
    });

    it("should reject duplicate refIds", async function () {
      const txRef = makeTxRef(1);
      await cityNode.connect(owner).addAnomalyTxRef(txRef);

      await expect(
        cityNode.connect(owner).addAnomalyTxRef(txRef)
      ).to.be.revertedWith("Duplicate refId");
    });

    it("should lookup tx ref by id", async function () {
      const txRef = makeTxRef(42);
      await cityNode.connect(owner).addAnomalyTxRef(txRef);

      const result = await cityNode.getAnomalyTxRefById(42);
      expect(result.refId).to.equal(42);
    });

    it("should revert for non-existent refId", async function () {
      await expect(cityNode.getAnomalyTxRefById(999)).to.be.revertedWith("TxRef not found");
    });

    it("should paginate tx refs correctly", async function () {
      for (let i = 1; i <= 5; i++) {
        await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(i, i % 6));
      }

      const page1 = await cityNode.getAnomalyTxRefs(0, 3);
      expect(page1.length).to.equal(3);
      expect(page1[0].refId).to.equal(1);

      const page2 = await cityNode.getAnomalyTxRefs(3, 3);
      expect(page2.length).to.equal(2);
      expect(page2[0].refId).to.equal(4);

      const empty = await cityNode.getAnomalyTxRefs(10, 3);
      expect(empty.length).to.equal(0);
    });
  });

  describe("Setup - Suspect Wallets", function () {
    it("should allow owner to add suspect wallet", async function () {
      const wallet = ethers.Wallet.createRandom().address;
      const suspect = makeSuspectWallet(wallet);
      await cityNode.connect(owner).addSuspectWallet(suspect);

      const result = await cityNode.getSuspectWallet(wallet);
      expect(result.wallet).to.equal(wallet);
      expect(result.suspicionLevel).to.equal(5);
    });

    it("should reject zero address wallet", async function () {
      const suspect = makeSuspectWallet(ethers.ZeroAddress);
      await expect(
        cityNode.connect(owner).addSuspectWallet(suspect)
      ).to.be.revertedWith("Invalid wallet");
    });

    it("should reject duplicate wallet", async function () {
      const wallet = ethers.Wallet.createRandom().address;
      const suspect = makeSuspectWallet(wallet);
      await cityNode.connect(owner).addSuspectWallet(suspect);

      await expect(
        cityNode.connect(owner).addSuspectWallet(suspect)
      ).to.be.revertedWith("Duplicate wallet");
    });

    it("should paginate suspect wallets", async function () {
      for (let i = 0; i < 4; i++) {
        const wallet = ethers.Wallet.createRandom().address;
        await cityNode.connect(owner).addSuspectWallet(makeSuspectWallet(wallet, i + 1));
      }

      const page1 = await cityNode.getSuspectWallets(0, 2);
      expect(page1.length).to.equal(2);

      const page2 = await cityNode.getSuspectWallets(2, 10);
      expect(page2.length).to.equal(2);
    });

    it("should revert for non-existent wallet", async function () {
      await expect(
        cityNode.getSuspectWallet(ethers.Wallet.createRandom().address)
      ).to.be.revertedWith("Suspect wallet not found");
    });
  });

  describe("Setup - Suspicion Index", function () {
    it("should allow owner to set suspicion index", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("high activity"));
      await cityNode.connect(owner).setSuspicionIndex(7, reasonHash);

      const [level, hash] = await cityNode.getSuspicionIndex();
      expect(level).to.equal(7);
      expect(hash).to.equal(reasonHash);
    });
  });

  describe("Setup - Hints", function () {
    it("should allow owner to set hints", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("look at the bridge"));
      await cityNode.connect(owner).setHint(0, 1, hintHash, 75);

      const [hash, strength] = await cityNode.getHint(0, 1);
      expect(hash).to.equal(hintHash);
      expect(strength).to.equal(75);
    });

    it("should reject invalid location index for hint", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("hint"));
      await expect(
        cityNode.connect(owner).setHint(3, 0, hintHash, 50)
      ).to.be.revertedWith("Invalid location index");
    });

    it("should reject invalid clue index for hint", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("hint"));
      await expect(
        cityNode.connect(owner).setHint(0, 3, hintHash, 50)
      ).to.be.revertedWith("Invalid clue index");
    });
  });

  describe("Setup - Clue Schema", function () {
    it("should have default clue schema", async function () {
      const [total, types] = await cityNode.getClueSchema();
      expect(total).to.equal(3);
      expect(types.length).to.equal(3);
    });

    it("should allow owner to update clue schema", async function () {
      await cityNode.connect(owner).setClueSchema([0, 1, 2, 3, 4]); // 5 types
      const [total, types] = await cityNode.getClueSchema();
      expect(total).to.equal(5);
    });
  });

  describe("Admin - Access Control", function () {
    it("should allow owner to set GameMaster", async function () {
      await cityNode.connect(owner).setGameMaster(otherUser.address);
      expect(await cityNode.gameMaster()).to.equal(otherUser.address);
    });

    it("should reject non-owner setting GameMaster", async function () {
      await expect(
        cityNode.connect(player).setGameMaster(otherUser.address)
      ).to.be.revertedWith("Not owner");
    });

    it("should allow owner to transfer ownership", async function () {
      await cityNode.connect(owner).transferOwnership(otherUser.address);
      expect(await cityNode.owner()).to.equal(otherUser.address);
    });

    it("should reject zero address for ownership transfer", async function () {
      await expect(
        cityNode.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  // ============================================================
  //                   ENERGY SYSTEM
  // ============================================================

  describe("Energy System", function () {
    it("should start at MAX_ENERGY for new players", async function () {
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(20);
    });

    it("should decrease energy on action", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      // inspect costs 1 energy
      await cityNode.connect(player).inspectLocation(0);
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(19);
    });

    it("should regenerate energy over time", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      // spend some energy
      await cityNode.connect(player).inspectLocation(0); // 20 -> 19
      await cityNode.connect(player).inspectLocation(1); // 19 -> 18

      // advance time by 30 minutes (2 regen ticks)
      await time.increase(30 * 60);

      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(20); // 18 + 2 = 20 (capped at MAX)
    });

    it("should cap energy at MAX_ENERGY", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      // spend 1 energy
      await cityNode.connect(player).inspectLocation(0); // 20 -> 19

      // advance time by 2 hours (lots of regen)
      await time.increase(2 * 60 * 60);

      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(20); // capped at MAX
    });

    it("should reject action when not enough energy", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      // exhaust energy: 20 total, each inspect=1, scan=6
      // 3 inspects (3 energy) + 2 scans (12 energy) = 15, then scan=6 > 5 remaining
      await cityNode.connect(player).inspectLocation(0); // 20->19
      await cityNode.connect(player).inspectLocation(1); // 19->18
      await cityNode.connect(player).inspectLocation(2); // 18->17
      await cityNode.connect(player).scanAnomalies(0);   // 17->11
      await cityNode.connect(player).scanAnomalies(1);   // 11->5

      // scanAnomalies costs 6, but only 5 left
      await expect(
        cityNode.connect(player).scanAnomalies(2)
      ).to.be.revertedWith("Not enough energy");
    });

    it("should emit EnergySpent event", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      await expect(cityNode.connect(player).inspectLocation(0))
        .to.emit(cityNode, "EnergySpent")
        .withArgs(player.address, 1, 19, 0); // cost=1, remaining=19, actionType=INSPECT(0)
    });
  });

  // ============================================================
  //                  PLAYER ACTIONS
  // ============================================================

  describe("Player Actions - inspectLocation", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
    });

    it("should mark location as inspected", async function () {
      await cityNode.connect(player).inspectLocation(0);

      const [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(Number(bitmap) & 1).to.equal(1); // bit 0 set
    });

    it("should emit LocationInspected", async function () {
      await expect(cityNode.connect(player).inspectLocation(1))
        .to.emit(cityNode, "LocationInspected")
        .withArgs(player.address, 1, () => true);
    });

    it("should reject if city not configured", async function () {
      const CityNodeFactory = await ethers.getContractFactory("CityNode");
      const freshNode = (await CityNodeFactory.deploy(
        "Paris", "FR", 84532, 2, gameMaster.address, ethers.ZeroAddress
      )) as CityNode;

      await expect(
        freshNode.connect(player).inspectLocation(0)
      ).to.be.revertedWith("City not configured");
    });

    it("should reject invalid location index", async function () {
      await expect(
        cityNode.connect(player).inspectLocation(3)
      ).to.be.revertedWith("Invalid location index");
    });
  });

  describe("Player Actions - scanAnomalies", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));
      const wallet = ethers.Wallet.createRandom().address;
      await cityNode.connect(owner).addSuspectWallet(makeSuspectWallet(wallet));
    });

    it("should require inspection before scan", async function () {
      await expect(
        cityNode.connect(player).scanAnomalies(0)
      ).to.be.revertedWith("Inspect location first");
    });

    it("should allow scan after inspection", async function () {
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).scanAnomalies(0);

      const [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(scans).to.equal(1);
    });

    it("should emit AnomalyTxLinked and SuspectWalletObserved", async function () {
      await cityNode.connect(player).inspectLocation(0);

      await expect(cityNode.connect(player).scanAnomalies(0))
        .to.emit(cityNode, "AnomalyTxLinked")
        .and.to.emit(cityNode, "SuspectWalletObserved");
    });

    it("should increment scans completed", async function () {
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).inspectLocation(1);
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(player).scanAnomalies(1);

      const [, , scans] = await cityNode.getPlayerProgress(player.address);
      expect(scans).to.equal(2);
    });
  });

  describe("Player Actions - requestClue", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      // inspect and scan location 0
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).scanAnomalies(0);
    });

    it("should require scan before clue request", async function () {
      // location 1 is inspected but not scanned
      await cityNode.connect(player).inspectLocation(1);

      await expect(
        cityNode.connect(player).requestClue(1, 0)
      ).to.be.revertedWith("Scan location first");
    });

    it("should create a clue request and emit event", async function () {
      await expect(cityNode.connect(player).requestClue(0, 0))
        .to.emit(cityNode, "ClueRequested")
        .withArgs(1, player.address, 0, 0);
    });

    it("should reject invalid location index", async function () {
      await expect(
        cityNode.connect(player).requestClue(3, 0)
      ).to.be.revertedWith("Invalid location index");
    });

    it("should reject invalid clue index", async function () {
      await expect(
        cityNode.connect(player).requestClue(0, 3)
      ).to.be.revertedWith("Invalid clue index");
    });
  });

  describe("Player Actions - flagTx", function () {
    it("should emit TxFlagged", async function () {
      const refId = ethers.keccak256(ethers.toUtf8Bytes("suspicious-tx"));
      await expect(cityNode.connect(player).flagTx(refId))
        .to.emit(cityNode, "TxFlagged")
        .withArgs(player.address, refId);
    });

    it("should cost 1 energy", async function () {
      const refId = ethers.keccak256(ethers.toUtf8Bytes("suspicious-tx"));
      await cityNode.connect(player).flagTx(refId);
      expect(await cityNode.getEnergy(player.address)).to.equal(19);
    });
  });

  describe("Player Actions - requestDossier", function () {
    it("should emit DossierRequested", async function () {
      await expect(cityNode.connect(player).requestDossier())
        .to.emit(cityNode, "DossierRequested")
        .withArgs(1, player.address, CITY_ID);
    });

    it("should cost 1 energy", async function () {
      await cityNode.connect(player).requestDossier();
      expect(await cityNode.getEnergy(player.address)).to.equal(19);
    });
  });

  describe("Player Actions - requestCapture", function () {
    it("should create capture request and emit event", async function () {
      const suspectWallet = ethers.Wallet.createRandom().address;
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));

      await expect(cityNode.connect(player).requestCapture(suspectWallet, evidenceHash))
        .to.emit(cityNode, "CaptureRequested")
        .withArgs(1, player.address, suspectWallet, evidenceHash);
    });

    it("should reject zero address suspect", async function () {
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
      await expect(
        cityNode.connect(player).requestCapture(ethers.ZeroAddress, evidenceHash)
      ).to.be.revertedWith("Invalid suspect wallet");
    });

    it("should reject zero evidence hash", async function () {
      const suspectWallet = ethers.Wallet.createRandom().address;
      await expect(
        cityNode.connect(player).requestCapture(suspectWallet, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid evidence bundle");
    });

    it("should cost 3 energy", async function () {
      const suspectWallet = ethers.Wallet.createRandom().address;
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
      await cityNode.connect(player).requestCapture(suspectWallet, evidenceHash);
      expect(await cityNode.getEnergy(player.address)).to.equal(17);
    });
  });

  // ============================================================
  //                GM-ONLY RESOLVE FUNCTIONS
  // ============================================================

  describe("GM Resolve - resolveClue", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(player).requestClue(0, 0);
    });

    it("should resolve clue and emit ClueUnlocked", async function () {
      const clueDataHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
      const anomalyRefId = ethers.keccak256(ethers.toUtf8Bytes("anomaly"));

      await expect(
        cityNode.connect(gameMaster).resolveClue(1, 0, clueDataHash, anomalyRefId) // clueType=BEHAVIOR_FINGERPRINT
      )
        .to.emit(cityNode, "ClueUnlocked")
        .withArgs(player.address, 0, 0, 0, clueDataHash, anomalyRefId);
    });

    it("should emit DeadEnd for DEAD_END clue type", async function () {
      const consolationHash = ethers.keccak256(ethers.toUtf8Bytes("sorry"));

      await expect(
        cityNode.connect(gameMaster).resolveClue(1, 5, consolationHash, ethers.ZeroHash) // clueType=DEAD_END(5)
      )
        .to.emit(cityNode, "DeadEnd")
        .withArgs(player.address, 0, consolationHash);
    });

    it("should increment player clues found for non-dead-end", async function () {
      const clueDataHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
      await cityNode.connect(gameMaster).resolveClue(1, 1, clueDataHash, ethers.ZeroHash);

      const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
      expect(cluesFound).to.equal(1);
    });

    it("should NOT increment clues found for dead end", async function () {
      await cityNode.connect(gameMaster).resolveClue(
        1, 5, ethers.keccak256(ethers.toUtf8Bytes("dead")), ethers.ZeroHash
      );

      const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
      expect(cluesFound).to.equal(0);
    });

    it("should update evidence bundle hash", async function () {
      const clueDataHash = ethers.keccak256(ethers.toUtf8Bytes("clue data"));
      await cityNode.connect(gameMaster).resolveClue(1, 0, clueDataHash, ethers.ZeroHash);

      const [totalClues, bundleHash, confidence] = await cityNode.getEvidenceSummary(player.address);
      expect(totalClues).to.equal(1);
      expect(bundleHash).to.not.equal(ethers.ZeroHash);
    });

    it("should reject non-GM caller", async function () {
      await expect(
        cityNode.connect(player).resolveClue(1, 0, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWith("Not GameMaster");
    });

    it("should reject invalid request ID", async function () {
      await expect(
        cityNode.connect(gameMaster).resolveClue(999, 0, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid request");
    });

    it("should reject double resolution", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
      await cityNode.connect(gameMaster).resolveClue(1, 0, hash, ethers.ZeroHash);

      await expect(
        cityNode.connect(gameMaster).resolveClue(1, 0, hash, ethers.ZeroHash)
      ).to.be.revertedWith("Already resolved");
    });
  });

  describe("GM Resolve - resolveDossier", function () {
    it("should emit DossierResolved", async function () {
      await cityNode.connect(player).requestDossier(); // creates request #1

      const dossierHash = ethers.keccak256(ethers.toUtf8Bytes("dossier"));
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("next objective"));

      await expect(
        cityNode.connect(gameMaster).resolveDossier(1, dossierHash, 80, hintHash)
      )
        .to.emit(cityNode, "DossierResolved")
        .withArgs(1, gameMaster.address, dossierHash, 80, hintHash);
    });

    it("should reject non-GM caller", async function () {
      await expect(
        cityNode.connect(player).resolveDossier(1, ethers.ZeroHash, 50, ethers.ZeroHash)
      ).to.be.revertedWith("Not GameMaster");
    });
  });

  describe("GM Resolve - resolveCapture", function () {
    let suspectWallet: string;
    let evidenceHash: string;

    beforeEach(async function () {
      suspectWallet = ethers.Wallet.createRandom().address;
      evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
      await cityNode.connect(player).requestCapture(suspectWallet, evidenceHash);
    });

    it("should resolve capture successfully", async function () {
      const gmNote = ethers.keccak256(ethers.toUtf8Bytes("good work"));

      await expect(
        cityNode.connect(gameMaster).resolveCapture(1, true, 0, gmNote) // reasonCode=OK
      )
        .to.emit(cityNode, "CaptureResolved")
        .withArgs(1, player.address, suspectWallet, true, 0, gmNote);
    });

    it("should resolve capture as failed", async function () {
      const gmNote = ethers.keccak256(ethers.toUtf8Bytes("wrong wallet"));

      await expect(
        cityNode.connect(gameMaster).resolveCapture(1, false, 2, gmNote) // reasonCode=WALLET_MISMATCH
      )
        .to.emit(cityNode, "CaptureResolved")
        .withArgs(1, player.address, suspectWallet, false, 2, gmNote);
    });

    it("should reject non-GM caller", async function () {
      await expect(
        cityNode.connect(player).resolveCapture(1, true, 0, ethers.ZeroHash)
      ).to.be.revertedWith("Not GameMaster");
    });

    it("should reject invalid request ID", async function () {
      await expect(
        cityNode.connect(gameMaster).resolveCapture(999, true, 0, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid request");
    });

    it("should reject double resolution", async function () {
      await cityNode.connect(gameMaster).resolveCapture(1, true, 0, ethers.ZeroHash);

      await expect(
        cityNode.connect(gameMaster).resolveCapture(1, true, 0, ethers.ZeroHash)
      ).to.be.revertedWith("Already resolved");
    });
  });

  // ============================================================
  //                 LEGACY FUNCTIONS
  // ============================================================

  describe("Legacy - Carmen Presence", function () {
    it("should default to Carmen not present", async function () {
      expect(await cityNode.getCarmenStatus(1)).to.equal(false);
    });

    it("should allow GM to set Carmen as present", async function () {
      await cityNode.connect(gameMaster).updateCarmenPresence(1, true);
      expect(await cityNode.getCarmenStatus(1)).to.equal(true);
    });

    it("should emit CarmenArrived when Carmen arrives", async function () {
      await expect(cityNode.connect(gameMaster).updateCarmenPresence(1, true))
        .to.emit(cityNode, "CarmenArrived")
        .withArgs(1);
    });

    it("should emit CarmenDeparted when Carmen leaves", async function () {
      await cityNode.connect(gameMaster).updateCarmenPresence(1, true);
      await expect(cityNode.connect(gameMaster).updateCarmenPresence(1, false))
        .to.emit(cityNode, "CarmenDeparted")
        .withArgs(1);
    });

    it("should not emit event when status unchanged", async function () {
      await expect(cityNode.connect(gameMaster).updateCarmenPresence(1, false))
        .to.not.emit(cityNode, "CarmenArrived")
        .and.to.not.emit(cityNode, "CarmenDeparted");
    });

    it("should reject non-GM updates", async function () {
      await expect(
        cityNode.connect(otherUser).updateCarmenPresence(1, true)
      ).to.be.revertedWith("Not GameMaster");
    });

    it("should track presence per mission", async function () {
      await cityNode.connect(gameMaster).updateCarmenPresence(1, true);
      await cityNode.connect(gameMaster).updateCarmenPresence(2, false);

      expect(await cityNode.getCarmenStatus(1)).to.equal(true);
      expect(await cityNode.getCarmenStatus(2)).to.equal(false);
    });
  });

  describe("Legacy - Departure Hints", function () {
    it("should allow GM to record departure hint", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("headed to a city with a famous river"));
      const ipfsPointer = "ipfs://bafyhint1";

      await cityNode.connect(gameMaster).recordDepartureHint(1, hintHash, ipfsPointer);

      const hints = await cityNode.getDepartureHints(1);
      expect(hints.length).to.equal(1);
      expect(hints[0].contentHash).to.equal(hintHash);
      expect(hints[0].ipfsPointer).to.equal(ipfsPointer);
    });

    it("should emit DepartureHintRecorded", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("port city route"));
      const ipfsPointer = "ipfs://bafyhint2";

      await expect(cityNode.connect(gameMaster).recordDepartureHint(1, hintHash, ipfsPointer))
        .to.emit(cityNode, "DepartureHintRecorded")
        .withArgs(1, hintHash, ipfsPointer);
    });

    it("should reject non-GM hint writes", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("timezone clue"));

      await expect(
        cityNode.connect(otherUser).recordDepartureHint(1, hintHash, "ipfs://bafyhint3")
      ).to.be.revertedWith("Not GameMaster");
    });

    it("should reject invalid hints", async function () {
      await expect(
        cityNode.connect(gameMaster).recordDepartureHint(1, ethers.ZeroHash, "ipfs://bafyhint4")
      ).to.be.revertedWith("Invalid hint");

      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("coastal clue"));
      await expect(
        cityNode.connect(gameMaster).recordDepartureHint(1, hintHash, "")
      ).to.be.revertedWith("Invalid hint");
    });
  });

  // ============================================================
  //               PLAYER PROGRESS / EVIDENCE
  // ============================================================

  describe("Player Progress", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));
    });

    it("should track progress across multiple actions", async function () {
      // inspect all 3 locations
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).inspectLocation(1);
      await cityNode.connect(player).inspectLocation(2);

      let [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(bitmap).to.equal(7); // 0b111

      // scan 2 locations
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(player).scanAnomalies(1);

      [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(scans).to.equal(2);
    });

    it("should allow owner to reset player progress", async function () {
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).scanAnomalies(0);

      await cityNode.connect(owner).resetPlayerProgress(player.address);

      const [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(bitmap).to.equal(0);
      expect(clues).to.equal(0);
      expect(scans).to.equal(0);

      // energy should also be reset to max
      expect(await cityNode.getEnergy(player.address)).to.equal(20);
    });
  });

  // ============================================================
  //               FULL GAMEPLAY FLOW
  // ============================================================

  describe("Full Gameplay Flow", function () {
    let suspectAddr: string;

    beforeEach(async function () {
      // setup city
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1, 0));
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(2, 3));

      suspectAddr = ethers.Wallet.createRandom().address;
      await cityNode.connect(owner).addSuspectWallet(makeSuspectWallet(suspectAddr, 8));
      await cityNode.connect(owner).setSuspicionIndex(7, ethers.keccak256(ethers.toUtf8Bytes("high")));
    });

    it("should complete full investigation flow: inspect -> scan -> clue -> capture", async function () {
      // step 1: inspect location
      await cityNode.connect(player).inspectLocation(0);

      // step 2: scan anomalies
      await cityNode.connect(player).scanAnomalies(0);

      // step 3: request clue
      await cityNode.connect(player).requestClue(0, 0);

      // step 4: GM resolves clue
      const clueHash = ethers.keccak256(ethers.toUtf8Bytes("important clue"));
      await cityNode.connect(gameMaster).resolveClue(1, 0, clueHash, ethers.ZeroHash);

      // step 5: request capture
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("my evidence bundle"));
      await cityNode.connect(player).requestCapture(suspectAddr, evidenceHash);

      // step 6: GM resolves capture
      const gmNote = ethers.keccak256(ethers.toUtf8Bytes("carmen caught!"));
      await expect(
        cityNode.connect(gameMaster).resolveCapture(1, true, 0, gmNote)
      ).to.emit(cityNode, "CaptureResolved");

      // verify final state
      const [totalClues, bundleHash] = await cityNode.getEvidenceSummary(player.address);
      expect(totalClues).to.equal(1);
      expect(bundleHash).to.not.equal(ethers.ZeroHash);
    });

    it("should handle multiple players independently", async function () {
      // player 1 inspects location 0
      await cityNode.connect(player).inspectLocation(0);

      // player 2 (otherUser) inspects location 1
      await cityNode.connect(otherUser).inspectLocation(1);

      // check they have independent progress
      const [bitmap1] = await cityNode.getPlayerProgress(player.address);
      const [bitmap2] = await cityNode.getPlayerProgress(otherUser.address);

      expect(bitmap1).to.equal(1);  // only bit 0
      expect(bitmap2).to.equal(2);  // only bit 1
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Energy Regeneration Boundaries
  // ============================================================

  describe("Energy Regeneration Boundaries", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
    });

    it("should regenerate exactly 1 energy after exactly 15 minutes", async function () {
      await cityNode.connect(player).inspectLocation(0); // 10 -> 9
      await time.increase(15 * 60); // exactly 15 minutes
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(10); // 9 + 1 = 10
    });

    it("should NOT regenerate energy before 15 minutes", async function () {
      await cityNode.connect(player).inspectLocation(0); // 10 -> 9
      await time.increase(14 * 60 + 59); // 14:59
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(9); // no regen yet
    });

    it("should regenerate multiple ticks correctly", async function () {
      // Spend 5 energy
      await cityNode.connect(player).inspectLocation(0); // 10->9
      await cityNode.connect(player).inspectLocation(1); // 9->8
      await cityNode.connect(player).inspectLocation(2); // 8->7
      await cityNode.connect(player).scanAnomalies(0);   // 7->5 (scan costs 2)

      // Inspect location 0 is already done, doing scan needs inspect first
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      // advance 45 minutes = 3 regen ticks
      await time.increase(45 * 60);
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(8); // 5 + 3 = 8
    });

    it("should cap regeneration at MAX_ENERGY (10)", async function () {
      await cityNode.connect(player).inspectLocation(0); // 10 -> 9
      // advance 24 hours (96 regen ticks)
      await time.increase(24 * 60 * 60);
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(10); // capped at MAX
    });

    it("should not exceed MAX_ENERGY even with massive time elapsed", async function () {
      await cityNode.connect(player).inspectLocation(0); // 10 -> 9
      // advance 7 days
      await time.increase(7 * 24 * 60 * 60);
      const energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(10);
    });

    it("should handle zero-energy state with regeneration", async function () {
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      // Exhaust all energy: inspect*3 (3) + scan*3 (6) + flagTx (1) = 10
      await cityNode.connect(player).inspectLocation(0); // 10->9
      await cityNode.connect(player).inspectLocation(1); // 9->8
      await cityNode.connect(player).inspectLocation(2); // 8->7
      await cityNode.connect(player).scanAnomalies(0);   // 7->5
      await cityNode.connect(player).scanAnomalies(1);   // 5->3
      await cityNode.connect(player).scanAnomalies(2);   // 3->1

      const refId = ethers.keccak256(ethers.toUtf8Bytes("tx1"));
      await cityNode.connect(player).flagTx(refId);      // 1->0

      let energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(0);

      // after 15 min, should have 1 energy
      await time.increase(15 * 60);
      energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(1);

      // can now inspect again
      // reset progress first to inspect again
      await cityNode.connect(owner).resetPlayerProgress(player.address);
      await cityNode.connect(player).inspectLocation(0);
      energy = await cityNode.getEnergy(player.address);
      expect(energy).to.equal(9); // was 10 after reset, then -1
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Array Pagination Edge Cases
  // ============================================================

  describe("Array Pagination Edge Cases", function () {
    it("should handle large number of anomaly tx refs", async function () {
      // Add 20 tx refs
      for (let i = 1; i <= 20; i++) {
        await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(i, i % 6));
      }

      // Paginate: get first 10
      const page1 = await cityNode.getAnomalyTxRefs(0, 10);
      expect(page1.length).to.equal(10);
      expect(page1[0].refId).to.equal(1);
      expect(page1[9].refId).to.equal(10);

      // Get next 10
      const page2 = await cityNode.getAnomalyTxRefs(10, 10);
      expect(page2.length).to.equal(10);
      expect(page2[0].refId).to.equal(11);

      // Get past the end
      const page3 = await cityNode.getAnomalyTxRefs(20, 10);
      expect(page3.length).to.equal(0);
    });

    it("should handle pagination with limit larger than remaining", async function () {
      for (let i = 1; i <= 5; i++) {
        await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(i));
      }

      const result = await cityNode.getAnomalyTxRefs(3, 100);
      expect(result.length).to.equal(2); // only 2 remaining
    });

    it("should handle suspect wallet pagination with limit=1", async function () {
      for (let i = 0; i < 5; i++) {
        const wallet = ethers.Wallet.createRandom().address;
        await cityNode.connect(owner).addSuspectWallet(makeSuspectWallet(wallet, i + 1));
      }

      // Iterate one by one
      for (let i = 0; i < 5; i++) {
        const page = await cityNode.getSuspectWallets(i, 1);
        expect(page.length).to.equal(1);
        expect(page[0].suspicionLevel).to.equal(i + 1);
      }

      // Past end
      const empty = await cityNode.getSuspectWallets(5, 1);
      expect(empty.length).to.equal(0);
    });

    it("should handle cursor at exact boundary", async function () {
      for (let i = 1; i <= 3; i++) {
        await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(i));
      }

      // cursor = length = 3 → empty
      const result = await cityNode.getAnomalyTxRefs(3, 10);
      expect(result.length).to.equal(0);

      // cursor = length - 1 = 2 → 1 result
      const last = await cityNode.getAnomalyTxRefs(2, 10);
      expect(last.length).to.equal(1);
      expect(last[0].refId).to.equal(3);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Deep Energy Exhaustion
  // ============================================================

  describe("Deep Energy Exhaustion", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));
    });

    it("should reject inspect when at 0 energy", async function () {
      // Drain energy to 0
      await cityNode.connect(player).inspectLocation(0); // 10->9
      await cityNode.connect(player).inspectLocation(1); // 9->8
      await cityNode.connect(player).inspectLocation(2); // 8->7
      await cityNode.connect(player).scanAnomalies(0);   // 7->5
      await cityNode.connect(player).scanAnomalies(1);   // 5->3
      await cityNode.connect(player).scanAnomalies(2);   // 3->1

      const refId = ethers.keccak256(ethers.toUtf8Bytes("tx1"));
      await cityNode.connect(player).flagTx(refId);      // 1->0

      expect(await cityNode.getEnergy(player.address)).to.equal(0);

      // All actions should fail
      await cityNode.connect(owner).resetPlayerProgress(player.address);
      // Reset resets energy too, so re-drain
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).inspectLocation(1);
      await cityNode.connect(player).inspectLocation(2);
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(player).scanAnomalies(1);
      await cityNode.connect(player).scanAnomalies(2);
      await cityNode.connect(player).flagTx(refId);

      expect(await cityNode.getEnergy(player.address)).to.equal(0);

      // Now test: all actions should fail
      await cityNode.connect(owner).resetPlayerProgress(player.address);
      // resetPlayerProgress resets energy but we want to test at 0
      // Let's just verify the reject works by not resetting

      // Actually, let's create a fresh player at 0 energy
      // Drain otherUser's energy
      await cityNode.connect(otherUser).inspectLocation(0);
      await cityNode.connect(otherUser).inspectLocation(1);
      await cityNode.connect(otherUser).inspectLocation(2);
      await cityNode.connect(otherUser).scanAnomalies(0);
      await cityNode.connect(otherUser).scanAnomalies(1);
      await cityNode.connect(otherUser).scanAnomalies(2);
      await cityNode.connect(otherUser).flagTx(refId);

      expect(await cityNode.getEnergy(otherUser.address)).to.equal(0);

      // requestCapture costs 3 energy → should fail
      const suspectWallet = ethers.Wallet.createRandom().address;
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
      await expect(
        cityNode.connect(otherUser).requestCapture(suspectWallet, evidenceHash)
      ).to.be.revertedWith("Not enough energy");
    });

    it("should allow action after partial regen from 0", async function () {
      // Drain otherUser to 0
      await cityNode.connect(otherUser).inspectLocation(0);
      await cityNode.connect(otherUser).inspectLocation(1);
      await cityNode.connect(otherUser).inspectLocation(2);
      await cityNode.connect(otherUser).scanAnomalies(0);
      await cityNode.connect(otherUser).scanAnomalies(1);
      await cityNode.connect(otherUser).scanAnomalies(2);
      const refId = ethers.keccak256(ethers.toUtf8Bytes("tx1"));
      await cityNode.connect(otherUser).flagTx(refId);

      expect(await cityNode.getEnergy(otherUser.address)).to.equal(0);

      // Wait for 1 regen tick (15 min)
      await time.increase(15 * 60);
      expect(await cityNode.getEnergy(otherUser.address)).to.equal(1);

      // Can now flag again (costs 1)
      const refId2 = ethers.keccak256(ethers.toUtf8Bytes("tx2"));
      await cityNode.connect(otherUser).flagTx(refId2);
      expect(await cityNode.getEnergy(otherUser.address)).to.equal(0);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Concurrent Request Handling
  // ============================================================

  describe("Concurrent Request Handling", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));
    });

    it("should handle multiple clue requests from same player", async function () {
      // Inspect and scan all 3 locations
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).inspectLocation(1);
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(player).scanAnomalies(1);

      // Request clues at different locations
      await expect(cityNode.connect(player).requestClue(0, 0))
        .to.emit(cityNode, "ClueRequested")
        .withArgs(1, player.address, 0, 0);

      await expect(cityNode.connect(player).requestClue(1, 0))
        .to.emit(cityNode, "ClueRequested")
        .withArgs(2, player.address, 1, 0);

      // Both can be resolved independently
      const clueHash1 = ethers.keccak256(ethers.toUtf8Bytes("clue1"));
      const clueHash2 = ethers.keccak256(ethers.toUtf8Bytes("clue2"));

      await cityNode.connect(gameMaster).resolveClue(1, 0, clueHash1, ethers.ZeroHash);
      await cityNode.connect(gameMaster).resolveClue(2, 1, clueHash2, ethers.ZeroHash);

      const [, cluesFound] = await cityNode.getPlayerProgress(player.address);
      expect(cluesFound).to.equal(2);
    });

    it("should handle multiple capture requests from different players", async function () {
      const wallet1 = ethers.Wallet.createRandom().address;
      const wallet2 = ethers.Wallet.createRandom().address;
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));

      await cityNode.connect(player).requestCapture(wallet1, evidenceHash);
      await cityNode.connect(otherUser).requestCapture(wallet2, evidenceHash);

      // Resolve in reverse order
      const gmNote = ethers.keccak256(ethers.toUtf8Bytes("note"));
      await cityNode.connect(gameMaster).resolveCapture(2, false, 1, gmNote);
      await cityNode.connect(gameMaster).resolveCapture(1, true, 0, gmNote);
    });

    it("should assign sequential request IDs to clue requests", async function () {
      await cityNode.connect(player).inspectLocation(0);
      await cityNode.connect(player).scanAnomalies(0);
      await cityNode.connect(otherUser).inspectLocation(0);
      await cityNode.connect(otherUser).scanAnomalies(0);

      await expect(cityNode.connect(player).requestClue(0, 0))
        .to.emit(cityNode, "ClueRequested")
        .withArgs(1, player.address, 0, 0);

      await expect(cityNode.connect(otherUser).requestClue(0, 1))
        .to.emit(cityNode, "ClueRequested")
        .withArgs(2, otherUser.address, 0, 1);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: scanAnomalies without seeded data
  // ============================================================

  describe("scanAnomalies Edge Cases", function () {
    beforeEach(async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);
    });

    it("should scan without emitting anomaly events when no tx refs exist", async function () {
      await cityNode.connect(player).inspectLocation(0);

      // No anomaly tx refs added, so scan should succeed but not emit anomaly events
      await expect(cityNode.connect(player).scanAnomalies(0))
        .to.not.emit(cityNode, "AnomalyTxLinked");

      const [, , scans] = await cityNode.getPlayerProgress(player.address);
      expect(scans).to.equal(1);
    });

    it("should scan with anomaly refs but no suspect wallets", async function () {
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));
      // No suspect wallets added

      await cityNode.connect(player).inspectLocation(0);

      await expect(cityNode.connect(player).scanAnomalies(0))
        .to.emit(cityNode, "AnomalyTxLinked")
        .and.to.not.emit(cityNode, "SuspectWalletObserved");
    });

    it("should reject scan on location not inspected", async function () {
      await cityNode.connect(owner).addAnomalyTxRef(makeTxRef(1));

      // Try scanning without inspecting first
      await expect(
        cityNode.connect(player).scanAnomalies(0)
      ).to.be.revertedWith("Inspect location first");
    });

    it("should reject scan on invalid location index", async function () {
      await expect(
        cityNode.connect(player).scanAnomalies(3)
      ).to.be.revertedWith("Invalid location index");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: View Functions
  // ============================================================

  describe("View Functions - Additional Coverage", function () {
    it("should return all 3 locations via getLocations", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      const locs = await cityNode.getLocations();
      expect(locs.length).to.equal(3);
      expect(locs[0].name).to.equal("Shibuya Crossing");
      expect(locs[1].name).to.equal("Akihabara District");
      expect(locs[2].name).to.equal("Tsukiji Market");
    });

    it("should return correct suspicion index after setup", async function () {
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("suspicious activity"));
      await cityNode.connect(owner).setSuspicionIndex(85, reasonHash);

      const [level, hash] = await cityNode.getSuspicionIndex();
      expect(level).to.equal(85);
      expect(hash).to.equal(reasonHash);
    });

    it("should return zeros for getEvidenceSummary on fresh player", async function () {
      const [totalClues, bundleHash, confidence] = await cityNode.getEvidenceSummary(player.address);
      expect(totalClues).to.equal(0);
      expect(bundleHash).to.equal(ethers.ZeroHash);
      expect(confidence).to.equal(0);
    });

    it("should return zeros for getPlayerProgress on fresh player", async function () {
      const [bitmap, clues, scans] = await cityNode.getPlayerProgress(player.address);
      expect(bitmap).to.equal(0);
      expect(clues).to.equal(0);
      expect(scans).to.equal(0);
    });

    it("should return default clue schema", async function () {
      const [totalClues, types] = await cityNode.getClueSchema();
      expect(totalClues).to.equal(3);
      expect(types.length).to.equal(3);
    });

    it("should return updated clue schema after setClueSchema", async function () {
      await cityNode.connect(owner).setClueSchema([0, 1]); // BEHAVIOR_FINGERPRINT, RELATIONSHIP
      const [totalClues, types] = await cityNode.getClueSchema();
      expect(totalClues).to.equal(2);
      expect(types.length).to.equal(2);
    });

    it("should return empty departure hints for non-existent mission", async function () {
      const hints = await cityNode.getDepartureHints(999);
      expect(hints.length).to.equal(0);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: requestDossier sequential IDs
  // ============================================================

  describe("requestDossier - Sequential IDs", function () {
    it("should emit sequential dossier request IDs", async function () {
      await cityNode.connect(owner).setupLocations(sampleLocations);

      await expect(cityNode.connect(player).requestDossier())
        .to.emit(cityNode, "DossierRequested")
        .withArgs(1, player.address, CITY_ID);

      await expect(cityNode.connect(otherUser).requestDossier())
        .to.emit(cityNode, "DossierRequested")
        .withArgs(2, otherUser.address, CITY_ID);
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Admin Access Control
  // ============================================================

  describe("Admin Functions - Additional Access Control", function () {
    it("should reject setupLocations from non-owner", async function () {
      await expect(
        cityNode.connect(player).setupLocations(sampleLocations)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject addAnomalyTxRef from non-owner", async function () {
      await expect(
        cityNode.connect(player).addAnomalyTxRef(makeTxRef(1))
      ).to.be.revertedWith("Not owner");
    });

    it("should reject addSuspectWallet from non-owner", async function () {
      const wallet = ethers.Wallet.createRandom().address;
      await expect(
        cityNode.connect(player).addSuspectWallet(makeSuspectWallet(wallet, 5))
      ).to.be.revertedWith("Not owner");
    });

    it("should reject setSuspicionIndex from non-owner", async function () {
      await expect(
        cityNode.connect(player).setSuspicionIndex(50, ethers.ZeroHash)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject setHint from non-owner", async function () {
      await expect(
        cityNode.connect(player).setHint(0, 0, ethers.ZeroHash, 50)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject setClueSchema from non-owner", async function () {
      await expect(
        cityNode.connect(player).setClueSchema([0, 1])
      ).to.be.revertedWith("Not owner");
    });

    it("should reject resetPlayerProgress from non-owner", async function () {
      await expect(
        cityNode.connect(player).resetPlayerProgress(player.address)
      ).to.be.revertedWith("Not owner");
    });

    it("should reject transferOwnership from non-owner", async function () {
      await expect(
        cityNode.connect(player).transferOwnership(player.address)
      ).to.be.revertedWith("Not owner");
    });
  });

  // ============================================================
  //    COVERAGE GAPS: Hint retrieval
  // ============================================================

  describe("Hint System", function () {
    it("should return correct hint after setting", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("important hint"));
      await cityNode.connect(owner).setHint(0, 0, hintHash, 75);

      const [returnedHash, strength] = await cityNode.getHint(0, 0);
      expect(returnedHash).to.equal(hintHash);
      expect(strength).to.equal(75);
    });

    it("should return zero hint for unset slot", async function () {
      const [hash, strength] = await cityNode.getHint(0, 0);
      expect(hash).to.equal(ethers.ZeroHash);
      expect(strength).to.equal(0);
    });

    it("should reject getHint with invalid location index", async function () {
      await expect(cityNode.getHint(3, 0)).to.be.revertedWith("Invalid location index");
    });

    it("should reject getHint with invalid clue index", async function () {
      await expect(cityNode.getHint(0, 3)).to.be.revertedWith("Invalid clue index");
    });
  });
});
