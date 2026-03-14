#!/bin/bash
# Compute the Merkle tree from agent IDs using the compute_tree Noir circuit.
# Usage: ./compute-tree.sh <agent_id_1> <agent_id_2> ... <agent_id_8>
# If fewer than 8 IDs are provided, remaining slots are filled with 0.
#
# Outputs JSON with leaves, layers, root, and paths for each agent.

set -euo pipefail
export PATH="$HOME/.bb:$HOME/.nargo/bin:$HOME/.foundry/bin:$PATH"

CIRCUIT_DIR="$(dirname "$0")/../circuits/compute_tree"

# Collect agent IDs (up to 8, pad with 0)
IDS=()
for i in $(seq 1 8); do
    IDS+=("${!i:-0}")
done

# Write Prover.toml
cat > "$CIRCUIT_DIR/Prover.toml" << EOF
agent_ids = ["${IDS[0]}", "${IDS[1]}", "${IDS[2]}", "${IDS[3]}", "${IDS[4]}", "${IDS[5]}", "${IDS[6]}", "${IDS[7]}"]
EOF

# Execute circuit to get the tree values
cd "$CIRCUIT_DIR"
OUTPUT=$(nargo execute 2>&1)

# Parse the return values from the witness
# nargo execute prints return values or we can read from the generated witness
# Actually, nargo execute with return values prints them
echo "$OUTPUT"
