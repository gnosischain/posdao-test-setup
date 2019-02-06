pragma solidity ^0.5.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/ERC677BridgeTokenRewardableMock.sol";

contract TestToken {
  function testInitialSupplyUsingDeployedContract() public {
    ERC677BridgeTokenRewardableMock token =
            ERC677BridgeTokenRewardableMock(DeployedAddresses.ERC677BridgeTokenRewardableMock());
    Assert.equal(token.totalSupply(), 0, "Total supply should be 0 initially");
  }

  function testInitialSupplyWithNewToken() public {
    ERC677BridgeTokenRewardableMock token = new ERC677BridgeTokenRewardableMock("New Token", "NEW", 23);
    Assert.equal(token.totalSupply(), 0, "Total supply should be 0 initially");
  }
}
