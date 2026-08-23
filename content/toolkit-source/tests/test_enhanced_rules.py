import unittest
import sys, os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from spark_plan_analyzer import lint_source, rank_bottlenecks, analyze_plan_text
from spark_autoconfig_core import recommend_nee_memory_split
from fabric_workload_advisor import forecast_fabric_throttling, calculate_burst_debt, high_concurrency_advisor

class TestEnhancedRules(unittest.TestCase):
    def test_m001_mlv_window_function(self):
        code = """
        CREATE MATERIALIZED VIEW silver.daily_sales AS
        SELECT order_id, customer_id,
               ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC) as rn
        FROM bronze.orders
        """
        findings = lint_source(code, "test_cell")
        codes = [f.code for f in findings]
        self.assertIn("M001", codes)
        
    def test_p012_unconstrained_broadcast(self):
        code = """
        df_joined = fact.join(broadcast(dim_large), "customer_id")
        """
        findings = lint_source(code, "test_cell")
        codes = [f.code for f in findings]
        self.assertIn("P012", codes)

    def test_l018_direct_lake_small_files(self):
        code = """
        df.write.format("delta").partitionBy("country", "region", "year", "month", "day").save(target)
        """
        findings = lint_source(code, "test_cell")
        codes = [f.code for f in findings]
        self.assertIn("L018", codes)

    def test_burst_debt_calculation(self):
        debt = calculate_burst_debt("F64", avg_burst_vcores=256, duration_minutes=120)
        self.assertEqual(debt["sku"], "F64")
        self.assertTrue(debt["debt_cu_seconds"] > 0)
        self.assertEqual(debt["throttling_risk_phase"], "PHASE_2_BACKGROUND_REJECTION")

    def test_high_concurrency_advisor(self):
        adv = high_concurrency_advisor(active_sessions=8, total_node_memory_gb=64)
        self.assertEqual(adv.value, "CRITICAL_MEMORY_CONTENTION")
        
        adv_healthy = high_concurrency_advisor(active_sessions=2, total_node_memory_gb=64)
        self.assertEqual(adv_healthy.value, "CONCURRENCY_OK")


    # ------------------------------------------------------------------ L019 / L020 / L021
    def test_L019_vorder_missing_on_gold_write(self):
        code = 'df.write.mode("overwrite").saveAsTable("gold.fact_sales")'
        self.assertIn("L019", [f.code for f in lint_source(code, "c")])

    def test_L019_not_raised_when_vorder_present(self):
        code = ('spark.conf.set("spark.sql.parquet.vorder.default", "true")\n'
                'df.write.mode("overwrite").saveAsTable("gold.fact_sales")')
        self.assertNotIn("L019", [f.code for f in lint_source(code, "c")])

    def test_L019_not_raised_on_bronze(self):
        # V-Order on landing tables costs write throughput for no serving benefit.
        code = 'df.write.mode("append").saveAsTable("bronze.raw_events")'
        self.assertNotIn("L019", [f.code for f in lint_source(code, "c")])

    def test_L020_vacuum_below_retention_floor(self):
        code = 'spark.sql("VACUUM silver.orders RETAIN 24 HOURS")'
        f = [x for x in lint_source(code, "c") if x.code == "L020"]
        self.assertTrue(f, "expected L020")
        self.assertEqual(f[0].severity, "critical")

    def test_L020_vacuum_at_floor_is_clean(self):
        code = 'spark.sql("VACUUM silver.orders RETAIN 168 HOURS")'
        self.assertNotIn("L020", [f.code for f in lint_source(code, "c")])

    def test_L020_retention_check_disabled(self):
        code = 'spark.conf.set("spark.databricks.delta.retentionDurationCheck.enabled", "false")'
        self.assertIn("L020", [f.code for f in lint_source(code, "c")])

    def test_L021_high_cardinality_partition(self):
        code = 'df.write.partitionBy("event_timestamp").save("/lake/t")'
        self.assertIn("L021", [f.code for f in lint_source(code, "c")])

    def test_L021_low_cardinality_partition_is_clean(self):
        code = 'df.write.partitionBy("region").save("/lake/t")'
        self.assertNotIn("L021", [f.code for f in lint_source(code, "c")])

    # ------------------------------------------------------------------ P015
    def test_P015_conversion_churn(self):
        plan = "ColumnarToRow\nRowToColumnar\nColumnarToRow\nRowToColumnar\nProject"
        self.assertIn("P015", [f.code for f in analyze_plan_text(plan, "p")])

    def test_P015_quiet_on_clean_native_plan(self):
        plan = "VeloxHashAggregate\nVeloxProject\nColumnarToRow"
        self.assertNotIn("P015", [f.code for f in analyze_plan_text(plan, "p")])

    # ------------------------------------------------------------------ throttling forecast
    def test_throttling_stage1_delay(self):
        r = forecast_fabric_throttling("F64", 90.0, carryover_ratio=0.004)
        self.assertEqual(r["throttle_stage"], 1)
        self.assertEqual(r["interactive_jobs"], "DELAYED")
        self.assertEqual(r["background_jobs"], "RUNNING")

    def test_throttling_stage2_interactive_rejection(self):
        r = forecast_fabric_throttling("F64", 110.0, carryover_ratio=0.02)
        self.assertEqual(r["throttle_stage"], 2)
        self.assertEqual(r["interactive_jobs"], "REJECTED")
        self.assertEqual(r["background_jobs"], "RUNNING")

    def test_throttling_stage3_background_rejection(self):
        r = forecast_fabric_throttling("F64", 150.0, carryover_ratio=0.05)
        self.assertEqual(r["throttle_stage"], 3)
        self.assertEqual(r["background_jobs"], "REJECTED")

    def test_throttling_rejects_unknown_sku(self):
        with self.assertRaises(KeyError):
            forecast_fabric_throttling("F999", 50.0, 0.0)

    # ------------------------------------------------------------------ NEE off-heap split
    def test_nee_offheap_split_sizes_and_scope(self):
        recs = recommend_nee_memory_split(64, is_nee_enabled=True)
        d = {r.key: r.value for r in recs}
        self.assertEqual(d["spark.memory.offHeap.enabled"], "true")
        self.assertEqual(d["spark.memory.offHeap.size"], "19g")   # 30% of 64
        for r in recs:
            if r.key.startswith("spark.memory.offHeap"):
                self.assertEqual(r.scope, "session_start")

    def test_nee_offheap_empty_when_disabled(self):
        self.assertEqual(recommend_nee_memory_split(64, is_nee_enabled=False), [])

    def test_nee_offheap_rejects_absurd_ratio(self):
        with self.assertRaises(ValueError):
            recommend_nee_memory_split(64, True, off_heap_ratio=0.95)

    def test_spark_native_is_session_start_scope(self):
        from spark_autoconfig_core import _scope_for_key
        self.assertEqual(_scope_for_key("spark.native.enabled"), "session_start")


if __name__ == "__main__":
    unittest.main()
