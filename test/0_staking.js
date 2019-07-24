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
const BlockRewardAuRa = require('../utils/getContract')('BlockRewardAuRa', web3);
const ValidatorSetAuRa = require('../utils/getContract')('ValidatorSetAuRa', web3);
const StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
const StakingTokenContract = require('../utils/getContract')('StakingToken', web3);
const sendInStakingWindow = require('../utils/sendInStakingWindow');
const waitForValidatorSetChange = require('../utils/waitForValidatorSetChange');
const pp = require('../utils/prettyPrint');
const keythereum = require('keythereum');
const REVERT_EXCEPTION_MSG = 'The execution failed due to an exception';
const waitForNextStakingEpoch = require('../utils/waitForNextStakingEpoch');

describe('Candidates place stakes on themselves', () => {
    var minCandidateStake;
    var minCandidateStakeBN;
    var minDelegatorStake;
    var minDelegatorStakeBN;
    const delegatorsNumber = 10;
    var delegators = [];

    before(async () => {
        // this is min stake per a CANDIDATE
        minCandidateStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        minDelegatorStake = await StakingAuRa.instance.methods.getDelegatorMinStake().call();
        minCandidateStakeBN = new BN(minCandidateStake.toString());
        minDelegatorStakeBN = new BN(minDelegatorStake.toString());

        console.log('**** Delegator addresses are generated');

        for (let i = 0; i < delegatorsNumber; i++) {
            keythereum.create({}, function (dk) {
                keythereum.dump("testnetpoa", dk.privateKey, dk.salt, dk.iv, {}, function (keyObject) {
                    keythereum.exportToFile(keyObject, "./accounts/keystore", function(keyFile) {
                        delegators.push(keyObject.address);
                    });
                });
            });
        }

        while (delegators.length < delegatorsNumber) {
            await new Promise(r => setTimeout(r, 100));
        }
    });

    it('Owner mints (2x minStake) tokens to candidates', async () => {
        let candidateTokensBN = minCandidateStakeBN.mul(new BN('2'));
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
        let stakeBN = minCandidateStakeBN.clone();
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

    it('Candidates place stakes on themselves', async () => {
        let stakeBN = minCandidateStakeBN.clone();
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

    it('Delegators place stakes into the second candidate\'s pool', async () => {
        const candidate = constants.CANDIDATES[1].staking;

        let promises;
        let nonce;
        let txs;

        console.log('**** Owner mints (3x minStake) tokens to delegators');

        const delegatorTokensBN = minDelegatorStakeBN.mul(new BN('3'));

        promises = [];
        nonce = await web3.eth.getTransactionCount(OWNER);
        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const prm = SnS(web3, {
                from: OWNER,
                to: StakingTokenContract.address,
                method: StakingTokenContract.instance.methods.mint(delegator, delegatorTokensBN.toString()),
                gasPrice: '0',
                nonce: nonce++
            });
            promises.push(prm);
        }
        txs = await Promise.all(promises);
        for (const tx of txs) {
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }

        console.log('**** BlockReward mints native coins to delegators');

        const newNativeBalance = '1000000000000000000';

        await SnS(web3, {
            from: OWNER,
            to: BlockRewardAuRa.address,
            method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]),
            gasPrice: '0'
        });

        promises = [];
        nonce = await web3.eth.getTransactionCount(OWNER);
        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const prm = SnS(web3, {
                from: OWNER,
                to: BlockRewardAuRa.address,
                method: BlockRewardAuRa.instance.methods.addExtraReceiver(newNativeBalance, delegator),
                gasPrice: '0',
                nonce: nonce++
            });
            promises.push(prm);
        }
        txs = await Promise.all(promises);
        for (const tx of txs) {
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }

        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const delegatorBalance = await web3.eth.getBalance(delegator);
            expect(delegatorBalance, `Amount of minted coins is incorrect for ${delegator}`).to.be.equal(newNativeBalance);
        }

        console.log('**** Delegators place stakes on the candidate');

        promises = [];
        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const prm = SnS(web3, {
                from: delegator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.stake(candidate, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000',
                gasLimit: '200000'
            });
            promises.push(prm);
        }
        txs = await Promise.all(promises);
        for (const tx of txs) {
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }

        for (let i = 0; i < delegatorsNumber; i++) {
            const fStake = await StakingAuRa.instance.methods.stakeAmount(candidate, delegators[i]).call();
            const fStakeBN = new BN(fStake.toString());
            expect(fStakeBN, `Stake on candidate ${candidate} didn't increase`).to.be.bignumber.equal(minDelegatorStakeBN);
        }

        // Test moving of stakes
        console.log('**** One of delegators moves stakes to another candidate');
        let candidate_rec = constants.CANDIDATES[2].staking;
        let delegator = delegators[0];

        // initial stake on the initial candidate
        let iStake = await StakingAuRa.instance.methods.stakeAmount(candidate, delegator).call();
        let iStakeBN = new BN(iStake.toString());

        // initial stake on the target candidate
        let iStake_rec = await StakingAuRa.instance.methods.stakeAmount(candidate_rec, delegator).call();
        let iStake_recBN = new BN(iStake_rec.toString());

        let tx = await SnS(web3, {
            from: delegator,
            to: StakingAuRa.address,
            method: StakingAuRa.instance.methods.moveStake(candidate, candidate_rec, minDelegatorStakeBN.toString()),
            gasPrice: '1000000000'
        });
        expect(tx.status, `Tx to move stake failed: ${tx.transactionHash}`).to.equal(true);

        // final stake on the initial candidate (should have decreased)
        let fStake = await StakingAuRa.instance.methods.stakeAmount(candidate, delegator).call();
        let fStakeBN = new BN(fStake.toString());
        let dStakeBN = fStakeBN.sub(iStakeBN);
        expect(dStakeBN, `Stake on initial candidate ${candidate} didn't decrease`).to.be.bignumber.equal(minDelegatorStakeBN.neg()); // x.neg() == -x

        // final stake on the target candidate (should have increased)
        let fStake_rec = await StakingAuRa.instance.methods.stakeAmount(candidate_rec, delegator).call();
        let fStake_recBN = new BN(fStake_rec.toString());
        let dStake_recBN = fStake_recBN.sub(iStake_recBN);
        expect(dStake_recBN, `Stake on target candidate ${candidate_rec} didn't increase`).to.be.bignumber.equal(minDelegatorStakeBN);

        console.log('**** Moving stake must fail if delegator tries to move stake to the same candidate');
        try {
            let tx2 = await SnS(web3, {
                from: delegator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.moveStake(candidate_rec, candidate_rec, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000'
            });
            expect(false, `Tx didn't throw an exception: ${tx2.transactionHash}. Tx status: ${tx2.status}`).to.equal(true);
        }
        catch (e) {
            expect(e && e.toString().includes(REVERT_EXCEPTION_MSG), `Tx threw an unexpected exception: ` + e.toString()).to.equal(true)
        }

        console.log('**** Delegator can\'t move more staking tokens than one has');
        try {
            let tx3 = await SnS(web3, {
                from: delegator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.moveStake(candidate, candidate_rec, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000'
            });
            expect(false, `Tx didn't throw an exception: ${tx3.transactionHash}. Tx status: ${tx3.status}`).to.equal(true);
        }
        catch (e) {
            expect(e && e.toString().includes(REVERT_EXCEPTION_MSG), `Tx threw an unexpected exception: ` + e.toString()).to.equal(true)
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

    it('New tokens are minted and deposited to the validators staking addresses; delegator claims ordered withdrawal', async () => {
        const miningAddresses = await ValidatorSetAuRa.instance.methods.getValidators().call();
        const unremovableValidator = (await ValidatorSetAuRa.instance.methods.unremovableValidator().call()).toLowerCase();
        const candidate = constants.CANDIDATES[2].staking;
        const delegator = delegators[0];

        let validators = {};
        for (mining of miningAddresses) {
            const staking = (await ValidatorSetAuRa.instance.methods.stakingByMiningAddress(mining).call()).toLowerCase();
            const balance = await StakingTokenContract.instance.methods.balanceOf(staking).call();
            if (staking == unremovableValidator) {
                // don't check unremovable validator because they didn't stake
                continue;
            }
            validators[mining] = {
                staking: staking,
                balance: new BN(balance.toString())
            };
        }

        // initial stake on the candidate
        const iStake = await StakingAuRa.instance.methods.stakeAmount(candidate, delegator).call();
        const iStakeBN = new BN(iStake.toString());
        console.log(`***** Initial stake of delegator ${delegator} on candidate ${candidate} is ${iStakeBN.toString()}, going to order withdrawal of ${minDelegatorStakeBN.toString()}`);
        const tx = await sendInStakingWindow(web3, async () => {
            return SnS(web3, {
                from: delegator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.orderWithdraw(candidate, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000'
            });
        });
        pp.tx(tx);
        expect(tx.status, `Tx to order withdrawal failed: ${tx.transactionHash}`).to.equal(true);

        await waitForNextStakingEpoch(web3);

        console.log('***** Check validator balances changing');
        for (mining in validators) {
            const new_balance = new BN((await StakingTokenContract.instance.methods.balanceOf(validators[mining].staking).call()).toString());
            expect(new_balance, `Validator ${mining} did not receive minted tokens`)
                .to.be.bignumber.above(validators[mining].balance);
            console.log(`**** validator ${mining} had ${validators[mining].balance} tokens before and ${new_balance} tokens after.`);
        }

        console.log('***** Claiming ordered withdrawal');
        const tx2 = await sendInStakingWindow(web3, async () => {
            return SnS(web3, {
                from: delegator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.claimOrderedWithdraw(candidate),
                gasPrice: '1000000000'
            });
        });
        pp.tx(tx2);
        const fStake = await StakingAuRa.instance.methods.stakeAmount(candidate, delegator).call();
        const fStakeBN = new BN(fStake.toString());

        expect(fStakeBN, `Candidate\'s (${candidate}) stake didn\'t decrease correctly after delegator (${delegator}) claimed the withdrawal: ` +
                        `initial = ${iStakeBN.toString()}, final = ${fStakeBN.toString()}, withdraw amount = ${minDelegatorStakeBN.toString()}`
                ).to.be.bignumber.equal(iStakeBN.sub(minDelegatorStakeBN));
    });
});
