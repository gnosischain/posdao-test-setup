const constants = require('./constants');

module.exports = function (contractName, web3) {
    var abi;
    var info;
    switch (contractName) {
        case 'RandomAuRa':
            abi = require('../posdao-contracts/build/contracts/RandomAuRa').abi;
            return {
                address: constants.RANDOM_AURA_ADDRESS,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.RANDOM_AURA_ADDRESS),
            };
        case 'BlockRewardAuRa':
            abi = require('../posdao-contracts/build/contracts/BlockRewardAuRa').abi;
            return {
                address: constants.BLOCK_REWARD_ADDRESS,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.BLOCK_REWARD_ADDRESS),
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
