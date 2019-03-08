const getContract = require('./getContract');

const RETRY_INTERVAL_MS = 2499;

module.exports = async (web3) => {
    let ValidatorSetAuRaContract = getContract('ValidatorSetAuRa', web3).instance;
    let StakingAuRaContract = getContract('StakingAuRa', web3).instance;

    let initialStakingEpoch = parseInt(await StakingAuRaContract.methods.stakingEpoch().call());
    // wait for the next staking epoch
    while (true) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
        let currentStakingEpoch = parseInt(await StakingAuRaContract.methods.stakingEpoch().call());
        let currentBlock = parseInt((await web3.eth.getBlock('latest')).number);
        if (currentStakingEpoch > initialStakingEpoch) {
            console.log(`***** Staking epoch changed at block ${currentBlock} (new epoch: ${currentStakingEpoch})`);
            break;
        }
    }

    // wait until new validator set is applied
    while (
        parseInt(
            await ValidatorSetAuRaContract.methods.validatorSetApplyBlock().call()
        ) === 0
    ) {
        await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
    }
    let currentBlock = parseInt((await web3.eth.getBlock('latest')).number);
    let validatorSet = await ValidatorSetAuRaContract.methods.getValidators().call();
    console.log(`***** ValidatorSet change applied at block ${currentBlock}
        (new validator set: ${JSON.stringify(validatorSet)})`);
    return validatorSet;
}
