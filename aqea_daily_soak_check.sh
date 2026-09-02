#!/bin/bash

echo "======================================================"
echo " AQEA DAILY FORWARD OOS SOAK CHECK"
echo " $(date)"
echo "======================================================"

echo
echo "### PM2 SERVICES"
pm2 status | grep -E "aqea-server|aqea-quant|aqea-client|soak-monitor"

echo
echo "### RESTART COUNTS"
pm2 jlist | node -e '
let s="";
process.stdin.on("data",d=>s+=d);
process.stdin.on("end",()=>{
  const a=JSON.parse(s);
  for(const p of a.filter(x=>[
    "aqea-server","aqea-quant","aqea-client","soak-monitor"
  ].includes(x.name))){
    console.log(`${p.name}: restarts=${p.pm2_env.restart_time}, status=${p.pm2_env.status}`);
  }
});
'

echo
echo "### SERVER HEALTH"
curl -s http://localhost:9991/health | python3 -m json.tool 2>/dev/null || \
curl -s http://localhost:9991/health

echo
echo "### AQEA FORWARD OOS / SAFETY SEARCH"
curl -s http://localhost:9991/health 2>/dev/null | \
grep -oE '"(LIVE_PROMOTION_BLOCKED|isLiveApproved|executionAttempted|orderCreationCount|walletMutationCount|syntheticOutcomeCountUsedForOOS|LSTMVotingEligible|calibrationFitFromInsufficientEvidence|N_resolved|N_active|N_absorbed)"[^,}]*' || true

echo
echo "### RECENT SOAK MONITOR LOG"
pm2 logs soak-monitor --lines 30 --nostream 2>/dev/null

echo
echo "======================================================"
echo " INTERPRETATION"
echo "======================================================"
echo "N_resolved must increase only when genuine forward"
echo "trade episodes explicitly resolve."
echo
echo "Required safety state:"
echo "LIVE_PROMOTION_BLOCKED=true"
echo "isLiveApproved=false"
echo "executionAttempted=false"
echo "orderCreationCount=0"
echo "walletMutationCount=0"
echo "syntheticOutcomeCountUsedForOOS=0"
echo "LSTMVotingEligible=false"
echo
echo "DO NOT restart or modify the policy merely because"
echo "N_resolved remains 0."
echo "======================================================"
