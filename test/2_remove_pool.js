const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const constants = require('../utils/constants');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const BN = web3.utils.BN;
const OWNER = constants.OWNER;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const ValidatorSetAuRa = require('../utils/getContract')('ValidatorSetAuRa', web3);
const StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
const StakingTokenContract = require('../utils/getContract')('StakingToken', web3);
const sendInStakingWindow = require('../utils/sendInStakingWindow');
const waitForValidatorSetChange = require('../utils/waitForValidatorSetChange');
const pp = require('../utils/prettyPrint');

describe('Pool removal and validator set change', () => {
    let tiredValidator = {};

    it('Validator removes his pool', async () => {
        let validators = await ValidatorSetAuRa.instance.methods.getValidators().call();
        console.log('***** Initial validator set = ' + JSON.stringify(validators));
        if (!validators.length == 1) {
            throw new Error('This test cannot be performed because it requires at least 2 validators in the validatorSet');
        }

        tiredValidator.mining = validators[validators.length-1];
        tiredValidator.staking = await ValidatorSetAuRa.instance.methods.stakingByMiningAddress(tiredValidator.mining).call();
        console.log('***** Validator to be removed: ' + JSON.stringify(tiredValidator));
        let tx = await sendInStakingWindow(web3, async () => {
            return SnS(web3, {
                from: tiredValidator.staking,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.removeMyPool(),
                gasPrice: '1000000000',
            });
        });
        pp.tx(tx);
        expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
    });

    it('Validator is not present in the validator set in the next stacking epoch', async () => {
        console.log('***** Wait for staking epoch to change');
        let validators = (await waitForValidatorSetChange(web3)).map(v => v.toLowerCase());
        let validatorIndex = validators.indexOf(tiredValidator.mining.toLowerCase());
        expect(validatorIndex, `Validator ${JSON.stringify(tiredValidator)}
            removed his pool but still is in validator set`)
            .to.equal(-1);
    });
});
