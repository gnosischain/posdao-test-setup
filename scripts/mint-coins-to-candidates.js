const Web3 = require('web3');
const path = require('path');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const BN = web3.utils.BN;
const ValidatorSetAuRa = require(path.join(__dirname, '../utils/getContract'))('ValidatorSetAuRa', web3);
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const mintCoins = require('../utils/mintCoins');
const constants = require('../utils/constants');

const coins = constants.CANDIDATE_INITIAL_BALANCE;

module.exports = async function () {
    const unremovableValidator = await ValidatorSetAuRa.instance.methods.unremovableValidator().call();
    const unremovableValidatorExists = unremovableValidator != '0x0000000000000000000000000000000000000000';
    let toWhom = [...constants.CANDIDATES.map(c => c.staking)];
    if (unremovableValidatorExists) {
        toWhom.push(unremovableValidator);
    }
    const txs = await mintCoins(web3, constants.OWNER, toWhom, coins);
    for (const tx of txs) {
        expect(tx.status, `Tx to mint inital balance failed: ${tx.transactionHash}`).to.equal(true);
    }
    for (let i = 0; i < constants.CANDIDATES.length; i++) {
        const candidate = constants.CANDIDATES[i].staking;
        const balanceBN = await web3.eth.getBalance(candidate);
        expect(balanceBN,
            `Amount initial coins minted to ${candidate} is incorrect: expected ${coins}, but got ${balanceBN.toString()}`
        ).to.be.equal(coins);
    }
    if (unremovableValidatorExists) {
        const balanceBN = await web3.eth.getBalance(unremovableValidator);
        expect(balanceBN,
            `Amount initial coins minted to unremovable validator (${unremovableValidator}) is incorrect: expected ${coins}, but got ${balanceBN.toString()}`
        ).to.be.equal(coins);
    }
}
