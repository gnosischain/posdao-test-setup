// Nethermind sometimes returns null for eth_getBlockByNumber.
// This is a workaround to do a few tries.
module.exports = async function (web3) {
  let tries = 0;
  let latestBlock = await web3.eth.getBlock('latest');
  while (!latestBlock && tries < 3) {
    await new Promise(r => setTimeout(r, 500));
    latestBlock = await web3.eth.getBlock('latest');
    tries++;
  }
  return latestBlock;
}
