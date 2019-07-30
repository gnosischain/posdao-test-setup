/*
    - RandomAuRa.getCurrentSeed (значение должно меняться каждые RandomAuRa.collectRoundLength() блоков)const fs = require('fs');
*/

const path = require('path');
const Web3 = require('web3');
const os = require('os');
const fs = require('fs');

const web3 = new Web3('http://localhost:8541');
// block time
const checkIntervalMS = 2539;

const node1Path = '../parity-data/node1/';
const checkLogFileName = path.join(__dirname, `${node1Path}/checkRandomSeed.log`);
fs.writeFileSync(checkLogFileName, '', 'utf8');

const RandomAuRa = require('../utils/getContract')('RandomAuRa', web3).instance;
let collectRoundLength;

let prevBlock = 0;
function getLatestBlock() {
    return web3.eth.getBlock('latest', false);
}

let prevSeed = 0;
function getCurrentSeed() {
    return RandomAuRa.methods.getCurrentSeed().call();
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
        getLatestBlock(),
        getCurrentSeed(),
        RandomAuRa.methods.collectRoundLength().call(),
    ]).then(results => {
        let block = results[0];
        if (block.number == prevBlock) return;
        prevBlock = block.number;
        let seed = results[1];
        let dur = results[2];
        fs.appendFileSync(checkLogFileName, `${new Date().toISOString()}: block = ${block.number}, seed = ${seed}, dur = ${dur}${os.EOL}`, 'utf8');
        /*fs.appendFileSync(blocksLogFileName, `${blockOrd.number} (${blockOrd.hash}) - ${blockVal.number} (${blockVal.hash})\n`, 'utf8');

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
        }*/
    }).catch(e => {
        //reportBad({}, {}, 'Exception: ' + e);
        fs.appendFileSync(checkLogFileName, `${new Date().toISOString()}: exception: ${e}`, 'utf8');
    });
}

(async () => {
    collectRoundLength = await RandomAuRa.methods.collectRoundLength().call();
})();
fs.appendFileSync(checkLogFileName, `${new Date().toISOString()}: collectRoundLength = ${collectRoundLength}${os.EOL}`, 'utf8');
setInterval(doCheck, checkIntervalMS);
