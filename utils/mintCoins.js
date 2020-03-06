const constants = require('./constants');
const SnS = require('./signAndSendTx.js');
const OWNER = constants.OWNER;

module.exports = async function (web3, fromWhom, toWhom, howMuch, blockRewardAuRa) {
    if (!fromWhom) {
        fromWhom = OWNER;
    }
    if (typeof toWhom === 'string') {
        toWhom = [toWhom];
    }

    let mintersAllowed = await blockRewardAuRa.methods.ercToNativeBridgesAllowed().call();
    mintersAllowed.push(fromWhom);

    // first - set allowed sender, this is always done from OWNER
    await SnS(web3, {
        from: OWNER,
        to: blockRewardAuRa.options.address,
        method: blockRewardAuRa.methods.setErcToNativeBridgesAllowed(mintersAllowed),
        gasPrice: '0',
    });

    // send txs taking care about nonces
    let txsp = [];
    let nonce = await web3.eth.getTransactionCount(fromWhom);
    for (let i = 0; i < toWhom.length; i++) {
        const tx = SnS(web3, {
            from: fromWhom,
            to: blockRewardAuRa.options.address,
            method: blockRewardAuRa.methods.addExtraReceiver(howMuch, toWhom[i]),
            gasPrice: '0',
            nonce: nonce,
        });
        txsp.push(tx);
        nonce++;
    }
    // return all tx promises
    return Promise.all(txsp);
}
