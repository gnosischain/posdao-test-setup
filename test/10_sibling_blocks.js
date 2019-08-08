const fs = require('fs');
const path = require('path');
const expect = require('chai')
    .use(require('chai-as-promised'))
    .expect;
const ethers = require("ethers");
const path = require("path");

const URL1 = "http://localhost:8546";   // original node address
const URL2 = "http://localhost:8549";   // duplicate node address
const rpc1 = new ethers.providers.JsonRpcProvider(URL1);
const rpc2 = new ethers.providers.JsonRpcProvider(URL2);
const validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3).instance;
const PASSWORD_PATH = "/../config/password"
const SIGNER_ADDRESS = '0x720e118ab1006cc97ed2ef6b4b49ac04bb3aa6d9';
const PARITY = '../parity-ethereum/target/release/parity';

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
    it('at the start the duplicate node should not be a signer', async () => {
        var validators = await validatorSetContract.methods.getValidators().call();
        var signing1 = await rpc2.send('eth_mining', []);
        expect(signing1, 'The original node should sign').to.be.true;
        var signing2 = await rpc2.send('eth_mining', []);
        expect(signing2, 'The duplicate node should not sign').to.be.false;
    });

    it('start the duplicate node', async () => {
        startNode1('./config/node9.toml');
    });

    it('the duplicate node is signing', async () => {
        var signing = false;
        while (!signing) {
            await new Promise(r => setTimeout(r, 999));
            signing2 = await rpc2.send('eth_mining', []);
            assert.typeOf(signing, 'boolean');
        };
        console.log('***** Duplicate node is signing OK');
    });

    it('a sibling block is produced', async () => {
        // TODO
    });

    it('the duplicated node gets removed', async () => {
        // TODO
    });
});
