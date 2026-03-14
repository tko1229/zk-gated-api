// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Script.sol";
import "../src/Verifier.sol";
import "../src/ZKGatedAccess.sol";

contract DeployScript is Script {
    function run() external {
        bytes32 merkleRoot = vm.envBytes32("MERKLE_ROOT");

        vm.startBroadcast();

        // Deploy the HonkVerifier
        HonkVerifier verifier = new HonkVerifier();
        console.log("HonkVerifier deployed at:", address(verifier));

        // Deploy ZKGatedAccess with the verifier and initial Merkle root
        ZKGatedAccess gatedAccess = new ZKGatedAccess(address(verifier), merkleRoot);
        console.log("ZKGatedAccess deployed at:", address(gatedAccess));

        vm.stopBroadcast();
    }
}
