const Web3 = require('web3');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
const constants = require('../utils/constants');
const waitForNextStakingEpoch = require('../utils/waitForNextStakingEpoch');
const expect = require('chai').expect;

const BlockRewardAuRa = require('../utils/getContract')('BlockRewardAuRa', web3);
const StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
const TxPriority = require('../utils/getContract')('TxPriority', web3);
const ValidatorSetAuRa = require('../utils/getContract')('ValidatorSetAuRa', web3);

const BN = web3.utils.BN;
const OWNER = constants.OWNER;

// Set to `false` to ignore transactions order when they are in different blocks
const checkOrderWhenDifferentBlocks = true;

describe('TxPriority tests', () => {
  const gasPrice0 = web3.utils.toWei('0', 'gwei');
  const gasPrice1 = web3.utils.toWei('1', 'gwei');
  const gasPrice2 = web3.utils.toWei('2', 'gwei');
  const gasPrice3 = web3.utils.toWei('3', 'gwei');
  const account = web3.eth.accounts.create();
  let candidateMinStake;
  let delegatorMinStake;

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
        arguments: [web3.utils.toWei('1'), OWNER],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }, {
        // Mint coins for the arbitrary account
        method: BlockRewardAuRa.instance.methods.addExtraReceiver,
        arguments: [web3.utils.toWei('1'), account.address],
        params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
      }];
      const { receipts } = await batchSendTransactions(transactions);
      const allTxSucceeded = receipts.reduce((acc, receipt) => acc && receipt.status, true);
      expect(allTxSucceeded, `Cannot mint coins for the owner and an arbitrary account`).to.equal(true);
    }
  });

  it('Test 1', async function() {
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

  it('Test 2', async function() {
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

  it('Test 3', async function() {
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

  it('Test 4 (depends on Test 3)', async function() { // will fail on OpenEthereum
    // Current priorities by weight:
    //   3000: BlockRewardAuRa.setErcToNativeBridgesAllowed
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

  it('Test 5 (depends on Test 3)', async function() {
    // Remove priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
    await applyPriorityRules('remove', [
      [BlockRewardAuRa.address, '0x171d54dd'], // BlockRewardAuRa.setErcToNativeBridgesAllowed
    ]);

    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

  it('Test 6 (depends on Tests 3, 5)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

  it('Test 7 (depends on Test 3)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

  it('Test 8 (depends on Test 3)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

  it('Test 9 (depends on Test 3)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

    // Here we expect the prioritized transaction to be mined,
    // and the non-prioritized one with the same nonce is rejected
    // despite that it has a higher gas price
    checkTransactionOrder([ // will fail on OpenEthereum
      0, // StakingAuRa.setCandidateMinStake
    ], receipts);
  });

  it('Test 10 (depends on Test 3)', async function() { // will fail on OpenEthereum
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

    // Here we expect the prioritized transaction to be mined,
    // and the non-prioritized one with the same nonce is rejected
    // despite that it has a higher gas price
    checkTransactionOrder([
      1, // StakingAuRa.setCandidateMinStake
    ], receipts);
  });

  it('Test 11 (depends on Test 3)', async function() { // will fail on OpenEthereum
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

    // We expect that the more weighted transaction will be mined
    // despite that it has a lower gas price
    checkTransactionOrder([
      1, // StakingAuRa.setDelegatorMinStake
    ], receipts);
  });

  it('Test 12 (depends on Test 3)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address
    //   1000: StakingAuRa.setCandidateMinStake

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

    // We expect that the more weighted transaction will be mined
    // despite that it has a lower gas price
    checkTransactionOrder([ // will fail on OpenEthereum
      0, // StakingAuRa.setDelegatorMinStake
    ], receipts);
  });

  it('Test 13 (depends on Test 3)', async function() {
    // Remove priority for StakingAuRa.setCandidateMinStake
    await applyPriorityRules('remove', [
      [StakingAuRa.address, '0x48aaa4a2'], // StakingAuRa.setCandidateMinStake
    ]);

    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address

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

    // We expect that the transaction with higher gas price will be mined
    checkTransactionOrder([
      1, // StakingAuRa.setCandidateMinStake
    ], receipts);
  });

  it('Test 14 (depends on Tests 3, 13)', async function() { // will fail on OpenEthereum
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake
    //   1500: arbitrary account.address

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

    // We expect that the second transaction will overlap the first one
    checkTransactionOrder([
      1, // StakingAuRa.setCandidateMinStake
    ], receipts);
  });

  it('Test 15 (depends on Tests 3, 13)', async function() {
    // Remove priority for arbitrary address
    await applyPriorityRules('remove', [
      [account.address, '0x00000000'], // arbitrary address
    ]);

    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake

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

    // Expect these txs to be mined in the same order
    checkTransactionOrder([
      0, // arbitrary account.address
      1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      2, // StakingAuRa.setDelegatorMinStake
    ], receipts);
  });

  it('Test 16 (depends on Tests 3, 13, 15)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake

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

    // We expect the following order because the non-prioritized TX from the OWNER
    // is the first in the list above, and setDelegatorMinStake is prioritized
    // towards the non-prioritized arbitrary transaction
    checkTransactionOrder([ // will fail on OpenEthereum
      0, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      2, // StakingAuRa.setDelegatorMinStake
      1, // arbitrary account.address
    ], receipts);
  });

  it('Test 17 (depends on Tests 3, 13, 15)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake

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
    // because it has higher gas price. Then, setDelegatorMinStake
    // should be mined as it is prioritized towards the
    // non-prioritized arbitrary transaction
    checkTransactionOrder([ // will fail on OpenEthereum
      1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      2, // StakingAuRa.setDelegatorMinStake
      0, // arbitrary account.address
    ], receipts);
  });

  it('Test 18 (depends on Tests 3, 13, 15)', async function() {
    // Current priorities by weight:
    //   2000: StakingAuRa.setDelegatorMinStake

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

  it('Finish', async function() {
    await waitForNextStakingEpoch(web3);
  });

  async function applyPriorityRules(type, rules) {
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

    // Wait for a few blocks to let validator nodes apply the rules
    const startBlockNumber = await web3.eth.getBlockNumber();
    do {
      await sleep(500);
    } while (await web3.eth.getBlockNumber() - startBlockNumber < 2);
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
    expect(sortByTransactionIndex(receipts.receiptsInSingleBlock), 'Invalid transactions order in a single block').to.eql(expectedTxOrder);
    if (checkOrderWhenDifferentBlocks && receipts.receiptsInDifferentBlocks) {
      expect(sortByTransactionIndex(receipts.receiptsInDifferentBlocks), 'Invalid transactions order in different blocks').to.eql(expectedTxOrder);
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
        blockNumber: receipt ? receipt.blockNumber : -1
      };
    });
    sortedResults = sortedResults.filter(sr => sr.transactionIndex >= 0);
    sortedResults.sort(
      (a, b) => a.blockNumber != b.blockNumber
              ? a.blockNumber - b.blockNumber
              : a.transactionIndex - b.transactionIndex
    );
    sortedResults = sortedResults.map(r => r.i);
    return sortedResults;
  }

});

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms));
}
