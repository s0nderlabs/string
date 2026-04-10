// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {StringRegistry} from "../src/StringRegistry.sol";

contract StringRegistryTest is Test {
    StringRegistry public registry;

    uint256 internal agentPk = 0xA11CE;
    address internal agent;

    uint256 internal agent2Pk = 0xB0B;
    address internal agent2;

    bytes32 constant REGISTER_TYPEHASH =
        keccak256(
            "Register(string name,string model,string harness,string os,bytes publicKey,string description,string[] skills,Service[] services,uint256 nonce)Service(string name,uint256 price,address token)"
        );
    bytes32 constant UPDATE_TYPEHASH =
        keccak256(
            "Update(string name,string model,string harness,string os,bytes publicKey,string description,string[] skills,Service[] services,uint256 nonce)Service(string name,uint256 price,address token)"
        );
    bytes32 constant DEREGISTER_TYPEHASH = keccak256("Deregister(uint256 nonce)");
    bytes32 constant SERVICE_TYPEHASH = keccak256("Service(string name,uint256 price,address token)");

    function setUp() public {
        registry = new StringRegistry();
        agent = vm.addr(agentPk);
        agent2 = vm.addr(agent2Pk);
    }

    // ── Helpers ──

    function _defaultInput() internal pure returns (StringRegistry.ProfileInput memory) {
        string[] memory skills = new string[](0);
        StringRegistry.Service[] memory services = new StringRegistry.Service[](0);
        return StringRegistry.ProfileInput({
            name: "alpha",
            model: "opus-4.6",
            harness: "claude-code",
            os: "macos-15.1",
            publicKey: hex"04abcdef",
            description: "",
            skills: skills,
            services: services
        });
    }

    function _richInput() internal pure returns (StringRegistry.ProfileInput memory) {
        string[] memory skills = new string[](2);
        skills[0] = "pragma";
        skills[1] = "github";
        StringRegistry.Service[] memory services = new StringRegistry.Service[](1);
        services[0] = StringRegistry.Service("code review", 5_000_000, address(0x1234));
        return StringRegistry.ProfileInput({
            name: "alpha",
            model: "opus-4.6",
            harness: "claude-code",
            os: "macos-15.1",
            publicKey: hex"04abcdef",
            description: "test agent",
            skills: skills,
            services: services
        });
    }

    function _signProfile(
        uint256 pk,
        bytes32 typeHash,
        StringRegistry.ProfileInput memory input,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
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
        bytes32 digest = _domainDigest(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signDeregister(uint256 pk, uint256 nonce) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(DEREGISTER_TYPEHASH, nonce));
        bytes32 digest = _domainDigest(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _domainDigest(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSep = _computeDomainSeparator();
        return keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
    }

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("StringRegistry"),
            keccak256("1"),
            block.chainid,
            address(registry)
        ));
    }

    function _hashStringArray(string[] memory arr) internal pure returns (bytes32) {
        if (arr.length == 0) return keccak256("");
        bytes32[] memory hashes = new bytes32[](arr.length);
        for (uint256 i = 0; i < arr.length; i++) {
            hashes[i] = keccak256(bytes(arr[i]));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _hashServices(StringRegistry.Service[] memory services) internal pure returns (bytes32) {
        if (services.length == 0) return keccak256("");
        bytes32[] memory hashes = new bytes32[](services.length);
        for (uint256 i = 0; i < services.length; i++) {
            hashes[i] = keccak256(abi.encode(
                SERVICE_TYPEHASH,
                keccak256(bytes(services[i].name)),
                services[i].price,
                services[i].token
            ));
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _registerAgent(uint256 pk) internal returns (address) {
        address a = vm.addr(pk);
        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(pk, REGISTER_TYPEHASH, input, 0);
        registry.register(a, input, 0, sig);
        return a;
    }

    // ── Register tests ──

    function test_register_success() public {
        _registerAgent(agentPk);
        assertTrue(registry.isRegistered(agent));
        assertTrue(registry.getProfile(agent).active);
    }

    function test_register_storesAllFields() public {
        StringRegistry.ProfileInput memory input = _richInput();
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);
        registry.register(agent, input, 0, sig);

        StringRegistry.Profile memory p = registry.getProfile(agent);
        assertEq(p.name, "alpha");
        assertEq(p.model, "opus-4.6");
        assertEq(p.harness, "claude-code");
        assertEq(p.os, "macos-15.1");
        assertEq(p.publicKey, hex"04abcdef");
        assertEq(p.description, "test agent");
        assertEq(p.skills.length, 2);
        assertEq(p.skills[0], "pragma");
        assertEq(p.skills[1], "github");
        assertEq(p.services.length, 1);
        assertEq(p.services[0].name, "code review");
        assertEq(p.services[0].price, 5_000_000);
    }

    function test_register_emitsEvent() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectEmit(true, false, false, true);
        emit StringRegistry.AgentRegistered(agent, "alpha", "opus-4.6");
        registry.register(agent, input, 0, sig);
    }

    function test_register_addsToAgentList() public {
        _registerAgent(agentPk);
        assertEq(registry.getAgentCount(), 1);
        assertEq(registry.getAgentAt(0), agent);
    }

    function test_register_incrementsNonce() public {
        assertEq(registry.nonces(agent), 0);
        _registerAgent(agentPk);
        assertEq(registry.nonces(agent), 1);
    }

    function test_register_revert_alreadyRegistered() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        input.name = "alpha2";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 1);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.AlreadyRegistered.selector, agent));
        registry.register(agent, input, 1, sig);
    }

    function test_register_revert_invalidSignature() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agent2Pk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.InvalidSignature.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_emptyName() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        input.name = "";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.EmptyName.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_emptyModel() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        input.model = "";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.EmptyModel.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_emptyHarness() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        input.harness = "";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.EmptyHarness.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_emptyOs() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        input.os = "";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.EmptyOs.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_emptyPublicKey() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        input.publicKey = "";
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(StringRegistry.EmptyPublicKey.selector);
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_invalidNonce() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 5);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.InvalidNonce.selector, 0, 5));
        registry.register(agent, input, 5, sig);
    }

    function test_register_revert_tooManySkills() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        string[] memory skills = new string[](33);
        for (uint256 i = 0; i < 33; i++) skills[i] = "skill";
        input.skills = skills;
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.TooManySkills.selector, 33, 32));
        registry.register(agent, input, 0, sig);
    }

    function test_register_revert_tooManyServices() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        StringRegistry.Service[] memory services = new StringRegistry.Service[](17);
        for (uint256 i = 0; i < 17; i++) services[i] = StringRegistry.Service("s", 1, address(0x1));
        input.services = services;
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.TooManyServices.selector, 17, 16));
        registry.register(agent, input, 0, sig);
    }

    function test_register_emptyOptionalFields() public {
        _registerAgent(agentPk);

        StringRegistry.Profile memory p = registry.getProfile(agent);
        assertEq(p.description, "");
        assertEq(p.skills.length, 0);
        assertEq(p.services.length, 0);
    }

    // ── UpdateProfile tests ──

    function test_updateProfile_success() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        input.name = "alpha-v2";
        input.model = "sonnet-4.5";
        input.os = "linux";
        input.description = "updated";
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);
        registry.updateProfile(agent, input, 1, sig);

        StringRegistry.Profile memory p = registry.getProfile(agent);
        assertEq(p.name, "alpha-v2");
        assertEq(p.model, "sonnet-4.5");
        assertEq(p.os, "linux");
        assertEq(p.description, "updated");
    }

    function test_updateProfile_emitsEvent() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        input.name = "alpha-v2";
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);

        vm.expectEmit(true, false, false, false);
        emit StringRegistry.AgentUpdated(agent);
        registry.updateProfile(agent, input, 1, sig);
    }

    function test_updateProfile_incrementsNonce() public {
        _registerAgent(agentPk);
        assertEq(registry.nonces(agent), 1);

        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);
        registry.updateProfile(agent, input, 1, sig);
        assertEq(registry.nonces(agent), 2);
    }

    function test_updateProfile_revert_notRegistered() public {
        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 0);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.NotRegistered.selector, agent));
        registry.updateProfile(agent, input, 0, sig);
    }

    function test_updateProfile_revert_invalidSignature() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agent2Pk, UPDATE_TYPEHASH, input, 1);

        vm.expectRevert(StringRegistry.InvalidSignature.selector);
        registry.updateProfile(agent, input, 1, sig);
    }

    function test_updateProfile_revert_emptyRequiredFields() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        input.name = "";
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);

        vm.expectRevert(StringRegistry.EmptyName.selector);
        registry.updateProfile(agent, input, 1, sig);
    }

    // ── Deregister tests ──

    function test_deregister_setsActiveFalse() public {
        _registerAgent(agentPk);
        assertTrue(registry.getProfile(agent).active);

        bytes memory sig = _signDeregister(agentPk, 1);
        registry.deregister(agent, 1, sig);
        assertFalse(registry.getProfile(agent).active);
    }

    function test_deregister_emitsEvent() public {
        _registerAgent(agentPk);

        vm.expectEmit(true, false, false, false);
        emit StringRegistry.AgentDeregistered(agent);

        bytes memory sig = _signDeregister(agentPk, 1);
        registry.deregister(agent, 1, sig);
    }

    function test_deregister_incrementsNonce() public {
        _registerAgent(agentPk);
        assertEq(registry.nonces(agent), 1);

        bytes memory sig = _signDeregister(agentPk, 1);
        registry.deregister(agent, 1, sig);
        assertEq(registry.nonces(agent), 2);
    }

    function test_deregister_revert_notRegistered() public {
        bytes memory sig = _signDeregister(agentPk, 0);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.NotRegistered.selector, agent));
        registry.deregister(agent, 0, sig);
    }

    function test_deregister_revert_invalidSignature() public {
        _registerAgent(agentPk);

        bytes memory sig = _signDeregister(agent2Pk, 1);

        vm.expectRevert(StringRegistry.InvalidSignature.selector);
        registry.deregister(agent, 1, sig);
    }

    // ── View tests ──

    function test_getProfile_unregistered_returnsEmpty() public view {
        StringRegistry.Profile memory p = registry.getProfile(address(0xDEAD));
        assertEq(bytes(p.name).length, 0);
        assertFalse(p.active);
    }

    function test_getAgentCount() public {
        assertEq(registry.getAgentCount(), 0);
        _registerAgent(agentPk);
        assertEq(registry.getAgentCount(), 1);
    }

    function test_isRegistered_true() public {
        _registerAgent(agentPk);
        assertTrue(registry.isRegistered(agent));
    }

    function test_isRegistered_false() public view {
        assertFalse(registry.isRegistered(agent));
    }

    // ── E2E tests ──

    function test_e2e_registerUpdateDeregister() public {
        _registerAgent(agentPk);
        assertTrue(registry.getProfile(agent).active);

        StringRegistry.ProfileInput memory input = _richInput();
        input.name = "alpha-v2";
        input.model = "sonnet-4.5";
        input.harness = "cursor";
        input.os = "windows-11";
        input.description = "updated agent";
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);
        registry.updateProfile(agent, input, 1, sig);
        assertEq(registry.getProfile(agent).name, "alpha-v2");
        assertEq(registry.nonces(agent), 2);

        bytes memory deregSig = _signDeregister(agentPk, 2);
        registry.deregister(agent, 2, deregSig);
        assertFalse(registry.getProfile(agent).active);
        assertEq(registry.nonces(agent), 3);
    }

    function test_e2e_multipleAgents() public {
        _registerAgent(agentPk);
        _registerAgent(agent2Pk);

        assertEq(registry.getAgentCount(), 2);
        assertTrue(registry.isRegistered(agent));
        assertTrue(registry.isRegistered(agent2));
        assertEq(registry.getAgentAt(0), agent);
        assertEq(registry.getAgentAt(1), agent2);
    }

    function test_register_withServicesAndSkills() public {
        StringRegistry.ProfileInput memory input = _richInput();
        bytes memory sig = _signProfile(agentPk, REGISTER_TYPEHASH, input, 0);
        registry.register(agent, input, 0, sig);

        StringRegistry.Profile memory p = registry.getProfile(agent);
        assertEq(p.skills.length, 2);
        assertEq(p.services.length, 1);
    }

    function test_updateProfile_withServicesAndSkills() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _richInput();
        input.name = "updated";
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 1);
        registry.updateProfile(agent, input, 1, sig);

        StringRegistry.Profile memory p = registry.getProfile(agent);
        assertEq(p.skills.length, 2);
        assertEq(p.services.length, 1);
    }

    function test_deregister_revert_invalidNonce() public {
        _registerAgent(agentPk);

        bytes memory sig = _signDeregister(agentPk, 5); // wrong nonce, should be 1

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.InvalidNonce.selector, 1, 5));
        registry.deregister(agent, 5, sig);
    }

    function test_updateProfile_revert_invalidNonce() public {
        _registerAgent(agentPk);

        StringRegistry.ProfileInput memory input = _defaultInput();
        bytes memory sig = _signProfile(agentPk, UPDATE_TYPEHASH, input, 99);

        vm.expectRevert(abi.encodeWithSelector(StringRegistry.InvalidNonce.selector, 1, 99));
        registry.updateProfile(agent, input, 99, sig);
    }

    function test_eip712Domain_correctValues() public view {
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            ,
        ) = registry.eip712Domain();

        assertEq(uint8(fields), 0x0f);
        assertEq(name, "StringRegistry");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(registry));
    }
}
