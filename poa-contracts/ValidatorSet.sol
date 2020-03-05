pragma solidity 0.5.10;


contract ValidatorSet  {

    address[] internal _currentValidators;

    constructor(address[] memory _validators) public {
        _currentValidators = _validators;
    }

    function getValidators() public view returns(address[] memory) {
        return _currentValidators;
    }

    function finalizeChange() public {
    }

}
