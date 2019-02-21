module.exports = async (web3) => {
	let ValidatorSetContract = require('../utils/getContract')('ValidatorSetAuRa', web3);
	while ( !(await ValidatorSetContract.instance.methods.areStakeAndWithdrawAllowed().call()) ) {
		console.log('**** Wait till can stake/withdraw');
		// Sleep for 0.5 s.
		await new Promise(r => setTimeout(r, 500));
	}
}
