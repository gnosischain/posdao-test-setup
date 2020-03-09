const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const constants = require('../utils/constants');
const { compile, getValidatorSetContractAddress } = require('../utils/utils');
const mintCoins = require('../utils/mintCoins');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const BN = web3.utils.BN;
const OWNER = constants.OWNER;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;

const sendInStakingWindow = require('../utils/sendInStakingWindow');
const waitForValidatorSetChange = require('../utils/waitForValidatorSetChange');
const pp = require('../utils/prettyPrint');
const REVERT_EXCEPTION_MSG = 'The execution failed due to an exception';
const waitForNextStakingEpoch = require('../utils/waitForNextStakingEpoch');

var BlockRewardAuRa;
var ValidatorSetAuRa;
var StakingAuRa;
var StakingTokenContract;

describe('Initialize contract instances', () => {
    it('Done', async () => {
        ValidatorSetAuRa = new web3.eth.Contract(
          require(`${constants.ARTIFACTS_PATH}ValidatorSetAuRa.json`).abi,
          getValidatorSetContractAddress()
        );
        BlockRewardAuRa = new web3.eth.Contract(
          require(`${constants.ARTIFACTS_PATH}BlockRewardAuRa.json`).abi,
          await ValidatorSetAuRa.methods.blockRewardContract().call()
        );
        StakingAuRa = new web3.eth.Contract(
          require(`${constants.ARTIFACTS_PATH}StakingAuRa.json`).abi,
          await ValidatorSetAuRa.methods.stakingContract().call()
        );
        const StakingTokenContractCompiled = await compile(
            __dirname + '/../posdao-contracts/test/mockContracts/',
            'ERC677BridgeTokenRewardableMock'
        );
        StakingTokenContract = new web3.eth.Contract(
            StakingTokenContractCompiled.abi,
            await StakingAuRa.methods.erc677TokenContract().call()
        );
    });
});

describe('Owner mints native coins for the candidates and initial validators', () => {
    it('Done', async () => {
        let toWhom = [...constants.CANDIDATES.map(c => c.staking)];
        const initialStakingAddresses = await StakingAuRa.methods.getPools().call();
        for (let i = 0; i < initialStakingAddresses.length; i++) {
            toWhom.push(initialStakingAddresses[i]);
        }
        const txs = await mintCoins(web3, constants.OWNER, toWhom, constants.CANDIDATE_INITIAL_BALANCE, BlockRewardAuRa);
        for (const tx of txs) {
            expect(tx.status, `Tx to mint initial balance failed: ${tx.transactionHash}`).to.equal(true);
        }
        for (let i = 0; i < toWhom.length; i++) {
            const balanceBN = await web3.eth.getBalance(toWhom[i]);
            expect(balanceBN,
                `Amount initial coins minted to ${toWhom[i]} is incorrect: expected ${constants.CANDIDATE_INITIAL_BALANCE}, but got ${balanceBN.toString()}`
            ).to.be.equal(constants.CANDIDATE_INITIAL_BALANCE);
        }
    });
});

describe('Initial validators remove their pools', () => {
    it('Done', async () => {
        console.log('  ***** Wait for staking epoch to change and validator set to be finalized');
        await waitForValidatorSetChange(web3, ValidatorSetAuRa, StakingAuRa);
        const unremovableValidator = await ValidatorSetAuRa.methods.unremovableValidator().call();
        const stakingAddresses = await StakingAuRa.methods.getPools().call();
        console.log('  ***** Validators call removeMyPool function');
        for (let i = 0; i < stakingAddresses.length; i++) {
            if (stakingAddresses[i] == unremovableValidator) {
                continue;
            }
            const tx = await SnS(web3, {
                from: stakingAddresses[i],
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.removeMyPool(),
                gasPrice: '1000000000',
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }
    });
});

describe('Tests of staking...', () => {
    var minCandidateStake;
    var minCandidateStakeBN;
    var minDelegatorStake;
    var minDelegatorStakeBN;
    const delegatorsNumber = 10;
    var delegators = [];

    before(async () => {
        // this is min stake per a CANDIDATE
        minCandidateStake = await StakingAuRa.methods.candidateMinStake().call();
        minDelegatorStake = await StakingAuRa.methods.delegatorMinStake().call();
        minCandidateStakeBN = new BN(minCandidateStake.toString());
        minDelegatorStakeBN = new BN(minDelegatorStake.toString());

        const keysPassword = fs.readFileSync(
            path.join(__dirname, '../config/password'),
            'utf-8'
        ).trim();

        console.log('**** Delegator addresses are generated');
        for (let i = 0; i < delegatorsNumber; i++) {
            let acc = web3.eth.accounts.create();
            let keystoreObj = web3.eth.accounts.encrypt(acc.privateKey, keysPassword);
            delegators.push(acc.address);
            fs.writeFileSync(path.join(__dirname, '../accounts/keystore', acc.address.substring(2).toLowerCase() + '.json'), JSON.stringify(keystoreObj), 'utf8');
        }
    });

    it('Owner mints (2x minStake) tokens to candidates', async () => {
        let candidateTokensBN = minCandidateStakeBN.mul(new BN('2'));
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iTokenBalance = await StakingTokenContract.methods.balanceOf(candidate.staking).call();
            let iTokenBalanceBN = new BN(iTokenBalance.toString());
            let tx = await SnS(web3, {
                from: OWNER,
                to: StakingTokenContract.options.address,
                method: StakingTokenContract.methods.mint(candidate.staking, candidateTokensBN.toString()),
                gasPrice: '0',
            });
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fTokenBalance = await StakingTokenContract.methods.balanceOf(candidate.staking).call();
            let fTokenBalanceBN = new BN(fTokenBalance.toString());
            expect(fTokenBalanceBN, `Amount of minted staking tokens is incorrect for ${candidate.staking}`).to.be.bignumber.equal(iTokenBalanceBN.add(candidateTokensBN));
        }
    });

    it('Owner emulates bridge token fee accrual', async () => {
        const stakeTokenInflationRate = await BlockRewardAuRa.methods.STAKE_TOKEN_INFLATION_RATE().call();
        if (stakeTokenInflationRate != 0) {
            console.log('Skipping this step because inflation is activated (the reward will be minted as a result of inflation, not a bridge fee)');
            return;
        }
        const bridgeTokenFeeAmount = '1000000000000000000';
        await SnS(web3, {
            from: OWNER,
            to: BlockRewardAuRa.options.address,
            method: BlockRewardAuRa.methods.setErcToErcBridgesAllowed([OWNER]),
            gasPrice: '0'
        });
        await SnS(web3, {
            from: OWNER,
            to: BlockRewardAuRa.options.address,
            method: BlockRewardAuRa.methods.addBridgeTokenRewardReceivers(bridgeTokenFeeAmount),
            gasPrice: '0'
        });
        const bridgeTokenFeeActual = new BN(await BlockRewardAuRa.methods.bridgeTokenReward().call());
        expect(bridgeTokenFeeActual, 'bridgeTokenReward amount is incorrect').to.be.bignumber.equal(new BN(bridgeTokenFeeAmount));
    });

    it('Candidates add pools for themselves', async () => {
        let stakeBN = minCandidateStakeBN.clone();
        console.log('**** stake = ' + stakeBN.toString());
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iStake = await StakingAuRa.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let iStakeBN = new BN(iStake.toString());
            let tx = await sendInStakingWindow(web3, async () => {
                return SnS(web3, {
                    from: candidate.staking,
                    to: StakingAuRa.options.address,
                    method: StakingAuRa.methods.addPool(stakeBN.toString(), candidate.mining),
                    gasPrice: '1000000000',
                });
            }, StakingAuRa);
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fStake = await StakingAuRa.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let fStakeBN = new BN(fStake.toString());
            expect(fStakeBN, `Stake on candidate ${candidate.staking} didn't increase`).to.be.bignumber.equal(iStakeBN.add(stakeBN));
        }
    });

    it('Candidates place stakes on themselves', async () => {
        let stakeBN = minCandidateStakeBN.clone();
        console.log('**** stake = ' + stakeBN.toString());
        for (candidate of constants.CANDIDATES) {
            console.log('**** candidate =', JSON.stringify(candidate));
            let iStake = await StakingAuRa.methods.stakeAmount(candidate.staking, candidate.staking).call();
            let iStakeBN = new BN(iStake.toString());
            let tx = await sendInStakingWindow(web3, async () => {
                return SnS(web3, {
                    from: candidate.staking,
                    to: StakingAuRa.options.address,
                    method: StakingAuRa.methods.stake(candidate.staking, stakeBN.toString()),
                    gasPrice: '1000000000',
                });
            }, StakingAuRa);
            pp.tx(tx);
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            let fStake = await StakingAuRa.methods.stakeAmount(candidate.staking, candidate.staking).call();
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
                to: StakingTokenContract.options.address,
                method: StakingTokenContract.methods.mint(delegator, delegatorTokensBN.toString()),
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

        promises = [];
        nonce = await web3.eth.getTransactionCount(OWNER);
        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const prm = SnS(web3, {
                from: OWNER,
                to: BlockRewardAuRa.options.address,
                method: BlockRewardAuRa.methods.addExtraReceiver(newNativeBalance, delegator),
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
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.stake(candidate, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000',
                gasLimit: '300000'
            });
            promises.push(prm);
        }
        txs = await Promise.all(promises);
        for (const tx of txs) {
            expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
        }

        for (let i = 0; i < delegatorsNumber; i++) {
            const fStake = await StakingAuRa.methods.stakeAmount(candidate, delegators[i]).call();
            const fStakeBN = new BN(fStake.toString());
            expect(fStakeBN, `Stake on candidate ${candidate} didn't increase`).to.be.bignumber.equal(minDelegatorStakeBN);
        }

        // Test moving of stakes
        console.log('**** One of delegators moves their stake to another candidate');
        let candidate_rec = constants.CANDIDATES[2].staking;
        let delegator = delegators[0];

        // initial stake on the initial candidate
        let iStake = await StakingAuRa.methods.stakeAmount(candidate, delegator).call();
        let iStakeBN = new BN(iStake.toString());

        // initial stake on the target candidate
        let iStake_rec = await StakingAuRa.methods.stakeAmount(candidate_rec, delegator).call();
        let iStake_recBN = new BN(iStake_rec.toString());

        let tx = await SnS(web3, {
            from: delegator,
            to: StakingAuRa.options.address,
            method: StakingAuRa.methods.moveStake(candidate, candidate_rec, minDelegatorStakeBN.toString()),
            gasPrice: '1000000000'
        });
        expect(tx.status, `Tx to move stake failed: ${tx.transactionHash}`).to.equal(true);

        // final stake on the initial candidate (should have decreased)
        let fStake = await StakingAuRa.methods.stakeAmount(candidate, delegator).call();
        let fStakeBN = new BN(fStake.toString());
        let dStakeBN = fStakeBN.sub(iStakeBN);
        expect(dStakeBN, `Stake on initial candidate ${candidate} didn't decrease`).to.be.bignumber.equal(minDelegatorStakeBN.neg()); // x.neg() == -x

        // final stake on the target candidate (should have increased)
        let fStake_rec = await StakingAuRa.methods.stakeAmount(candidate_rec, delegator).call();
        let fStake_recBN = new BN(fStake_rec.toString());
        let dStake_recBN = fStake_recBN.sub(iStake_recBN);
        expect(dStake_recBN, `Stake on target candidate ${candidate_rec} didn't increase`).to.be.bignumber.equal(minDelegatorStakeBN);

        console.log('**** Moving stake must fail if delegator tries to move their stake to the same candidate');
        try {
            let tx2 = await SnS(web3, {
                from: delegator,
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.moveStake(candidate_rec, candidate_rec, minDelegatorStakeBN.toString()),
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
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.moveStake(candidate, candidate_rec, minDelegatorStakeBN.toString()),
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
        let validators = (await waitForValidatorSetChange(web3, ValidatorSetAuRa, StakingAuRa)).map(v => v.toLowerCase());
        for (candidate of constants.CANDIDATES) {
            let validatorIndex = validators.indexOf(candidate.mining.toLowerCase());
            expect(validatorIndex, `Candidate ${JSON.stringify(candidate)}
                is not in the validator set in the new epoch`)
                .to.not.equal(-1);
        }
    });

    it('New tokens are minted and deposited to the BlockRewardAuRa contract; delegator claims ordered withdrawal', async () => {
        const miningAddresses = await ValidatorSetAuRa.methods.getValidators().call();
        const unremovableValidator = (await ValidatorSetAuRa.methods.unremovableValidator().call()).toLowerCase();
        const candidate = constants.CANDIDATES[2].staking;
        const delegator = delegators[0];

        const stakingEpoch = await StakingAuRa.methods.stakingEpoch().call();
        const iBlockRewardAuRaBalance = new BN(await StakingTokenContract.methods.balanceOf(BlockRewardAuRa.options.address).call());

        let validators = {};
        for (mining of miningAddresses) {
            const staking = (await ValidatorSetAuRa.methods.stakingByMiningAddress(mining).call()).toLowerCase();
            const balance = await BlockRewardAuRa.methods.epochPoolTokenReward(stakingEpoch, mining).call();
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
        const iStake = await StakingAuRa.methods.stakeAmount(candidate, delegator).call();
        const iStakeBN = new BN(iStake.toString());
        console.log(`***** Initial stake of delegator ${delegator} on candidate ${candidate} is ${iStakeBN.toString()}, going to order withdrawal of ${minDelegatorStakeBN.toString()}`);
        const tx = await sendInStakingWindow(web3, async () => {
            return SnS(web3, {
                from: delegator,
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.orderWithdraw(candidate, minDelegatorStakeBN.toString()),
                gasPrice: '1000000000'
            });
        }, StakingAuRa);
        pp.tx(tx);
        expect(tx.status, `Tx to order withdrawal failed: ${tx.transactionHash}`).to.equal(true);

        const fStake = await StakingAuRa.methods.stakeAmount(candidate, delegator).call();
        const fStakeBN = new BN(fStake.toString());

        expect(fStakeBN, `Delegator\'s stake didn\'t decrease correctly after they (${delegator}) ordered the withdrawal: ` +
                        `initial = ${iStakeBN.toString()}, final = ${fStakeBN.toString()}, ordered amount = ${minDelegatorStakeBN.toString()}`
                ).to.be.bignumber.equal(iStakeBN.sub(minDelegatorStakeBN));

        await waitForNextStakingEpoch(web3, StakingAuRa);

        await new Promise(r => setTimeout(r, 10000));

        console.log('***** Check BlockRewardAuRa and pool balances changing');
        const fBlockRewardAuRaBalance = new BN(await StakingTokenContract.methods.balanceOf(BlockRewardAuRa.options.address).call());
        expect(fBlockRewardAuRaBalance, `BlockRewardAuRa contract did not receive minted tokens`)
                .to.be.bignumber.above(iBlockRewardAuRaBalance);
        console.log(`**** BlockRewardAuRa had ${iBlockRewardAuRaBalance} tokens before and ${fBlockRewardAuRaBalance} tokens after.`);
        for (mining in validators) {
            const new_balance = new BN(await BlockRewardAuRa.methods.epochPoolTokenReward(stakingEpoch, mining).call());
            expect(new_balance, `Pool with mining address ${mining} did not receive minted tokens`)
                .to.be.bignumber.above(validators[mining].balance);
            console.log(`**** the pool ${mining} had ${validators[mining].balance} tokens before and ${new_balance} tokens after.`);
        }

        const iOrdered = await StakingAuRa.methods.orderedWithdrawAmount(candidate, delegator).call();
        const iOrderedBN = new BN(iOrdered.toString());

        console.log('***** Claiming ordered withdrawal');
        const tx2 = await sendInStakingWindow(web3, async () => {
            return SnS(web3, {
                from: delegator,
                to: StakingAuRa.options.address,
                method: StakingAuRa.methods.claimOrderedWithdraw(candidate),
                gasPrice: '1000000000'
            });
        }, StakingAuRa);
        pp.tx(tx2);

        const fOrdered = await StakingAuRa.methods.orderedWithdrawAmount(candidate, delegator).call();
        const fOrderedBN = new BN(fOrdered.toString());

        expect(fOrderedBN, `Delegator\'s ordered amount didn\'t decrease correctly after they (${delegator}) claimed the withdrawal: ` +
                        `initial = ${iOrderedBN.toString()}, final = ${fOrderedBN.toString()}, claimed amount = ${minDelegatorStakeBN.toString()}`
                ).to.be.bignumber.equal(iOrderedBN.sub(minDelegatorStakeBN));

        expect(fOrderedBN, `Delegator\'s ordered amount now should be zero: ` +
                        `initial = ${iOrderedBN.toString()}, final = ${fOrderedBN.toString()}, claimed amount = ${minDelegatorStakeBN.toString()}`
                ).to.be.bignumber.equal(new BN(0));
    });
});
