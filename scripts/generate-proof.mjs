#!/usr/bin/env node
/**
 * ZK Membership Proof Generator
 * 
 * 1. Computes the Merkle tree from agent IDs using the compute_tree circuit
 * 2. Extracts the Merkle path for a specific agent
 * 3. Generates a ZK proof using nargo execute + bb prove
 * 4. Outputs the proof and public inputs for verification
 *
 * Usage: node generate-proof.mjs --agent-id <id> [--agent-ids <id1,id2,...>]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREE_CIRCUIT = resolve(__dirname, '../circuits/compute_tree');
const PROOF_CIRCUIT = resolve(__dirname, '../circuits/membership_proof');
const PATH_PREFIX = `${process.env.HOME}/.bb:${process.env.HOME}/.nargo/bin:${process.env.HOME}/.foundry/bin:${process.env.PATH}`;

function run(cmd, opts = {}) {
  return execSync(cmd, { 
    encoding: 'utf8', 
    env: { ...process.env, PATH: PATH_PREFIX },
    ...opts 
  }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let agentId = null;
  let agentIds = ['42', '100', '200', '300', '0', '0', '0', '0']; // defaults

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) {
      agentId = args[++i];
    } else if (args[i] === '--agent-ids' && args[i + 1]) {
      const ids = args[++i].split(',');
      agentIds = ids.concat(Array(8 - ids.length).fill('0')).slice(0, 8);
    }
  }

  if (!agentId) {
    console.error('Usage: node generate-proof.mjs --agent-id <id> [--agent-ids <id1,id2,...>]');
    process.exit(1);
  }

  return { agentId, agentIds };
}

function computeTree(agentIds) {
  console.log('📐 Computing Merkle tree...');
  
  // Write Prover.toml for compute_tree
  const toml = `agent_ids = [${agentIds.map(id => `"${id}"`).join(', ')}]\n`;
  writeFileSync(resolve(TREE_CIRCUIT, 'Prover.toml'), toml);

  // Execute circuit
  const output = run('nargo execute 2>&1', { cwd: TREE_CIRCUIT });
  
  // Parse output values
  const match = output.match(/Circuit output: \[(.*)\]/s);
  if (!match) {
    throw new Error('Failed to parse circuit output: ' + output);
  }

  const values = match[1].split(',').map(v => v.trim());
  
  // Structure: [8 leaves, 4 layer1, 2 layer2, 1 root]
  const leaves = values.slice(0, 8);
  const layer1 = values.slice(8, 12);
  const layer2 = values.slice(12, 14);
  const root = values[14];

  return { leaves, layer1, layer2, root };
}

function getMerklePath(tree, agentIndex) {
  // For a depth-3 tree, the path from leaf at `agentIndex` to root:
  // Level 0: sibling of leaf at agentIndex
  // Level 1: sibling of layer1 node
  // Level 2: sibling of layer2 node

  const { leaves, layer1, layer2 } = tree;

  // Level 0: sibling leaf
  const siblingLeafIdx = agentIndex % 2 === 0 ? agentIndex + 1 : agentIndex - 1;
  const pathElement0 = leaves[siblingLeafIdx];
  const pathIndex0 = agentIndex % 2; // 0 if left child, 1 if right child

  // Level 1: which layer1 node, and its sibling
  const layer1Idx = Math.floor(agentIndex / 2);
  const siblingLayer1Idx = layer1Idx % 2 === 0 ? layer1Idx + 1 : layer1Idx - 1;
  const pathElement1 = layer1[siblingLayer1Idx];
  const pathIndex1 = layer1Idx % 2;

  // Level 2: which layer2 node, and its sibling
  const layer2Idx = Math.floor(layer1Idx / 2);
  const siblingLayer2Idx = layer2Idx % 2 === 0 ? layer2Idx + 1 : layer2Idx - 1;
  const pathElement2 = layer2[siblingLayer2Idx];
  const pathIndex2 = layer2Idx % 2;

  return {
    pathElements: [pathElement0, pathElement1, pathElement2],
    pathIndices: [pathIndex0, pathIndex1, pathIndex2],
  };
}

function generateProof(agentId, root, pathElements, pathIndices) {
  console.log('🔐 Generating ZK proof...');

  // Write Prover.toml for membership_proof
  const toml = `root = "${root}"
agent_id = "${agentId}"
path_elements = [${pathElements.map(e => `"${e}"`).join(', ')}]
path_indices = [${pathIndices.map(i => `"${i}"`).join(', ')}]
`;
  writeFileSync(resolve(PROOF_CIRCUIT, 'Prover.toml'), toml);

  // Execute to generate witness
  console.log('  Solving witness...');
  run('nargo execute 2>&1', { cwd: PROOF_CIRCUIT });

  // Generate proof with bb
  console.log('  Generating proof with barretenberg...');
  run(`bb prove --oracle_hash keccak -b ./target/membership_proof.json -w ./target/membership_proof.gz -o ./target/proof_out`, { cwd: PROOF_CIRCUIT });

  // Read proof (bb outputs a directory with proof and public_inputs files)
  const proofPath = resolve(PROOF_CIRCUIT, 'target/proof_out/proof');
  const publicInputsPath = resolve(PROOF_CIRCUIT, 'target/proof_out/public_inputs');
  const proof = readFileSync(proofPath);
  const publicInputsRaw = readFileSync(publicInputsPath);

  console.log(`  ✅ Proof generated (${proof.length} bytes)`);
  return { proof, publicInputsRaw };
}

function extractPublicInputs(proofBuf) {
  // UltraHonk proofs: public inputs are embedded in the proof
  // For on-chain verification, we need to extract them
  // The number of public inputs is 17 (1 root + 16 aggregation object)
  // Each public input is 32 bytes, stored at the beginning of the proof after 4 bytes of size
  
  // Actually, bb puts public inputs in the proof file. Let's read the raw proof
  // and use bb to extract/verify
  return proofBuf;
}

async function main() {
  const { agentId, agentIds } = parseArgs();

  // Check that agentId is in the set
  const agentIndex = agentIds.indexOf(agentId);
  if (agentIndex === -1) {
    console.error(`❌ Agent ID "${agentId}" not found in agent set: [${agentIds.join(', ')}]`);
    process.exit(1);
  }

  console.log(`🤖 Agent ID: ${agentId} (index ${agentIndex} in set of ${agentIds.filter(id => id !== '0').length} agents)`);

  // Step 1: Compute tree
  const tree = computeTree(agentIds);
  console.log(`🌳 Merkle root: ${tree.root}`);

  // Step 2: Get Merkle path
  const { pathElements, pathIndices } = getMerklePath(tree, agentIndex);
  console.log(`🛤️  Path elements: [${pathElements.join(', ')}]`);
  console.log(`🛤️  Path indices: [${pathIndices.join(', ')}]`);

  // Step 3: Generate proof
  const { proof, publicInputsRaw } = generateProof(agentId, tree.root, pathElements, pathIndices);

  // Step 4: Verify locally
  console.log('🔍 Verifying proof locally...');
  try {
    const verifyResult = run(
      `bb verify -t evm -k ./target/vk -p ./target/proof_out/proof -i ./target/proof_out/public_inputs`,
      { cwd: PROOF_CIRCUIT }
    );
    console.log('  ✅ Proof verified locally!');
  } catch (e) {
    console.error('  ❌ Local verification failed:', e.message);
    process.exit(1);
  }

  // Output result
  const result = {
    merkleRoot: tree.root,
    proofHex: '0x' + proof.toString('hex'),
    publicInputsHex: '0x' + publicInputsRaw.toString('hex'),
    proofSize: proof.length,
    agentIndex,
    totalAgents: agentIds.filter(id => id !== '0').length,
  };

  // Write result to file
  writeFileSync(resolve(__dirname, '../proof-output.json'), JSON.stringify(result, null, 2));
  console.log('\n📄 Result saved to proof-output.json');
  console.log(`📊 Proof size: ${proof.length} bytes`);
  console.log(`🌳 Merkle root: ${tree.root}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
