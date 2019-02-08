const Token = artifacts.require('ERC677BridgeTokenRewardableMock')

const ValidatorSetContract = require("../utils/getContract")("ValidatorSetAuRa", web3);

contract('TestToken', _accounts => {
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
})
