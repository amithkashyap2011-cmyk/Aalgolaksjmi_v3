const fs = require('fs');
const path = require('path');

const files = [
  'server/diagnose_balance.ts', 'server/query_db.js', 'server/run_v2_5_core_repair_validation.ts', 
  'server/test_db4.js', 'server/inspect-trades-detail.js', 'server/run_v2_4h_audit.ts', 
  'server/run_core_recalibration_sim.ts', 'server/run_v2_4b_audit.ts', 'server/run_v2_4r_postfix_audit.ts', 
  'server/gatekeeper.ts', 'server/test-update.ts', 'server/test_db.js', 'server/check_wallet.ts', 
  'server/inspectTrades.js', 'server/closeAll.ts', 'server/test_db5.js', 'server/dry_run_v2_9e.ts', 
  'server/run_v2_4a_validation.ts', 'server/testSl.js', 'server/test-socket.ts', 'server/test_wallet.ts', 
  'server/run_v2_3a_audit.ts', 'server/test_db2.js', 'server/run_v2_4g_audit.ts', 'server/check_trades.js', 
  'server/zero_trade_forensics_v2_9g.ts', 'server/test-socket-client.ts', 'server/inspectWalletSnapshots.js', 
  'server/test_db6.js', 'server/test_db10.js', 'server/run_v2_2b_validation.ts', 'server/check_aqea_data.js', 
  'server/check_user.ts', 'server/scratch_pos_size.js', 'server/backfill_evidence.ts', 'server/run_capital_test.ts', 
  'server/verifyAlerts.js', 'server/daily_aqea_report.ts', 'server/test_router.ts', 
  'server/run_validation_demonstration.ts', 'server/test_db3.js', 'server/test-apikeys.ts', 
  'server/test_agg.js', 'server/ai_forensics_v2_9j.ts', 'server/final_truth_audit.ts', 
  'server/chaos_test.ts', 'server/run_outcome_attribution.ts', 'server/testSymbol.js', 
  'server/audit_rejections.ts', 'server/debug_attribution.ts', 'server/test_sio.js', 
  'server/test-users.ts', 'server/fix_db.ts', 'server/test-update-2.js', 'server/run_v2_5a_reality_replay.ts', 
  'server/stress_test_v2_8c.ts', 'server/test-apikeys-req.ts', 'server/test_db9.js',
  'scratch/fix_db_simple.js', 'scratch/query_db.js', 'scratch/inspect-trades-detail.js', 
  'scratch/reset_mongo.js', 'scratch/set_futures.ts', 'scratch/dry_run_tick.js'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace Mongo URIs
  content = content.replace(/mongodb:\/\/127\.0\.0\.1:27017\/[a-zA-Z0-9_]+/g, 'process.env.MONGO_URI');
  content = content.replace(/mongodb:\/\/localhost:27017\/[a-zA-Z0-9_]+/g, 'process.env.MONGO_URI');
  
  // Replace hardcoded URLs
  content = content.replace(/http:\/\/127\.0\.0\.1:9991/g, 'process.env.API_GATEWAY_URL');
  content = content.replace(/http:\/\/localhost:9991/g, 'process.env.API_GATEWAY_URL');
  content = content.replace(/http:\/\/127\.0\.0\.1:5000/g, 'process.env.API_GATEWAY_URL');
  content = content.replace(/http:\/\/localhost:8000/g, 'process.env.API_GATEWAY_URL');
  content = content.replace(/http:\/\/127\.0\.0\.1:8080/g, 'process.env.API_GATEWAY_URL');
  content = content.replace(/http:\/\/localhost:8888/g, 'process.env.API_GATEWAY_URL');
  
  fs.writeFileSync(file, content);
});
console.log("Cleanup script finished.");
