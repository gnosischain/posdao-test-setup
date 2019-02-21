module.exports = {
	tx: function (tx, prefix) {
		prefix = prefix || '****';
		console.log(prefix, 'tx: status =', tx.status, 'hash =', tx.transactionHash, 'blockNumber =', tx.blockNumber);
	},
}