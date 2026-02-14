import { expect } from "chai";
import { ethers } from "hardhat";
import { CityNode } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("CityNode", function () {
  let cityNode: CityNode;
  let owner: SignerWithAddress;
  let creOracle: SignerWithAddress;
  let otherUser: SignerWithAddress;

  const CITY_NAME = "Tokyo";
  const CHAIN_ID = 421614;

  beforeEach(async function () {
    [owner, creOracle, otherUser] = await ethers.getSigners();

    const CityNodeFactory = await ethers.getContractFactory("CityNode");
    cityNode = await CityNodeFactory.deploy(
      CITY_NAME,
      CHAIN_ID,
      creOracle.address
    ) as CityNode;
  });

  describe("Deployment", function () {
    it("should set correct city name", async function () {
      expect(await cityNode.cityName()).to.equal(CITY_NAME);
    });

    it("should set correct chain ID", async function () {
      expect(await cityNode.chainId()).to.equal(CHAIN_ID);
    });

    it("should set correct CRE oracle", async function () {
      expect(await cityNode.creOracle()).to.equal(creOracle.address);
    });
  });

  describe("Carmen Presence", function () {
    it("should default to Carmen not present", async function () {
      expect(await cityNode.getCarmenStatus(1)).to.equal(false);
    });

    it("should allow CRE to set Carmen as present", async function () {
      await cityNode.connect(creOracle).updateCarmenPresence(1, true);
      expect(await cityNode.getCarmenStatus(1)).to.equal(true);
    });

    it("should emit CarmenArrived when Carmen arrives", async function () {
      await expect(cityNode.connect(creOracle).updateCarmenPresence(1, true))
        .to.emit(cityNode, "CarmenArrived")
        .withArgs(1);
    });

    it("should emit CarmenDeparted when Carmen leaves", async function () {
      await cityNode.connect(creOracle).updateCarmenPresence(1, true);
      await expect(cityNode.connect(creOracle).updateCarmenPresence(1, false))
        .to.emit(cityNode, "CarmenDeparted")
        .withArgs(1);
    });

    it("should not emit event when status unchanged", async function () {
      // Carmen not present -> set not present = no event
      await expect(cityNode.connect(creOracle).updateCarmenPresence(1, false))
        .to.not.emit(cityNode, "CarmenArrived")
        .and.to.not.emit(cityNode, "CarmenDeparted");
    });

    it("should reject non-CRE updates", async function () {
      await expect(
        cityNode.connect(otherUser).updateCarmenPresence(1, true)
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should track presence per mission", async function () {
      await cityNode.connect(creOracle).updateCarmenPresence(1, true);
      await cityNode.connect(creOracle).updateCarmenPresence(2, false);

      expect(await cityNode.getCarmenStatus(1)).to.equal(true);
      expect(await cityNode.getCarmenStatus(2)).to.equal(false);
    });
  });

  describe("Departure Hints", function () {
    it("should allow CRE to record departure hint", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("headed to a city with a famous river"));
      const ipfsPointer = "ipfs://bafyhint1";

      await cityNode.connect(creOracle).recordDepartureHint(1, hintHash, ipfsPointer);

      const hints = await cityNode.getDepartureHints(1);
      expect(hints.length).to.equal(1);
      expect(hints[0].contentHash).to.equal(hintHash);
      expect(hints[0].ipfsPointer).to.equal(ipfsPointer);
      expect(hints[0].timestamp).to.be.gt(0);
    });

    it("should emit DepartureHintRecorded", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("port city route"));
      const ipfsPointer = "ipfs://bafyhint2";

      await expect(cityNode.connect(creOracle).recordDepartureHint(1, hintHash, ipfsPointer))
        .to.emit(cityNode, "DepartureHintRecorded")
        .withArgs(1, hintHash, ipfsPointer);
    });

    it("should reject non-CRE hint writes", async function () {
      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("timezone clue"));

      await expect(
        cityNode.connect(otherUser).recordDepartureHint(1, hintHash, "ipfs://bafyhint3")
      ).to.be.revertedWith("Not CRE oracle");
    });

    it("should reject invalid hints", async function () {
      await expect(
        cityNode.connect(creOracle).recordDepartureHint(1, ethers.ZeroHash, "ipfs://bafyhint4")
      ).to.be.revertedWith("Invalid hint");

      const hintHash = ethers.keccak256(ethers.toUtf8Bytes("coastal clue"));
      await expect(
        cityNode.connect(creOracle).recordDepartureHint(1, hintHash, "")
      ).to.be.revertedWith("Invalid hint");
    });

    it("should track hints per mission", async function () {
      const hintHash1 = ethers.keccak256(ethers.toUtf8Bytes("mission one clue"));
      const hintHash2 = ethers.keccak256(ethers.toUtf8Bytes("mission two clue"));

      await cityNode.connect(creOracle).recordDepartureHint(1, hintHash1, "ipfs://bafyhint5");
      await cityNode.connect(creOracle).recordDepartureHint(2, hintHash2, "ipfs://bafyhint6");

      const mission1Hints = await cityNode.getDepartureHints(1);
      const mission2Hints = await cityNode.getDepartureHints(2);

      expect(mission1Hints.length).to.equal(1);
      expect(mission1Hints[0].contentHash).to.equal(hintHash1);

      expect(mission2Hints.length).to.equal(1);
      expect(mission2Hints[0].contentHash).to.equal(hintHash2);
    });
  });

  describe("Admin", function () {
    it("should allow owner to update CRE oracle", async function () {
      await cityNode.connect(owner).setCREOracle(otherUser.address);
      expect(await cityNode.creOracle()).to.equal(otherUser.address);
    });

    it("should reject non-owner updating CRE oracle", async function () {
      await expect(
        cityNode.connect(creOracle).setCREOracle(otherUser.address)
      ).to.be.revertedWith("Not owner");
    });
  });
});