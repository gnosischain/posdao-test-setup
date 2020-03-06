console.log('');
console.log('');

const fs = require('fs');
const Web3 = require('web3');
const providerUrl = 'ws://localhost:9541';
const web3 = new Web3(new Web3.providers.WebsocketProvider(providerUrl));
const artifactsPath = '../posdao-contracts/build/contracts/';

main();

var prevConnected = false;
var subscription = null;
async function main() {
  const connected = isConnected();
  if (!connected) {
    if (subscription) {
      await subscription.unsubscribe();
      subscription = null;
    }
    web3.setProvider(new Web3.providers.WebsocketProvider(providerUrl));
  } else if (!prevConnected) {
    subscription = web3.eth.subscribe('newBlockHeaders', function(error, result){
      if (error) {
        console.log(error);
      }
    }).on("data", onNewBlock).on("error", console.error);
  }
  prevConnected = connected;
  setTimeout(main, 3000);
}

async function onNewBlock(blockHeader) {
  if (blockHeader.number) {
    const block = await web3.eth.getBlock(blockHeader.number, true);
    const contractNameByAddress = {};
    
    const validatorSetContract = new web3.eth.Contract(
      require(`${artifactsPath}ValidatorSetAuRa.json`).abi,
      getValidatorSetContractAddress(blockHeader.number)
    );
    contractNameByAddress[validatorSetContract.options.address] = 'ValidatorSetAuRa';
    
    let stakingContract = null;
    let randomContract = null;
    try {
      stakingContract = new web3.eth.Contract(
        require(`${artifactsPath}StakingAuRa.json`).abi,
        await validatorSetContract.methods.stakingContract().call()
      );
      contractNameByAddress[stakingContract.options.address] = 'StakingAuRa';
      randomContract = new web3.eth.Contract(
        require(`${artifactsPath}RandomAuRa.json`).abi,
        await validatorSetContract.methods.randomContract().call()
      );
      contractNameByAddress[randomContract.options.address] = 'RandomAuRa';
    } catch(e) {
    }

    console.log(`Block ${blockHeader.number}`);
    console.log(`  Gas used:  ${blockHeader.gasUsed} [${block.transactions.length} txs]`);
    console.log(`  Gas limit: ${blockHeader.gasLimit}`);
    console.log(`  Validator: ${blockHeader.miner}`);
    console.log('');

    if (stakingContract && randomContract) {
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

      const events = await validatorSetContract.getPastEvents('InitiateChange', {fromBlock: blockHeader.number, toBlock: blockHeader.number});
      for (let i = 0; i < events.length; i++) {
        console.log('InitiateChange:');
        console.log(events[i].returnValues.newSet);
        console.log('');
      }
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
}

function getValidatorSetContractAddress(currentBlock) {
  let vsBlock;
  let spec = fs.readFileSync(__dirname + '/../parity-data/spec.json', 'utf8');
  spec = JSON.parse(spec);
  for (const hfBlock in spec.engine.authorityRound.params.validators.multi) {
    if (currentBlock >= hfBlock || !currentBlock) {
      vsBlock = hfBlock;
    }
  }
  const multi = spec.engine.authorityRound.params.validators.multi[vsBlock];
  return multi.contract || multi.safeContract;
}

function isConnected() {
  const connection = web3.currentProvider.connection;
  return connection.readyState == connection.OPEN;
}
