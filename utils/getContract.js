const constants = require('./constants');

module.exports = function (contractName, web3) {
    var abi;
    var info;
    switch (contractName) {
        case 'BlockRewardAuRa':
            abi = require('../posdao-contracts/build/contracts/BlockRewardAuRa').abi;
            return {
                address: constants.BLOCK_REWARD_CONTRACT,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.BLOCK_REWARD_CONTRACT),
            };

        case 'ValidatorSetAuRa':
            abi = require('../posdao-contracts/build/contracts/ValidatorSetAuRa').abi;
            return {
                address: constants.VALIDATOR_SET_ADDRESS,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.VALIDATOR_SET_ADDRESS),
            };

        case 'StakingAuRa':
            abi = require('../posdao-contracts/build/contracts/StakingAuRa').abi;
            return {
                address: constants.STAKING_CONTRACT_ADDRESS,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.STAKING_CONTRACT_ADDRESS),
            };

        case 'StakingToken':
            info = require('../parity-data/StakingToken');
            return {
                address: info.address,
                abi: info.abi,
                instance: new web3.eth.Contract(info.abi, info.address),
            };
        default:
            throw new Error('Unknown contract ' + contractName);
    }
}
