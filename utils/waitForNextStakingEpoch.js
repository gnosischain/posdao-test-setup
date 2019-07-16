const getContract = require('./getContract');

const RETRY_INTERVAL_MS = 2499;

module.exports = async (web3) => {
    let StakingAuRa = getContract('StakingAuRa', web3);
    let latestBlock = await StakingAuRa.instance.methods.stakingEpochEndBlock().call();
    console.log('**** Waiting for next staking epoch to start (after block ' + latestBlock + ')')
    while (
        parseInt(
            await web3.eth.getBlockNumber()
        ) <= latestBlock
    ) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
    }
}
