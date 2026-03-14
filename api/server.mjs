#!/usr/bin/env node
/**
 * ZK-Gated API Server
 * 
 * Agents call this API by providing a ZK proof of membership.
 * No API key required — access is granted purely by proof verification.
 * 
 * POST /api/secret
 *   Body: { proof: "0x...", publicInputs: ["0x..."] }
 *   → 200 + secret data if proof valid
 *   → 403 if proof invalid
 *
 * GET /api/status
 *   → Server status and contract info
 */

import express from 'express';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config from env
const PORT = process.env.API_PORT || 3000;
const RPC_URL = process.env.BASE_RPC_URL;
const GATED_ACCESS_ADDRESS = process.env.ZK_GATED_ACCESS_ADDRESS;
const VERIFIER_ADDRESS = process.env.HONK_VERIFIER_ADDRESS;

// ZKGatedAccess ABI (only what we need)
const ZK_GATED_ABI = [
  'function verifyAccess(bytes calldata _proof, bytes32[] calldata _publicInputs) external returns (bool granted)',
  'function merkleRoot() external view returns (bytes32)',
  'event AccessGranted(bytes32 indexed merkleRoot, bytes32 proofHash)',
  'event AccessDenied(bytes32 indexed merkleRoot, bytes32 proofHash)',
];

// HonkVerifier ABI
const VERIFIER_ABI = [
  'function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external returns (bool)',
];

const app = express();
app.use(express.json({ limit: '1mb' }));

// Stats
let totalRequests = 0;
let successfulVerifications = 0;
let failedVerifications = 0;

app.get('/api/status', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(GATED_ACCESS_ADDRESS, ZK_GATED_ABI, provider);
    const root = await contract.merkleRoot();
    
    res.json({
      status: 'running',
      chain: 'Base Mainnet (8453)',
      contracts: {
        zkGatedAccess: GATED_ACCESS_ADDRESS,
        honkVerifier: VERIFIER_ADDRESS,
      },
      merkleRoot: root,
      stats: {
        totalRequests,
        successfulVerifications,
        failedVerifications,
      },
    });
  } catch (err) {
    res.json({
      status: 'running (contract not yet deployed)',
      error: err.message,
    });
  }
});

app.post('/api/secret', async (req, res) => {
  totalRequests++;
  const startTime = Date.now();

  try {
    const { proof, publicInputs } = req.body;

    if (!proof || !publicInputs) {
      failedVerifications++;
      return res.status(400).json({
        ok: false,
        error: 'Missing proof or publicInputs',
      });
    }

    console.log(`\n🔐 Incoming request #${totalRequests}`);
    console.log(`   Proof size: ${proof.length} hex chars`);
    console.log(`   Public inputs: ${publicInputs.length} elements`);

    // Verify on-chain using static call (no gas needed for the caller)
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    // Use staticCall to the verifier directly (no state changes, no gas)
    const verifier = new ethers.Contract(VERIFIER_ADDRESS, VERIFIER_ABI, provider);
    
    let verified = false;
    try {
      // Use staticCall — simulates the transaction without broadcasting
      verified = await verifier.verify.staticCall(proof, publicInputs);
    } catch (err) {
      console.log(`   ❌ Verification reverted: ${err.message?.slice(0, 100)}`);
      verified = false;
    }

    const elapsed = Date.now() - startTime;

    if (verified) {
      successfulVerifications++;
      console.log(`   ✅ Access GRANTED (${elapsed}ms)`);
      
      return res.json({
        ok: true,
        message: '🔓 Access granted! You proved membership without revealing your identity.',
        secret: 'The Synthesis Demo: ZK-authenticated agent access on Base Mainnet. No API key, no identity disclosure — just math.',
        metadata: {
          chain: 'Base Mainnet',
          verifiedOnChain: true,
          verifierContract: VERIFIER_ADDRESS,
          verificationTimeMs: elapsed,
          proofType: 'UltraHonk (Noir/Barretenberg)',
        },
      });
    } else {
      failedVerifications++;
      console.log(`   ❌ Access DENIED (${elapsed}ms)`);
      
      return res.status(403).json({
        ok: false,
        error: 'Invalid proof — access denied.',
        message: 'Your ZK proof did not verify. You are not in the allowed agent set, or the proof is malformed.',
      });
    }
  } catch (err) {
    failedVerifications++;
    console.error(`   💥 Error: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: 'Verification error: ' + err.message,
    });
  }
});

// Catch-all
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    endpoints: {
      'GET /api/status': 'Server status and contract info',
      'POST /api/secret': 'Submit ZK proof for gated access',
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 ZK-Gated API Server running on port ${PORT}`);
  console.log(`   Chain: Base Mainnet (8453)`);
  console.log(`   Verifier: ${VERIFIER_ADDRESS || 'NOT SET'}`);
  console.log(`   ZKGatedAccess: ${GATED_ACCESS_ADDRESS || 'NOT SET'}`);
  console.log(`\nEndpoints:`);
  console.log(`   GET  /api/status  — Server info`);
  console.log(`   POST /api/secret  — Submit proof for access\n`);
});
