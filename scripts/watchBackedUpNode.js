var assert = require("assert");
var fs = require("fs");
var { promisify } = require("util");
var readFile = promisify(fs.readFile);
var ethers = require("ethers");

const SIGNER_ADDRESS = "0x522df396ae70a058bd69778408630fdb023389b2";
const PORT = "8546";

var Web3 = require("web3");
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:" + PORT));
var provider = new ethers.providers.JsonRpcProvider("http://localhost:" + PORT);

const RETRY_TIMEOUT_SECONDS = 2;
const SCAN_INTERVAL_SECONDS = 5;
const MAX_VALIDATOR_SET_SIZE = 21;

// `true` if the primary is required to sign and `false` if the secondary does.
var primaryHasToSign = true;

async function scanBlocks() {
    var lastBlockNum = web3.eth.getBlock("latest").number;
    if (startBlockNum < MAX_VALIDATOR_SET_SIZE) {
        return true;
    }
    var startBlockNum = lastBlockNum - MAX_VALIDATOR_SET_SIZE;

    console.log(`Scanning blocks from ${startBlockNum} to ${lastBlockNum}.`);

    for (var i = startBlockNum;  i <= lastBlockNum; i++) {
        let block = await web3.eth.getBlock(i);
        if (block.author === SIGNER_ADDRESS) {
            return true;
        }
    }
    return false;
}

async function startSecondarySigning() {
    console.log("Reserve node at port " + PORT + " starts signing");

    let password = await readFile(__dirname + "/../config/password", "UTF-8");
    assert(typeof password === "string");
    await provider.send(
        "parity_setEngineSigner",
        [ SIGNER_ADDRESS, password.trim() ]
    );
}

async function stopSecondarySigning() {
    console.log("Reserve node at port " + PORT + " stops signing");

    await provider.send(
        "parity_setEngineSigner",
        [ "0x0000000000000000000000000000000000000000", "" ]
    );
}

function startScan() {
    web3.eth.net.isListening()
        .then(async () => {
            let signed = await scanBlocks();
            if (!signed) {
                console.log(`Failed to find a block authored by ${SIGNER_ADDRESS}`);
                if (primaryHasToSign) {
                    await startSecondarySigning();
                    primaryHasToSign = false;
                } else {
                    await stopSecondarySigning();
                    primaryHasToSign = true;
                }
            }
            setTimeout(startScan, SCAN_INTERVAL_SECONDS * 1000);
        })
        .catch(e => {
            console.log(`Not connected to the node; retry in ${RETRY_TIMEOUT_SECONDS} seconds`);
            setTimeout(startScan, RETRY_TIMEOUT_SECONDS * 1000);
        });
}

startScan();
