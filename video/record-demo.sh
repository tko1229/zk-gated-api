#!/bin/bash
export PATH="/root/.nargo/bin:/root/.foundry/bin:/root/.bb:$PATH"
source ~/.openclaw/.env 2>/dev/null

cd /root/synthesis-demo

# Simulate a human typing the commands with small delays
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ZK-Gated API Access — Live Demo"
echo "  Base Mainnet (Chain 8453)"
echo "═══════════════════════════════════════════════════"
echo ""
sleep 2

echo '$ node scripts/call-gated-api.mjs'
sleep 1
node scripts/call-gated-api.mjs
sleep 3

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Now: Two Anonymous Callers"
echo "═══════════════════════════════════════════════════"
echo ""
sleep 2

echo '$ node scripts/two-callers-demo.mjs'
sleep 1
node scripts/two-callers-demo.mjs
sleep 3

echo ""
echo "✅ Demo complete. No API keys were used."
echo ""
