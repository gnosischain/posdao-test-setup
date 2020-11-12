const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const constants = require('../utils/constants');
const waitForNextStakingEpoch = require('../utils/waitForNextStakingEpoch');
const expect = require('chai').expect;

const BlockRewardAuRa = require('../utils/getContract')('BlockRewardAuRa', web3);
const Certifier = require('../utils/getContract')('Certifier', web3);
const StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
const TxPriority = require('../utils/getContract')('TxPriority', web3);
const ValidatorSetAuRa = require('../utils/getContract')('ValidatorSetAuRa', web3);

const BN = web3.utils.BN;
const OWNER = constants.OWNER;

const configFilepath = `${__dirname}/../config/TxPriority.json`;

// Set to `false` to ignore transactions order when they are in different blocks
const checkOrderWhenDifferentBlocks = false;

describe('TxPriority tests', () => {
  const gasPrice0 = web3.utils.toWei('0', 'gwei');
  const gasPrice1 = web3.utils.toWei('1', 'gwei');
  const gasPrice2 = web3.utils.toWei('2', 'gwei');
  const gasPrice3 = web3.utils.toWei('3', 'gwei');
  const account = web3.eth.accounts.create();
  const account2 = web3.eth.accounts.create();
  let candidateMinStake;
  let delegatorMinStake;
  let isLocalConfig = true;
  let step;

  before(async function() {
    const nodeInfo = await web3.eth.getNodeInfo();
    if (!nodeInfo.includes('Nethermind')) {
      console.log('    TxPriority tests will be skipped as they can only run with Nethermind');
      this.skip();
    } else {
      candidateMinStake = await StakingAuRa.instance.methods.candidateMinStake().call();
      delegatorMinStake = await StakingAuRa.instance.methods.delegatorMinStake().call();

      let ownerNonce = await web3.eth.getTransactionCount(OWNER);
      const transactions = [{
        // Set minter address to be able to mint coins through the BlockReward
        method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
        arguments: [[OWNER]],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }, {
        // Mint coins for the owner
        method: BlockRewardAuRa.instance.methods.addExtraReceiver,
        arguments: [web3.utils.toWei('100'), OWNER],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }, {
        // Mint coins for the arbitrary account
        method: BlockRewardAuRa.instance.methods.addExtraReceiver,
        arguments: [web3.utils.toWei('100'), account.address],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }, {
        // Mint coins for the arbitrary account2
        method: BlockRewardAuRa.instance.methods.addExtraReceiver,
        arguments: [web3.utils.toWei('100'), account2.address],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }];
      const { receipts } = await batchSendTransactions(transactions);
      const allTxSucceeded = receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `Cannot mint coins for the owner and an arbitrary account`).to.equal(true);
    }
  });

  for (step = 0; step < 2; step++) {
    it(testName('Test 1'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [BlockRewardAuRa.address, '0x171d54dd', '3000'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x2bafde8d', '2000'],     // StakingAuRa.setDelegatorMinStake
        [StakingAuRa.address, '0x48aaa4a2', '1000'],     // StakingAuRa.setCandidateMinStake
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call prioritized StakingAuRa.setCandidateMinStake
          // with non-zero gas price and nonce + 0
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. Call prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with non-zero gas price and nonce + 2
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 2 } // 1 GWei
        }, {
          // 2. Call prioritized StakingAuRa.setDelegatorMinStake
          // with non-zero gas price and nonce + 1
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }, {
          // 3. The arbitrary account sends a non-prioritized TX with a higher gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: '0x0000000000000000000000000000000000000000',
            gas: '21000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }];
      });

      // Check transactions order
      checkTransactionOrder([ // will fail on OpenEthereum
        0, // StakingAuRa.setCandidateMinStake
        2, // StakingAuRa.setDelegatorMinStake
        1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
        3, // arbitrary transaction
      ], receipts);

      // Remove previously set priorities
      await applyPriorityRules('remove', [
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x2bafde8d'],     // StakingAuRa.setDelegatorMinStake
        [StakingAuRa.address, '0x48aaa4a2'],     // StakingAuRa.setCandidateMinStake
      ]);
    });

    it(testName('Test 2'), async function() {
      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized StakingAuRa.setCandidateMinStake
          // with non-zero gas price and nonce + 0
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with non-zero gas price and nonce + 2
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 2 } // 1 GWei
        }, {
          // 2. Call a non-prioritized StakingAuRa.setDelegatorMinStake
          // with non-zero gas price and nonce + 1
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }, {
          // 3. The arbitrary account sends a non-prioritized TX with a higher gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: '0x0000000000000000000000000000000000000000',
            gas: '21000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }];
      });

      // Check transactions order
      checkTransactionOrder([
        3, // arbitrary transaction
        0, // StakingAuRa.setCandidateMinStake
        2, // StakingAuRa.setDelegatorMinStake
        1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 3'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [BlockRewardAuRa.address, '0x171d54dd', '3000'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x2bafde8d', '2000'],     // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],         // arbitrary address
        [StakingAuRa.address, '0x48aaa4a2', '1000'],     // StakingAuRa.setCandidateMinStake
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        let ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.setCandidateMinStake
          // with nonce + 0
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ } // 1 GWei
        }, {
          // 1. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with nonce + 1
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ } // 1 GWei
        }, {
          // 2. Call a prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with nonce + 2
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ } // 1 GWei
        }, {
          // 3. Another account sends a prioritized TX with the same gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }];
      });

      // Check transactions order
      checkTransactionOrder([ // will fail on OpenEthereum
        3, // arbitrary transaction
        0, // StakingAuRa.setCandidateMinStake
        1, // StakingAuRa.setDelegatorMinStake
        2, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 4 (depends on Test 3)'), async function() { // will fail on OpenEthereum
      // Current priorities by weight:
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([
        [BlockRewardAuRa.address, '0x171d54dd', '3000'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x2bafde8d', '2000'],     // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],         // arbitrary address
        [StakingAuRa.address, '0x48aaa4a2', '1000'],     // StakingAuRa.setCandidateMinStake
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. The arbitrary account sends a prioritized TX
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }, {
          // 1. Call a prioritized StakingAuRa.setCandidateMinStake
          // with the same gas price
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 2. Call a prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with the same gas price and nonce
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 3. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with the same gas price and nonce
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }];
      }, 2);

      // Here we expect that the most weighted transaction will be picked up
      // when the nonce is the same, and the arbitrary prioritized transaction
      // from another account will be the last
      checkTransactionOrder([
        2, // BlockRewardAuRa.setErcToNativeBridgesAllowed
        0, // arbitrary transaction
      ], receipts);
    });

    it(testName('Test 5 (depends on Test 3)'), async function() {
      // Remove priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      await applyPriorityRules('remove', [
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x48aaa4a2', '1000'], // StakingAuRa.setCandidateMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.setCandidateMinStake
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }, {
          // 1. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with the same gas price but a lower nonce
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }];
      });

      // The non-prioritized transaction will be the first
      // because it has lower nonce than the prioritized one
      checkTransactionOrder([
        1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
        0, // StakingAuRa.setCandidateMinStake
      ], receipts);
    });

    it(testName('Test 6 (depends on Tests 3, 5)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x48aaa4a2', '1000'], // StakingAuRa.setCandidateMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }, {
          // 1. Call a prioritized StakingAuRa.setCandidateMinStake
          // with the same gas price and a lower nonce
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }];
      });

      // Check transactions order
      checkTransactionOrder([
        1, // StakingAuRa.setCandidateMinStake
        0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 7 (depends on Test 3)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],     // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.setDelegatorMinStake
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. Send 0 coins to a prioritized account.address
          // with the same gas price but a higher nonce
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce + 1
          }
        }];
      });

      // Check transactions order
      checkTransactionOrder([
        0, // StakingAuRa.setDelegatorMinStake
        1, // arbitrary account.address
      ], receipts);
    });

    it(testName('Test 8 (depends on Test 3)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],     // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Send 0 coins to a prioritized account.address
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }, {
          // 1. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with the same gas price but a higher nonce
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }];
      });

      // Check transactions order
      checkTransactionOrder([
        0, // arbitrary account.address
        1, // StakingAuRa.setDelegatorMinStake
      ], receipts);
    });

    it(testName('Test 9 (depends on Test 3)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x48aaa4a2', '1000'], // StakingAuRa.setCandidateMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.setCandidateMinStake
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }, {
          // 1. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with the same nonce and a higher gas price
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice2, nonce } // 2 GWei
        }];
      }, 1);

      // Here we expect the non-prioritized transaction to be mined,
      // and the prioritized one from the same sender with the same nonce
      // is rejected because it has a lower gas price
      checkTransactionOrder([
        1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 10 (depends on Tests 3, 5)'), async function() { // will fail on OpenEthereum
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x48aaa4a2', '1000'], // StakingAuRa.setCandidateMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice2, nonce } // 2 GWei
        }, {
          // 1. Call a prioritized StakingAuRa.setCandidateMinStake
          // with the same nonce and a lower gas price
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }];
      }, 1);

      // Here we expect the non-prioritized transaction to be mined,
      // and the prioritized one from the same sender with the same nonce
      // is rejected because it has a lower gas price
      checkTransactionOrder([
        0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 11 (depends on Test 3)'), async function() { // will fail on OpenEthereum
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],     // arbitrary account.address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Send 0 coins to a prioritized account.address
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice2, // 2 GWei
            nonce
          }
        }, {
          // 1. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with the same nonce but a lower gas price
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }];
      }, 1);

      // We expect that the more weighted transaction from the same sender
      // with the same nonce won't be mined since it has a lower gas price
      checkTransactionOrder([
        0, // arbitrary account.address
      ], receipts);
    });

    it(testName('Test 12 (depends on Test 3)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address
      //   1000: StakingAuRa.setCandidateMinStake

      await ensurePriorityRules([
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
        [account.address, '0x00000000', '1500'],     // arbitrary account.address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.setDelegatorMinStake
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }, {
          // 1. Send 0 coins to a prioritized account.address
          // with the same nonce but a higher gas price
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice2, // 2 GWei
            nonce
          }
        }];
      }, 1);

      // We expect that the more weighted transaction from the same sender
      // with the same nonce won't be mined since it has a lower gas price
      checkTransactionOrder([
        1, // arbitrary account.address
      ], receipts);
    });

    it(testName('Test 13 (depends on Test 3)'), async function() {
      // Remove priority for StakingAuRa.setCandidateMinStake
      await applyPriorityRules('remove', [
        [StakingAuRa.address, '0x48aaa4a2'], // StakingAuRa.setCandidateMinStake
      ]);

      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address

      await ensurePriorityRules(null, [
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x48aaa4a2'], // StakingAuRa.setCandidateMinStake
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }, {
          // 1. Call a non-prioritized StakingAuRa.setCandidateMinStake
          // with the same nonce but a higher gas price
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice2, nonce } // 2 GWei
        }];
      }, 1);

      // We expect that the transaction with a higher gas price will be mined
      checkTransactionOrder([
        1, // StakingAuRa.setCandidateMinStake
      ], receipts);
    });

    it(testName('Test 14 (depends on Tests 3, 13)'), async function() { // will fail on OpenEthereum
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake
      //   1500: arbitrary account.address

      await ensurePriorityRules(null, [
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [StakingAuRa.address, '0x48aaa4a2'], // StakingAuRa.setCandidateMinStake
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const nonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }, {
          // 1. Call a non-prioritized StakingAuRa.setCandidateMinStake
          // with the same nonce and gas price
          method: StakingAuRa.instance.methods.setCandidateMinStake,
          arguments: [candidateMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce } // 1 GWei
        }];
      }, 1);

      try {
        // We expect that the second transaction overlaps the first one
        // since it is sent after the first one
        checkTransactionOrder([
          1, // StakingAuRa.setCandidateMinStake
        ], receipts);
      } catch(e) {
        // If the order differs, we don't treat this as an error
        // because both transactions are non-prioritized and both have
        // the same gas price and nonce, so they can be taken in random order
        console.log('    Warning:', e);
      }
    });

    it(testName('Test 15 (depends on Tests 3, 13)'), async function() {
      // Remove priority for arbitrary address
      await applyPriorityRules('remove', [
        [account.address, '0x00000000'], // arbitrary address
      ]);

      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [account.address, '0x00000000'], // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. The arbitrary account sends a non-prioritized TX
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }, {
          // 1. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with the same gas price
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 2. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with incremented nonce and the same gas price
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }];
      });

      let firstCheckIsFine = true;

      try {
        // Expect these txs to be mined in the same order because
        // the second non-prioritized transaction is sent after the first one
        // according to the above order
        checkTransactionOrder([
          0, // arbitrary account.address
          1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
          2, // StakingAuRa.setDelegatorMinStake
        ], receipts);
      } catch (e) {
        console.log('    Warning:', e);
        firstCheckIsFine = false;
      }

      if (!firstCheckIsFine) {
        // This order can also be treated as correct because the first
        // non-prioritized transaction can be taken later than the second one
        // despite their order above
        checkTransactionOrder([
          1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
          2, // StakingAuRa.setDelegatorMinStake
          0, // arbitrary account.address
        ], receipts);
      }
    });

    it(testName('Test 16 (depends on Tests 3, 13, 15)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [account.address, '0x00000000'], // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. The arbitrary account sends a non-prioritized TX
          // with the same gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with incremented nonce and the same gas price
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }];
      });

      let firstCheckIsFine = true;

      try {
        // We expect the following order because the non-prioritized TX from the OWNER
        // is the first in the list above, and setDelegatorMinStake is prioritized
        // towards the non-prioritized arbitrary transaction
        checkTransactionOrder([ // will fail on OpenEthereum
          0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
          2, // StakingAuRa.setDelegatorMinStake
          1, // arbitrary account.address
        ], receipts);
      } catch (e) {
        console.log('    Warning:', e);
        firstCheckIsFine = false;
      }

      if (!firstCheckIsFine) {
        // This order can also be treated as correct because the first
        // non-prioritized transaction can be taken later than the second one
        // despite their order above
        checkTransactionOrder([ // will fail on OpenEthereum
          1, // arbitrary account.address
          0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
          2, // StakingAuRa.setDelegatorMinStake
        ], receipts);
      }
    });

    it(testName('Test 17 (depends on Tests 3, 13, 15)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [account.address, '0x00000000'], // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. The arbitrary account sends a non-prioritized TX
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 1. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          // with a higher gas price
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice3, nonce: ownerNonce } // 3 GWei
        }, {
          // 2. Call a prioritized StakingAuRa.setDelegatorMinStake
          // with incremented nonce and a lower gas price
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }];
      });

      // We expect setErcToNativeBridgesAllowed to be mined first
      // because it has a higher gas price. Then, setDelegatorMinStake
      // should be mined as it is prioritized towards the
      // non-prioritized arbitrary transaction
      checkTransactionOrder([ // will fail on OpenEthereum
        1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
        2, // StakingAuRa.setDelegatorMinStake
        0, // arbitrary account.address
      ], receipts);
    });

    it(testName('Test 18 (depends on Tests 3, 13, 15)'), async function() {
      // Current priorities by weight:
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [StakingAuRa.address, '0x2bafde8d', '2000'], // StakingAuRa.setDelegatorMinStake
      ], [ // should not exist:
        [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
        [account.address, '0x00000000'], // arbitrary address
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a non-prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. The arbitrary account sends a non-prioritized TX
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: account.address,
            gas: '21000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized StakingAuRa.setDelegatorMinStake
          method: StakingAuRa.instance.methods.setDelegatorMinStake,
          arguments: [delegatorMinStake],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 } // 1 GWei
        }];
      });

      // We expect the non-prioritized arbitrary transaction to be mined first
      // because it has a higher gas price. Then, we expect setErcToNativeBridgesAllowed
      // to be second because of the nonce.
      checkTransactionOrder([
        1, // arbitrary account.address
        0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
        2, // StakingAuRa.setDelegatorMinStake
      ], receipts);
    });

    it(testName('Test 19'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [BlockRewardAuRa.address, '0x00000000', '4000'], // BlockRewardAuRa.fallback
        [BlockRewardAuRa.address, '0x171d54dd', '3000'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Current priorities by weight:
      //   4000: BlockRewardAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([
        [BlockRewardAuRa.address, '0x00000000', '4000'], // BlockRewardAuRa.fallback
        [BlockRewardAuRa.address, '0x171d54dd', '3000'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.setErcToNativeBridgesAllowed
          method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
          arguments: [[OWNER]],
          params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce } // 1 GWei
        }, {
          // 1. The arbitrary account sends a prioritized TX to call BlockRewardAuRa.fallback
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }];
      });

      // Check transactions order
      checkTransactionOrder([ // will fail on OpenEthereum
        1, // BlockRewardAuRa.fallback
        0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      ], receipts);
    });

    it(testName('Test 20'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [StakingAuRa.address, '0x00000000', '3001'],      // StakingAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ]);

      // Current priorities by weight:
      //   4001: ValidatorSetAuRa.fallback
      //   3001: StakingAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2001: BlockRewardAuRa.fallback
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [StakingAuRa.address, '0x00000000', '3001'],      // StakingAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.fallback
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice3 // 3 GWei
          })).rawTransaction
        }, {
          // 1. Call a prioritized StakingAuRa.fallback
          // by another account with a lower gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized ValidatorSetAuRa.fallback
          // by another account with a lower gas price
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }];
      });

      // Check transactions order
      checkTransactionOrder([ // will fail on OpenEthereum
        2, // ValidatorSetAuRa.fallback
        1, // StakingAuRa.fallback
        0, // BlockRewardAuRa.fallback
      ], receipts);
    });

    it(testName('Test 21 (depends on Test 20)'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [BlockRewardAuRa.address, '0x00000000', '5000'],  // BlockRewardAuRa.fallback
      ]);

      // Current priorities by weight:
      //   5000: BlockRewardAuRa.fallback
      //   4001: ValidatorSetAuRa.fallback
      //   3001: StakingAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([
        [BlockRewardAuRa.address, '0x00000000', '5000'],  // BlockRewardAuRa.fallback
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [StakingAuRa.address, '0x00000000', '3001'],      // StakingAuRa.fallback
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized StakingAuRa.fallback
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }, {
          // 1. Call a prioritized ValidatorSetAuRa.fallback
          // by another account with the same gas price
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }, {
          // 2. Call a prioritized BlockRewardAuRa.fallback
          // by another account with the same gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }];
      });

      // Check transactions order
      checkTransactionOrder([ // will fail on OpenEthereum
        2, // BlockRewardAuRa.fallback
        1, // ValidatorSetAuRa.fallback
        0, // StakingAuRa.fallback
      ], receipts);
    });

    it(testName('Test 22'), async function() {
      // Set priorities
      await applyPriorityRules('set', [
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [StakingAuRa.address, '0x00000000', '3001'],      // StakingAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ]);

      // Current priorities by weight:
      //   4001: ValidatorSetAuRa.fallback
      //   3001: StakingAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2001: BlockRewardAuRa.fallback
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [StakingAuRa.address, '0x00000000', '3001'],      // StakingAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ]);

      // Set sender whitelist
      await applySenderWhitelist([account.address, account2.address]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.fallback
          // by a whitelisted sender
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice3 // 3 GWei
          })).rawTransaction
        }, {
          // 1. Call a prioritized StakingAuRa.fallback
          // by another whitelisted sender with a lower gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized ValidatorSetAuRa.fallback
          // with a lower gas price
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }];
      });

      // We expect StakingAuRa.fallback and BlockRewardAuRa.fallback
      // to be mined first because their senders are in the whitelist
      // despite that the ValidatorSetAuRa.fallback has higher weight.
      // StakingAuRa.fallback must be mined before BlockRewardAuRa.fallback
      // as it has higher weight (despite the different gas prices).
      checkTransactionOrder([ // will fail on OpenEthereum
        1, // StakingAuRa.fallback
        0, // BlockRewardAuRa.fallback
        2, // ValidatorSetAuRa.fallback
      ], receipts);
    });

    it(testName('Test 23 (depends on Test 22)'), async function() {
      // Remove priority for StakingAuRa.fallback
      await applyPriorityRules('remove', [
        [StakingAuRa.address, '0x00000000'], // StakingAuRa.fallback
      ]);

      // Current priorities by weight:
      //   4001: ValidatorSetAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2001: BlockRewardAuRa.fallback
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ], [ // should not exist:
        [StakingAuRa.address, '0x00000000'], // StakingAuRa.fallback
      ]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.fallback
          // by a whitelisted sender
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice3 // 3 GWei
          })).rawTransaction
        }, {
          // 1. Call a non-prioritized StakingAuRa.fallback
          // by another whitelisted sender with a lower gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized ValidatorSetAuRa.fallback
          // by another non-whitelisted account with a lower gas price
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }];
      });

      // We expect BlockRewardAuRa.fallback and StakingAuRa.fallback
      // to be mined first because their senders are in the whitelist
      // despite that the ValidatorSetAuRa.fallback has a higher weight.
      // BlockRewardAuRa.fallback must be mined before StakingAuRa.fallback
      // as that has a higher gas price.
      checkTransactionOrder([
        0, // BlockRewardAuRa.fallback
        1, // StakingAuRa.fallback
        2, // ValidatorSetAuRa.fallback
      ], receipts);
    });

    it(testName('Test 24 (depends on Tests 22, 23)'), async function() {
      // Current priorities by weight:
      //   4001: ValidatorSetAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2001: BlockRewardAuRa.fallback
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ], [ // should not exist:
        [StakingAuRa.address, '0x00000000'], // StakingAuRa.fallback
      ]);

      // Set sender whitelist
      await applySenderWhitelist([account.address]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.fallback
          // by a whitelisted sender
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1 // 1 GWei
          })).rawTransaction
        }, {
          // 1. Call a non-prioritized StakingAuRa.fallback
          // by another whitelisted sender with a higher gas price
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized ValidatorSetAuRa.fallback
          // by another non-whitelisted account
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }];
      });

      // We expect BlockRewardAuRa.fallback to be first as its sender is whitelisted.
      // The ValidatorSetAuRa.fallback is the second because it is prioritized
      // in comparison to the StakingAuRa.fallback which is not prioritized.
      checkTransactionOrder([ // will fail on OpenEthereum
        0, // BlockRewardAuRa.fallback
        2, // ValidatorSetAuRa.fallback
        1, // StakingAuRa.fallback
      ], receipts);
    });

    it(testName('Test 25 (depends on Tests 22, 23)'), async function() {
      // Current priorities by weight:
      //   4001: ValidatorSetAuRa.fallback
      //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
      //   2001: BlockRewardAuRa.fallback
      //   2000: StakingAuRa.setDelegatorMinStake

      await ensurePriorityRules([ // should exist:
        [ValidatorSetAuRa.address, '0x00000000', '4001'], // ValidatorSetAuRa.fallback
        [BlockRewardAuRa.address, '0x00000000', '2001'],  // BlockRewardAuRa.fallback
      ], [ // should not exist:
        [StakingAuRa.address, '0x00000000'], // StakingAuRa.fallback
      ]);

      // Clear sender whitelist
      await applySenderWhitelist([]);

      // Send test transactions in a single block
      const receipts = await sendTestTransactionsInSingleBlock(async () => {
        const ownerNonce = await web3.eth.getTransactionCount(OWNER);
        return [{
          // 0. Call a prioritized BlockRewardAuRa.fallback
          method: web3.eth.sendSignedTransaction,
          params: (await account.signTransaction({
            to: BlockRewardAuRa.address,
            gas: '100000',
            gasPrice: gasPrice2 // 2 GWei
          })).rawTransaction
        }, {
          // 1. Call a non-prioritized StakingAuRa.fallback
          method: web3.eth.sendSignedTransaction,
          params: (await account2.signTransaction({
            to: StakingAuRa.address,
            gas: '100000',
            gasPrice: gasPrice3 // 3 GWei
          })).rawTransaction
        }, {
          // 2. Call a prioritized ValidatorSetAuRa.fallback
          method: web3.eth.sendTransaction,
          params: {
            from: OWNER,
            to: ValidatorSetAuRa.address,
            gas: '100000',
            gasPrice: gasPrice1, // 1 GWei
            nonce: ownerNonce
          }
        }];
      });

      // The sender whitelist is empty, so
      // we expect ValidatorSetAuRa.fallback to be first as it has a higher priority.
      // The BlockRewardAura.fallback is the second because it has a lower priority.
      // The non-prioritized StakingAuRa.fallback is last.
      checkTransactionOrder([ // will fail on OpenEthereum
        2, // ValidatorSetAuRa.fallback
        0, // BlockRewardAura.fallback
        1, // StakingAuRa.fallback
      ], receipts);
    });

    it(testName('Test 26'), async function() {
      // Ensure all validator nodes have the same MinGasPrice in their config
      const configPath = `${__dirname}/../config`;
      let configFiles = fs.readdirSync(configPath);
      configFiles = configFiles.filter(f => f.includes('nethermind') && !f.includes('node0'));
      let minGasPrices = [];
      configFiles.forEach(configFile => {
        const configJson = require(`${configPath}/${configFile}`);
        minGasPrices.push(configJson.Mining.MinGasPrice);
      });
      minGasPrices = minGasPrices.filter((value, index, self) => self.indexOf(value) === index);
      expect(minGasPrices.length, 'Validators have different MinGasPrice in their configs').to.equal(1);

      const configMinGasPrice = minGasPrices[0];
      const gasPrice05 = web3.utils.toWei('0.5', 'gwei');

      // Ensure the configured MinGasPrice is correct
      expect((new BN(gasPrice05)).lt(new BN(configMinGasPrice)), `Config MinGasPrice is less than ${gasPrice05} wei`).to.equal(true);
      expect((new BN(gasPrice2)).gt(new BN(configMinGasPrice)), `Config MinGasPrice is greater than or equal to ${gasPrice2} wei`).to.equal(true);

      // Set MinGasPrice rules
      await applyMinGasPrices('set', [
        [StakingAuRa.address, '0x2bafde8d', gasPrice05], // StakingAuRa.setDelegatorMinStake
        [StakingAuRa.address, '0x48aaa4a2', gasPrice2], // StakingAuRa.setCandidateMinStake
      ]);

      // The owner successfully calls StakingAuRa.setDelegatorMinStake and StakingAuRa.setCandidateMinStake
      // with zero gas price because the owner is certified
      let ownerNonce = await web3.eth.getTransactionCount(OWNER);
      let results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setDelegatorMinStake,
        arguments: [delegatorMinStake],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }, {
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }]);
      const allTxSucceeded = results.receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `The owner failed when using zero gas price`).to.equal(true);

      // The owner tries to call StakingAuRa.setDelegatorMinStake with gas price
      // which is less than the MinGasPrice from the config, but fails
      // because the gas price cannot be less than the configured MinGasPrice
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setDelegatorMinStake,
        arguments: [delegatorMinStake],
        params: { from: OWNER, gasPrice: gasPrice05, nonce: ownerNonce }
      }]);
      // Will fail on OpenEthereum
      let receipt = results.receipts[0];
      expect(receipt, `The owner succeeded when using disallowed gas price of ${gasPrice05} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(null);

      // The owner successfully calls StakingAuRa.setDelegatorMinStake
      // with the allowed gas price equal to MinGasPrice from the config
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setDelegatorMinStake,
        arguments: [delegatorMinStake],
        params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ }
      }]);
      receipt = results.receipts[0];
      expect(receipt.status, `The owner failed when using allowed gas price of ${gasPrice1} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(true);

      // The owner tries to call StakingAuRa.setCandidateMinStake with gas price
      // which is less than the MinGasPrice from TxPriority, but fails
      // because the gas price cannot be less than the defined in TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
      }]);
      // Will fail on OpenEthereum
      receipt = results.receipts[0];
      expect(receipt, `The owner succeeded when using disallowed gas price of ${gasPrice1} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(null);

      // The owner successfully calls StakingAuRa.setCandidateMinStake
      // with the allowed gas price equal to MinGasPrice from TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice2, nonce: ownerNonce++ }
      }]);
      receipt = results.receipts[0];
      expect(receipt.status, `The owner failed when using allowed gas price of ${gasPrice2} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(true);

      // Increase MinGasPrice for StakingAuRa.setDelegatorMinStake
      await applyMinGasPrices('set', [
        [StakingAuRa.address, '0x2bafde8d', gasPrice3], // StakingAuRa.setDelegatorMinStake
      ]);
      ownerNonce = await web3.eth.getTransactionCount(OWNER);

      // The owner tries to call StakingAuRa.setDelegatorMinStake with gas price
      // which is less than the MinGasPrice from TxPriority, but fails
      // because the gas price cannot be less than the defined in TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setDelegatorMinStake,
        arguments: [delegatorMinStake],
        params: { from: OWNER, gasPrice: gasPrice2, nonce: ownerNonce }
      }]);
      // Will fail on OpenEthereum
      receipt = results.receipts[0];
      expect(receipt, `The owner succeeded when using disallowed gas price of ${gasPrice2} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(null);

      // Remove MinGasPrice rule for StakingAuRa.setDelegatorMinStake
      await applyMinGasPrices('remove', [
        [StakingAuRa.address, '0x2bafde8d'], // StakingAuRa.setDelegatorMinStake
      ], gasPrice3);
      ownerNonce = await web3.eth.getTransactionCount(OWNER);

      // The owner successfully calls StakingAuRa.setDelegatorMinStake
      // with the allowed gas price greater than the MinGasPrice from the config
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setDelegatorMinStake,
        arguments: [delegatorMinStake],
        params: { from: OWNER, gasPrice: gasPrice2, nonce: ownerNonce++ }
      }]);
      receipt = results.receipts[0];
      expect(receipt.status, `The owner failed when using allowed gas price of ${gasPrice2} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(true);

      // The owner tries to call StakingAuRa.setCandidateMinStake with gas price
      // which is less than the MinGasPrice from TxPriority and equal to config's, but fails
      // because the gas price cannot be less than the defined in TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
      }]);
      // Will fail on OpenEthereum
      receipt = results.receipts[0];
      expect(receipt, `The owner succeeded when using disallowed gas price of ${gasPrice1} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(null);

      // Remove MinGasPrice rule for StakingAuRa.setCandidateMinStake
      await applyMinGasPrices('remove', [
        [StakingAuRa.address, '0x48aaa4a2'], // StakingAuRa.setCandidateMinStake
      ], gasPrice2);
      ownerNonce = await web3.eth.getTransactionCount(OWNER);

      // The owner successfully calls StakingAuRa.setCandidateMinStake
      // with the allowed gas price equal to MinGasPrice from the config
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ }
      }]);
      receipt = results.receipts[0];
      expect(receipt.status, `The owner failed when using allowed gas price of ${gasPrice1} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(true);

      // Set a new MinGasPrice rule for StakingAuRa.setCandidateMinStake
      await applyMinGasPrices('set', [
        [StakingAuRa.address, '0x48aaa4a2', gasPrice3], // StakingAuRa.setCandidateMinStake
      ]);
      ownerNonce = await web3.eth.getTransactionCount(OWNER);

      // The owner tries to call StakingAuRa.setCandidateMinStake with gas price
      // which is less than the MinGasPrice from TxPriority and greater than config's, but fails
      // because the gas price cannot be less than the defined in TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice2, nonce: ownerNonce }
      }]);
      // Will fail on OpenEthereum
      receipt = results.receipts[0];
      expect(receipt, `The owner succeeded when using disallowed gas price of ${gasPrice2} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(null);

      // Update the existing MinGasPrice rule for StakingAuRa.setCandidateMinStake
      await applyMinGasPrices('set', [
        [StakingAuRa.address, '0x48aaa4a2', gasPrice2], // StakingAuRa.setCandidateMinStake
      ], gasPrice3);
      ownerNonce = await web3.eth.getTransactionCount(OWNER);

      // The owner successfully calls StakingAuRa.setCandidateMinStake
      // with the allowed gas price equal to MinGasPrice from TxPriority
      results = await batchSendTransactions([{
        method: StakingAuRa.instance.methods.setCandidateMinStake,
        arguments: [candidateMinStake],
        params: { from: OWNER, gasPrice: gasPrice2, nonce: ownerNonce++ }
      }]);
      receipt = results.receipts[0];
      expect(receipt.status, `The owner failed when using allowed gas price of ${gasPrice2} wei. Tx hash: ${receipt ? receipt.transactionHash : 'undefined'}`).to.equal(true);
    });

    it(testName('Clear priority rules'), async function() {
      if (isLocalConfig) {
        const config = { whitelist: [], priorities: [], minGasPrices: [] };
        await saveConfigFile(config);
      } else {
        let removeRules = [];
        let items = await TxPriority.instance.methods.getPriorities().call();
        items.forEach(rule => {
          removeRules.push([rule['target'], rule['fnSignature']]);
        });
        await applyPriorityRules('remove', removeRules);
        items = await TxPriority.instance.methods.getPriorities().call();
        expect(items.length, 'Cannot remove priority rules').to.equal(0);

        removeRules = [];
        items = await TxPriority.instance.methods.getMinGasPrices().call();
        items.forEach(rule => {
          removeRules.push([rule['target'], rule['fnSignature']]);
        });
        await applyMinGasPrices('remove', removeRules);
        items = await TxPriority.instance.methods.getMinGasPrices().call();
        expect(items.length, 'Cannot remove MinGasPrice rules').to.equal(0);

        await applySenderWhitelist([]);
        items = await TxPriority.instance.methods.getSendersWhitelist().call();
        expect(items.length, 'Cannot remove SendersWhitelist').to.equal(0);
      }

      isLocalConfig = !isLocalConfig;
    });
  }

  it('Test zero gas price', async function() {
    // Ensure the account.address is not certified
    expect(await Certifier.instance.methods.certifiedExplicitly(account.address).call()).to.equal(false);

    // Try to send an arbitrary transaction with zero gas price from account.address
    let results = await batchSendTransactions([{
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: '0x0000000000000000000000000000000000000000',
        gas: '21000',
        gasPrice: gasPrice0
      })).rawTransaction
    }]);
    expect(results.receipts[0], 'A non-certified arbitrary account succeeded when using zero gas price').to.equal(null);

    // Try to send an arbitrary transaction with non-zero gas price from account.address
    results = await batchSendTransactions([{
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: '0x0000000000000000000000000000000000000000',
        gas: '21000',
        gasPrice: gasPrice1
      })).rawTransaction
    }]);
    expect(results.receipts[0].status, 'An arbitrary account failed when using a non-zero gas price').to.equal(true);
  });

  it('Finish', async function() {
    await waitForNextStakingEpoch(web3);
  });

  async function applyPriorityRules(type, rules) {
    if (!rules || !rules.length) return;

    if (isLocalConfig) {
      let config = require(configFilepath);
      rules.forEach(rule => {
        const target = rule[0].toLowerCase();
        const fnSignature = rule[1].toLowerCase();
        if (type == 'set') {
          const value = rule[2].toLowerCase();
          expect(config.priorities.some(p => p.value.toLowerCase() == value && (p.target.toLowerCase() != target || p.fnSignature.toLowerCase() != fnSignature)), 'Priority weight must be unique').to.equal(false);
          const index = config.priorities.findIndex(p => p.target.toLowerCase() == target && p.fnSignature.toLowerCase() == fnSignature);
          if (index < 0) {
            config.priorities.push({ target, fnSignature, value });
          } else {
            config.priorities[index] = { target, fnSignature, value };
          }
        } else {
          config.priorities = config.priorities.filter(p => p.target.toLowerCase() != target || p.fnSignature.toLowerCase() != fnSignature);
        }
      });
      await saveConfigFile(config);
    } else {
      let ownerNonce = await web3.eth.getTransactionCount(OWNER);
      const transactions = [];
      const method = (type == 'set') ? TxPriority.instance.methods.setPriority : TxPriority.instance.methods.removePriority;

      rules.forEach(arguments => {
        transactions.push({
          method,
          arguments,
          params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
        });
      });

      const { receipts } = await batchSendTransactions(transactions);
      const allTxSucceeded = receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `Cannot update priorities`).to.equal(true);
    }
  }

  async function applySenderWhitelist(senders) {
    if (isLocalConfig) {
      let config = require(configFilepath);
      config.whitelist = senders;
      await saveConfigFile(config);
    } else {
      const nonce = await web3.eth.getTransactionCount(OWNER);
      const transactions = [{
        method: TxPriority.instance.methods.setSendersWhitelist,
        arguments: [senders],
        params: { from: OWNER, gasPrice: gasPrice0, nonce }
      }];
      const { receipts } = await batchSendTransactions(transactions);
      const allTxSucceeded = receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `Cannot update senderWhitelist`).to.equal(true);
    }
  }

  async function applyMinGasPrices(type, rules, gasPrice) {
    if (!rules || !rules.length) return;

    if (isLocalConfig) {
      let config = require(configFilepath);
      rules.forEach(rule => {
        const target = rule[0].toLowerCase();
        const fnSignature = rule[1].toLowerCase();
        if (type == 'set') {
          const value = rule[2].toLowerCase();
          const index = config.minGasPrices.findIndex(p => p.target.toLowerCase() == target && p.fnSignature.toLowerCase() == fnSignature);
          if (index < 0) {
            config.minGasPrices.push({ target, fnSignature, value });
          } else {
            config.minGasPrices[index] = { target, fnSignature, value };
          }
        } else {
          config.minGasPrices = config.minGasPrices.filter(p => p.target.toLowerCase() != target || p.fnSignature.toLowerCase() != fnSignature);
        }
      });
      await saveConfigFile(config);
    } else {
      let ownerNonce = await web3.eth.getTransactionCount(OWNER);
      const transactions = [];
      const method = (type == 'set') ? TxPriority.instance.methods.setMinGasPrice : TxPriority.instance.methods.removeMinGasPrice;

      if (!gasPrice) {
        gasPrice = gasPrice0;
      }

      rules.forEach(arguments => {
        transactions.push({
          method,
          arguments,
          params: { from: OWNER, gasPrice, nonce: ownerNonce++ }
        });
      });

      const { receipts } = await batchSendTransactions(transactions);
      const allTxSucceeded = receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `Cannot update min gas prices`).to.equal(true);
    }
  }

  async function batchSendTransactions(transactions, ensureSingleBlock, receiptsExpected) {
    // Estimate gas for each transaction
    const promises = [];
    transactions.forEach(item => {
      const arguments = item.arguments;
      if (arguments !== undefined && !item.params.gas) {
        promises.push(new Promise((resolve, reject) => {
          const params = Object.assign({}, item.params); // copy the object without reference
          delete params.nonce;
          item.method(...arguments).estimateGas(params, async (err, gas) => {
            if (err) {
              reject(err);
            } else {
              resolve(gas);
            }
          });
        }));
      } else {
        promises.push(null);
      }
    });
    const gas = await Promise.all(promises);

    const receipts = await executeTransactions(transactions, gas, receiptsExpected);

    if (ensureSingleBlock && transactions.length > 0) {
      // Ensure the transactions were mined in the same block
      let blockNumber = getTransactionsBlockNumber(receipts);
      if (!blockNumber) {
        return { receipts, singleBlock: false };
      }

      // Check min/max transactionIndex
      let minTransactionIndex = Number.MAX_SAFE_INTEGER;
      let maxTransactionIndex = Number.MIN_SAFE_INTEGER;
      let definedResults = 0;
      receipts.forEach(receipt => {
        if (receipt) {
          minTransactionIndex = Math.min(minTransactionIndex, receipt.transactionIndex);
          maxTransactionIndex = Math.max(maxTransactionIndex, receipt.transactionIndex);
          definedResults++;
        }
      });
      expect(
        minTransactionIndex == Number.MAX_SAFE_INTEGER || maxTransactionIndex == Number.MIN_SAFE_INTEGER || !definedResults,
        'transactionIndexes are not found'
      ).to.equal(false);
      expect(
        maxTransactionIndex - minTransactionIndex + 1,
        'Transactions are not consequent in the block'
      ).to.equal(definedResults);

      if (minTransactionIndex > 0) {
        // There must be emitInitiateChange and/or randomness transaction
        // at the beginning of the block
        const block = await web3.eth.getBlock(blockNumber, true);
        expect(block.transactions.length).to.be.at.least(maxTransactionIndex + 1);
        for (let i = 0; i < block.transactions.length; i++) {
          const superiorTx = block.transactions[i];
          if (superiorTx.transactionIndex < minTransactionIndex) {
            const data = superiorTx.input.toLowerCase();
            expect(
              // ValidatorSetAuRa.emitInitiateChange()
              superiorTx.to == constants.VALIDATOR_SET_ADDRESS && data.startsWith('0x93b4e25e') ||
              // RandomAuRa.commitHash(bytes32,bytes) or revealNumber(uint256)
              superiorTx.to == constants.RANDOM_AURA_ADDRESS && (data.startsWith('0x0b61ba85') || data.startsWith('0xfe7d567d'))
            ).to.equal(true);
          }
        }
      }

      return { receipts, singleBlock: true };
    }

    return { receipts };
  }

  function checkTransactionOrder(expectedTxOrder, receipts) {
    let results = sortByTransactionIndex(receipts.receiptsInSingleBlock);
    expect(results.map(r => r.i), `Invalid transactions order in a single block. TX hashes: ${JSON.stringify(results.map(r => r.transactionHash))}`).to.eql(expectedTxOrder);
    if (checkOrderWhenDifferentBlocks && receipts.receiptsInDifferentBlocks) {
      results = sortByTransactionIndex(receipts.receiptsInDifferentBlocks);
      expect(results.map(r => r.i), `Invalid transactions order in different blocks. TX hashes: ${JSON.stringify(results.map(r => r.transactionHash))}`).to.eql(expectedTxOrder);
    }
  }

  async function ensurePriorityRules(rulesToBeExistent, rulesToBeNonExistent) {
    let priorities;
    if (isLocalConfig) {
      priorities = require(configFilepath).priorities.map(p => [p.target, p.fnSignature, p.value]);
    } else {
      priorities = await TxPriority.instance.methods.getPriorities().call();
    }
    const exceptionMessage = `Current priority rules do not converge. Current priorities: ${JSON.stringify(priorities)}`;
    if (rulesToBeExistent) {
      expect(rulesToBeExistent.every(rule => {
        return priorities.some(priority => rule.every((r, i) => r.toLowerCase() === priority[i].toLowerCase()));
      }), exceptionMessage).to.equal(true);
    }
    if (rulesToBeNonExistent) {
      expect(rulesToBeNonExistent.some(rule => {
        return priorities.some(priority => rule.every((r, i) => r.toLowerCase() === priority[i].toLowerCase()));
      }), exceptionMessage).to.equal(false);
    }
  }

  async function executeTransactions(transactions, gas, receiptsExpected) {
    const promises = [];

    let receiptsReceived = 0;
    if (!receiptsExpected) {
      receiptsExpected = transactions.length;
    }

    // Prepare transactions for sending in batch
    let batch = new web3.BatchRequest();
    transactions.forEach((item, index) => {
      const arguments = item.arguments;
      let send;
      if (arguments !== undefined) {
        // eth_sendTransaction
        send = item.method(...arguments).send;
      } else {
        // eth_sendRawTransaction or eth_sendTransaction
        send = item.method;
      }
      if (gas[index]) {
        item.params.gas = gas[index] * 2;
      }
      promises.push(new Promise((resolve, reject) => {
        batch.add(send.request(item.params, async (err, txHash) => {
          if (err) {
            reject(err);
          } else {
            let attempts = 0;
            let receipt = null;
            // Wait for the receipt during 30 seconds
            while (receipt == null && attempts++ <= 60 && receiptsReceived < receiptsExpected) {
              await sleep(500);
              receipt = await web3.eth.getTransactionReceipt(txHash);
              if (receipt) receiptsReceived++;
            }
            resolve(receipt);
          }
        }));
      }));
    });

    // Execute the batch
    batch.execute();
    return await Promise.all(promises);
  }

  function getTransactionsBlockNumber(receipts) {
    let blockNumber = 0;
    let blockNumbers = receipts.map(receipt => receipt ? receipt.blockNumber : 0);
    blockNumbers = blockNumbers.filter((x, i, a) => a.indexOf(x) == i);
    blockNumbers.sort((a, b) => a - b);
    if (blockNumbers.length == 1) {
      blockNumber = blockNumbers[0];
      expect(blockNumber > 0, 'Invalid block number').to.equal(true);
    } else if (blockNumbers.length == 2) {
      blockNumber = blockNumbers[1];
      if (blockNumber == 0 || blockNumbers[0] != 0) {
        return 0;
      }
    }
    return blockNumber;
  }

  async function sendTestTransactionsInSingleBlock(getTransactions, receiptsExpected) {
    let results = await batchSendTransactions(await getTransactions(), true, receiptsExpected);

    let receiptsInDifferentBlocks = null;
    if (!results.singleBlock) {
      receiptsInDifferentBlocks = JSON.parse(JSON.stringify(results.receipts));
    }

    for (let t = 0; t < 10 && !results.singleBlock; t++) {
      console.log('      Transactions were not mined in the same block. Retrying...');
      console.log('      Receipts:', JSON.stringify(results.receipts));
      results = await batchSendTransactions(await getTransactions(), true, receiptsExpected);
    }
    if (!results.singleBlock) {
      expect(false, 'Transactions were not mined in the same block').to.equal(true);
    }
    return { receiptsInDifferentBlocks, receiptsInSingleBlock: results.receipts };
  }

  function sortByTransactionIndex(receipts) {
    let sortedResults = receipts.map((receipt, i) => {
      return {
        i,
        transactionIndex: receipt ? receipt.transactionIndex : -1,
        blockNumber: receipt ? receipt.blockNumber : -1,
        transactionHash: receipt ? receipt.transactionHash : null
      };
    });
    sortedResults = sortedResults.filter(sr => sr.transactionIndex >= 0);
    sortedResults.sort(
      (a, b) => a.blockNumber != b.blockNumber
              ? a.blockNumber - b.blockNumber
              : a.transactionIndex - b.transactionIndex
    );
    return sortedResults;
  }

  function testName(name) {
    return name + ' - ' + (step === 0 ? 'local config' : 'TxPriority contract');
  }

});

async function saveConfigFile(config) {
  const attempts = 3;
  for (let t = 0; t < attempts; t++) {
    try {
      fs.writeFileSync(configFilepath, JSON.stringify(config, null, 2));
      break;
    } catch (e) {
      if (e.code == 'EBUSY') {
        if (t < attempts - 1) {
          await sleep(1000); // wait for 1s and try again
          continue;
        }
      }
      throw e;
    }
  }
}

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}
