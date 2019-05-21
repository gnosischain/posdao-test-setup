const fs = require('fs');
const path = require('path');
const Web3 = require('web3');
const os = require('os');

// ordinary node
const web3Ord = new Web3('http://localhost:8540');
// reference validator node
const web3Val = new Web3('http://localhost:8541');
// block time
const blockTimeMS = 2539;

const checkLogFileName = path.join(__dirname, '../parity-data/node0/check.log');
fs.writeFileSync(checkLogFileName, '', 'utf8');

function getLatestBlock(web3) {
    return web3.eth.getBlock('latest', false);
}

function reportBad(blockOrd, blockVal, reason) {
    fs.appendFileSync(checkLogFileName, JSON.stringify({
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
    }) + os.EOL, 'utf8');
}

function doCheck() {
    Promise.all([
        getLatestBlock(web3Ord),
        getLatestBlock(web3Val)
    ]).then(blocks => {
        let blockOrd = blocks[0];
        let blockVal = blocks[1];

        if (Math.abs(blockOrd.number - blockVal.number) > 1) {
            reportBad(blockOrd, blockVal, 'Block numbers too far apart: ' + (blockOrd.number - blockVal.number));
            return;
        }

        if (Math.abs(blockOrd.number - blockVal.number) == 1) {
            // maybe we just happen to be in the moment when blocks change, check next time
            return;
        }
        // here block numbers agree

        if (blockOrd.hash.toLowerCase() != blockVal.hash.toLowerCase()) {
            reportBad(blockOrd, blockVal, 'Block hashes disagree: ' + blockOrd.hash.toLowerCase() + ' vs ' + blockVal.hash.toLowerCase());
            return;
        }
    }).catch(e => {
      reportBad({}, {}, 'Exception: ' + e);
    });
}

setInterval(doCheck, blockTimeMS);
