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
  if (web3.utils.isHexStrict(value)) {
    return new BN(web3.utils.hexToNumberString(value));
  }
  return new BN(value);
}

function prepareTxNonceField(nonce) {
  if (nonce === undefined) {
    throw "Nonce is not defined";
  }
  if (!web3.utils.isHexStrict(nonce)) {
    nonce = web3.utils.toHex(nonce);
  }
  if ((new BN(web3.utils.stripHexPrefix(nonce), 16)).isZero()) {
    nonce = '';
  }
  return nonce;
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

function signTransaction(txMessage, isEIP1559, privateKey) {
  const messageHash = web3.utils.keccak256('0x' + rlp.encode(txMessage).toString('hex'));

  let privateKeyBuffer;
  if (Buffer.isBuffer(privateKey)) {
    privateKeyBuffer = privateKey;
  } else {
    privateKeyBuffer = Buffer.from(privateKey.toLowerCase().startsWith('0x') ? privateKey.slice(2) : privateKey, "hex");
  }

  const sigObj = secp256k1.ecdsaSign(Buffer.from(messageHash.slice(2), "hex"), privateKeyBuffer);
  const signature = Buffer.from(sigObj.signature).toString('hex');

  const chainId = isEIP1559 ? txMessage[0] : txMessage[6];
  const v = web3.utils.toHex(sigObj.recid + (isEIP1559 ? 0 : 27 + chainId * 2 + 8));
  const r = '0x' + signature.slice(0, 64);
  const s = '0x' + signature.slice(64, 128);

  const txMessageSigned = isEIP1559 ? txMessage : txMessage.slice(0, 6);
  txMessageSigned.push(v);
  txMessageSigned.push(r);
  txMessageSigned.push(s);

  const rawTransaction = '0x' + (isEIP1559 ? '02' : '') + rlp.encode(txMessageSigned).toString('hex');
  const transactionHash = web3.utils.keccak256(rawTransaction);
  const rawTransactionRLP = isEIP1559 ? '0x' + rlp.encode(rawTransaction).toString('hex') : rawTransaction;

  return { messageHash, v, r, s, rawTransaction: rawTransactionRLP, transactionHash };
}

module.exports = function (transaction, privateKey) {
  const chainId = prepareTxIntegerField(transaction.chainId, 'Chain id');
  const nonce = prepareTxNonceField(transaction.nonce);
  const maxPriorityFeePerGas = prepareTxIntegerField(transaction.maxPriorityFeePerGas, 'maxPriorityFeePerGas');
  const maxFeePerGas = prepareTxIntegerField(transaction.maxFeePerGas, 'maxFeePerGas');
  const gas = prepareTxIntegerField(transaction.gas, 'Gas limit');
  const to = prepareTxToField(transaction.to);
  const value = prepareTxIntegerField(transaction.value, 'Value');
  const data = prepareTxDataField(transaction.data);

  const txMessage = [
    chainId,
    nonce,
    maxPriorityFeePerGas,
    maxFeePerGas,
    gas,
    to,
    value,
    data,
    transaction.accessList
  ];

  return signTransaction(txMessage, true, privateKey);
}
