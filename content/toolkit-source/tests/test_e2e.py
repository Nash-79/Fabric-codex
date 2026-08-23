import shutil, os
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from delta import configure_spark_with_delta_pip

WAREHOUSE = "/home/claude/_test_warehouse"
shutil.rmtree(WAREHOUSE, ignore_errors=True)

builder = (
    SparkSession.builder.appName("autoconfig-e2e-test")
    .master("local[4]")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
    .config("spark.driver.memory", "2g")
    .config("spark.executor.cores", "4")
    .config("spark.executor.memory", "2g")
)
spark = configure_spark_with_delta_pip(builder).getOrCreate()
spark.sparkContext.setLogLevel("ERROR")

# ---- Build a synthetic Delta table: 300 small-ish files, ~600MB total ----
big_path = f"{WAREHOUSE}/sales_fact"
df = spark.range(0, 6_000_000).withColumn("amount", (F.col("id") % 1000).cast("double")) \
          .withColumn("region", (F.col("id") % 12).cast("int"))
df.repartition(300).write.format("delta").mode("overwrite").save(big_path)

# ---- Small dimension table for the broadcast-threshold test ----
small_path = f"{WAREHOUSE}/region_dim"
spark.range(0, 12).withColumnRenamed("id", "region").write.format("delta").mode("overwrite").save(small_path)

print("\n--- synthetic data written, now exercising SparkAutoConfigurator ---\n")

import sys
sys.path.insert(0, "/home/claude")
from spark_autoconfig import SparkAutoConfigurator

cfg = SparkAutoConfigurator(spark, platform="oss")  # force oss path (no notebookutils here)

data_profile = cfg.analyze(big_path, table_format="delta",
                            smallest_join_side_path=small_path, smallest_join_side_format="delta",
                            expected_skew=False, estimate_row_count=True)
print("\nDataProfile:", data_profile)
assert data_profile.file_count > 1
assert data_profile.total_bytes > 0
assert data_profile.smallest_join_side_bytes is not None
assert data_profile.estimated_row_count == 6_000_000

cluster_profile = cfg.detect_cluster(node_size=None, num_nodes=4, node_vcores=16, node_memory_gb=64)
print("\nClusterProfile:", cluster_profile)

recs = cfg.recommend(workload="batch_etl", cache_heavy=False, target_partition_mb=128)
print(f"\n{len(recs)} recommendations generated.")

report_text = cfg.report()
assert "SPARK AUTO-CONFIG REPORT" in report_text

applied = cfg.apply(dry_run=False)
print("\n--- verifying configs actually landed in the live SparkSession ---")
for k, v in applied.items():
    live_val = spark.conf.get(k)
    status = "OK" if live_val == v else f"MISMATCH (live={live_val})"
    print(f"  {k} = {v}  [{status}]")
    assert live_val == v, f"{k} did not apply correctly"

print("\nALL END-TO-END CHECKS PASSED")
spark.stop()

# Re-open a fresh session to test the Fabric-flavored path + session_start_snippet rendering
print("\n\n=== Fabric-flavored recommendation + session_start_snippet check ===\n")
spark2 = configure_spark_with_delta_pip(
    SparkSession.builder.appName("autoconfig-e2e-test-2").master("local[4]")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
).getOrCreate()
spark2.sparkContext.setLogLevel("ERROR")

cfg2 = SparkAutoConfigurator(spark2, platform="fabric")
dp2 = cfg2.analyze(big_path, table_format="delta", estimate_row_count=False)
cp2 = cfg2.detect_cluster(node_size="Large", num_nodes=6)
recs2 = cfg2.recommend(workload="batch_etl", enable_efficient_scaledown=True)
applied2 = cfg2.apply(dry_run=False)
snippet_fabric = cfg2.session_start_snippet(as_format="fabric")
print("\n--- %%configure snippet (Fabric) ---")
print(snippet_fabric)
import json
parsed = json.loads(snippet_fabric.replace("%%configure -f\n", ""))
assert "conf" in parsed
assert "spark.remote.shuffle.enabled" in parsed["conf"]
assert parsed["conf"]["spark.remote.shuffle.enabled"] == "true"
print("\nFabric snippet JSON parses correctly and contains Efficient Scaledown keys. PASSED.")
spark2.stop()
