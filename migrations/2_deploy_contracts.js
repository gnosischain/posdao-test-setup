var Hello = artifacts.require("./Hello.sol");

module.exports = function(deployer) {
  if (!Hello.isDeployed()) {
  	deployer.deploy(Hello);
  }
};
