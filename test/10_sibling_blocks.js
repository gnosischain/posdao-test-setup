const fs = require('fs');
const path = require('path');
const { promisify } = require("util");
const exec = promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const assert = require('chai').assert;
const expect = require('chai')
    .use(require('chai-as-promised'))
    .expect;
const ethers = require('ethers');
const Web3 = require('web3');
const PORT_GOOD = '9545';
const PORT1 = '8546';
const PORT2 = '8549';
const URL_GOOD = `ws://localhost:${PORT_GOOD}`;   // good node address
const URL1 = `http://localhost:${PORT1}`;   // original node address
const URL2 = `http://localhost:${PORT2}`;   // duplicate node address
const web3Good = new Web3(URL_GOOD);
const web3 = new Web3(URL1);
const rpcGood = new ethers.providers.Web3Provider(web3Good.currentProvider);
const rpc1 = new ethers.providers.JsonRpcProvider(URL1);
const rpc2 = new ethers.providers.JsonRpcProvider(URL2);
const goodValidatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3Good).instance;
const validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3).instance;
const PASSWORD_PATH = '/../config/password'
const SIGNER_ADDRESS = '0x720E118Ab1006Cc97ED2EF6B4B49ac04bb3aA6d9';
const PARITY = '../parity-ethereum/target/release/parity';

var lastBlockBeforeDuplication;

function startDuplicateNode(configToml) {
    var out = fs.openSync('./parity-data/node9/log', 'a');
    var err = fs.openSync('./parity-data/node9/log', 'a');
    console.log('***** Starting the duplicate node');
    spawn(PARITY, ['--config', configToml], {
        detached: true,
        stdio: ['ignore', out, err]
    }).unref();
}

describe('Make the duplicate node a signer, check that it produces sibling blocks and gets removed', () => {
    it('at the start the duplicate node should be offline', async () => {
        var signing1 = await rpc1.send('eth_mining', []);
        expect(signing1, 'The original node should sign').to.be.true;
        var cmd = `lsof -t -i:${PORT2}`
        try {
            var execOutput = await exec(cmd);
            expect(
                execOutput.stdout,
                'The port of the duplicate node is being used by ${execOutput.stdout}'

            ).to.be.empty;
        } catch {
            console.log('***** Duplicate node is offline as expected');
        }
    });

    it('the original node is a validator', async() => {
        var validators = await validatorSetContract.methods.getValidators().call();
        console.log(`***** Current validators: ${validators}`);
        expect(validators.includes(SIGNER_ADDRESS),
               `${SIGNER_ADDRESS} should be in the set of validators`).to.be.true;
    });

    it('start the duplicate node', async () => {
        lastBlockBeforeDuplication = await web3.eth.getBlockNumber();
        assert.typeOf(lastBlockBeforeDuplication, 'number');
        startDuplicateNode('./config/node9.toml');
    });

    it('the duplicate node is signing', async () => {
        var signing = false;
        while (!signing) {
            await new Promise(r => setTimeout(r, 999));
            signing = await rpc2.send('eth_mining', []);
            assert.typeOf(signing, 'boolean');
        };
        console.log('***** Duplicate node is signing OK');
    });

    it('a sibling block is produced', async () => {
        var maliceReported = false;
        console.log('***** Listening on ReportedMalicious events from a good validator');
        goodValidatorSetContract.events.ReportedMalicious({
            fromBlock: lastBlockBeforeDuplication
        }).on('data', (event) => {
            maliceReported = true;
        }).on('error', console.error);
        expect(maliceReported).to.be.true;
    });

    it('the duplicated node gets removed from the set of validators', async () => {
        var validators = await goodValidatorSetContract.methods.getValidators().call();
        while (validators.includes(SIGNER_ADDRESS)) {
            await new Promise(r => setTimeout(r, 499));
        }
    });
});
