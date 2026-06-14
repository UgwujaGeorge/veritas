import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Veritas = await ethers.getContractFactory("Veritas");
  const veritas = await Veritas.deploy();

  await veritas.waitForDeployment();

  console.log(`Veritas deployed by ${deployer.address}`);
  console.log(`Veritas contract: ${await veritas.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
