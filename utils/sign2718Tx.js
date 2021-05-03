const secp256k1 = require("secp256k1");
const rlp = require('rlp');
const Web3 = require('web3');
const web3 = new Web3();
const BN = web3.utils.BN;

function prepareTxDataField(data) {
  if (!data) {
    return '';
  } else {
    if (!data.toLowerCase().startsWith('0x')) {
      throw "Data should have 0x prefix";
    }
  }
  return data;
}

function prepareTxIntegerField(value, name) {
  if (value === undefined) {
    throw `${name} is not defined`;
  }
  if (!web3.utils.isHexStrict(value)) {
    value = web3.utils.toHex(value);
  }
  if ((new BN(web3.utils.stripHexPrefix(value), 16)).isZero()) {
    return '';
  }
  return new BN(web3.utils.hexToNumberString(value));
}

function prepareTxToField(to) {
  if (to === undefined) {
    throw "Destination address is not defined";
  }
  to = to.toLowerCase();
  if (web3.utils.isAddress(to)) {
    to = to.startsWith('0x') ? to : `0x${to}`;
  } else {
    throw "Invalid destination address";
  }
  return to;
}

function signTransaction(txMessage, txType, privateKey) {
  const messageHash = web3.utils.keccak256('0x' + (txType > 0 ? `0${txType}` : '') + rlp.encode(txMessage).toString('hex'));

  let privateKeyBuffer;
  if (Buffer.isBuffer(privateKey)) {
    privateKeyBuffer = privateKey;
  } else {
    privateKeyBuffer = Buffer.from(privateKey.toLowerCase().startsWith('0x') ? privateKey.slice(2) : privateKey, "hex");
  }

  const sigObj = secp256k1.ecdsaSign(Buffer.from(messageHash.slice(2), "hex"), privateKeyBuffer);
  const signature = Buffer.from(sigObj.signature).toString('hex');

  const chainId = txType > 0 ? txMessage[0] : txMessage[6];
  let v;
  if (txType > 0) {
    v = (sigObj.recid != 0) ? web3.utils.toHex(sigObj.recid) : '';
  } else {
    v = web3.utils.toHex(sigObj.recid + 27 + chainId * 2 + 8);
  }
  const r = '0x' + signature.slice(0, 64);
  const s = '0x' + signature.slice(64, 128);

  const txMessageSigned = txType > 0 ? txMessage : txMessage.slice(0, 6);
  txMessageSigned.push(v);
  txMessageSigned.push(r);
  txMessageSigned.push(s);

  const rawTransaction = '0x' + (txType > 0 ? `0${txType}` : '') + rlp.encode(txMessageSigned).toString('hex');
  const transactionHash = web3.utils.keccak256(rawTransaction);

  return { messageHash, v, r, s, rawTransaction, transactionHash };
}

module.exports = function (transaction, privateKey, txType) {
  const chainId = prepareTxIntegerField(transaction.chainId, 'Chain id');
  const nonce = prepareTxIntegerField(transaction.nonce, 'Nonce');
  const gas = prepareTxIntegerField(transaction.gas, 'Gas limit');
  const to = prepareTxToField(transaction.to);
  const value = prepareTxIntegerField(transaction.value, 'Value');
  const data = prepareTxDataField(transaction.data);

  let txMessage = [chainId, nonce];

  if (txType == 2) { // EIP-1559
    txMessage.push(prepareTxIntegerField(transaction.maxPriorityFeePerGas, 'maxPriorityFeePerGas'));
    txMessage.push(prepareTxIntegerField(transaction.maxFeePerGas, 'maxFeePerGas'));
  } else if (txType == 1) { // EIP-2930
    txMessage.push(prepareTxIntegerField(transaction.gasPrice, 'Gas price'));
  } else {
    throw "Unsupported transaction type";
  }

  txMessage = txMessage.concat([
    gas,
    to,
    value,
    data,
    transaction.accessList
  ]);

  return signTransaction(txMessage, txType, privateKey);
}
