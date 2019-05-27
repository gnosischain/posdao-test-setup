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

    it('Delegators place stakes into the second candidate\'s pool', async () => {
        const candidate = constants.CANDIDATES[1].staking;

        console.log('**** Delegator addresses are generated');

        const delegatorsNumber = 10;
        let delegators = [];

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

        const minStake = await StakingAuRa.instance.methods.getDelegatorMinStake().call();
        const minStakeBN = new BN(minStake.toString());

        let promises;
        let nonce;
        let txs;

        console.log('**** Owner mints (3x minStake) tokens to delegators');

        const delegatorTokensBN = minStakeBN.mul(new BN('3'));

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
                method: StakingAuRa.instance.methods.stake(candidate, minStakeBN.toString()),
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
            expect(fStakeBN, `Stake on candidate ${candidate} didn't increase`).to.be.bignumber.equal(minStakeBN);
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

    it('New tokens are minted and deposited to the validators staking addresses', async () => {
        async function waitForTheLatestBlockOfEpoch(latestBlock) {
            while (true) {
                if (await web3.eth.getBlockNumber() >= latestBlock) {
                    break;
                } else {
                    await new Promise(r => setTimeout(r, 2499));
                }
            }
        }

        const mining_addrs = await ValidatorSetAuRa.instance.methods.getValidators().call();
        const unremovableValidator = (await ValidatorSetAuRa.instance.methods.unremovableValidator().call()).toLowerCase();

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
                balance: new BN(balance.toString())
            };
        }

        console.log('***** Wait for the last block of the current staking epoch');
        const latestBlock = await StakingAuRa.instance.methods.stakingEpochEndBlock().call();
        await waitForTheLatestBlockOfEpoch(latestBlock);

        console.log('***** Check balances changing');
        for (mining in validators) {
            const new_balance = new BN((await StakingTokenContract.instance.methods.balanceOf(validators[mining].staking).call()).toString());
            expect(new_balance, `Validator ${mining} did not receive minted tokens`)
                .to.be.bignumber.above(validators[mining].balance);
            console.log(`**** validator ${mining} had ${validators[mining].balance} tokens before and ${new_balance} tokens after.`);
        }
    });
});
