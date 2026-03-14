/// Utility circuit: computes the Merkle root from 8 agent IDs (depth-3 tree).
/// Used off-chain to derive the root and Merkle paths for the membership proof.
///
/// All 8 leaves are public inputs (agent_ids).
/// Returns the root as the circuit return value.
/// Also returns all intermediate hashes so the caller can reconstruct paths.

use std::hash::pedersen_hash;

fn main(
    agent_ids: pub [Field; 8]
) -> pub [Field; 15] {
    // Layer 0: hash each agent_id to get leaves
    let mut leaves: [Field; 8] = [0; 8];
    for i in 0..8 {
        leaves[i] = pedersen_hash([agent_ids[i]]);
    }

    // Layer 1: 4 nodes
    let mut layer1: [Field; 4] = [0; 4];
    for i in 0..4 {
        layer1[i] = pedersen_hash([leaves[2 * i], leaves[2 * i + 1]]);
    }

    // Layer 2: 2 nodes
    let mut layer2: [Field; 2] = [0; 2];
    for i in 0..2 {
        layer2[i] = pedersen_hash([layer1[2 * i], layer1[2 * i + 1]]);
    }

    // Root
    let root = pedersen_hash([layer2[0], layer2[1]]);

    // Return all: [8 leaves, 4 layer1, 2 layer2, 1 root] = 15 values
    let mut result: [Field; 15] = [0; 15];
    for i in 0..8 {
        result[i] = leaves[i];
    }
    for i in 0..4 {
        result[8 + i] = layer1[i];
    }
    for i in 0..2 {
        result[12 + i] = layer2[i];
    }
    result[14] = root;

    result
}
