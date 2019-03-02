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
const sendInStakingWindow = require('../utils/sendInStakingWindow');
const pp = require('../utils/prettyPrint');

describe('Reported validators cannot withdraw their stakes',() => {
    'use strict';
    it('reports a validator as malicious', async () => {
        let i = 0;
        for (const candidate of CANDIDATES) {
            ++i;
            if (candidate === BAD_VALIDATOR) {
                console.error('bad validator!');
                continue;
            }
            console.log(i);
            const tx = await SnS(web3, {
                from: candidate.mining,
                to: ValidatorSetContract.address,
                method: ValidatorSetContract.instance.methods.reportMalicious(BAD_VALIDATOR.mining, 0, '0x'),
                gasPrice: '0',
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }
    });
});
