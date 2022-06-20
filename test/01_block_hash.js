const Web3 = require('web3');
const web3 = new Web3('http://localhost:8641');
const web3_2 = new Web3('http://localhost:8642');
const web3_3 = new Web3('http://localhost:8643');
const expect = require('chai').expect;

describe('Block hash test', () => {
  it('All nodes have the same block hash after the merge', async function() {
    const block = await web3.eth.getBlock('latest');

    // Make sure the merge is in the past
    expect(!block.step && !!block.mixHash, 'It seems the merge has not happened yet').to.equal(true);

    const block2 = await web3_2.eth.getBlock(block.number);
    const block3 = await web3_3.eth.getBlock(block.number);

    expect(block.hash === block2.hash, 'node and node2 have different block hashes').to.equal(true);
    expect(block.hash === block3.hash, 'node and node3 have different block hashes').to.equal(true);
  });
});
