'use strict';
const assert = require('assert');

module.exports = async function (web3, signer_address, depth) {
    assert(typeof signer_address === "string");
    assert(typeof depth === "number");
    var lastBlock = await web3.eth.getBlock("latest");
    var lastBlockNum = lastBlock.number;
    assert(typeof lastBlockNum === "number");
    if (lastBlockNum < depth) {
        return true;
    }
    var startBlockNum = lastBlockNum - depth;

    console.log(`Scanning blocks from ${startBlockNum} to ${lastBlockNum}`);

    for (var i = startBlockNum;  i <= lastBlockNum; i++) {
        let block = await web3.eth.getBlock(i);
        if (block.author.toLowerCase() === signer_address.toLowerCase()) {
            return true;
        }
    }
    return false;
}
