// Validator node failover script
//
// The script should be run on the secondary (failover) node that backs up a primary node. The
// secondary node has signing disabled by default. It starts signing blocks when the primary node is
// a validator but has not produced a block when it was its turn and this script cannot connect to
// it by HTTP. The secondary node stops sigining blocks as soon as the HTTP connection to the
// primary node re-establishes.

const assert = require("assert");
const fs = require("fs");
const findSignedBlock = require('../utils/findSignedBlock.js');
const got = require("got");
const { promisify } = require("util");
const path = require("path");
const readFile = promisify(fs.readFile);
const ethers = require("ethers");

const URL1 = "http://localhost:15116";  // remote address of the primary (replace in production)
const URL2 = "http://localhost:8544";   // local address of the secondary
const RETRY_TIMEOUT_SECONDS = 2;
const SCAN_INTERVAL_SECONDS = 5;
const PASSWORD_PATH = "/../config/password"
const SIGNER_ADDRESS = "0xbbcaa8d48289bb1ffcf9808d9aa4b1d215054c78";

var Web3 = require("web3");
var web3 = new Web3(new Web3.providers.HttpProvider(URL2));
var provider = new ethers.providers.JsonRpcProvider(URL2);
// `true` if the primary is required to sign and `false` if the secondary does.
var primaryHasToSign = true;
var validatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3).instance;

// Starts signing at the secondary node by setting the secondary signer address.
async function startSecondarySigning() {
    console.log(`Reserve node starts signing`);

    let password = await readFile(path.join(__dirname, PASSWORD_PATH), "UTF-8");
    assert(typeof password === "string");
    await provider.send(
        "parity_setEngineSigner",
        [ SIGNER_ADDRESS, password.trim() ]
    );
}

// Stops signing at the secondary node by setting the dummy signer address.
async function stopSecondarySigning() {
    console.log(`Reserve node stops signing`);
    await provider.send("parity_clearEngineSigner", []);
}

async function startScan() {
    var secondaryListening = false;
    try {
        secondaryListening = await web3.eth.net.isListening();
    } catch(e) {
        console.log("Disconnected from secondary");
    }
    assert(typeof secondaryListening === "boolean");
    if (secondaryListening) {
        let validators = await validatorSetContract.methods.getValidators().call();
        validators = validators.map(v => v.toLowerCase());
        // Perform failover checks only if the primary is currently a validator.
        if (validators.indexOf(SIGNER_ADDRESS.toLowerCase()) != -1) {
            var primarySigning = false;
            var connected = true;
            try {
                let response = await got(URL1, { json: false });
                if (response.body.trim() === "true") {
                    primarySigning = true;
                }
            } catch(e) {
                console.log("Disconnected from primary");
                // For the start, assume that the primary is still mining even though the secondary
                // cannot check that.
                primarySigning = true;
                connected = false;
            }
            if (!connected) {
                // Ensure that we (the secondary mode) are still connected to the network by
                // checking that other validators continued to sign blocks.
                let signed = await findSignedBlock(web3, SIGNER_ADDRESS, validators.length);
                if (!signed) {
                    // Since there is a gap in signed blocks, it follows that, if the primary is the
                    // current signer (primaryHasToSign == true), that it is has become disconnected
                    // from the rest of the network, while the secondary node (us) is still
                    // connected.
                    console.log(`Failed to find a block authored by ${SIGNER_ADDRESS}`);
                    primarySigning = false;
                }
            }
            if (!primarySigning) {
                if (primaryHasToSign) {
                    console.log("Primary has stopped signing; making the secondary sign");
                    primaryHasToSign = false;
                    await startSecondarySigning();
                }
            } else if (connected) {
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
    console.log("startScan ERROR: " + e);
}
