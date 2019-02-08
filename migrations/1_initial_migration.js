var Migrations = artifacts.require("./Migrations.sol");

module.exports = function(deployer) {
  if (!Migrations.isDeployed()) {
    deployer.deploy(Migrations);
  }
};
