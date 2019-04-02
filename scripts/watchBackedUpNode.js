// Validator node failover script
//
// The script should be run on the secondary (failover) node that backs up a
// primary node. The secondary node has signing disabled by default. It starts
// signing blocks when the primary node is a validator but has not produced a
// block when it was its turn and this script cannot connect to it by HTTP. The
// secondary node stops sigining blocks as soon as the HTTP connection to the
// primary node re-establishes.

var assert = require("assert");
var fs = require("fs");
var { promisify } = require("util");
var path = require("path");
var readFile = promisify(fs.readFile);
var ethers = require("ethers");

const PORT1 = "8543";
const PORT2 = "8546";
const RETRY_TIMEOUT_SECONDS = 2;
const SCAN_INTERVAL_SECONDS = 5;
const PASSWORD_PATH = "/../config/password"
const SIGNER_ADDRESS = "0x522df396ae70a058bd69778408630fdb023389b2";

var Web3 = require("web3");
var web3_1 = new Web3(new Web3.providers.HttpProvider(`http://localhost:${PORT1}`));
var web3_2 = new Web3(new Web3.providers.HttpProvider(`http://localhost:${PORT2}`));
var provider = new ethers.providers.JsonRpcProvider(`http://localhost:${PORT2}`);
// `true` if the primary is required to sign and `false` if the secondary does.
var primaryHasToSign = true;
var validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3_2).instance;

async function scanBlocks(depth) {
    assert(typeof depth === "number");
    var lastBlock = await web3_2.eth.getBlock("latest");
    var lastBlockNum = lastBlock.number;
    assert(typeof lastBlockNum === "number");
    if (lastBlockNum < depth) {
        return true;
    }
    var startBlockNum = lastBlockNum - depth;

    console.log(`Scanning blocks from ${startBlockNum} to ${lastBlockNum}`);

    for (var i = startBlockNum;  i <= lastBlockNum; i++) {
        let block = await web3_2.eth.getBlock(i);
        if (block.author === SIGNER_ADDRESS) {
            return true;
        }
    }
    return false;
}

// Starts signing at the secondary node by setting the secondary signer address.
async function startSecondarySigning() {
    console.log(`Reserve node at port ${PORT2} starts signing`);

    let password = await readFile(path.join(__dirname, PASSWORD_PATH), "UTF-8");
    assert(typeof password === "string");
    await provider.send(
        "parity_setEngineSigner",
        [ SIGNER_ADDRESS, password.trim() ]
    );
}

// Stops signing at the secondary node by setting the dummy signer address.
async function stopSecondarySigning() {
    console.log(`Reserve node at port ${PORT2} stops signing`);
    await provider.send("parity_clearEngineSigner", []);
}

async function startScan() {
    var secondaryListening = false;
    try {
        secondaryListening = await web3_2.eth.net.isListening();
    } catch(e) {
        console.log("Disconnected from secondary");
    }
    assert(typeof secondaryListening === "boolean");
    if (secondaryListening) {
        let validators = await validatorSetContract.methods.getValidators().call();
        validators = validators.map(v => v.toLowerCase());
        // Perform failover checks only if the primary is currently a validator.
        if (validators.indexOf(SIGNER_ADDRESS.toLowerCase()) != -1) {
            var primaryListening = false;
            try {
                primaryListening = await web3_1.eth.net.isListening();
            } catch(e) {
                console.log("Disconnected from primary");
            }
            assert(typeof primaryListening === "boolean");
            if (!primaryListening) {
                // Ensure that we (the secondary mode) are still connected to the
                // network by checking that other validators continued to sign
                // blocks.
                let signed = await scanBlocks(validators.length);
                if (!signed) {
                    console.log(`Failed to find a block authored by ${SIGNER_ADDRESS}`);
                    if (primaryHasToSign) {
                        primaryHasToSign = false;
                        await startSecondarySigning();
                    }
                }
            } else {
                if (!primaryHasToSign) {
                    console.log("Primary has come back up; moving the secondary to reserve");
                    primaryHasToSign = true;
                    await stopSecondarySigning();
                }
            }
        }
        setTimeout(startScan, SCAN_INTERVAL_SECONDS * 1000);
    } else {
        console.log(`Disconnected from secondary; retry in ${RETRY_TIMEOUT_SECONDS}s`);
        setTimeout(startScan, RETRY_TIMEOUT_SECONDS * 1000);
    }
}

try {
    startScan();
} catch(e) {
    console.log("startScan: " + e);
}
