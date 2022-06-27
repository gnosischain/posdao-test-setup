const Web3 = require('web3');
const web3 = new Web3('http://localhost:8641');
const constants = require('../utils/constants');
const calcMinGasPrice = require('../utils/calcMinGasPrice');
const SnS = require('../utils/signAndSendTx.js');
const expect = require('chai').expect;

const RandomAuRa = require('../utils/getContract')('RandomAuRa', web3);

const BN = web3.utils.BN;
const OWNER = constants.OWNER;

describe('TxPermission test', () => {
  it('TxPermission does not work after the merge', async function() {
    let block = await web3.eth.getBlock('latest');

    // Make sure the merge is in the past
    expect(!block.step && !!block.mixHash, 'It seems the merge has not happened yet').to.equal(true);

    // Send some native coins to RandomAuRa contract.
    // This operation is restricted when TxPermission is active
    const minGasPrice = await calcMinGasPrice(web3);
    const gasPrice = minGasPrice.mul(new BN(2));
    const oneCoin = web3.utils.toWei('1', 'ether');
    const receipt = await SnS(web3, {
      from: OWNER,
      to: RandomAuRa.address,
      gasLimit: '30000',
      gasPrice,
      value: oneCoin
    });

    expect(receipt.status, 'Transaction was not successful').to.equal(true);
  });
});
