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

const web3_2 = new Web3('http://localhost:8542');
const web3_3 = new Web3('http://localhost:8543');

web3_2.eth.transactionConfirmationBlocks = 1;
web3_3.eth.transactionConfirmationBlocks = 1;

const web3s = [
    web3,
    web3_2,
    web3_3,
];

const delegatorsNumber = 3000;

describe(`Adding ${delegatorsNumber} delegators...`, () => {
    let delegators = [];
    const delegatorsPerBlock = 50;
    const validators = [
        '0x0b2f5e2f3cbd864eaa2c642e3769c1582361caf6',
        '0xaa94b687d3f9552a453b81b2834ca53778980dc0',
        '0x312c230e7d6db05224f60208a656e3541c5c42ba'
    ];

    let nodeCounter = 0;

    it('Delegators addresses are generated', async () => {
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

    it('Owner mints (3x minStake) tokens to delegators and validators', async () => {
        console.log('      Owner mints (3x minStake) tokens to delegators and validators...');
        const minStake = await StakingAuRa.instance.methods.getDelegatorMinStake().call();
        const minStakeBN = new BN(minStake.toString());
        const delegatorTokensBN = minStakeBN.mul(new BN('3'));

        const iterations = delegatorsNumber / delegatorsPerBlock;
        let txsDone = 0;
        const txsTotal = delegatorsPerBlock * iterations;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            let nonce = await web3.eth.getTransactionCount(OWNER);
            for (let d = delegatorsPerBlock*i; d < delegatorsPerBlock*(i + 1); d++) {
                const delegator = delegators[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: StakingTokenContract.address,
                    method: StakingTokenContract.instance.methods.mint(delegator, delegatorTokensBN.toString()),
                    gasPrice: '0',
                    nonce: nonce++
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += delegatorsPerBlock;
            console.log(`        Txs done: ${txsDone}/${txsTotal}`);
        }

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            await SnS(web3s[nodeCounter++ % 3], {
                from: OWNER,
                to: StakingTokenContract.address,
                method: StakingTokenContract.instance.methods.mint(validator, delegatorTokensBN.toString()),
                gasPrice: '0'
            });
        }
    });

    it('BlockReward mints native coins to delegators and validators', async () => {
        console.log('      BlockReward mints native coins to delegators and validators...');

        await SnS(web3s[nodeCounter++ % 3], {
            from: OWNER,
            to: BlockRewardAuRa.address,
            method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]),
            gasPrice: '0'
        });

        const newBalance = '1000000000000000000';

        const iterations = delegatorsNumber / delegatorsPerBlock;
        let txsDone = 0;
        const txsTotal = delegatorsPerBlock * iterations;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            let nonce = await web3.eth.getTransactionCount(OWNER);
            for (let d = delegatorsPerBlock*i; d < delegatorsPerBlock*(i + 1); d++) {
                const delegator = delegators[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: BlockRewardAuRa.address,
                    method: BlockRewardAuRa.instance.methods.addExtraReceiver(newBalance, delegator),
                    gasPrice: '0',
                    nonce: nonce++
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += delegatorsPerBlock;
            console.log(`        Txs done: ${txsDone}/${txsTotal}`);
        }

        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const delegatorBalance = await web3.eth.getBalance(delegator);
            expect(delegatorBalance, `Amount of minted coins is incorrect for ${delegator}`).to.be.equal(newBalance);
        }

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            await SnS(web3s[nodeCounter++ % 3], {
                from: OWNER,
                to: BlockRewardAuRa.address,
                method: BlockRewardAuRa.instance.methods.addExtraReceiver(newBalance, validator),
                gasPrice: '0'
            });
        }
    });

    it('Validators place stakes on themselves', async () => {
        console.log('      Validators place stakes on themselves...');

        const minStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        const minStakeBN = new BN(minStake.toString());

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            await SnS(web3s[nodeCounter++ % 3], {
                from: validator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.stake(validator, minStakeBN.toString()),
                gasPrice: '1000000000',
            });
        }
    });

    it('Delegators place stakes on validators', async () => {
        console.log('      Delegators place stakes on validators...');

        const minStake = await StakingAuRa.instance.methods.getDelegatorMinStake().call();
        const minStakeBN = new BN(minStake.toString());

        const iterations = delegatorsNumber / delegatorsPerBlock;
        let txsDone = 0;
        const txsTotal = delegatorsPerBlock * iterations * validators.length;

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];

            for (let i = 0; i < iterations; i++) {
                let promises = [];
                for (let d = delegatorsPerBlock*i; d < delegatorsPerBlock*(i + 1); d++) {
                    const delegator = delegators[d];
                    const prm = SnS(web3s[nodeCounter++ % 3], {
                        from: delegator,
                        to: StakingAuRa.address,
                        method: StakingAuRa.instance.methods.stake(validator, minStakeBN.toString()),
                        gasPrice: '1000000000',
                        gasLimit: '200000'
                    });
                    promises.push(prm);
                }
                const txs = await Promise.all(promises);
                for (const tx of txs) {
                    expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
                }
                txsDone += delegatorsPerBlock;
                console.log(`        Txs done: ${txsDone}/${txsTotal}`);
            }
        }
    });

    it('Call addBridgeNativeFeeReceivers every block', async () => {
        console.log('      Call addBridgeNativeFeeReceivers every block...');
        while (true) {
            let promises = [];
            let prm;
            let nonce = await web3.eth.getTransactionCount(OWNER);

            prm = SnS(web3s[nodeCounter++ % 3], {
                from: OWNER,
                to: BlockRewardAuRa.address,
                method: BlockRewardAuRa.instance.methods.addBridgeNativeFeeReceivers('1000000000'),
                gasPrice: '0',
                gasLimit: '200000',
                nonce: nonce++
            });
            promises.push(prm);

            for (let i = 0; i < 30; i++) {
                prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: BlockRewardAuRa.address,
                    method: BlockRewardAuRa.instance.methods.addExtraReceiver('1000000000', delegators[i]),
                    gasPrice: '0',
                    gasLimit: '200000',
                    nonce: nonce++
                });
                promises.push(prm);
            }

            try {
                await Promise.all(promises);
            } catch (e) {
                console.log(`error: ${e.message}`);
            }
        }
    });
});

/*
// Native staking
describe('Adding a lot of delegators', () => {
    let delegators = [];
    const delegatorsNumber = 3000;
    const delegatorsPerBlock = 50;
    const validators = [
        '0x0b2f5e2f3cbd864eaa2c642e3769c1582361caf6',
        '0xaa94b687d3f9552a453b81b2834ca53778980dc0',
        '0x312c230e7d6db05224f60208a656e3541c5c42ba'
    ];

    let nodeCounter = 0;

    it('Delegators addresses are generated', async () => {
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

    it('BlockReward mints native coins to delegators and validators', async () => {
        console.log('BlockReward mints native coins to delegators and validators:');

        await SnS(web3s[nodeCounter++ % 3], {
            from: OWNER,
            to: BlockRewardAuRa.address,
            method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]),
            gasPrice: '0'
        });

        const newBalance = '5000000000000000000';

        const iterations = delegatorsNumber / delegatorsPerBlock;
        let txsDone = 0;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            let nonce = await web3.eth.getTransactionCount(OWNER);
            for (let d = delegatorsPerBlock*i; d < delegatorsPerBlock*(i + 1); d++) {
                const delegator = delegators[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: BlockRewardAuRa.address,
                    method: BlockRewardAuRa.instance.methods.addExtraReceiver(newBalance, delegator),
                    gasPrice: '0',
                    nonce: nonce++
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += delegatorsPerBlock;
            console.log(`Txs done: ${txsDone}`);
        }

        for (let i = 0; i < delegatorsNumber; i++) {
            const delegator = delegators[i];
            const delegatorBalance = await web3.eth.getBalance(delegator);
            expect(delegatorBalance, `Amount of minted coins is incorrect for ${delegator}`).to.be.equal(newBalance);
        }

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            await SnS(web3s[nodeCounter++ % 3], {
                from: OWNER,
                to: BlockRewardAuRa.address,
                method: BlockRewardAuRa.instance.methods.addExtraReceiver(newBalance, validator),
                gasPrice: '0'
            });
        }
    });

    it('Validators place stakes on themselves', async () => {
        console.log('Validators place stakes on themselves:');

        const minStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        const minStakeBN = new BN(minStake.toString());

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            await SnS(web3s[nodeCounter++ % 3], {
                from: validator,
                to: StakingAuRa.address,
                method: StakingAuRa.instance.methods.stakeNative(validator),
                gasPrice: '1000000000',
                gasLimit: '400000',
                value: minStakeBN.toString()
            });
        }
    });

    it('Delegators place stakes on validators', async () => {
        console.log('Delegators place stakes on validators:');

        const minStake = await StakingAuRa.instance.methods.getDelegatorMinStake().call();
        const minStakeBN = new BN(minStake.toString());
        let txsDone = 0;

        for (let v = 0; v < validators.length; v++) {
            const validator = validators[v];
            const iterations = delegatorsNumber / delegatorsPerBlock;

            for (let i = 0; i < iterations; i++) {
                let promises = [];
                for (let d = delegatorsPerBlock*i; d < delegatorsPerBlock*(i + 1); d++) {
                    const delegator = delegators[d];
                    const prm = SnS(web3s[nodeCounter++ % 3], {
                        from: delegator,
                        to: StakingAuRa.address,
                        method: StakingAuRa.instance.methods.stakeNative(validator),
                        gasPrice: '1000000000',
                        gasLimit: '400000',
                        value: minStakeBN.toString()
                    });
                    promises.push(prm);
                }
                const txs = await Promise.all(promises);
                for (const tx of txs) {
                    expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
                }
                txsDone += delegatorsPerBlock;
                console.log(`Txs done: ${txsDone}`);
            }
        }
    });
});
*/

/*
describe('Adding a lot of candidates', () => {
    let candidates = [];
    const candidatesNumber = 3000;
    const candidatesPerBlock = 50;

    let nodeCounter = 0;

    it('Candidate addresses are generated', async () => {
        for (let i = 0; i < candidatesNumber; i++) {
            keythereum.create({}, function (dk) {
                keythereum.dump("testnetpoa", dk.privateKey, dk.salt, dk.iv, {}, function (keyObject) {
                    keythereum.exportToFile(keyObject, "./accounts/keystore", function(keyFile) {
                        candidates.push(keyObject.address);
                    });
                });
            });
        }

        while (candidates.length < candidatesNumber) {
            await new Promise(r => setTimeout(r, 100));
        }
    });

    it('Owner mints (3x minStake) tokens to candidates', async () => {
        console.log('Owner mints (3x minStake) tokens to candidates:');
        const minStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        const minStakeBN = new BN(minStake.toString());
        const candidateTokensBN = minStakeBN.mul(new BN('3'));

        const iterations = candidatesNumber / candidatesPerBlock;
        let txsDone = 0;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            let nonce = await web3.eth.getTransactionCount(OWNER);
            for (let d = candidatesPerBlock*i; d < candidatesPerBlock*(i + 1); d++) {
                const candidate = candidates[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: StakingTokenContract.address,
                    method: StakingTokenContract.instance.methods.mint(candidate, candidateTokensBN.toString()),
                    gasPrice: '0',
                    nonce: nonce++
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += candidatesPerBlock;
            console.log(`Txs done: ${txsDone} / ${candidatesNumber}`);
        }
    });

    it('BlockReward mints native coins to candidates', async () => {
        console.log('BlockReward mints native coins to candidates:');
        await SnS(web3s[nodeCounter++ % 3], {
            from: OWNER,
            to: BlockRewardAuRa.address,
            method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]),
            gasPrice: '0'
        });

        const newBalance = '1000000000000000000';

        const iterations = candidatesNumber / candidatesPerBlock;
        let txsDone = 0;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            let nonce = await web3.eth.getTransactionCount(OWNER);
            for (let d = candidatesPerBlock*i; d < candidatesPerBlock*(i + 1); d++) {
                const candidate = candidates[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: OWNER,
                    to: BlockRewardAuRa.address,
                    method: BlockRewardAuRa.instance.methods.addExtraReceiver(newBalance, candidate),
                    gasPrice: '0',
                    nonce: nonce++
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += candidatesPerBlock;
            console.log(`Txs done: ${txsDone} / ${candidatesNumber}`);
        }

        for (let i = 0; i < candidatesNumber; i++) {
            const candidate = candidates[i];
            const candidateBalance = await web3.eth.getBalance(candidate);
            expect(candidateBalance, `Amount of minted coins is incorrect for ${candidate}`).to.be.equal(newBalance);
        }
    });

    it('Candidates create their pools', async () => {
        console.log('Candidates create their pools:');
        const minStake = await StakingAuRa.instance.methods.getCandidateMinStake().call();
        const minStakeBN = new BN(minStake.toString());
        let txsDone = 0;

        const iterations = candidatesNumber / candidatesPerBlock;

        for (let i = 0; i < iterations; i++) {
            let promises = [];
            for (let d = candidatesPerBlock*i; d < candidatesPerBlock*(i + 1); d++) {
                const candidate = candidates[d];
                const prm = SnS(web3s[nodeCounter++ % 3], {
                    from: candidate,
                    to: StakingAuRa.address,
                    method: StakingAuRa.instance.methods.addPool(minStakeBN.toString(), candidate),
                    gasPrice: '1000000000',
                    gasLimit: '400000'
                });
                promises.push(prm);
            }
            const txs = await Promise.all(promises);
            for (const tx of txs) {
                expect(tx.status, `Failed tx: ${tx.transactionHash}`).to.equal(true);
            }
            txsDone += candidatesPerBlock;
            console.log(`Txs done: ${txsDone} / ${candidatesNumber}`);
        }
    });

    // it('Bridge mints native coins', async () => {
    //     while (true) {
    //         await SnS(web3s[nodeCounter++ % 3], {
    //             from: OWNER,
    //             to: BlockRewardAuRa.address,
    //             method: BlockRewardAuRa.instance.methods.addBridgeNativeFeeReceivers('1000000000'),
    //             gasPrice: '0',
    //             gasLimit: '200000'
    //         });
    //     }
    // });
});
*/
