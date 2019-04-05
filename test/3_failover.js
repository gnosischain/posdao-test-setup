const { promisify } = require("util");
const exec = promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const fs = require("fs");
const readFile = promisify(fs.readFile);
const ethers = require("ethers");
const path = require("path");
const Web3 = require('web3');
const URL1 = "http://localhost:8541";   // primary address
const URL2 = "http://localhost:8544";   // secondary address
const web3 = new Web3(URL2);
const BN = web3.utils.BN;
const assert = require('chai').assert;
const expect = require('chai')
    .use(require('chai-bn')(BN))
    .use(require('chai-as-promised'))
    .expect;
const rpc1 = new ethers.providers.JsonRpcProvider(URL1);
const rpc2 = new ethers.providers.JsonRpcProvider(URL2);
const validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3).instance;

const PASSWORD_PATH = "/../config/password"
const SIGNER_ADDRESS = '0xbbcaa8d48289bb1ffcf9808d9aa4b1d215054c78';
const PARITY = '../parity-ethereum/target/debug/parity';

async function killNode1() {
    let cmd = 'kill -9 $(lsof -t -i:30301)';
    console.log('***** Killing Node 1');
    var execOutput = await exec(cmd);
    expect(execOutput.stderr, `Error when killing Node 1: ${execOutput.stderr}`).to.be.empty;
}

async function killIsMining() {
    let cmd = 'kill -9 $(lsof -t ./parity-data/isMining.out)';
    console.log('***** Killing isMining.js');
    var execOutput = await exec(cmd);
    expect(execOutput.stderr, `Error when killing isMining.js: ${execOutput.stderr}`).to.be.empty;
}

function startNode1(configToml) {
    var out = fs.openSync('./parity-data/node1/log', 'a');
    var err = fs.openSync('./parity-data/node1/log', 'a');
    console.log('***** Restarting Node 1');
    spawn(PARITY, ['--config', configToml], {
        detached: true,
        stdio: ['ignore', out, err]
    }).unref();
}

function startIsMining() {
    var out = fs.openSync('./parity-data/isMining.out', 'a');
    var err = fs.openSync('./parity-data/isMining.err', 'a');
    console.log('***** Restarting isMining.js');
    spawn('node', ['./scripts/isMining.js'], {
        detached: true,
        stdio: ['ignore', out, err]
    }).unref();
}

describe('Node 1 is backed up by node 4', () => {
    it('Node 1 disconnects and reconnects with the engine signer not set', async () => {
        await killNode1();
        var signing2 = false;
        // Wait until the secondary starts to sign.
        while (!signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 is now signing instead of Node 1');
        startNode1('./config/node1-no-signer.toml');
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * validators.length * 5000));
        signing2 = await rpc2.send("eth_mining", []);
        expect(signing2, 'Node 4 should remain being the signer').to.be.true;
    });

    // After the last test, Node 1 is still not signing. The following test returns Node 1 in the
    // initial state where it is a signer. So in fact the starting state for this test is where the
    // previous test left off.
    it('Node 4 stops signing as soon as Node 1 starts to sign', async () => {
        let password = await readFile(path.join(__dirname, PASSWORD_PATH), "UTF-8");
        assert(typeof password === "string");
        await rpc1.send(
            "parity_setEngineSigner",
            [ SIGNER_ADDRESS, password.trim() ]
        );
        var signing2 = true;
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 stopped signing OK');
    });

    it('Node 1 disconnects and reconnects with the engine signer set', async () => {
        await killNode1();
        var signing2 = false;
        // Wait until the secondary starts to sign.
        while (!signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 is now signing instead of Node 1');
        startNode1('./config/node1.toml');
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 has stopped signing OK');
    });

    it('isMining.js is down, Node 1 still signs, Node 4 stays in reserve', async () => {
        killIsMining();
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * validators.length * 5000));
        var signing1 = await rpc2.send("eth_mining", []);
        expect(signing1, 'Node 1 should remain being the signer').to.be.true;
        var signing2 = await rpc2.send("eth_mining", []);
        expect(signing2, 'Node 4 should remain being in reserve').to.be.false;
    });

    it('isMining.js is down, Node 1 is down, Node 4 signs', async () => {
        killNode1();
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * validators.length * 5000));
        var signing2 = await rpc2.send("eth_mining", []);
        expect(signing2, 'Node 4 should start signing').to.be.true;
    });

    it('isMining.js is up, Node 1 is up and starts to sign', async () => {
        startIsMining();
        startNode1('./config/node1.toml');
        var signing2 = true;
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        }
        console.log('***** Node 4 stopped signing OK');
    });
});
