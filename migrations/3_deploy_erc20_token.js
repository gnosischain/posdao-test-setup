var Token = artifacts.require("./ERC677BridgeTokenRewardableMock.sol");

module.exports = function(deployer) {
  deployer.deploy(Token, "PoS Test Token", "POS", 18);
};
