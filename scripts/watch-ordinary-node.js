const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const os = require('os');
const { isConnected } = require('../utils/utils');

const ordUrl = 'ws://localhost:9540';
const valUrl = 'ws://localhost:9541';

// ordinary node
const web3Ord = new Web3(new Web3.providers.WebsocketProvider(ordUrl));
// reference validator node
const web3Val = new Web3(new Web3.providers.WebsocketProvider(valUrl));
// block time
const blockTimeMS = 2539;

const node0Path = '../parity-data/node0/';
const blocksLogFileName = path.join(__dirname, `${node0Path}blocks.log`);
const checkLogFileName = path.join(__dirname, `${node0Path}check.log`);

var tooFarApartCounter = 0;

function getLatestBlock(web3) {
    if (isConnected(web3)) {
        return web3.eth.getBlock('latest', false);
    } else {
        return null;
    }
}

function reportBad(blockOrd, blockVal, reason) {
    const report = JSON.stringify({
        reason,
        ordinaryNodeBlock: {
          number: blockOrd.number,
          hash: blockOrd.hash,
          author: blockOrd.author,
        },
        validatorNodeBlock: {
          number: blockVal.number,
          hash: blockVal.hash,
          author: blockVal.author,
        },
    }) + os.EOL;
    fs.appendFileSync(checkLogFileName, report, 'utf8');
}

function repeatOrExit() {
    const ordConnected = isConnected(web3Ord);
    const valConnected = isConnected(web3Val);

    if (ordConnected || valConnected) {
        if (!ordConnected) {
            web3Ord.setProvider(new Web3.providers.WebsocketProvider(ordUrl));
        }
        if (!valConnected) {
            web3Val.setProvider(new Web3.providers.WebsocketProvider(valUrl));
        }

        setTimeout(doCheck, blockTimeMS);
    } else {
        // Exit if both nodes are turned off
        process.exit();
    }
}

async function doCheck() {
    Promise.all([
        getLatestBlock(web3Ord),
        getLatestBlock(web3Val)
    ]).then(async function(blocks) {
        let blockOrd = blocks[0];
        let blockVal = blocks[1];

        if (blockOrd == null || blockVal == null) {
            repeatOrExit();
            return;
        }

        fs.appendFileSync(blocksLogFileName, `${blockOrd.number} (${blockOrd.hash}) - ${blockVal.number} (${blockVal.hash})\n`, 'utf8');

        if (Math.abs(blockOrd.number - blockVal.number) > 1) {
            tooFarApartCounter++;
            if (tooFarApartCounter * blockTimeMS > 30000) {
                // If the block numbers differ for more than 30 seconds,
                // something is wrong
                reportBad(blockOrd, blockVal, 'Block numbers too far apart: ' + (blockOrd.number - blockVal.number));
                tooFarApartCounter = 0;
            }
            setTimeout(doCheck, blockTimeMS);
            return;
        }

        if (Math.abs(blockOrd.number - blockVal.number) == 1) {
            // maybe we just happen to be in the moment when blocks change, check next time
            setTimeout(doCheck, blockTimeMS);
            return;
        }
        // here block numbers agree

        if (blockOrd.hash.toLowerCase() != blockVal.hash.toLowerCase()) {
            reportBad(blockOrd, blockVal, 'Block hashes disagree: ' + blockOrd.hash.toLowerCase() + ' vs ' + blockVal.hash.toLowerCase());
        }

        setTimeout(doCheck, blockTimeMS);
    }).catch(e => {
        repeatOrExit();
    });
}

setTimeout(doCheck, blockTimeMS);
