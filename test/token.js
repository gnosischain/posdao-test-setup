const BN = web3.utils.BN;
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bn')(BN))
  .should();
const Token = artifacts.require('ERC677BridgeTokenRewardableMock');
const ValidatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3);
const constants = require('../utils/constants');
const SnS = require('../utils/signAndSendTx.js');

contract('TestToken', async accounts => {
  let instance;

  // NOTE: This test cannot succeed twice.
  //
  // it('should have 0 initial supply', async () => {
  //   instance = await Token.deployed();
  //   let supply = await instance.totalSupply.call();
  //   assert.equal(supply.valueOf(), 0, "the initial supply isn't 0");
  // });

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
    let minStake = await ValidatorSetContract.instance.methods.getCandidateMinStake().call()
        .should.be.fulfilled;
    const candidateStake = (new BN(minStake.toString())).mul(new BN('2'));
    for (candidate of constants.CANDIDATES) {
      console.log('  **** candidate =', candidate);
      const balanceBefore = await instance.balanceOf(candidate.staking);
      await instance.mint(candidate.staking, candidateStake).should.be.fulfilled;
      const balanceAfter = await instance.balanceOf(candidate.staking);
      balanceAfter.should.be.bignumber.equal(balanceBefore.add(candidateStake));
    }
  });

  it('candidates should make stakes on themselves', async () => {
    instance = await Token.deployed();
    let minStake = await ValidatorSetContract.instance.methods.getCandidateMinStake().call()
        .should.be.fulfilled;
    console.log('  **** minStake =', minStake);
    let minStakeBN = new BN(minStake.toString());
    console.log('  **** ValidatorSetContract.address =', ValidatorSetContract.address);

    for (candidate of constants.CANDIDATES) {
      console.log('  **** candidate =', candidate);
      let ibalance = await instance.balanceOf(candidate.staking);
      let istakeAmount = await ValidatorSetContract.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
      let istakeAmountBN = new BN(istakeAmount.toString());
      console.log('  ****** initial balance = ' + ibalance);
      console.log('  ****** initial stakeAmount = ' + istakeAmount);

      console.log('  **** add pool. linking staking address ' + candidate.staking + ' with mining address ' + candidate.mining);
      let pool_tx = await SnS(web3, {
          from: candidate.staking,
          to: ValidatorSetContract.address,
          method: ValidatorSetContract.instance.methods.addPool(minStake, candidate.mining),
          gasPrice: '1000000000',
      });
      console.log('  ****** pool_tx: status =', pool_tx.status, 'hash =', pool_tx.transactionHash, 'block number=', pool_tx.blockNumber);
      // console.log('  ***** pool_tx =', pool_tx);
      pool_tx.status.should.be.equal(true);


      let tx_details = {
          from:     candidate.staking,
	  to:       ValidatorSetContract.address,
	  method:   ValidatorSetContract.instance.methods.stake(candidate.staking, minStake),
          gasPrice: '1000000000',
      };
      let tx = await SnS(web3, tx_details, null);
      console.log('  ****** tx: status =', tx.status, ' hash =', tx.transactionHash, ' block number=', tx.blockNumber);
      // console.log('  **** tx :', tx);
      tx.status.should.be.equal(true);

      let fbalance = await instance.balanceOf(candidate.staking);
      let fstakeAmount = await ValidatorSetContract.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
      console.log('  **** final balance =', fbalance);
      console.log('  **** final stakeAmount =', fstakeAmount);
      let fstakeAmountBN = new BN(fstakeAmount.toString());

      fstakeAmountBN.should.be.bignumber.equal(istakeAmountBN.add(minStakeBN).mul(new BN('2')));
    }
  });
})
