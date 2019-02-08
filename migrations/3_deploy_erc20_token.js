var Token = artifacts.require("./ERC677BridgeTokenRewardableMock.sol");
const constants = require("../utils/constants");
const ValidatorSetContract = require("../utils/getContract")("ValidatorSetAuRa", web3);

module.exports = async function(deployer) {
  if (!Token.isDeployed()) {
    await deployer.deploy(Token, "PoS Test Token", "POS", 18);
    const tokenContract = await Token.deployed();
    console.log("   *** ERC677BridgeTokenRewardableMock deployed");

    console.log("   *** Assuming VALIDATOR_SET_ADDRESS =", ValidatorSetContract.address);

    console.log("   *** Calling tokenContract.setValidatorSetContract");
    await tokenContract.setValidatorSetContract(ValidatorSetContract.address);

    console.log("   *** Estimating gas for ValidatorSet.setErc20TokenContract");
    let opts = {
      from: constants.OWNER,
      gasPrice: "0",
    };
    let egas = await ValidatorSetContract.instance.methods.setErc20TokenContract(tokenContract.address).estimateGas(opts);
    console.log("   *** Estimated gas value =", egas);
    console.log("   *** Calling ValidatorSet.setErc20TokenContract");
    opts.gas = egas;
    await ValidatorSetContract.instance.methods.setErc20TokenContract(tokenContract.address).send(opts);
  }
};
