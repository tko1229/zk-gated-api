/// ZK Membership Proof Circuit
///
/// Proves that a private `agent_id` is a member of a set of registered agents
/// (represented as a Merkle tree) WITHOUT revealing which agent_id.
///
/// Public inputs:  root (Merkle root of the allowed agent set)
/// Private inputs: agent_id, path_elements (siblings), path_indices (left/right)
///
/// Tree depth: 3 (supports up to 8 agents)

use std::hash::pedersen_hash;

// Tree depth
global DEPTH: u32 = 3;

fn main(
    root: pub Field,           // Public: Merkle root of allowed agents
    agent_id: Field,           // Private: the agent's secret identifier
    path_elements: [Field; 3], // Private: sibling hashes along the path
    path_indices: [Field; 3],  // Private: 0 = left child, 1 = right child
) {
    // Hash the agent_id to get the leaf
    let leaf = pedersen_hash([agent_id]);

    // Walk up the Merkle tree
    let mut current = leaf;
    for i in 0..DEPTH {
        let sibling = path_elements[i];
        let index = path_indices[i];

        // index == 0 means current is left child, sibling is right
        // index == 1 means current is right child, sibling is left
        let left = if index == 0 { current } else { sibling };
        let right = if index == 0 { sibling } else { current };

        current = pedersen_hash([left, right]);
    }

    // The computed root must match the public root
    assert(current == root, "Merkle proof verification failed: agent not in allowed set");
}

#[test]
fn test_membership() {
    // Simple test: build a tree with one real leaf and empty siblings
    // Leaf = pedersen_hash([42])
    // This is just a compilation test; real values computed off-chain
    let agent_id: Field = 42;
    let leaf = pedersen_hash([agent_id]);

    // For a depth-3 tree with only one leaf at position 0 (leftmost):
    // Level 0: hash(leaf, 0) 
    // Level 1: hash(level0, 0)
    // Level 2: hash(level1, 0)
    let zero: Field = 0;
    let level0 = pedersen_hash([leaf, zero]);
    let level1 = pedersen_hash([level0, zero]);
    let root = pedersen_hash([level1, zero]);

    main(root, agent_id, [zero, zero, zero], [0, 0, 0]);
}
