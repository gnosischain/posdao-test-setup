const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const constants = require('../utils/constants');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
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

describe('Candidates make stakes on themselves', () => {
    var minStake;
    var minStakeBN;
    before(async () => {
        minStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        minStakeBN = new BN(minStake.toString());
    });

    it('Owner mints (2x minStake) tokens to candidates', async () => {
        let candidateTokensBN = minStakeBN.mul(new BN('2'));
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iTokenBalance = await StakingTokenContract.instance.methods.balanceOf(candidate.staking).call();
            let iTokenBalanceBN = new BN(iTokenBalance.toString());
            let tx = await SnS(web3, {
                from: OWNER,
                to: StakingTokenContract.address,
                method: StakingTokenContract.instance.methods.mint(candidate.staking, candidateTokensBN.toString()),
                gasPrice: '0',
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fTokenBalance = await StakingTokenContract.instance.methods.balanceOf(candidate.staking).call();
            let fTokenBalanceBN = new BN(fTokenBalance.toString());
            expect(fTokenBalanceBN, `Amount of minted staking tokens is incorrect for ${candidate.staking}`).to.be.bignumber.equal(iTokenBalanceBN.add(candidateTokensBN));
        }
    });

    it('Candidates add pools for themselves', async () => {
        let stakeBN = minStakeBN.clone();
        console.log('**** stake = ' + stakeBN.toString());
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iStake = await StakingAuRa.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let iStakeBN = new BN(iStake.toString());
            let tx = await sendInStakingWindow(web3, async () => {
                return SnS(web3, {
                    from: candidate.staking,
                    to: StakingAuRa.address,
                    method: StakingAuRa.instance.methods.addPool(stakeBN.toString(), candidate.mining),
                    gasPrice: '1000000000',
                });
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fStake = await StakingAuRa.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let fStakeBN = new BN(fStake.toString());
            expect(fStakeBN, `Stake on candidate ${candidate.staking} didn't increase`).to.be.bignumber.equal(iStakeBN.add(stakeBN));
        }
    });

    it('Candidates make stakes on themselves', async () => {
        let stakeBN = minStakeBN.clone();
        console.log('**** stake = ' + stakeBN.toString());
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iStake = await StakingAuRa.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let iStakeBN = new BN(iStake.toString());
            let tx = await sendInStakingWindow(web3, async () => {
                return SnS(web3, {
                    from: candidate.staking,
                    to: StakingAuRa.address,
                    method: StakingAuRa.instance.methods.stake(candidate.staking, stakeBN.toString()),
                    gasPrice: '1000000000',
                });
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fStake = await StakingAuRa.instance.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let fStakeBN = new BN(fStake.toString());
            expect(fStakeBN, `Stake on candidate ${candidate.staking} didn't increase`).to.be.bignumber.equal(iStakeBN.add(stakeBN));
        }
    });

    it('Candidates are in validator set in the new staking epoch', async() => {
        console.log('***** Wait for staking epoch to change');
        let validators = (await waitForValidatorSetChange(web3)).map(v => v.toLowerCase());
        for (candidate of constants.CANDIDATES) {
            let validatorIndex = validators.indexOf(candidate.mining.toLowerCase());
            expect(validatorIndex, `Candidate ${JSON.stringify(candidate)}
                is not in the validator set in the new epoch`)
                .to.not.equal(-1);
        }
    });

    it('New tokens are minted and deposited in the validators\' staking addresses', async () => {
        const mining_addrs = await ValidatorSetAuRa.instance.methods.getValidators().call();
        const unremovableValidator = (await ValidatorSetAuRa.instance.methods.unremovableValidator().call()).toLowerCase();
        for (let i = 0; i < 3; i++) {
            let validators = {};
            for (mining of mining_addrs) {
                const staking = (await ValidatorSetAuRa.instance.methods.stakingByMiningAddress(mining).call()).toLowerCase();
                const balance = await StakingTokenContract.instance.methods.balanceOf(staking).call();
                if (staking == unremovableValidator) {
                    // don't check unremovable validator because they didn't stake
                    continue;
                }
                validators[mining] = {
                    staking: staking,
                    balance: new BN(balance)
                };
            }
            console.log('***** Wait a bit');
            await new Promise(r => setTimeout(r, 10000));
            for (mining in validators) {
                const new_balance = new BN(await StakingTokenContract.instance.methods.balanceOf(validators[mining].staking).call());
                expect(new_balance, `Validator ${mining} did not receive minted tokens`)
                    .to.be.bignumber.above(validators[mining].balance);
                console.log(`**** validator ${mining} had ${validators[mining].balance} tokens before and ${new_balance} tokens after.`);
            }
        }
    });
});
