pragma solidity 0.5.10;


contract BlockReward {

    uint256 public lastBlockProcessed;
    uint256 public mintedTotally;
    mapping(address => uint256) public mintedTotallyByBridge;

    constructor() public {
        mintedTotally = 100000 ether;
        mintedTotallyByBridge[0x7301CFA0e1756B71869E93d4e4Dca5c7d0eb0AA6] = mintedTotally;
    }

    modifier onlySystem {
        require(msg.sender == 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE);
        _;
    }

    function reward(address[] calldata benefactors, uint16[] calldata kind)
        external
        onlySystem
        returns(address[] memory, uint256[] memory)
    {
        if (benefactors.length != kind.length || benefactors.length != 1 || kind[0] != 0) {
            return (new address[](0), new uint256[](0));
        }

        lastBlockProcessed = block.number;

        return (new address[](0), new uint256[](0));
    }
    
}
