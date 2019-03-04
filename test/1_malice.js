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
const StakingTokenContract = getContract('StakingToken');
const pp = require('../utils/prettyPrint');

describe('Reported validators cannot withdraw their stakes',() => {
    'use strict';
    it('reports a validator as malicious', async () => {
        let i = 0;
        for (;;) {
            const validators = await ValidatorSetContract.instance.methods.getValidators().call();
            for (const candidate of validators) {
                ++i;
                if (candidate === BAD_VALIDATOR.mining) {
                    console.error('bad validator!');
                }
                console.log(i);
                console.log('### sending transaction');
                const can_report = await expect(ValidatorSetContract.instance.methods.reportMaliciousCallable(candidate, BAD_VALIDATOR.mining, 1).call()).to.be.fulfilled;
                console.log(can_report);
                expect(Array.isArray(can_report)).to.be.equal(true);
                expect(can_report.length).to.be.equal(2);
                expect(Object.getPrototypeOf(can_report)).to.be.equal(true);
                if (!can_report[0] || can_report[1])
                    continue;
                SnS(web3, {
                    from: candidate,
                    to: ValidatorSetContract.address,
                    method: ValidatorSetContract.instance.methods.reportMalicious(BAD_VALIDATOR.mining, 1, '0x'),
                    gasPrice: '0',
                }).then(tx => {
                    console.log('### transaction sent');
                    pp.tx(tx);
                    expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
                }).catch(() => void 0);
            }
            console.log('end of loop');
        }
    });
});
