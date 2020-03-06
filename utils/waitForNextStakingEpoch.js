const RETRY_INTERVAL_MS = 2499;

module.exports = async (web3, stakingAuRa) => {
    let latestBlock = await stakingAuRa.methods.stakingEpochEndBlock().call();
    console.log('**** Waiting for next staking epoch to start (after block ' + latestBlock + ')')
    while (
        parseInt(
            await web3.eth.getBlockNumber()
        ) <= latestBlock
    ) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
    }
}
