const Web3 = require('web3');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const BN = web3.utils.BN;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const mintCoins = require('../utils/mintCoins');
const constants = require('../utils/constants');

let coins = constants.CANDIDATE_INITIAL_BALANCE;

module.exports = async function () {
    let txsp = mintCoins(web3, constants.OWNER, constants.CANDIDATES.map(c => c.staking), coins);
    let txs = await txsp;
    for (let tx of txs) {
        expect(tx.status, `Tx to mint inital balance failed: ${tx.transactionHash}`).to.equal(true);
    }
    for (let i = 0; i < constants.CANDIDATES.length; i++) {
        let candidate = constants.CANDIDATES[i].staking;
        let balanceBN = await web3.eth.getBalance(candidate);
        expect(balanceBN,
            `Amount initial coins minted to ${candidate} is incorrect: expected ${coins}, but got ${balanceBN.toString()}`
        ).to.be.equal(coins);
    }
}
