const Web3 = require('web3');
const web3 = new Web3('http://localhost:8641');
const expect = require('chai').expect;

const RandomAuRa = require('../utils/getContract')('RandomAuRa', web3);

const BN = web3.utils.BN;

describe('Randomness test', () => {
  it('RandomAuRa does not work after the merge', async function() {
    let block = await web3.eth.getBlock('latest');

    // Make sure the merge is in the past
    expect(!block.step && !!block.mixHash, 'It seems the merge has not happened yet').to.equal(true);

    const collectRoundLength = new BN(await RandomAuRa.instance.methods.collectRoundLength().call());
    const currentSeed = await RandomAuRa.instance.methods.currentSeed().call();
    const checkBlock = collectRoundLength.add(new BN(block.number));

    console.log(`    Waiting for the block ${checkBlock.toString()} ...`);
    do {
      await sleep(3500);
      block = await web3.eth.getBlock('latest');
    } while (checkBlock.gt(new BN(block.number)));

    // Make sure nobody committed
    const collectRound = new BN(await RandomAuRa.instance.methods.currentCollectRound().call());
    const committedValidatorsCount = web3.utils.hexToNumber(await web3.eth.getStorageAt(RandomAuRa.address, findMapLocation('2', collectRound)));
    expect(committedValidatorsCount === 0, 'Someone committed randomness hash. RandomAuRa still works, but should not').to.equal(true);

    // Make sure random seed didn't change
    expect(await RandomAuRa.instance.methods.currentSeed().call() == currentSeed, 'RandomAuRa seed is changed, but should not').to.equal(true);
  });
});

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}

function findMapLocation(slot, key) {
  return web3.utils.keccak256(web3.eth.abi.encodeParameters(['uint256','uint256'], [key, slot]));
}
