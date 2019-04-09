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

async function killPrimary() {
    let cmd = 'kill -9 $(lsof -t -i:30301)';
    console.log('***** Killing primary node');
    var execOutput = await exec(cmd);
    expect(execOutput.stderr, `Error when killing primary node: ${execOutput.stderr}`).to.be.empty;
}

async function killIsMining() {
    let cmd = 'kill -9 $(lsof -t ./parity-data/isMining.out)';
    console.log('***** Killing isMining.js');
    var execOutput = await exec(cmd);
    expect(execOutput.stderr, `Error when killing isMining.js: ${execOutput.stderr}`).to.be.empty;
}

function startPrimary(configToml) {
    var out = fs.openSync('./parity-data/node1/log', 'a');
    console.log('***** Restarting primary node');
    spawn(PARITY, ['--config', configToml], {
        detached: true,
        stdio: ['ignore', out, out]
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

describe('Primary node is backed up by secondary node', () => {
    it('Secondary node starts in reserve', async () => {
        var signing2 = await rpc2.send('eth_mining', []);
        expect(signing2, 'Secondary node should start in reserve').to.be.false;
    });
    it('isMining.js is down, primary still signs, secondary stays in reserve', async () => {
        killIsMining();
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * (validators.length + 1) * 5000));
        var signing1 = await rpc2.send('eth_mining', []);
        expect(signing1, 'Primary node should stay being the signer').to.be.true;
        var signing2 = await rpc2.send('eth_mining', []);
        expect(signing2, 'Secondary node should stay in reserve').to.be.false;
    });

    it('isMining.js is down, primary node is down, secondary node signs', async () => {
        killPrimary();
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * (validators.length + 1) * 5000));
        var signing2 = await rpc2.send('eth_mining', []);
        expect(signing2, 'Secondary node should start signing').to.be.true;
    });

    it('isMining.js is up, primary node is up and starts to sign', async () => {
        startIsMining();
        startPrimary('./config/node1.toml');
        var signing2 = true;
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing2, 'boolean');
        }
        console.log('***** Secondary node stopped signing OK');
    });

    it('Primary node disconnects and reconnects with the engine signer not set', async () => {
        await killPrimary();
        var signing2 = false;
        // Wait until the secondary starts to sign.
        while (!signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Secondary node is now signing instead of the primary node');
        startPrimary('./config/node1-no-signer.toml');
        var validators = await validatorSetContract.methods.getValidators().call();
        await new Promise(r => setTimeout(r, 2 * (validators.length + 1) * 5000));
        signing2 = await rpc2.send('eth_mining', []);
        expect(signing2, 'Secondary node should stay being the signer').to.be.true;
    });

    // After the last test, Node 1 is still not signing. The following test returns Node 1 in the
    // initial state where it is a signer. So in fact the starting state for this test is where the
    // previous test left off.
    it('Secondary stops signing as soon as the primary starts to sign', async () => {
        let password = await readFile(path.join(__dirname, PASSWORD_PATH), "UTF-8");
        assert(typeof password === "string");
        await rpc1.send(
            "parity_setEngineSigner",
            [ SIGNER_ADDRESS, password.trim() ]
        );
        var signing2 = true;
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Secondary node stopped signing OK');
    });

    it('Primary node disconnects and reconnects with the engine signer set', async () => {
        await killPrimary();
        var signing2 = false;
        // Wait until the secondary starts to sign.
        while (!signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Secondary node is now signing instead of primary node');
        startPrimary('./config/node1.toml');
        while (signing2) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Secondary node stopped signing OK');
    });
});
