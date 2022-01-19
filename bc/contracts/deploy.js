const assert = require('assert');
const Web3 = require('web3');
const fs = require('fs');
const solc = require('solc');
const constants = require('../../utils/constants');
const web3 = new Web3('http://localhost:8541');
web3.eth.transactionConfirmationBlocks = 1;
web3.eth.transactionPollingTimeout = 30;
const BN = web3.utils.BN;
const OWNER = constants.OWNER;

function compileContract(contractName) {
    let input = {
        language: 'Solidity',
        sources: {
            'contract.sol': {
                content: fs.readFileSync(`${__dirname}/${contractName}.sol`, 'utf8'),
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
    let compiledContract = JSON.parse(solc.compile(JSON.stringify(input)));
    return compiledContract.contracts['contract.sol'][contractName];
}

async function main() {
    let compiledContract = compileContract('SBCToken');
    let abi = compiledContract.abi;
    let bytecode = compiledContract.evm.bytecode.object;

    const MGNO_AMOUNT = 32;
    const NUMBER_OF_VALIDATORS = 2048;
    const mintAmount = web3.utils.toWei(MGNO_AMOUNT).mul(new BN(NUMBER_OF_VALIDATORS));

    console.log(`** Deploying SBCToken`);
    const contract = new web3.eth.Contract(abi);

    // Deploy using eth_sendTransaction
    let data = await contract.deploy({ data: '0x' + bytecode, arguments: [mintAmount] }).encodeABI();
    let receipt = await web3.eth.sendTransaction({
        from: OWNER,
        gasPrice: web3.utils.numberToHex('0'),
        gas: web3.utils.numberToHex('4700000'),
        data
    });

    const sbcTokenInstance = new web3.eth.Contract(abi, receipt.contractAddress);

    let address = sbcTokenInstance.options.address;
    console.log('**** SBCToken deployed at:', address);

    console.log('**** Check that owner\'s balance is correct');
    const ownerBalance = await sbcTokenInstance.methods.balanceOf(OWNER).call();
    assert(ownerBalance === mintAmount.toString());
}

main();
