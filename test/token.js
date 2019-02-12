const BN = web3.utils.BN;
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();
const Token = artifacts.require('ERC677BridgeTokenRewardableMock')
const ValidatorSetContract = require("../utils/getContract")("ValidatorSetAuRa", web3);

contract('TestToken', async accounts => {
  it('should have 0 initial supply', async () => {
    var instance = await Token.deployed()
    var supply = await instance.totalSupply.call()
    assert.equal(supply.valueOf(), 0, "the initial supply isn't 0")
  })

  it('validatorSetContract field value should match ValidatorSet contract address', async () => {
    let instance = await Token.deployed();
    let validatorSetContractAddress = await instance.validatorSetContract.call();
    assert.equal(validatorSetContractAddress.valueOf(), ValidatorSetContract.address);
  });

  it('deployed address should match erc20TokenContract in ValidatorSet contract', async () => {
    let instance = await Token.deployed();
    let erc20TokenContract = await ValidatorSetContract.instance.methods.erc20TokenContract().call();
    assert.equal(erc20TokenContract.valueOf(), instance.address);
  });

  it('should mint tokens', async () => {
    assert(accounts.length > 0, 'no accounts to carry on the test');
    let instance = await Token.deployed();
    const increment = new BN(1);
    for (var i = 0; i < accounts.length; i++) {
      const addr = accounts[i];
      console.log('   *** Minting tokens for account ' + addr.toString());
      const balanceBefore = await instance.balanceOf(addr);
      await instance.mint(addr, increment).should.be.fulfilled;
      const balanceAfter = await instance.balanceOf(addr);
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(increment));
    }
  });
})
