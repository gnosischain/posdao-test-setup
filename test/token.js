const Token = artifacts.require('ERC677BridgeTokenRewardableMock')

contract('TestToken', _accounts => {
  it('should have 0 initial supply', async () => {
    var instance = await Token.deployed()
    var supply = await instance.totalSupply.call()
    assert.equal(supply.valueOf(), 0, "the initial supply isn't 0")
  })
})
