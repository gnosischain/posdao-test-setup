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

describe('TxPriority tests', () => {
  const gasPrice0 = web3.utils.toWei('0', 'gwei');
  const gasPrice1 = web3.utils.toWei('1', 'gwei');
  const gasPrice2 = web3.utils.toWei('2', 'gwei');
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
      const results = await batchSendTransactions(transactions);
      const allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
      expect(allTxSucceeded, `Cannot mint coins for the owner and an arbitrary account`).to.equal(true);
    }
  });

  it('Test 1', async function() {
    // Set priorities
    let ownerNonce = await web3.eth.getTransactionCount(OWNER);
    let transactions = [{
      // Set priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      method: TxPriority.instance.methods.setPriority,
      arguments: [BlockRewardAuRa.address, '0x171d54dd', '3000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Set priority for StakingAuRa.setDelegatorMinStake
      method: TxPriority.instance.methods.setPriority,
      arguments: [StakingAuRa.address, '0x2bafde8d', '2000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Set priority for StakingAuRa.setCandidateMinStake
      method: TxPriority.instance.methods.setPriority,
      arguments: [StakingAuRa.address, '0x48aaa4a2', '1000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }];
    let results = await batchSendTransactions(transactions);
    let allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
    expect(allTxSucceeded, `Cannot set priorities`).to.equal(true);

    // Send test transactions
    transactions = [{
      // 0. Call StakingAuRa.setCandidateMinStake with non-zero gas price
      // and nonce + 0
      method: StakingAuRa.instance.methods.setCandidateMinStake,
      arguments: [candidateMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
    }, {
      // 1. Call BlockRewardAuRa.setErcToNativeBridgesAllowed with non-zero gas price
      // and nonce + 2
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
      arguments: [[OWNER]],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 2 }
    }, {
      // 2. Call StakingAuRa.setDelegatorMinStake with non-zero gas price
      // and nonce + 1
      method: StakingAuRa.instance.methods.setDelegatorMinStake,
      arguments: [delegatorMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 }
    }, {
      // 3. The arbitrary account sends a TX with higher gas price
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: '0x0000000000000000000000000000000000000000',
        gas: '21000',
        gasPrice: gasPrice2
      })).rawTransaction
    }];
    results = await batchSendTransactions(transactions, true);

    // Check transactions order (will fail on OpenEthereum)
    expect(sortByTransactionIndex(results), 'Invalid transactions order').to.eql([
      0, // StakingAuRa.setCandidateMinStake
      2, // StakingAuRa.setDelegatorMinStake
      1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      3, // arbitrary transaction
    ]);

    // Remove previously set priorities
    ownerNonce = await web3.eth.getTransactionCount(OWNER);
    transactions = [{
      // Remove priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      method: TxPriority.instance.methods.removePriority,
      arguments: [BlockRewardAuRa.address, '0x171d54dd'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Remove priority for StakingAuRa.setDelegatorMinStake
      method: TxPriority.instance.methods.removePriority,
      arguments: [StakingAuRa.address, '0x2bafde8d'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Remove priority for StakingAuRa.setCandidateMinStake
      method: TxPriority.instance.methods.removePriority,
      arguments: [StakingAuRa.address, '0x48aaa4a2'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }];
    results = await batchSendTransactions(transactions);
    allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
    expect(allTxSucceeded, 'Cannot remove priorities').to.equal(true);
  });

  it('Test 2', async function() {
    // Send test transactions
    const ownerNonce = await web3.eth.getTransactionCount(OWNER);
    const transactions = [{
      // 0. Call StakingAuRa.setCandidateMinStake with non-zero gas price
      // and nonce + 0
      method: StakingAuRa.instance.methods.setCandidateMinStake,
      arguments: [candidateMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
    }, {
      // 1. Call BlockRewardAuRa.setErcToNativeBridgesAllowed with non-zero gas price
      // and nonce + 2
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
      arguments: [[OWNER]],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 2 }
    }, {
      // 2. Call StakingAuRa.setDelegatorMinStake with non-zero gas price
      // and nonce + 1
      method: StakingAuRa.instance.methods.setDelegatorMinStake,
      arguments: [delegatorMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce + 1 }
    }, {
      // 3. The arbitrary account sends a TX with higher gas price
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: '0x0000000000000000000000000000000000000000',
        gas: '21000',
        gasPrice: gasPrice2
      })).rawTransaction
    }];
    const results = await batchSendTransactions(transactions, true);

    // Check transactions order
    expect(sortByTransactionIndex(results), 'Invalid transactions order').to.eql([
      3, // arbitrary transaction
      0, // StakingAuRa.setCandidateMinStake
      2, // StakingAuRa.setDelegatorMinStake
      1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
    ]);
  });

  it('Test 3', async function() {
    // Set priorities
    let ownerNonce = await web3.eth.getTransactionCount(OWNER);
    let transactions = [{
      // Set priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      method: TxPriority.instance.methods.setPriority,
      arguments: [BlockRewardAuRa.address, '0x171d54dd', '3000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Set priority for StakingAuRa.setDelegatorMinStake
      method: TxPriority.instance.methods.setPriority,
      arguments: [StakingAuRa.address, '0x2bafde8d', '2000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Set priority for the arbitrary address
      method: TxPriority.instance.methods.setPriority,
      arguments: [account.address, '0x00000000', '1500'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }, {
      // Set priority for StakingAuRa.setCandidateMinStake
      method: TxPriority.instance.methods.setPriority,
      arguments: [StakingAuRa.address, '0x48aaa4a2', '1000'],
      params: { from: OWNER, gasPrice: gasPrice0, nonce: ownerNonce++ }
    }];
    let results = await batchSendTransactions(transactions);
    let allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
    expect(allTxSucceeded, `Cannot set priorities`).to.equal(true);

    // Send test transactions
    transactions = [{
      // 0. Call StakingAuRa.setCandidateMinStake with non-zero gas price
      // and nonce + 0
      method: StakingAuRa.instance.methods.setCandidateMinStake,
      arguments: [candidateMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ }
    }, {
      // 1. Call StakingAuRa.setDelegatorMinStake with non-zero gas price
      // and nonce + 1
      method: StakingAuRa.instance.methods.setDelegatorMinStake,
      arguments: [delegatorMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ }
    }, {
      // 2. Call BlockRewardAuRa.setErcToNativeBridgesAllowed with non-zero gas price
      // and nonce + 2
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
      arguments: [[OWNER]],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce++ }
    }, {
      // 3. The arbitrary account sends a TX with the same gas price
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: account.address,
        gas: '21000',
        gasPrice: gasPrice1
      })).rawTransaction
    }];
    results = await batchSendTransactions(transactions, true);

    // Check transactions order (will fail on OpenEthereum)
    expect(sortByTransactionIndex(results), 'Invalid transactions order').to.eql([
      3, // arbitrary transaction
      0, // StakingAuRa.setCandidateMinStake
      1, // StakingAuRa.setDelegatorMinStake
      2, // BlockRewardAuRa.setErcToNativeBridgesAllowed
    ]);
  });

  it('Test 4 (depends on Test 3)', async function() {
    // Send test transactions
    const ownerNonce = await web3.eth.getTransactionCount(OWNER);
    const transactions = [{
      // 0. The arbitrary account sends a TX
      method: web3.eth.sendSignedTransaction,
      params: (await account.signTransaction({
        to: account.address,
        gas: '21000',
        gasPrice: gasPrice1
      })).rawTransaction
    }, {
      // 1. Call StakingAuRa.setCandidateMinStake with the same gas price
      method: StakingAuRa.instance.methods.setCandidateMinStake,
      arguments: [candidateMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
    }, {
      // 2. Call BlockRewardAuRa.setErcToNativeBridgesAllowed with the same gas price
      // and nonce
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed,
      arguments: [[OWNER]],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
    }, {
      // 3. Call StakingAuRa.setDelegatorMinStake with the same gas price and nonce
      method: StakingAuRa.instance.methods.setDelegatorMinStake,
      arguments: [delegatorMinStake],
      params: { from: OWNER, gasPrice: gasPrice1, nonce: ownerNonce }
    }];
    const results = await batchSendTransactions(transactions, true);

    // Check transactions order (will fail on OpenEthereum)
    expect(sortByTransactionIndex(results), 'Invalid transactions order').to.eql([
      2, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      0, // arbitrary transaction
    ]);
  });

  it('Finish', async function() {
    await waitForNextStakingEpoch(web3);
  });

  async function batchSendTransactions(transactions, ensureSingleBlock) {
    let promises = [];

    // Estimate gas for each transaction
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
    promises = [];

    // Send transactions
    let batch = new web3.BatchRequest();
    transactions.forEach((item, index) => {
      const arguments = item.arguments;
      let send;
      if (arguments !== undefined) {
        // eth_sendTransaction
        send = item.method(...arguments).send;
      } else {
        // eth_sendRawTransaction
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
            const tx = await web3.eth.getTransaction(txHash);
            if (tx) {
              let receipt = null;
              while (receipt == null) {
                await new Promise(r => setTimeout(r, 500));
                receipt = await web3.eth.getTransactionReceipt(txHash);
              }
              resolve({ tx, receipt });
            } else {
              resolve();
            }
          }
        }));
      }));
    });
    batch.execute();
    const results = await Promise.all(promises);

    if (ensureSingleBlock && transactions.length > 0) {
      // Ensure the transactions were mined in the same block
      let blockNumber = 0;
      let blockNumbers = results.map(r => r ? r.receipt.blockNumber : 0);
      blockNumbers = blockNumbers.filter((x, i, a) => a.indexOf(x) == i);
      blockNumbers.sort((a, b) => a - b);
      if (blockNumbers.length == 1) {
        blockNumber = blockNumbers[0];
        expect(blockNumber > 0, 'Invalid block number').to.equal(true);
      } else if (blockNumbers.length == 2) {
        blockNumber = blockNumbers[1];
        expect(blockNumber > 0 && blockNumbers[0] == 0, 'Invalid block number').to.equal(true);
      } else {
        expect(false, 'Transactions were not mined in the same block').to.equal(true);
      }

      // Check min/max transactionIndex
      let minTransactionIndex = Number.MAX_SAFE_INTEGER;
      let maxTransactionIndex = Number.MIN_SAFE_INTEGER;
      let definedResults = 0;
      results.forEach(r => {
        if (r) {
          minTransactionIndex = Math.min(minTransactionIndex, r.receipt.transactionIndex);
          maxTransactionIndex = Math.max(maxTransactionIndex, r.receipt.transactionIndex);
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
    }

    return results;
  }

  function sortByTransactionIndex(results) {
    let sortedResults = results.map((r, i) => {
      return { i, transactionIndex: r ? r.receipt.transactionIndex : -1 };
    });
    sortedResults = sortedResults.filter(sr => sr.transactionIndex >= 0);
    sortedResults.sort((a, b) => a.transactionIndex - b.transactionIndex);
    sortedResults = sortedResults.map(r => r.i);
    return sortedResults;
  }

});
