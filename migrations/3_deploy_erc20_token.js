var Token = artifacts.require("./ERC677BridgeTokenRewardableMock.sol");

module.exports = function(deployer) {
  if (!Token.isDeployed()) {
    deployer.deploy(Token, "PoS Test Token", "POS", 18);
  }
};
