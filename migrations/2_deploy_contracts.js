var Hello = artifacts.require("./Hello.sol");

module.exports = function(deployer) {
  deployer.deploy(Hello);
};
