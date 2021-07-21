console.log('');
console.log('');

const Web3 = require('web3');
const providerUrl = 'ws://localhost:9541';
const web3 = new Web3(new Web3.providers.WebsocketProvider(providerUrl));
const sendRequest = require('../utils/sendRequest.js');

const artifactsPath = '../posdao-contracts/build/contracts/';
const blockRewardContract = new web3.eth.Contract(
  require(`${artifactsPath}BlockRewardAuRa.json`).abi,
  '0x2000000000000000000000000000000000000001'
);
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
contractNameByAddress[blockRewardContract.options.address] = 'BlockRewardAuRa';
contractNameByAddress['0x4100000000000000000000000000000000000000'] = 'TxPriority';

var prevBlock = null;
var prevConnected = false;
var tryingReconnect = false;
var subscription = null;
var scanInterval = null;

connect();

async function connect() {
  const connected = isConnected();
  if (!connected) {
    if (prevConnected) {
      console.log('Lost connection');
    }
    if (subscription) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    prevBlock = null;
    web3.setProvider(new Web3.providers.WebsocketProvider(providerUrl));
    if (!tryingReconnect) {
      console.log('Trying a new websocket connection...');
      console.log();
      tryingReconnect = true;
    }
  } else {
    tryingReconnect = false;
    if (!prevConnected) {
      subscription = web3.eth.subscribe('newBlockHeaders', function(error, result){
        if (error && error.message.includes('not supported')) {
          scanInterval = setInterval(scanForNewBlock, 500);
        }
      }).on("data", blockHeader => onNewBlock(blockHeader.number));
    }
  }
  prevConnected = connected;
  setTimeout(connect, 3000);
}

async function onNewBlock(blockNumber) {
  let block;
  if (isConnected()) {
    block = await web3.eth.getBlock(blockNumber, true);
  } else {
    return;
  }

  console.log(`Block ${block.number}`);
  console.log(`  Gas used:  ${block.gasUsed} [${block.transactions.length} txs]`);
  console.log(`  Gas limit: ${block.gasLimit}`);
  console.log(`  Validator: ${block.miner}`);
  if (prevBlock) {
    console.log(`  Timestamp delta from prevBlock: ${block.timestamp - prevBlock.timestamp}`);
  }
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

  const events = await validatorSetContract.getPastEvents('InitiateChange', {fromBlock: block.number, toBlock: block.number});
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
      console.log(`    gas used: ${tx.receipt.gasUsed}/${tx.gasLimit}, gas price: ${tx.gasPrice}, nonce: ${tx.nonce}, index: ${tx.receipt.transactionIndex}`);
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
      console.log(`    gas used: ${tx.receipt.gasUsed}/${tx.gasLimit}, gas price: ${tx.gasPrice}, nonce: ${tx.nonce}, index: ${tx.receipt.transactionIndex}`);
    });
    console.log('');
  }

  //////////////////////////
  if (blockNumber == 12) {
    /*
    const txParams = {
      from: '0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24',
      to: '0xf67cc5231c5858ad6cc87b105217426e17b824bb',
      value: web3.utils.numberToHex('100'),
      gasPrice: '0x3b9aca00',
      gas: web3.utils.numberToHex('21000')
    };
    const txHash = await sendRequest(`curl --data '{"method":"eth_sendTransaction","params":[${JSON.stringify(txParams)}],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST ${web3.currentProvider.host} 2>/dev/null`);
    let txReceipt;
    while(!(txReceipt = await sendRequest(`curl --data '{"method":"eth_getTransactionReceipt","params":["${txHash}"],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST ${web3.currentProvider.host} 2>/dev/null`))) {
        await sleep(500);
    }
    console.log(txReceipt);
    */
    // Legacy send to EOA
    web3.eth.sendTransaction({
      from: '0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24',
      to: '0xf67cc5231c5858ad6cc87b105217426e17b824bb',
      value: web3.utils.numberToHex('100'),
      gasPrice: web3.utils.numberToHex('2000000000'),
      gas: web3.utils.numberToHex('21000')
    });
  } else if (blockNumber == 15) {
    // Legacy send to contract
    web3.eth.sendTransaction({
      from: '0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24',
      to: stakingContract.options.address,
      gasPrice: web3.utils.numberToHex('2000000000'),
      gas: web3.utils.numberToHex('100000'),
      data: stakingContract.methods.setDelegatorMinStake('1000000000000000000000').encodeABI()
    });
  }
  //////////////////////////

  console.log('');
  console.log('=======================================================');
  console.log('');
  console.log('');

  prevBlock = block;
}

function isConnected() {
  const connection = web3.currentProvider.connection;
  return connection.readyState == connection.OPEN;
}

async function scanForNewBlock() {
  if (isConnected()) {
    let blockNumber;
    try {
      blockNumber = await web3.eth.getBlockNumber();
    } catch (e) {
      prevBlock = null;
      return;
    }
    if (!prevBlock || blockNumber > prevBlock.number) {
      await onNewBlock(blockNumber);
    }
  } else {
    prevBlock = null;
  }
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}
