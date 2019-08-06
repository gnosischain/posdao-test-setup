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
let collectRoundLengthBN;

let seedState = (function () {
    let currentPhase = '';
    let lastValueBN = null;
    let lastChangeStart = 0;
    return {
        update: function (blockN, currentSeedBN, validatorsLength) {
            if (!currentPhase) {
                // not initialized yet
                if (currentSeedBN.isZero()) {
                    return { err: false };
                }
                else {
                    currentPhase = 'changing';
                    lastChangeStart = blockN;
                    lastValueBN = currentSeedBN;
                    return { err: false };
                }
            }

            if (currentPhase == 'changing') {
                if (blockN - lastChangeStart < validatorsLength) {
                    // here should change
                    return { err: false };
                }
                else if (blockN - lastChangeStart == validatorsLength) {
                    // here should change
                    currentPhase = 'fixed';
                    lastValueBN = currentSeedBN;
                    return { err: false };
                }
                else {
                    // zombie apocalypse
                    lastValueBN = currentSeedBN;
                    return { err: true, reason: `we skipped a block during "${currentPhase}" phase` };
                }
            }

            if (currentPhase == 'fixed') {
                // blockN < lastChangeStart + collectRoundLengthBN
                if (collectRoundLengthBN.gt(blockN - lastChangeStart)) {
                    if (currentSeedBN.eq(lastValueBN)) {
                        lastValueBN = currentSeedBN;
                        return { err: false };
                    }
                    else {
                        lastValueBN = currentSeedBN;
                        return {
                            err: true,
                            reason: `seed value changed before collection round ended: ` +
                                    `expected to change at block ${collectRoundLengthBN.add(lastChangeStart)}. ` +
                                    `current seed value = ${currentSeedBN}, previous value = ${lastValueBN} `,
                        };
                    }
                }
                else if (collectRoundLengthBN.eq(blockN - lastChangeStart)) {
                    currentPhase = 'changing';
                    lastChangeStart = blockN;
                    if (currentSeedBN.eq(lastValueBN)) {
                        lastValueBN = currentSeedBN;
                        return {
                            err: true,
                            reason: `seed value didn't changed when new collection round started: ` +
                                    `current seed value = ${currentSeedBN}, previous value = ${lastValueBN} `,
                        };
                    }
                    else {
                        lastValueBN = currentSeedBN;
                        return {
                            err: false,
                        };
                    }
                }
                else {
                    // zombie apocalypse
                    lastValueBN = currentSeedBN;
                    return { err: true, reason: `we skipped a block during "${currentPhase}" phase` };
                }
            }
        }
    }
})();





function getCurrentBlock() {
    return web3.eth.getBlock('latest', false);
}

function getCurrentSeed() {
    return RandomAuRa.methods.getCurrentSeed().call();
}

// utility functions:
function appendLine(str) {
    fs.appendFileSync(checkLogFileName, `${new Date().toISOString()} ${str}${os.EOL}`, 'utf8');
}

async function wait(ms) {
    await new Promise(r => setTimeout(r, ms));
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
        getCurrentBlock(),
        getCurrentSeed(),
        RandomAuRa.methods.collectRoundLength().call(),
    ]).then(results => {
        let block = results[0];
        if (block.number == prevBlock) return;
        prevBlock = block.number;
        let seed = results[1];
        let dur = results[2];
        appendLine(`${new Date().toISOString()}: block = ${block.number}, seed = ${seed}, dur = ${dur}`);
    }).catch(e => {
        appendLine(`${new Date().toISOString()}: exception: ${e}`);
    });
}


async function main() {
    // initially wait until collectRoundLength becomes defined
    while (true) {
        let _collectRoundLengthBN = await RandomAuRa.methods.collectRoundLength().call();
        if (_collectRoundLengthBN) {
            collectRoundLengthBN = _collectRoundLengthBN;
            let currentBlock = (await getCurrentBlock()).number;
            appendLine(`[${currentBlock}]: got collectRoundLengthBN = ${collectRoundLengthBN}`);
            break;
        }
        else {
            await wait(checkIntervalMS);
        }
    }

    // wait for first non-zero seed
    while (true) {
        let _currentSeedBN = await getCurrentSeed();
        if (!_currentSeedBN.isZero()) {
            lastSeedChangeStartBlock = (await getCurrentBlock()).number;;
            seedState = 'updating';
            appendLine(`[${lastSeedChangeStartBlock}]: got first non-zero seed = ${_currentSeedBN}`);
            break;
        }
        else {
            await wait(checkIntervalMS);
        }
    }

    setInterval(doCheck, checkIntervalMS);
}

main();
