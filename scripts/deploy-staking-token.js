// Assumes network is started

const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const constants = require('../utils/constants');
const SnS = require('../utils/signAndSendTx.js');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
web3.eth.transactionPollingTimeout = 30;
const BN = web3.utils.BN;
const BlockRewardAuRa = require(path.join(__dirname, '../utils/getContract'))('BlockRewardAuRa', web3);
const StakingAuRa = require(path.join(__dirname, '../utils/getContract'))('StakingAuRa', web3);
const OWNER = constants.OWNER;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const pp = require('../utils/prettyPrint');
const mintCoinsToCandidates = require('./mint-coins-to-candidates');
let tokenName = 'STAKE';
let tokenSymbol = 'STAKE';
let tokenDecimals = 18;

function compileContract() {
    let input = {
        language: 'Solidity',
        sources: {
            'token.sol': {
                content: fs.readFileSync(path.join(__dirname, '../posdao-contracts/contracts/ERC677BridgeTokenRewardable.sol'), 'utf8'),
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
    };
    let compiledContract = JSON.parse( solc.compile(JSON.stringify(input)) );
    return compiledContract.contracts['token.sol']['ERC677BridgeTokenRewardable'];
}

async function main() {
    console.log('**** Check that StakingToken is already deployed in StakingAuRa');
    let existingStakingTokenAddress = await StakingAuRa.instance.methods.erc677TokenContract().call();
    if (existingStakingTokenAddress
          && existingStakingTokenAddress.toLowerCase() != '0x'
          && existingStakingTokenAddress.toLowerCase() != '0x0000000000000000000000000000000000000000'
        ) {
        console.log('***** StakingToken already deployed at ' + existingStakingTokenAddress + ', skipping deployment');
        return;
    }

    let compiledContract = compileContract();
    let abi = compiledContract.abi;
    let bytecode = compiledContract.evm.bytecode.object;
    const netId = await web3.eth.net.getId();

    console.log(`**** Deploying StakingToken. netId = ${netId}`);
    const contract = new web3.eth.Contract(abi);

    // Deploy using eth_sendTransaction
    const data = await contract
        .deploy({
            data: '0x' + bytecode,
            arguments: [tokenName, tokenSymbol, tokenDecimals, netId],
        })
        .encodeABI();
    let txParams;
    const latestBlock = await sendRequest(`curl --data '{"method":"eth_getBlockByNumber","params":["latest",false],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST ${web3.currentProvider.host} 2>/dev/null`);
    if (latestBlock.baseFee) { // EIP-1559 is activated, so we can use a new type of transactions
        txParams = {
            from: OWNER,
            type: '0x2',
            chainId: web3.utils.numberToHex(netId),
            maxPriorityFeePerGas: web3.utils.numberToHex('0'),
            maxFeePerGas: web3.utils.numberToHex('0'),
            gas: web3.utils.numberToHex('4700000'),
            data,
            accessList: []
        };
    } else { // EIP-1559 is not activated. Use a legacy transaction
        txParams = {
            from: OWNER,
            gasPrice: web3.utils.numberToHex('0'),
            gas: web3.utils.numberToHex('4700000'),
            data
        };
    }
    const txHash = await sendRequest(`curl --data '{"method":"eth_sendTransaction","params":[${JSON.stringify(txParams)}],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST ${web3.currentProvider.host} 2>/dev/null`);
    let stakingTokenDeployTxReceipt;
    while(!(stakingTokenDeployTxReceipt = await sendRequest(`curl --data '{"method":"eth_getTransactionReceipt","params":["${txHash}"],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST ${web3.currentProvider.host} 2>/dev/null`))) {
        await sleep(500);
    }
    /*
    // Deploy using eth_sendRawTransaction
    const stakingTokenDeploy = await contract.deploy({
        data: '0x' + bytecode,
        arguments: [tokenName, tokenSymbol, tokenDecimals, netId]
    });
    const stakingTokenDeployTxReceipt = await SnS(web3, {
        from: OWNER,
        method: stakingTokenDeploy,
        gasLimit: '4700000',
        gasPrice: '0'
    });
    */
    const StakingTokenInstance = new web3.eth.Contract(abi, stakingTokenDeployTxReceipt.contractAddress);

    let address = StakingTokenInstance.options.address;
    console.log('**** StakingToken deployed at:', address);

    console.log('**** Saving output to ./data');
    let runtimeData = { abi, address };
    fs.writeFileSync(path.join(__dirname, '../data/StakingToken.json'), JSON.stringify(runtimeData, null, 4));

    let tx;

    console.log('**** Set StakingAuRa address in StakingToken contract');
    tx = await SnS(web3, {
        from: OWNER,
        to: address,
        method: StakingTokenInstance.methods.setStakingContract(StakingAuRa.address),
        gasPrice: '0',
    });
    pp.tx(tx);
    expect(tx.status).to.equal(true);

    console.log('**** Set BlockRewardAuRa address in StakingToken contract');
    tx = await SnS(web3, {
        from: OWNER,
        to: address,
        method: StakingTokenInstance.methods.setBlockRewardContract(BlockRewardAuRa.address),
        gasPrice: '0',
    });
    pp.tx(tx);
    expect(tx.status).to.equal(true);

    console.log('**** Set StakingToken address in StakingAuRa');
    tx = await SnS(web3, {
        from: OWNER,
        to: StakingAuRa.address,
        method: StakingAuRa.instance.methods.setErc677TokenContract(address),
        gasPrice: '0',
    });
    pp.tx(tx);
    expect(tx.status).to.equal(true);

    let contractAddress;

    console.log('**** Check that StakingAuRa address in StakingToken contract is correct');
    contractAddress = await StakingTokenInstance.methods.stakingContract().call();
    expect(contractAddress).to.equal(StakingAuRa.address);

    console.log('**** Check that BlockRewardAuRa address in StakingToken contract is correct');
    contractAddress = await StakingTokenInstance.methods.blockRewardContract().call();
    expect(contractAddress).to.equal(BlockRewardAuRa.address);

    console.log('**** Check that StakingToken address in StakingAuRa is correct');
    contractAddress = await StakingAuRa.instance.methods.erc677TokenContract().call();
    expect(contractAddress).to.equal(address);

    console.log('**** Mint initial coins to candidates and unremovable validator');
    await mintCoinsToCandidates();
}

function sendRequest(cmd) {
  return new Promise((resolve, reject) => {
    var exec = require('child_process').exec;
    exec(cmd, function (error, stdout, stderr) {
      if (error !== null) {
        reject(error);
      }
      let resp;
      try {
        resp = JSON.parse(stdout);
      } catch(e) {
        reject(e);
      }
      if (resp.hasOwnProperty('result')) {
        resolve(resp.result);
      } else {
        reject(new Error('result is undefined'));
      }
    });
  })
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

main();
