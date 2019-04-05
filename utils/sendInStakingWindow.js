'use strict';

const RETRY_INTERVAL_MS = 2499;

async function getCurrentBlockNumber(web3) {
    return parseInt((await web3.eth.getBlock('latest')).number);
}

module.exports = async function (web3, sendTx) {
    let StakingAuRa = require('../utils/getContract')('StakingAuRa', web3);
    // `8` is to account for possible period of snapshotting
    let stakeWithdrawDisallowPeriod = parseInt(await StakingAuRa.instance.methods.stakeWithdrawDisallowPeriod().call());
    let maxRetriesBlocks = 8 + stakeWithdrawDisallowPeriod;

    let startBlock = await getCurrentBlockNumber(web3);
    let currentBlock = startBlock;
    let exc;

    while (currentBlock <= startBlock + maxRetriesBlocks) {
        currentBlock = await getCurrentBlockNumber(web3);
        if ( !(await StakingAuRa.instance.methods.areStakeAndWithdrawAllowed().call()) ) {
            console.log(`***** stake/withdraw not allowed now (block ${currentBlock})`);
            await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
            continue;
        }
        try {
            let tx = await sendTx();
            return tx;
        }
        catch (e) {
            exc = e;
            let blocksPassed = (await getCurrentBlockNumber(web3)) - currentBlock;
            if (blocksPassed <= stakeWithdrawDisallowPeriod && !!(await StakingAuRa.instance.methods.areStakeAndWithdrawAllowed().call())) {
                throw new Error(`Tx failed yet it seems to be in the staking window, exception: ${exc}`);
            }
            else {
                console.log(`***** Tx execution failed, waiting for stake/withdraw window`);
                await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
            }
        }
    }
    throw new Error(`Tx didn't succeed after ${maxRetriesBlocks} blocks or areStakeAndWithdrawAllowed() didn't returned "true". Last exception: ${exc}`);
}
