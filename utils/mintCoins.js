const constants = require('./constants');
const SnS = require('./signAndSendTx.js');
const OWNER = constants.OWNER;
const getContract = require('./getContract');

module.exports = async function (web3, fromWhom, toWhom, howMuch) {
    const BlockRewardAuRa = getContract('BlockRewardAuRa', web3);
    if (!fromWhom) {
        fromWhom = OWNER;
    }
    if (typeof toWhom === 'string') {
        toWhom = [toWhom];
    }

    // first - set allowed sender, this is always done from OWNER
    await SnS(web3, {
        from: OWNER,
        to: BlockRewardAuRa.address,
        method: BlockRewardAuRa.instance.methods.setErcToNativeBridgesAllowed([fromWhom]),
        gasPrice: '0',
    });

    // send txs taking care about nonces
    let txsp = [];
    let nonce = await web3.eth.getTransactionCount(fromWhom);
    for (let i = 0; i < toWhom.length; i++) {
        const tx = SnS(web3, {
            from: fromWhom,
            to: BlockRewardAuRa.address,
            method: BlockRewardAuRa.instance.methods.addExtraReceiver(howMuch, toWhom[i]),
            gasPrice: '0',
            nonce: nonce,
        });
        txsp.push(tx);
        nonce++;
    }
    // return all tx promises
    return Promise.all(txsp);
}
