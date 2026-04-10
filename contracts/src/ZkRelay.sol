// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external view returns (bool);
}

/// @title ZkRelay v2 — ZK-proven message relay for String protocol
/// @notice Verifies Groth16 proofs and stores encrypted messages on-chain
/// @dev Backend passes sender's actual Ethereum address (ZK proof guarantees message integrity)
contract ZkRelay {
    IGroth16Verifier public immutable verifier;

    struct Message {
        bytes32 commitment;
        address sender;
        bytes encryptedMessage;
        uint256 timestamp;
    }

    Message[] internal _messages;
    mapping(bytes32 => uint256[]) internal _commitmentToMessages;

    event MessageVerified(
        bytes32 indexed commitment,
        address indexed sender,
        bytes encryptedMessage,
        uint256 timestamp
    );

    error InvalidProof();
    error ZeroAddress();
    error MessageNotFound(uint256 messageId);

    constructor(address _verifier) {
        if (_verifier == address(0)) revert ZeroAddress();
        verifier = IGroth16Verifier(_verifier);
    }

    /// @notice Relay a ZK-proven encrypted message
    /// @param _pA Groth16 proof component A
    /// @param _pB Groth16 proof component B
    /// @param _pC Groth16 proof component C
    /// @param _pubSignals Public signals [commitment, senderSecretHash]
    /// @param encryptedMessage ECIES-encrypted message blob
    /// @param sender Actual Ethereum address of the sender (passed by backend)
    /// @return messageId Index of the stored message
    function relayMessage(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals,
        bytes calldata encryptedMessage,
        address sender
    ) external returns (uint256 messageId) {
        if (sender == address(0)) revert ZeroAddress();
        if (!verifier.verifyProof(_pA, _pB, _pC, _pubSignals)) revert InvalidProof();

        bytes32 commitment = bytes32(_pubSignals[0]);

        messageId = _messages.length;
        _messages.push(Message({
            commitment: commitment,
            sender: sender,
            encryptedMessage: encryptedMessage,
            timestamp: block.timestamp
        }));

        _commitmentToMessages[commitment].push(messageId);

        emit MessageVerified(commitment, sender, encryptedMessage, block.timestamp);
    }

    function getMessageCount() external view returns (uint256) {
        return _messages.length;
    }

    function getMessage(uint256 messageId) external view returns (Message memory) {
        if (messageId >= _messages.length) revert MessageNotFound(messageId);
        return _messages[messageId];
    }

    function getMessagesByCommitment(bytes32 commitment) external view returns (uint256[] memory) {
        return _commitmentToMessages[commitment];
    }
}
