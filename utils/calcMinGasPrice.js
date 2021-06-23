const getLatestBlock = require('./getLatestBlock');

module.exports = async function (web3) {
  const config = require('../config/node1.nethermind.json');
  const minGasPrice = new web3.utils.BN(config.Mining.MinGasPrice);
  let gasPrice = minGasPrice;
  const latestBlock = await getLatestBlock(web3);
  if (latestBlock.baseFeePerGas) {
    // For EIP-1559 and legacy tx the gasPrice should satisfy the requirement:
    // require(legacyGasPrice - latestBlock.baseFeePerGas >= MinGasPrice)
    const baseFeePerGas = new web3.utils.BN(web3.utils.hexToNumberString(latestBlock.baseFeePerGas));
    gasPrice = minGasPrice.add(baseFeePerGas);
  }
  return gasPrice;
}
