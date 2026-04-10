// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {ZkRelay} from "../src/ZkRelay.sol";
import {StringRegistry} from "../src/StringRegistry.sol";
import {StringEscrow} from "../src/StringEscrow.sol";

contract DeployScript is Script {
    bytes32 constant SALT = bytes32(uint256(0x537472696e67)); // "String"

    function run() public {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        vm.startBroadcast();

        Groth16Verifier verifier = new Groth16Verifier{salt: SALT}();
        console.log("Groth16Verifier:", address(verifier));

        ZkRelay relay = new ZkRelay{salt: SALT}(address(verifier));
        console.log("ZkRelay:", address(relay));

        StringRegistry registry = new StringRegistry{salt: SALT}();
        console.log("StringRegistry:", address(registry));

        StringEscrow escrow = new StringEscrow{salt: SALT}(usdc, feeRecipient, msg.sender);
        console.log("StringEscrow:", address(escrow));

        vm.stopBroadcast();
    }
}
