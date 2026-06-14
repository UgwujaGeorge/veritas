import { config as loadEnv } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";

loadEnv();
loadEnv({ path: "backend/.env" });

const deployerPrivateKey = process.env.BASE_DEPLOYER_PRIVATE_KEY ?? process.env.RELAY_PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts,
    },
    baseMainnet: {
      url: process.env.BASE_MAINNET_RPC ?? "https://mainnet.base.org",
      chainId: 8453,
      accounts,
    },
  },
  paths: {
    sources: "contracts/solidity",
  },
};

export default config;
