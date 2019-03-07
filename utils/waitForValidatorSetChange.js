const getContract = require('./getContract');

const RETRY_INTERVAL_MS = 2499;

module.exports = async (web3) => {
    let ValidatorSetAuRaContract = getContract('ValidatorSetAuRa', web3).instance;
    let StakingAuRaContract = getContract('StakingAuRa', web3).instance;

    let initialStakingEpoch = parseInt(await StakingAuRaContract.methods.stakingEpoch().call());
    let epochChangeBlock;

    // wait for the next staking epoch
    while (true) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
        let currentStakingEpoch = parseInt(await StakingAuRaContract.methods.stakingEpoch().call());
        let currentBlock = parseInt((await web3.eth.getBlock('latest')).number);
        if (currentStakingEpoch > initialStakingEpoch) {
            console.log(`***** Staking epoch changed at block ${currentBlock} (new epoch ${currentStakingEpoch})`);
            epochChangeBlock = currentBlock;
            break;
        }
    }

    // wait a few more blocks to finalize the change
    while (true) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
        let currentBlock = parseInt((await web3.eth.getBlock('latest')).number);
        if (currentBlock - epochChangeBlock >= 6) {
            break;
        }
    }
}
