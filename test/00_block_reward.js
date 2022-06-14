const Web3 = require('web3');
const web3 = new Web3('http://localhost:8641');
const web3_2 = new Web3('http://localhost:8642');
const web3_3 = new Web3('http://localhost:8643');
web3.eth.transactionConfirmationBlocks = 1;
const constants = require('../utils/constants');
const calcMinGasPrice = require('../utils/calcMinGasPrice');
const SnS = require('../utils/signAndSendTx.js');
const expect = require('chai').expect;

const BlockRewardAuRa = require('../utils/getContract')('BlockRewardAuRa', web3);

const BN = web3.utils.BN;
const OWNER = constants.OWNER;

describe('BlockReward tests', () => {
  it('BlockReward works before the merge', async function() {
    const testAddress = '0x7F57249A03C3d07E4539CFf2E7bcc5b086367001';
    let block = await web3.eth.getBlock('latest');

    // Make sure the merge transition hasn't happened yet
    expect(block.step > 0, `Cannot find step field of the block. It seems the merge already happened`).to.equal(true);

    // Allow the owner minting native coins
    let minGasPrice = await calcMinGasPrice(web3);
    let gasPrice = minGasPrice.mul(new BN(2));
    await SnS(web3, {
      from: OWNER,
      to: BlockRewardAuRa.address,
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]),
      gasPrice
    });

    // Mint one native coin
    const oneCoin = web3.utils.toWei('1', 'ether');
    await SnS(web3, {
      from: OWNER,
      to: BlockRewardAuRa.address,
      method: BlockRewardAuRa.instance.methods.addExtraReceiver(oneCoin, testAddress),
      gasPrice
    });

    expect(await web3.eth.getBalance(testAddress) === oneCoin, 'The balance of the test address did not increase').to.equal(true);
  });
});
