const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("Veritas resubmissions", function () {
  async function deployWithGrant() {
    const [issuer, grantee] = await ethers.getSigners();
    const Veritas = await ethers.getContractFactory("Veritas");
    const veritas = await Veritas.deploy();
    await veritas.waitForDeployment();

    await veritas.connect(issuer).createGrant(
      "Retryable grant",
      grantee.address,
      ["Ship MVP"],
      ["Evidence must show the MVP was shipped."],
      [ethers.parseEther("0.01")],
      { value: ethers.parseEther("0.01") },
    );

    return { veritas, issuer, grantee };
  }

  it("lets a grantee resubmit evidence after rejection", async function () {
    const { veritas, grantee } = await deployWithGrant();

    await veritas.connect(grantee).submitEvidence(0, 0, "https://example.com/attempt-1");
    let milestone = await veritas.getMilestone(0, 0);
    assert.equal(Number(milestone.status), 1);
    assert.equal(milestone.evidenceUrl, "https://example.com/attempt-1");
    assert.equal(milestone.resubmissionCount, 0n);

    await veritas.recordVerdict(0, 0, false);
    milestone = await veritas.getMilestone(0, 0);
    assert.equal(Number(milestone.status), 3);
    assert.equal(milestone.resubmissionCount, 0n);

    await veritas.connect(grantee).submitEvidence(0, 0, "https://example.com/attempt-2");
    milestone = await veritas.getMilestone(0, 0);
    assert.equal(Number(milestone.status), 1);
    assert.equal(milestone.evidenceUrl, "https://example.com/attempt-2");
    assert.equal(milestone.resubmissionCount, 1n);

    await veritas.recordVerdict(0, 0, false);
    await veritas.connect(grantee).submitEvidence(0, 0, "https://example.com/attempt-3");
    milestone = await veritas.getMilestone(0, 0);
    assert.equal(milestone.evidenceUrl, "https://example.com/attempt-3");
    assert.equal(milestone.resubmissionCount, 2n);
  });

  it("does not allow overwriting submitted evidence before a verdict", async function () {
    const { veritas, grantee } = await deployWithGrant();

    await veritas.connect(grantee).submitEvidence(0, 0, "https://example.com/attempt-1");
    await assert.rejects(
      veritas.connect(grantee).submitEvidence(0, 0, "https://example.com/overwrite"),
      /MilestoneNotSubmittable/,
    );
  });
});
