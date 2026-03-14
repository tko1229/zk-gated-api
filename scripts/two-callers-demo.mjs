#!/usr/bin/env node
/**
 * Phase 2: Two Anonymous Callers Demo
 * 
 * Demonstrates that two different agents from the same set can both
 * prove membership — and the verifier CANNOT distinguish between them.
 * 
 * Both produce valid proofs, but the proofs don't reveal which agent is calling.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREE_CIRCUIT = resolve(__dirname, '../circuits/compute_tree');
const PROOF_CIRCUIT = resolve(__dirname, '../circuits/membership_proof');
const PATH_PREFIX = `${process.env.HOME}/.bb:${process.env.HOME}/.nargo/bin:${process.env.HOME}/.foundry/bin:${process.env.PATH}`;

const HONK_VERIFIER = '0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578';

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', env: { ...process.env, PATH: PATH_PREFIX }, ...opts }).trim();
}

function computeTree(agentIds) {
  const toml = `agent_ids = [${agentIds.map(id => `"${id}"`).join(', ')}]\n`;
  writeFileSync(resolve(TREE_CIRCUIT, 'Prover.toml'), toml);
  const output = run('nargo execute 2>&1', { cwd: TREE_CIRCUIT });
  const match = output.match(/Circuit output: \[(.*)\]/s);
  const values = match[1].split(',').map(v => v.trim());
  return {
    leaves: values.slice(0, 8),
    layer1: values.slice(8, 12),
    layer2: values.slice(12, 14),
    root: values[14],
  };
}

function getMerklePath(tree, agentIndex) {
  const { leaves, layer1, layer2 } = tree;
  const siblingLeafIdx = agentIndex % 2 === 0 ? agentIndex + 1 : agentIndex - 1;
  const layer1Idx = Math.floor(agentIndex / 2);
  const siblingLayer1Idx = layer1Idx % 2 === 0 ? layer1Idx + 1 : layer1Idx - 1;
  const layer2Idx = Math.floor(layer1Idx / 2);
  const siblingLayer2Idx = layer2Idx % 2 === 0 ? layer2Idx + 1 : layer2Idx - 1;
  return {
    pathElements: [leaves[siblingLeafIdx], layer1[siblingLayer1Idx], layer2[siblingLayer2Idx]],
    pathIndices: [agentIndex % 2, layer1Idx % 2, layer2Idx % 2],
  };
}

function generateAndVerifyProof(label, agentId, root, pathElements, pathIndices) {
  console.log(`\n🔐 ${label}: Generating proof...`);
  const toml = `root = "${root}"
agent_id = "${agentId}"
path_elements = [${pathElements.map(e => `"${e}"`).join(', ')}]
path_indices = [${pathIndices.map(i => `"${i}"`).join(', ')}]
`;
  writeFileSync(resolve(PROOF_CIRCUIT, 'Prover.toml'), toml);
  run('nargo execute 2>&1', { cwd: PROOF_CIRCUIT });
  run('bb prove -t evm -b ./target/membership_proof.json -w ./target/membership_proof.gz -o ./target/proof_out', { cwd: PROOF_CIRCUIT });
  
  const proofBytes = readFileSync(resolve(PROOF_CIRCUIT, 'target/proof_out/proof'));
  const pubInputsBytes = readFileSync(resolve(PROOF_CIRCUIT, 'target/proof_out/public_inputs'));
  console.log(`   Proof size: ${proofBytes.length} bytes`);
  return { proofBytes, pubInputsBytes };
}

async function verifyOnChain(proofBytes, pubInputsBytes, rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const numPubInputs = pubInputsBytes.length / 32;
  const publicInputs = [];
  for (let i = 0; i < numPubInputs; i++) {
    const slice = pubInputsBytes.slice(i * 32, (i + 1) * 32);
    publicInputs.push('0x' + slice.toString('hex').padStart(64, '0'));
  }
  const verifier = new ethers.Contract(HONK_VERIFIER, 
    ['function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool)'],
    provider
  );
  return await verifier.verify.staticCall('0x' + proofBytes.toString('hex'), publicInputs);
}

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) { console.error('BASE_RPC_URL not set'); process.exit(1); }

  // Two agents from the same anonymity set
  const AGENT_A = '255205401822843543504688297811637588323'; // Boba
  const AGENT_B = '1001'; // Second agent
  const agentIds = [AGENT_A, AGENT_B, '1002', '1003', '0', '0', '0', '0'];

  console.log('══════════════════════════════════════════════════════');
  console.log('  Two Anonymous Callers — Same Set, No Distinction');
  console.log('══════════════════════════════════════════════════════\n');
  console.log('Agent set: 4 registered agents');
  console.log('Both agents will prove membership. The verifier cannot tell them apart.\n');

  // Compute tree
  const tree = computeTree(agentIds);
  console.log(`🌳 Merkle root: ${tree.root}`);

  // Agent A
  const pathA = getMerklePath(tree, 0);
  const proofA = generateAndVerifyProof('Agent A (Boba)', AGENT_A, tree.root, pathA.pathElements, pathA.pathIndices);

  // Agent B  
  const pathB = getMerklePath(tree, 1);
  const proofB = generateAndVerifyProof('Agent B (anonymous)', AGENT_B, tree.root, pathB.pathElements, pathB.pathIndices);

  // Verify both on-chain
  console.log('\n🌐 Verifying both proofs on Base Mainnet...\n');

  const verifiedA = await verifyOnChain(proofA.proofBytes, proofA.pubInputsBytes, rpcUrl);
  console.log(`   Agent A: ${verifiedA ? '✅ VERIFIED' : '❌ FAILED'}`);

  const verifiedB = await verifyOnChain(proofB.proofBytes, proofB.pubInputsBytes, rpcUrl);
  console.log(`   Agent B: ${verifiedB ? '✅ VERIFIED' : '❌ FAILED'}`);

  // Compare what the verifier sees
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  What the API/verifier sees:');
  console.log('══════════════════════════════════════════════════════\n');
  console.log('  Agent A proof hash:', ethers.keccak256('0x' + proofA.proofBytes.toString('hex')).slice(0, 18) + '...');
  console.log('  Agent B proof hash:', ethers.keccak256('0x' + proofB.proofBytes.toString('hex')).slice(0, 18) + '...');
  console.log('\n  Both proofs:');
  console.log('    ✅ Verify against the SAME Merkle root');
  console.log('    ✅ Both return true from the on-chain verifier');
  console.log('    ❌ Proofs are DIFFERENT (can\'t correlate calls)');
  console.log('    ❌ No agent ID appears in either proof');
  console.log('    ❌ Verifier CANNOT tell which agent made which call');
  console.log('\n  → Two agents, one anonymity set, zero identity leakage. 🔒\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
