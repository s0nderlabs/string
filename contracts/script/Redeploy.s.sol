// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {ZkRelay} from "../src/ZkRelay.sol";
import {StringRegistry} from "../src/StringRegistry.sol";
import {StringEscrow} from "../src/StringEscrow.sol";

/// @notice Redeploy only changed contracts. Groth16Verifier unchanged, reuse existing.
contract RedeployScript is Script {
    bytes32 constant SALT = bytes32(uint256(0x537472696e6732)); // "String2" — new salt for changed contracts

    address constant EXISTING_VERIFIER = 0xfBA6B526ed1724Ca9a92418de45A60769E2842cd;

    function run() public {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        vm.startBroadcast();

        ZkRelay relay = new ZkRelay{salt: SALT}(EXISTING_VERIFIER);
        console.log("ZkRelay v2:", address(relay));

        StringRegistry registry = new StringRegistry{salt: SALT}();
        console.log("StringRegistry:", address(registry));

        StringEscrow escrow = new StringEscrow{salt: SALT}(usdc, feeRecipient, msg.sender);
        console.log("StringEscrow:", address(escrow));

        vm.stopBroadcast();
    }
}
