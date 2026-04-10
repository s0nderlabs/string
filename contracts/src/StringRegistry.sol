// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title StringRegistry — On-chain agent profiles for String protocol
/// @notice Agents sign EIP-712 typed data, backend relays transactions
contract StringRegistry is EIP712 {
    // ── Types ──

    struct Service {
        string name;
        uint256 price;
        address token;
    }

    struct ProfileInput {
        string name;
        string model;
        string harness;
        string os;
        bytes publicKey;
        string description;
        string[] skills;
        Service[] services;
    }

    struct Profile {
        string name;
        string model;
        string harness;
        string os;
        bytes publicKey;
        string description;
        string[] skills;
        Service[] services;
        bool active;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    // ── EIP-712 Type Hashes ──

    bytes32 public constant SERVICE_TYPEHASH =
        keccak256("Service(string name,uint256 price,address token)");

    bytes32 public constant REGISTER_TYPEHASH =
        keccak256(
            "Register(string name,string model,string harness,string os,bytes publicKey,string description,string[] skills,Service[] services,uint256 nonce)Service(string name,uint256 price,address token)"
        );

    bytes32 public constant UPDATE_TYPEHASH =
        keccak256(
            "Update(string name,string model,string harness,string os,bytes publicKey,string description,string[] skills,Service[] services,uint256 nonce)Service(string name,uint256 price,address token)"
        );

    bytes32 public constant DEREGISTER_TYPEHASH =
        keccak256("Deregister(uint256 nonce)");

    // ── Storage ──

    mapping(address => Profile) internal _profiles;
    address[] public agentList;
    mapping(address => uint256) internal _agentIndex; // 1-based
    mapping(address => uint256) public nonces;

    // ── Events ──

    event AgentRegistered(address indexed agent, string name, string model);
    event AgentUpdated(address indexed agent);
    event AgentDeregistered(address indexed agent);

    // ── Errors ──

    error AlreadyRegistered(address agent);
    error NotRegistered(address agent);
    error InvalidSignature();
    error EmptyName();
    error EmptyModel();
    error EmptyHarness();
    error EmptyOs();
    error EmptyPublicKey();
    error TooManySkills(uint256 count, uint256 max);
    error TooManyServices(uint256 count, uint256 max);

    uint256 public constant MAX_SKILLS = 32;
    uint256 public constant MAX_SERVICES = 16;
    error InvalidNonce(uint256 expected, uint256 got);

    // ── Constructor ──

    constructor() EIP712("StringRegistry", "1") {}

    // ── External Functions ──

    function register(
        address agent,
        ProfileInput calldata input,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (_agentIndex[agent] != 0) revert AlreadyRegistered(agent);
        _validateRequired(input);
        if (nonce != nonces[agent]) revert InvalidNonce(nonces[agent], nonce);

        bytes32 digest = _hashTypedDataV4(_hashProfileStruct(REGISTER_TYPEHASH, input, nonce));
        if (ECDSA.recover(digest, signature) != agent) revert InvalidSignature();

        nonces[agent]++;
        agentList.push(agent);
        _agentIndex[agent] = agentList.length;

        _storeProfile(agent, input);
        _profiles[agent].active = true;
        _profiles[agent].registeredAt = block.timestamp;
        _profiles[agent].updatedAt = block.timestamp;

        emit AgentRegistered(agent, input.name, input.model);
    }

    function updateProfile(
        address agent,
        ProfileInput calldata input,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (_agentIndex[agent] == 0) revert NotRegistered(agent);
        _validateRequired(input);
        if (nonce != nonces[agent]) revert InvalidNonce(nonces[agent], nonce);

        bytes32 digest = _hashTypedDataV4(_hashProfileStruct(UPDATE_TYPEHASH, input, nonce));
        if (ECDSA.recover(digest, signature) != agent) revert InvalidSignature();

        nonces[agent]++;
        _storeProfile(agent, input);
        _profiles[agent].updatedAt = block.timestamp;

        emit AgentUpdated(agent);
    }

    function deregister(
        address agent,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (_agentIndex[agent] == 0) revert NotRegistered(agent);
        if (nonce != nonces[agent]) revert InvalidNonce(nonces[agent], nonce);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(DEREGISTER_TYPEHASH, nonce))
        );
        if (ECDSA.recover(digest, signature) != agent) revert InvalidSignature();

        nonces[agent]++;
        _profiles[agent].active = false;
        _profiles[agent].updatedAt = block.timestamp;

        emit AgentDeregistered(agent);
    }

    // ── View Functions ──

    function getProfile(address agent) external view returns (Profile memory) {
        return _profiles[agent];
    }

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAgentAt(uint256 index) external view returns (address) {
        return agentList[index];
    }

    function isRegistered(address agent) external view returns (bool) {
        return _agentIndex[agent] != 0;
    }

    // ── Internal ──

    function _validateRequired(ProfileInput calldata input) internal pure {
        if (bytes(input.name).length == 0) revert EmptyName();
        if (bytes(input.model).length == 0) revert EmptyModel();
        if (bytes(input.harness).length == 0) revert EmptyHarness();
        if (bytes(input.os).length == 0) revert EmptyOs();
        if (input.publicKey.length == 0) revert EmptyPublicKey();
        if (input.skills.length > MAX_SKILLS) revert TooManySkills(input.skills.length, MAX_SKILLS);
        if (input.services.length > MAX_SERVICES) revert TooManyServices(input.services.length, MAX_SERVICES);
    }

    function _storeProfile(address agent, ProfileInput calldata input) internal {
        Profile storage p = _profiles[agent];
        p.name = input.name;
        p.model = input.model;
        p.harness = input.harness;
        p.os = input.os;
        p.publicKey = input.publicKey;
        p.description = input.description;

        delete p.skills;
        delete p.services;

        for (uint256 i = 0; i < input.skills.length; i++) {
            p.skills.push(input.skills[i]);
        }
        for (uint256 i = 0; i < input.services.length; i++) {
            p.services.push(input.services[i]);
        }
    }

    function _hashProfileStruct(
        bytes32 typeHash,
        ProfileInput calldata input,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            typeHash,
            keccak256(bytes(input.name)),
            keccak256(bytes(input.model)),
            keccak256(bytes(input.harness)),
            keccak256(bytes(input.os)),
            keccak256(input.publicKey),
            keccak256(bytes(input.description)),
            _hashStringArray(input.skills),
            _hashServices(input.services),
            nonce
        ));
    }

    function _hashService(Service calldata service) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            SERVICE_TYPEHASH,
            keccak256(bytes(service.name)),
            service.price,
            service.token
        ));
    }

    function _hashServices(Service[] calldata services) internal pure returns (bytes32) {
        if (services.length == 0) return keccak256("");
        bytes32[] memory hashes = new bytes32[](services.length);
        for (uint256 i = 0; i < services.length; i++) {
            hashes[i] = _hashService(services[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _hashStringArray(string[] calldata arr) internal pure returns (bytes32) {
        if (arr.length == 0) return keccak256("");
        bytes32[] memory hashes = new bytes32[](arr.length);
        for (uint256 i = 0; i < arr.length; i++) {
            hashes[i] = keccak256(bytes(arr[i]));
        }
        return keccak256(abi.encodePacked(hashes));
    }
}
