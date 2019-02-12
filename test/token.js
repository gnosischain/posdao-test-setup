const BN = web3.utils.BN;
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();
const Token = artifacts.require('ERC677BridgeTokenRewardableMock');
const ValidatorSetContract = require("../utils/getContract")("ValidatorSetAuRa", web3);
const constants = require('../utils/constants');

contract('TestToken', async accounts => {
  let instance;

  it('should have 0 initial supply', async () => {
    instance = await Token.deployed();
    let supply = await instance.totalSupply.call();
    assert.equal(supply.valueOf(), 0, "the initial supply isn't 0");
  });

  it('validatorSetContract field value should match ValidatorSet contract address', async () => {
    instance = await Token.deployed();
    let validatorSetContractAddress = await instance.validatorSetContract.call();
    assert.equal(validatorSetContractAddress.valueOf(), ValidatorSetContract.address);
  });

  it('deployed address should match erc20TokenContract in ValidatorSet contract', async () => {
    instance = await Token.deployed();
    let erc20TokenContract = await ValidatorSetContract.instance.methods.erc20TokenContract().call();
    assert.equal(erc20TokenContract.valueOf(), instance.address);
  });

  it('should mint staking tokens to candidates', async () => {
    instance = await Token.deployed();
    const candidateStake = new BN(web3.utils.toWei('1', 'ether').toString());
    for (candidate of constants.CANDIDATES) {
    const balanceBefore = await instance.balanceOf(candidate);
      await instance.mint(candidate, candidateStake).should.be.fulfilled;
      const balanceAfter = await instance.balanceOf(candidate);
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(candidateStake));
    }
  });
})
