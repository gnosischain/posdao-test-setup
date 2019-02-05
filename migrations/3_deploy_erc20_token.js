var Token = artifacts.require("../pos-contracts/test/mockContracts/ERC677BridgeTokenRewardableMock.sol");

module.exports = function(deployer) {
  deployer.deploy(Token, "PoS Test Token", "POS", 18);
};
