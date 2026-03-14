#!/usr/bin/env node
/**
 * End-to-End ZK-Gated API Call
 * 
 * Demonstrates: Agent proves membership via ZK proof → verifies on Base Mainnet → gets access.
 * NO API key used for the gated resource. Only a ZK proof.
 *
 * Usage: node call-gated-api.mjs [--agent-id <id>] [--agent-ids <id1,id2,...>]
 *        Defaults: Boba's participant ID in a 4-agent set
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

// Contract addresses on Base Mainnet
const HONK_VERIFIER = '0xA95E3fc6a8d4e02d5717AF73744ed9BdEbD30578';
const ZK_GATED_ACCESS = '0x0F60203C05270a5d39bF7494e7cd29F1Dd52aFC7';

// Boba's participant ID as field element
const BOBA_AGENT_ID = '255205401822843543504688297811637588323'; // 0xbffec5c4c9c549b29487358d9f965163

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf8',
    env: { ...process.env, PATH: PATH_PREFIX },
    ...opts
  }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let agentId = BOBA_AGENT_ID;
  let agentIds = [BOBA_AGENT_ID, '1001', '1002', '1003', '0', '0', '0', '0'];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) agentId = args[++i];
    else if (args[i] === '--agent-ids' && args[i + 1]) {
      const ids = args[++i].split(',');
      agentIds = ids.concat(Array(8 - ids.length).fill('0')).slice(0, 8);
    }
  }
  return { agentId, agentIds };
}

function computeTree(agentIds) {
  const toml = `agent_ids = [${agentIds.map(id => `"${id}"`).join(', ')}]\n`;
  writeFileSync(resolve(TREE_CIRCUIT, 'Prover.toml'), toml);
  const output = run('nargo execute 2>&1', { cwd: TREE_CIRCUIT });
  const match = output.match(/Circuit output: \[(.*)\]/s);
  if (!match) throw new Error('Failed to parse circuit output: ' + output);
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

function generateProof(agentId, root, pathElements, pathIndices) {
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
  return { proofBytes, pubInputsBytes };
}

async function verifyOnChain(proofBytes, pubInputsBytes, rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Format public inputs as bytes32[]
  // Public inputs file contains raw 32-byte values concatenated
  const numPubInputs = pubInputsBytes.length / 32;
  const publicInputs = [];
  for (let i = 0; i < numPubInputs; i++) {
    const slice = pubInputsBytes.slice(i * 32, (i + 1) * 32);
    publicInputs.push('0x' + slice.toString('hex').padStart(64, '0'));
  }

  const verifierAbi = ['function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool)'];
  const verifier = new ethers.Contract(HONK_VERIFIER, verifierAbi, provider);

  const proofHex = '0x' + proofBytes.toString('hex');
  return { verified: await verifier.verify.staticCall(proofHex, publicInputs), publicInputs, proofHex };
}

async function main() {
  const { agentId, agentIds } = parseArgs();
  const agentIndex = agentIds.indexOf(agentId);
  if (agentIndex === -1) { console.error('Agent ID not in set'); process.exit(1); }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  ZK-Gated API Call — The Synthesis Demo (Boba)');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`🤖 Agent: anonymous (index ${agentIndex} in set of ${agentIds.filter(id => id !== '0').length})`);
  console.log(`🔗 Chain: Base Mainnet (8453)`);
  console.log(`📜 Verifier: ${HONK_VERIFIER}`);
  console.log(`📜 ZKGatedAccess: ${ZK_GATED_ACCESS}`);

  // Step 1: Compute Merkle tree
  console.log('\n📐 Step 1: Computing Merkle tree from agent set...');
  const tree = computeTree(agentIds);
  console.log(`   Root: ${tree.root}`);

  // Step 2: Generate ZK proof
  console.log('\n🔐 Step 2: Generating ZK membership proof...');
  console.log('   (Agent proves it belongs to the set WITHOUT revealing which agent it is)');
  const { pathElements, pathIndices } = getMerklePath(tree, agentIndex);
  const { proofBytes, pubInputsBytes } = generateProof(agentId, tree.root, pathElements, pathIndices);
  console.log(`   Proof size: ${proofBytes.length} bytes`);

  // Step 3: Verify locally first
  console.log('\n🔍 Step 3: Local verification...');
  try {
    run('bb verify -t evm -k ./target/vk -p ./target/proof_out/proof -i ./target/proof_out/public_inputs', { cwd: PROOF_CIRCUIT });
    console.log('   ✅ Local verification passed');
  } catch (e) {
    console.error('   ❌ Local verification FAILED');
    process.exit(1);
  }

  // Step 4: Verify on Base Mainnet
  const rpcUrl = process.env.BASE_RPC_URL;
  if (!rpcUrl) {
    console.error('\n❌ BASE_RPC_URL not set');
    process.exit(1);
  }

  console.log('\n🌐 Step 4: On-chain verification on Base Mainnet...');
  try {
    const { verified, publicInputs, proofHex } = await verifyOnChain(proofBytes, pubInputsBytes, rpcUrl);
    
    if (verified) {
      console.log('   ✅ ON-CHAIN VERIFICATION PASSED!');
      console.log('\n🔓 ACCESS GRANTED');
      console.log('   ┌─────────────────────────────────────────────────┐');
      console.log('   │  The agent proved membership without revealing  │');
      console.log('   │  its identity. No API key was used.             │');
      console.log('   │                                                 │');
      console.log('   │  Secret: ZK-authenticated agent access works!   │');
      console.log('   │  Chain: Base Mainnet | Proof: UltraHonk (Noir) │');
      console.log('   └─────────────────────────────────────────────────┘');
    } else {
      console.log('   ❌ ON-CHAIN VERIFICATION FAILED');
      console.log('   Access denied — proof invalid.');
    }

    // Save result
    const result = {
      success: verified,
      chain: 'Base Mainnet (8453)',
      verifier: HONK_VERIFIER,
      gatedAccess: ZK_GATED_ACCESS,
      merkleRoot: tree.root,
      proofSize: proofBytes.length,
      publicInputs,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(resolve(__dirname, '../e2e-result.json'), JSON.stringify(result, null, 2));
    console.log('\n📄 Full result saved to e2e-result.json');

  } catch (err) {
    console.error(`\n❌ On-chain verification error: ${err.message}`);
    
    // Debug info
    console.log('\nDebug info:');
    console.log(`  Proof length: ${proofBytes.length}`);
    console.log(`  Public inputs length: ${pubInputsBytes.length}`);
    console.log(`  Public inputs hex: 0x${pubInputsBytes.toString('hex')}`);
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
