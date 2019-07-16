console.log('');
console.log('');

const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:9541'));

const artifactsPath = '../posdao-contracts/build/contracts/';
const validatorSetContract = new web3.eth.Contract(
  require(`${artifactsPath}ValidatorSetAuRa.json`).abi,
  '0x1000000000000000000000000000000000000001'
);
const stakingContract = new web3.eth.Contract(
  require(`${artifactsPath}StakingAuRa.json`).abi,
  '0x1100000000000000000000000000000000000001'
);
const randomContract = new web3.eth.Contract(
  require(`${artifactsPath}RandomAuRa.json`).abi,
  '0x3000000000000000000000000000000000000001'
);

const contractNameByAddress = {};
contractNameByAddress[validatorSetContract.options.address] = 'ValidatorSetAuRa';
contractNameByAddress[stakingContract.options.address] = 'StakingAuRa';
contractNameByAddress[randomContract.options.address] = 'RandomAuRa';

web3.eth.subscribe('newBlockHeaders', function(error, result){
  if (error) {
    console.log(error);
  }
}).on("data", async function(blockHeader){
  if (blockHeader.number) {
    const block = await web3.eth.getBlock(blockHeader.number, true);

    console.log(`Block ${blockHeader.number}`);
    console.log(`  Gas used:  ${blockHeader.gasUsed} [${block.transactions.length} txs]`);
    console.log(`  Gas limit: ${blockHeader.gasLimit}`);
    console.log(`  Validator: ${blockHeader.miner}`);
    console.log('');

    const stakingEpoch = await stakingContract.methods.stakingEpoch().call();
    const stakingEpochStartBlock = await stakingContract.methods.stakingEpochStartBlock().call();
    const validatorSetApplyBlock = await validatorSetContract.methods.validatorSetApplyBlock().call();
    const stakingEpochEndBlock = await stakingContract.methods.stakingEpochEndBlock().call();
    console.log(`stakingEpoch ${stakingEpoch}`);
    console.log(`  startBlock ${stakingEpochStartBlock}`);
    console.log(`  applyBlock ${validatorSetApplyBlock > 0 ? validatorSetApplyBlock : '-'}`);
    console.log(`  endBlock   ${stakingEpochEndBlock}`);
    console.log('');

    const collectionRound = await randomContract.methods.currentCollectRound().call();
    const isCommitPhase = await randomContract.methods.isCommitPhase().call();
    console.log(`collectionRound ${collectionRound}`);
    console.log(`  ${isCommitPhase ? 'COMMITS' : 'REVEALS'} PHASE`);
    console.log('');

    let emptyList = true;
    let method;
    const validators = await validatorSetContract.methods.getValidators().call();

    if (isCommitPhase) {
      console.log('isCommitted:');
      method = randomContract.methods.isCommitted;
    } else {
      console.log('sentReveal:');
      method = randomContract.methods.sentReveal;
    }
    for (let i = 0; i < validators.length; i++) {
      const result = await method(collectionRound, validators[i]).call();
      if (result) {
        console.log(`  ${validators[i]}`);
        emptyList = false;
      }
    }
    if (emptyList) {
      console.log('-');
    }
    console.log('');

    //console.log('currentRandom:');
    //console.log(await randomContract.methods.currentRandom().call());
    //console.log('');

    const events = await validatorSetContract.getPastEvents('InitiateChange', {fromBlock: blockHeader.number, toBlock: blockHeader.number});
    for (let i = 0; i < events.length; i++) {
      console.log('InitiateChange:');
      console.log(events[i].returnValues.newSet);
      console.log('');
    }

    let txSuccess = [];
    let txFail = [];

    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      const txReceipt = await web3.eth.getTransactionReceipt(tx.hash);
      const txObject = {from: tx.from, to: tx.to, gasPrice: tx.gasPrice, gasLimit: tx.gas, nonce: tx.nonce, receipt: txReceipt};
      if (txReceipt.status) {
        txSuccess.push(txObject);
      } else {
        txFail.push(txObject);
      }
    }

    if (txSuccess.length > 0) {
      console.log('SUCCESS transactions:');
      txSuccess.forEach((tx) => {
        let contractName = tx.to;
        if (contractNameByAddress.hasOwnProperty(tx.to)) {
          contractName = contractNameByAddress[tx.to]
        }
        console.log(`  ${tx.from} => ${contractName}`);
        console.log(`    gas used: ${tx.receipt.gasUsed}/${tx.gasLimit}, gas price: ${tx.gasPrice}, nonce: ${tx.nonce}`);
      });
      console.log('');
    }

    if (txFail.length > 0) {
      console.log('FAILED transactions:');
      txFail.forEach((tx) => {
        let contractName = tx.to;
        if (contractNameByAddress.hasOwnProperty(tx.to)) {
          contractName = contractNameByAddress[tx.to]
        }
        console.log(`  ${tx.from} => ${contractName}`);
        console.log(`    gas used: ${tx.receipt.gasUsed}/${tx.gasLimit}, gas price: ${tx.gasPrice}, nonce: ${tx.nonce}`);
      });
      console.log('');
    }

    console.log('');
    console.log('=======================================================');
    console.log('');
    console.log('');
  }
}).on("error", console.error);
