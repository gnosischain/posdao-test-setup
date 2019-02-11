const BN = require('bn.js');
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
    const increment = 1;
    const incrementBN = new BN(increment.toString()); // web3.utils.toWei('1');
    for (var i = 0; i < accounts.length; i++) {
      const addr = accounts[i];
      console.log('   *** Minting tokens for account ' + addr.toString());
      const balanceBefore = await instance.balanceOf.call(addr);
      await instance.mint.call(addr, incrementBN);
      const balanceAfter = await instance.balanceOf.call(addr);
      assert.equal(balanceBefore.valueOf().add(incrementBN), balanceAfter.valueOf(),
                   'balances before minting and after do not differ by the minted amount.');
    }
  });
})
