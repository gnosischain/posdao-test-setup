const { promisify } = require("util");
const exec = promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const fs = require("fs");
const ethers = require("ethers");
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

const SIGNER_ADDRESS = '0xbbcaa8d48289bb1ffcf9808d9aa4b1d215054c78';
const PARITY = '../parity-ethereum/target/debug/parity';

describe('Node 1 is backed up by node 4', () => {
    it('Node 1 disconnects and reconnects with the engine signer set', async () => {
        let cmd = 'kill -9 $(lsof -t ./parity-data/node1/log)';
        console.log(`***** Command: ${cmd}`);
        var execOutput = await exec(cmd);
        expect(execOutput.stderr, `Error when killing Node 1: ${execOutput.stderr}`).to.be.empty;
        await new Promise(r => setTimeout(r, 6000));
        var signing2 = false;
        // Wait until the secondary starts to sign.
        while (!signing2) {
            await new Promise(r => setTimeout(r, 3999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 is now signing instead of Node 1');
        var out = fs.openSync('./parity-data/node1/log', 'a');
        var err = fs.openSync('./parity-data/node1/log', 'a');
        console.log(`***** Restarting Node 1`);
        spawn(PARITY, ['--config', './config/node1.toml'], {
            detached: true,
            stdio: ['ignore', out, err]
        }).unref();
        while (signing2) {
            await new Promise(r => setTimeout(r, 3999));
            signing2 = await rpc2.send("eth_mining", []);
            assert.typeOf(signing2, 'boolean');
        };
        console.log('***** Node 4 has stopped signing OK');
    });
});
