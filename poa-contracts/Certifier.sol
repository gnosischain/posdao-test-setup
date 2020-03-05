pragma solidity 0.5.10;


contract Certifier {

    mapping(address => bool) public certified;

    event Confirmed(address indexed who);

    constructor(address[] memory _certifiedAddresses) public {
        for (uint256 i = 0; i < _certifiedAddresses.length; i++) {
            _certify(_certifiedAddresses[i]);
        }
    }

    function _certify(address _who) internal {
        require(_who != address(0));
        certified[_who] = true;
        emit Confirmed(_who);
    }
}
