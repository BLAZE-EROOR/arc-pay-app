require("dotenv").config();
const hre = require("hardhat");

async function main() {
  console.log("Deploying USDCStaking contract to Arc Testnet...");

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  const USDCStaking = await hre.ethers.getContractFactory("USDCStaking");
  const staking = await USDCStaking.deploy(USDC_ADDRESS);

  await staking.waitForDeployment();

  const address = await staking.getAddress();
  console.log("✅ USDCStaking deployed to:", address);
  console.log("📋 Save this address — you'll need it for the frontend!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});