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
const StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
const StakingTokenContract = require('../utils/getContract')('StakingToken', web3);
const sendInStakingWindow = require('../utils/sendInStakingWindow');
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
        for (const candidate of constants.CANDIDATES) {
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
});
