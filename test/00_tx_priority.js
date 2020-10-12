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
    /*
    const nodeInfo = await web3.eth.getNodeInfo();
    if (!nodeInfo.includes('Nethermind')) {
      console.log('    TxPriority tests will be skipped as they can only run with Nethermind');
      this.skip();
    } else {
    */
      candidateMinStake = await StakingAuRa.instance.methods.candidateMinStake().call();
      delegatorMinStake = await StakingAuRa.instance.methods.delegatorMinStake().call();

      const transactions = [{
        // Set minter address to be able to mint coins through the BlockReward
        method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]).send,
        from: OWNER,
        gasPrice: gasPrice0
      }, {
        // Mint coins for the owner
        method: BlockRewardAuRa.instance.methods.addExtraReceiver(web3.utils.toWei('1'), OWNER).send,
        from: OWNER,
        gasPrice: gasPrice0
      }, {
        // Mint coins for the arbitrary account
        method: BlockRewardAuRa.instance.methods.addExtraReceiver(web3.utils.toWei('1'), account.address).send,
        from: OWNER,
        gasPrice: gasPrice0
      }];
      const results = await batchSendTransactions(transactions);
      const allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
      expect(allTxSucceeded, `Cannot mint coins for the owner and an arbitrary account`).to.equal(true);
    /*
    }
    */
  });

  it('Test 1', async function() {
    // Set priorities
    let transactions = [{
      // Set priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      method: TxPriority.instance.methods.setPriority(BlockRewardAuRa.address, '0x171d54dd', '3000').send,
      from: OWNER,
      gasPrice: gasPrice0
    }, {
      // Set priority for StakingAuRa.setDelegatorMinStake
      method: TxPriority.instance.methods.setPriority(StakingAuRa.address, '0x2bafde8d', '2000').send,
      from: OWNER,
      gasPrice: gasPrice0
    }, {
      // Set priority for StakingAuRa.setCandidateMinStake
      method: TxPriority.instance.methods.setPriority(StakingAuRa.address, '0x48aaa4a2', '1000').send,
      from: OWNER,
      gasPrice: gasPrice0
    }];
    let results = await batchSendTransactions(transactions);
    let allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
    expect(allTxSucceeded, `Cannot set priorities`).to.equal(true);

    // Send test transactions
    const ownerNonce = await web3.eth.getTransactionCount(OWNER);
    transactions = [{
      // 0. Call StakingAuRa.setCandidateMinStake with non-zero gas price
      // and nonce + 0
      method: StakingAuRa.instance.methods.setCandidateMinStake(candidateMinStake).send,
      from: OWNER,
      gasPrice: gasPrice1,
      nonce: ownerNonce
    }, {
      // 1. Call BlockRewardAuRa.setErcToNativeBridgesAllowed with non-zero gas price
      // and nonce + 2
      method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([OWNER]).send,
      from: OWNER,
      gasPrice: gasPrice1,
      nonce: ownerNonce + 2
    }, {
      // 2. Call StakingAuRa.setDelegatorMinStake with non-zero gas price
      // and nonce + 1
      method: StakingAuRa.instance.methods.setDelegatorMinStake(delegatorMinStake).send,
      from: OWNER,
      gasPrice: gasPrice1,
      nonce: ownerNonce + 1
    }, {
      // 3. The arbitrary account sends a TX with higher gas price
      method: web3.eth.sendSignedTransaction,
      params: [(await account.signTransaction({
        to: '0x0000000000000000000000000000000000000000',
        gas: '21000',
        gasPrice: gasPrice2
      })).rawTransaction]
    }];
    results = await batchSendTransactions(transactions, true);

    // Sort and check results by transactionIndex
    expect(sortByTransactionIndex(results), 'Invalid transactions order').to.eql([
      0, // StakingAuRa.setCandidateMinStake
      2, // StakingAuRa.setDelegatorMinStake
      1, // BlockRewardAuRa.setErcToNativeBridgesAllowed
      3, // arbitrary transaction
    ]);

    // Remove previously set priorities
    transactions = [{
      // Remove priority for BlockRewardAuRa.setErcToNativeBridgesAllowed
      method: TxPriority.instance.methods.removePriority(BlockRewardAuRa.address, '0x171d54dd').send,
      from: OWNER,
      gasPrice: gasPrice0
    }, {
      // Remove priority for StakingAuRa.setDelegatorMinStake
      method: TxPriority.instance.methods.removePriority(StakingAuRa.address, '0x2bafde8d').send,
      from: OWNER,
      gasPrice: gasPrice0
    }, {
      // Remove priority for StakingAuRa.setCandidateMinStake
      method: TxPriority.instance.methods.removePriority(StakingAuRa.address, '0x48aaa4a2').send,
      from: OWNER,
      gasPrice: gasPrice0
    }];
    results = await batchSendTransactions(transactions);
    allTxSucceeded = results.reduce((acc, val) => acc && val.receipt.status, true);
    expect(allTxSucceeded, 'Cannot remove priorities').to.equal(true);
  });

  it('Finish', async function() {
    await waitForNextStakingEpoch(web3);
  });

  async function batchSendTransactions(transactions, ensureSingleBlock) {
    let promises = [];
    let batch = new web3.BatchRequest();
    transactions.forEach(item => {
      let params = [item];
      if (item.params) {
        params = item.params;
      }
      promises.push(new Promise((resolve, reject) => {
        batch.add(item.method.request(...params, async (err, txHash) => {
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

    if (ensureSingleBlock) {
      // Ensure the transactions were mined in the same block
      const blockNumbers = results.map(r => r.receipt.blockNumber);
      expect(
        blockNumbers.filter((x, i, a) => a.indexOf(x) == i).length,
        'Transactions were not mined in the same block'
      ).to.equal(1);

      // Check min/max transactionIndex
      const minTransactionIndex = results.reduce((acc, cur) => {
        if (cur.receipt.transactionIndex < acc) {
          return cur.receipt.transactionIndex;
        } else {
          return acc;
        }
      }, results[0].receipt.transactionIndex);
      const maxTransactionIndex = results.reduce((acc, cur) => {
        if (cur.receipt.transactionIndex > acc) {
          return cur.receipt.transactionIndex;
        } else {
          return acc;
        }
      }, results[0].receipt.transactionIndex);
      expect(
        maxTransactionIndex - minTransactionIndex + 1,
        'Transactions are not consequent in the block'
      ).to.equal(results.length);

      if (minTransactionIndex > 0) {
        // There must be emitInitiateChange and/or randomness transaction
        // at the beginning of the block
        const block = await web3.eth.getBlock(blockNumbers[0], true);
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
      return { i, transactionIndex: r.receipt.transactionIndex };
    });
    sortedResults.sort((a, b) => a.transactionIndex - b.transactionIndex);
    sortedResults = sortedResults.map(r => r.i);
    return sortedResults;
  }

});
