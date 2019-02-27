'use strict';

const RETRY_INTERVAL_MS = 2499;

module.exports = async function (web3, sendTx) {
    let ValidatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3);
    // `6` is to account for possible period of validator set change
    let maxRetriesBlocks = 6 + parseInt(await ValidatorSetContract.instance.methods.stakeWithdrawDisallowPeriod().call());

    let startBlock = parseInt( (await web3.eth.getBlock('latest')).number );
    let currentBlock = startBlock;
    let exc;

    while (currentBlock <= startBlock + maxRetriesBlocks) {
        currentBlock = parseInt( (await web3.eth.getBlock('latest')).number );
        if ( !(await ValidatorSetContract.instance.methods.areStakeAndWithdrawAllowed().call()) ) {
            await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
            continue;
        }

        try {
            let tx = await sendTx();
            return tx;
        }
        catch (e) {
            exc = e;
            await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
        }
    }
    throw new Error(`Tx didn't succeed after ${maxRetriesBlocks} blocks or areStakeAndWithdrawAllowed() didn't returned "true". Last exception: ${exc}`);
}
