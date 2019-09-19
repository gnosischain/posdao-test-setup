'use strict';
const EthereumTx = require('ethereumjs-tx');
const fs = require('fs');
const path = require('path');
/*
 * Expects the following structure for tx_details:
  {
    from:      "0x...",
    to:        "0x...",
    value:     1234, // defaults to 0
    gasPrice:  4321, // defaults to 1 gwei
    gasLimit:  1234, // runs estimateGas if empty
    method:    myContract.myMethod(param1, param2, ...) // optional
    nonce:     1324, // auto-calculated if empty
  }
 * If privateKey is empty, it is recovered from json file in /accounts/keystore folder
 * Returns sendSignedTransaction promise.
*/

const DEBUG=false;
const dbg = DEBUG? function dbg(...msg) { console.log(...msg) } : function () {};

const keysDir = path.join(__dirname, '../accounts/');
const keysPassword = fs.readFileSync(
  path.join(__dirname, '../config/password'),
  'utf-8'
).trim();

function getPrivateKey(web3, address) {
  var fname = path.join(keysDir, './keystore/', address.substring(2).toLowerCase() + '.json');
  var keystore = require(fname);
  var privateKey = web3.eth.accounts.decrypt(keystore, keysPassword).privateKey;
  var pkBuff =  Buffer.from(privateKey.substring(2), "hex");
  return pkBuff;
}

module.exports = async function (web3, tx_details, privateKey) {
  let from = tx_details.from;
  let to = tx_details.to;
  let value = web3.utils.toHex(tx_details.value || 0);
  dbg('  **** from =', from);
  dbg('  **** to =', to);
  dbg('  **** value =', value);

  let gasPrice = web3.utils.toWei('1', 'gwei');
  if (tx_details.gasPrice != null) {
    gasPrice = tx_details.gasPrice;
  }
  dbg('  **** gasPrice =', gasPrice);

  // defaults for plain eth-transfer transaction
  let data = '0x';
  let egas = '21000';
  if (tx_details.method != null) {
    data = tx_details.method.encodeABI();
  }
  if (tx_details.gasLimit == null && tx_details.method != null) {
    egas = await tx_details.method.estimateGas({ from, gasPrice });
  }
  else {
    egas = tx_details.gasLimit;
  }
  dbg('  **** data =', data);
  dbg('  **** egas =', egas);

  let nonce;
  if (tx_details.nonce == null) {
    nonce = await web3.eth.getTransactionCount(from);
  }
  else {
    nonce = tx_details.nonce;
  }
  dbg('  **** nonce =', nonce);

  let chainId = await web3.eth.net.getId();
  dbg('  **** chainId =', chainId);

  if (privateKey == null) {
    privateKey = getPrivateKey(web3, from);
  }

  let _tx = {
    from:      from,
    to:        to,
    value:     web3.utils.toHex(value),
    gasPrice:  web3.utils.toHex(gasPrice),
    data:      data,
    gasLimit:  web3.utils.toHex(egas),
    nonce:     web3.utils.toHex(nonce),
    chainId:   chainId,
  };
  dbg('  **** _tx =', _tx);
  let tx = new EthereumTx(_tx);
  dbg('  **** tx =', tx);
  tx.sign(privateKey);
  let serializedTx = tx.serialize();

  return web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
}
