const Hello = artifacts.require("Hello");

contract('Hello', _accounts => {
  it('should convey the hello world message', async () => {
    var instance = await Hello.deployed()
    var message = await instance.message.call()
    assert.equal(message, "Hello world!")
  })
})
