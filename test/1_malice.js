'use strict';
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const constants = require('../utils/constants');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
const BN = web3.utils.BN;
const { OWNER, BAD_VALIDATOR, CANDIDATES } = constants;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const getContract = (((getContractInner, w) => name => getContractInner(name, w))
    (require('../utils/getContract'), web3));
const ValidatorSetContract = getContract('ValidatorSetAuRa');
const StakingAuRa = getContract('StakingAuRa');
const StakingTokenContract = getContract('StakingToken');
const pp = require('../utils/prettyPrint');

describe('Reported validators cannot withdraw their stakes',() => {
    'use strict';
    it('reports a validator as malicious', async () => {
        let i = 0;
        let old_block = 0;
        const validators = await ValidatorSetContract.instance.methods.getValidators().call();
        expect(Array.isArray(validators)).to.be.equal(true);
        expect(validators.length).to.be.not.equal(0);
        const bad_validator = validators[0];
        console.log(bad_validator);
        while (!await expect(ValidatorSetContract.instance.methods.isReportValidatorValid(bad_validator).call()).to.be.fulfilled)
            await new Promise(s => setTimeout(s, 500));
        console.log('Success!');
        const blockNum = await expect(web3.eth.getBlockNumber()).to.be.fulfilled;
        if (blockNum > old_block) {
            console.log((old_block = blockNum));
        }
        for (i = 1; i < validators.length; ++i) {
            const candidate = validators[i];
            const isValid = await expect(ValidatorSetContract.instance.methods.isReportValidatorValid(candidate).call()).to.be.fulfilled;
            expect(isValid).to.be.equal(true);
            const can_report = await expect(ValidatorSetContract.instance.methods.reportMaliciousCallable(candidate, bad_validator, blockNum).call()).to.be.fulfilled;
            console.log(can_report);
            expect(Array.isArray(can_report)).to.be.equal(false);
            expect(Object.getPrototypeOf(can_report)).to.not.be.equal(Object.prototype);
            if (!can_report[0])
                continue;
            console.log('### transaction sent');
            await SnS(web3, {
                from: candidate,
                to: ValidatorSetContract.address,
                method: ValidatorSetContract.instance.methods.reportMalicious(bad_validator, 1, '0x'),
                gasPrice: '0',
            }).then(tx => {
                pp.tx(tx);
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            });
        }
        const miningAddress = await ValidatorSetContract.instance.methods.stakingByMiningAddress(validators[0]).call();
        await expect(SnS(web3, {
            from: miningAddress,
            to: StakingAuRa.address,
            method: StakingAuRa.instance.methods.withdraw(miningAddress, 1),
            gasPrice: '0',
        })).to.be.rejected;
        console.log('Transaction sent and rejected');
    });
});
