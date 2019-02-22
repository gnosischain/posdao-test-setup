const constants = require('./constants');

module.exports = function (contractName, web3) {
    switch (contractName) {
        case 'ValidatorSetAuRa':
            const abi = require('../posdao-contracts/build/contracts/ValidatorSetAuRa').abi;
            return {
                address: constants.VALIDATOR_SET_ADDRESS,
                abi: abi,
                instance: new web3.eth.Contract(abi, constants.VALIDATOR_SET_ADDRESS),
            };

        case 'StakingToken':
            const info = require('../parity-data/StakingToken');
            return {
                address: info.address,
                abi: info.abi,
                instance: new web3.eth.Contract(info.abi, info.address),
            };

        default:
            throw new Error('Unknown contract ' + contractName);
    }
}
