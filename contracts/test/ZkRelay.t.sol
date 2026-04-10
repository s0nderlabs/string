// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ZkRelay} from "../src/ZkRelay.sol";
import {MockGroth16Verifier} from "./mocks/MockGroth16Verifier.sol";

contract ZkRelayTest is Test {
    ZkRelay public relay;
    MockGroth16Verifier public verifier;

    address public sender = address(0xA1);
    bytes32 public commitment = keccak256("test-commitment");
    bytes public encrypted = hex"deadbeef";

    uint[2] internal pA;
    uint[2][2] internal pB;
    uint[2] internal pC;
    uint[2] internal pubSignals;

    function setUp() public {
        verifier = new MockGroth16Verifier();
        relay = new ZkRelay(address(verifier));

        pubSignals[0] = uint256(commitment);
        pubSignals[1] = uint256(keccak256("sender-secret-hash"));
    }

    // ── Constructor ──

    function test_constructor_setsVerifier() public view {
        assertEq(address(relay.verifier()), address(verifier));
    }

    function test_constructor_revert_zeroAddress() public {
        vm.expectRevert(ZkRelay.ZeroAddress.selector);
        new ZkRelay(address(0));
    }

    // ── relayMessage success ──

    function test_relayMessage_success() public {
        uint256 id = relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
        assertEq(id, 0);
        assertEq(relay.getMessageCount(), 1);
    }

    function test_relayMessage_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ZkRelay.MessageVerified(commitment, sender, encrypted, block.timestamp);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
    }

    function test_relayMessage_storesCorrectData() public {
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);

        ZkRelay.Message memory msg_ = relay.getMessage(0);
        assertEq(msg_.commitment, commitment);
        assertEq(msg_.sender, sender);
        assertEq(msg_.encryptedMessage, encrypted);
        assertEq(msg_.timestamp, block.timestamp);
    }

    function test_relayMessage_storesSenderAddress_notPubSignal() public {
        address realSender = address(0xBEEF);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, realSender);

        ZkRelay.Message memory msg_ = relay.getMessage(0);
        assertEq(msg_.sender, realSender);
        // pubSignals[1] is the Poseidon hash — NOT what we store as sender
        assertTrue(msg_.sender != address(uint160(pubSignals[1])));
    }

    function test_relayMessage_incrementsMessageCount() public {
        assertEq(relay.getMessageCount(), 0);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
        assertEq(relay.getMessageCount(), 1);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
        assertEq(relay.getMessageCount(), 2);
    }

    function test_relayMessage_addsToCommitmentIndex() public {
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);

        uint256[] memory ids = relay.getMessagesByCommitment(commitment);
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
    }

    function test_relayMessage_multipleMessages() public {
        uint256 id0 = relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
        uint256 id1 = relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_relayMessage_multipleMessagesPerCommitment() public {
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, address(0xB2));

        uint256[] memory ids = relay.getMessagesByCommitment(commitment);
        assertEq(ids.length, 2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
    }

    // ── relayMessage reverts ──

    function test_relayMessage_revert_invalidProof() public {
        verifier.setShouldVerify(false);
        vm.expectRevert(ZkRelay.InvalidProof.selector);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, sender);
    }

    function test_relayMessage_revert_zeroSender() public {
        vm.expectRevert(ZkRelay.ZeroAddress.selector);
        relay.relayMessage(pA, pB, pC, pubSignals, encrypted, address(0));
    }

    // ── View functions ──

    function test_getMessageCount_empty() public view {
        assertEq(relay.getMessageCount(), 0);
    }

    function test_getMessagesByCommitment_empty() public view {
        uint256[] memory ids = relay.getMessagesByCommitment(keccak256("nonexistent"));
        assertEq(ids.length, 0);
    }

    function test_getMessage_revert_notFound() public {
        vm.expectRevert(abi.encodeWithSelector(ZkRelay.MessageNotFound.selector, 0));
        relay.getMessage(0);
    }
}
