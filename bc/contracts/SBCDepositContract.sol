// SPDX-License-Identifier: CC0-1.0

pragma solidity 0.8.9;

/**
 * @dev Interface of the ERC165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[EIP].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IDepositContract {
    /// @notice A processed deposit event.
    event DepositEvent(bytes pubkey, bytes withdrawal_credentials, bytes amount, bytes signature, bytes index);

    /// @notice Submit a Phase 0 DepositData object.
    /// @param pubkey A BLS12-381 public key.
    /// @param withdrawal_credentials Commitment to a public key for withdrawals.
    /// @param signature A BLS12-381 signature.
    /// @param deposit_data_root The SHA-256 hash of the SSZ-encoded DepositData object.
    /// Used as a protection against malformed input.
    function deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 stake_amount
    ) external;

    /// @notice Query the current deposit root hash.
    /// @return The deposit root hash.
    function get_deposit_root() external view returns (bytes32);

    /// @notice Query the current deposit count.
    /// @return The deposit count encoded as a little endian 64-bit number.
    function get_deposit_count() external view returns (bytes memory);
}

interface IERC677Receiver {
    function onTokenTransfer(
        address from,
        uint256 value,
        bytes calldata data
    ) external returns (bool);
}

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

/**
 * @title EIP1967Admin
 * @dev Upgradeable proxy pattern implementation according to minimalistic EIP1967.
 */
contract EIP1967Admin {
    // EIP 1967
    // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
    uint256 internal constant EIP1967_ADMIN_STORAGE =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    modifier onlyAdmin() {
        require(msg.sender == _admin());
        _;
    }

    function _admin() internal view returns (address res) {
        assembly {
            res := sload(EIP1967_ADMIN_STORAGE)
        }
    }
}


/**
 * @title PausableEIP1967Admin
 * @dev Pausable contract, controlled by the current EIP1967 proxy owner.
 */
contract PausableEIP1967Admin is EIP1967Admin, Pausable {
    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }
}

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}


/**
 * @title Claimable
 * @dev Implementation of the claiming utils that can be useful for withdrawing accidentally sent tokens.
 */
contract Claimable {
    /**
     * @dev Withdraws the erc20 tokens or native coins from this contract.
     * @param _token address of the claimed token or address(0) for native coins.
     * @param _to address of the tokens/coins receiver.
     */
    function _claimValues(address _token, address _to) internal {
        if (_token == address(0)) {
            _claimNativeCoins(_to);
        } else {
            _claimERC20Tokens(_token, _to);
        }
    }

    /**
     * @dev Internal function for withdrawing all native coins from the contract.
     * @param _to address of the coins receiver.
     */
    function _claimNativeCoins(address _to) internal {
        uint256 balance = address(this).balance;
        payable(_to).transfer(balance);
    }

    /**
     * @dev Internal function for withdrawing all tokens of some particular ERC20 contract from this contract.
     * @param _token address of the claimed ERC20 token.
     * @param _to address of the tokens receiver.
     */
    function _claimERC20Tokens(address _token, address _to) internal {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(_to, balance);
    }
}


/**
 * @title SBCDepositContract
 * @dev Implementation of the ERC20 ETH2.0 deposit contract.
 * For the original implementation, see the Phase 0 specification under https://github.com/ethereum/eth2.0-specs
 */
contract SBCDepositContract is IDepositContract, IERC165, IERC677Receiver, PausableEIP1967Admin, Claimable {
    uint256 private constant DEPOSIT_CONTRACT_TREE_DEPTH = 32;
    // NOTE: this also ensures `deposit_count` will fit into 64-bits
    uint256 private constant MAX_DEPOSIT_COUNT = 2**DEPOSIT_CONTRACT_TREE_DEPTH - 1;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private zero_hashes;

    bytes32[DEPOSIT_CONTRACT_TREE_DEPTH] private branch;
    uint256 private deposit_count;

    mapping(bytes => bytes32) public validator_withdrawal_credentials;

    IERC20 public immutable stake_token;

    constructor(address _token) {
        stake_token = IERC20(_token);
    }

    function get_deposit_root() external view override returns (bytes32) {
        bytes32 node;
        uint256 size = deposit_count;
        for (uint256 height = 0; height < DEPOSIT_CONTRACT_TREE_DEPTH; height++) {
            if ((size & 1) == 1) {
                node = sha256(abi.encodePacked(branch[height], node));
            } else {
                node = sha256(abi.encodePacked(node, zero_hashes[height]));
            }
            size /= 2;
        }
        return sha256(abi.encodePacked(node, to_little_endian_64(uint64(deposit_count)), bytes24(0)));
    }

    function get_deposit_count() external view override returns (bytes memory) {
        return to_little_endian_64(uint64(deposit_count));
    }

    function deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 stake_amount
    ) external override whenNotPaused {
        stake_token.transferFrom(msg.sender, address(this), stake_amount);
        _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, stake_amount);
    }

    function batchDeposit(
        bytes calldata pubkeys,
        bytes calldata withdrawal_credentials,
        bytes calldata signatures,
        bytes32[] calldata deposit_data_roots
    ) external whenNotPaused {
        uint256 count = deposit_data_roots.length;
        require(count > 0, "BatchDeposit: You should deposit at least one validator");
        require(count <= 128, "BatchDeposit: You can deposit max 128 validators at a time");

        require(pubkeys.length == count * 48, "BatchDeposit: Pubkey count don't match");
        require(signatures.length == count * 96, "BatchDeposit: Signatures count don't match");
        require(withdrawal_credentials.length == 32, "BatchDeposit: Withdrawal Credentials count don't match");

        uint256 stake_amount = 32 ether;
        stake_token.transferFrom(msg.sender, address(this), stake_amount * count);

        for (uint256 i = 0; i < count; ++i) {
            bytes memory pubkey = bytes(pubkeys[i * 48:(i + 1) * 48]);
            bytes memory signature = bytes(signatures[i * 96:(i + 1) * 96]);

            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_roots[i], stake_amount);
        }
    }

    function onTokenTransfer(
        address,
        uint256 stake_amount,
        bytes calldata data
    ) external override whenNotPaused returns (bool) {
        require(msg.sender == address(stake_token), "DepositContract: not a deposit token");
        require(data.length % 176 == 32, "DepositContract: incorrect deposit data length");
        uint256 count = data.length / 176;
        require(count > 0, "BatchDeposit: You should deposit at least one validator");
        uint256 stake_amount_per_deposit = stake_amount;
        if (count > 1) {
            require(count <= 128, "BatchDeposit: You can deposit max 128 validators at a time");
            require(stake_amount == 32 ether * count, "BatchDeposit: batch deposits require 32 SBC deposit amount");
            stake_amount_per_deposit = 32 ether;
        }

        bytes memory withdrawal_credentials = data[0:32];
        for (uint256 p = 32; p < data.length; p += 176) {
            bytes memory pubkey = data[p:p + 48];
            bytes memory signature = data[p + 48:p + 144];
            bytes32 deposit_data_root = bytes32(data[p + 144:p + 176]);
            _deposit(pubkey, withdrawal_credentials, signature, deposit_data_root, stake_amount_per_deposit);
        }
        return true;
    }

    function _deposit(
        bytes memory pubkey,
        bytes memory withdrawal_credentials,
        bytes memory signature,
        bytes32 deposit_data_root,
        uint256 stake_amount
    ) internal {
        // Extended ABI length checks since dynamic types are used.
        require(pubkey.length == 48, "DepositContract: invalid pubkey length");
        require(withdrawal_credentials.length == 32, "DepositContract: invalid withdrawal_credentials length");
        require(signature.length == 96, "DepositContract: invalid signature length");

        // Check deposit amount
        require(stake_amount >= 1 ether, "DepositContract: deposit value too low");
        require(stake_amount % 1 gwei == 0, "DepositContract: deposit value not multiple of gwei");
        uint256 deposit_amount = stake_amount / 1 gwei;
        require(deposit_amount <= type(uint64).max, "DepositContract: deposit value too high");

        // Don't allow to use different withdrawal credentials for subsequent deposits
        bytes32 saved_wc = validator_withdrawal_credentials[pubkey];
        bytes32 wc;
        assembly {
            wc := mload(add(withdrawal_credentials, 32))
        }
        if (saved_wc == bytes32(0)) {
            validator_withdrawal_credentials[pubkey] = wc;
        } else {
            require(saved_wc == wc, "DepositContract: invalid withdrawal_credentials");
        }

        // Emit `DepositEvent` log
        bytes memory amount = to_little_endian_64(uint64(deposit_amount));
        emit DepositEvent(
            pubkey,
            withdrawal_credentials,
            amount,
            signature,
            to_little_endian_64(uint64(deposit_count))
        );

        // Compute deposit data root (`DepositData` hash tree root)
        bytes32 pubkey_root = sha256(abi.encodePacked(pubkey, bytes16(0)));
        bytes32[3] memory sig_parts = abi.decode(signature, (bytes32[3]));
        bytes32 signature_root = sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(sig_parts[0], sig_parts[1])),
                sha256(abi.encodePacked(sig_parts[2], bytes32(0)))
            )
        );
        bytes32 node = sha256(
            abi.encodePacked(
                sha256(abi.encodePacked(pubkey_root, withdrawal_credentials)),
                sha256(abi.encodePacked(amount, bytes24(0), signature_root))
            )
        );

        // Verify computed and expected deposit data roots match
        require(
            node == deposit_data_root,
            "DepositContract: reconstructed DepositData does not match supplied deposit_data_root"
        );

        // Avoid overflowing the Merkle tree (and prevent edge case in computing `branch`)
        require(deposit_count < MAX_DEPOSIT_COUNT, "DepositContract: merkle tree full");

        // Add deposit data root to Merkle tree (update a single `branch` node)
        deposit_count += 1;
        uint256 size = deposit_count;
        for (uint256 height = 0; height < DEPOSIT_CONTRACT_TREE_DEPTH; height++) {
            if ((size & 1) == 1) {
                branch[height] = node;
                return;
            }
            node = sha256(abi.encodePacked(branch[height], node));
            size /= 2;
        }
        // As the loop should always end prematurely with the `return` statement,
        // this code should be unreachable. We assert `false` just to be safe.
        assert(false);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IDepositContract).interfaceId ||
            interfaceId == type(IERC677Receiver).interfaceId;
    }

    /**
     * @dev Allows to transfer any locked token from this contract.
     * Only admin can call this method.
     * Deposit-related tokens cannot be claimed.
     * @param _token address of the token, if it is not provided (0x00..00), native coins will be transferred.
     * @param _to address that will receive the locked tokens from this contract.
     */
    function claimTokens(address _token, address _to) external onlyAdmin {
        require(address(stake_token) != _token, "DepositContract: not allowed to claim deposit token");
        _claimValues(_token, _to);
    }

    function to_little_endian_64(uint64 value) internal pure returns (bytes memory ret) {
        ret = new bytes(8);
        bytes8 bytesValue = bytes8(value);
        // Byteswapping during copying to bytes.
        ret[0] = bytesValue[7];
        ret[1] = bytesValue[6];
        ret[2] = bytesValue[5];
        ret[3] = bytesValue[4];
        ret[4] = bytesValue[3];
        ret[5] = bytesValue[2];
        ret[6] = bytesValue[1];
        ret[7] = bytesValue[0];
    }
}
