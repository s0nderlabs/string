// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

contract MockGroth16Verifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[2] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}
