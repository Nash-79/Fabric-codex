import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from spark_autoconfig_core import (
    DataProfile, ClusterProfile, WorkloadHints, build_full_recommendation,
    estimate_shuffle_partitions, nearest_fabric_node, recommend_broadcast_threshold,
    FABRIC_NODE_SIZES,
)

def show(title, recs):
    print(f"\n=== {title} ===")
    for r in recs:
        print(f"  [{r.basis:13s}] {r.key:55s} = {r.value}")

# --- Scenario 1: small Fabric ETL job on a Medium starter pool ---
d1 = DataProfile(total_bytes=int(15 * 1024**3), file_count=120)  # 15 GB, 120 files
c1 = ClusterProfile(platform="fabric", node_size="Medium", num_nodes=4)
w1 = WorkloadHints(kind="batch_etl")
recs1 = build_full_recommendation(d1, c1, w1, enable_efficient_scaledown=False)
show("Scenario 1: 15GB Fabric ETL, Medium x4 nodes", recs1)
assert any(r.key == "spark.sql.shuffle.partitions" for r in recs1)
assert int(recs1[0].value) > 0

# --- Scenario 2: large Fabric job, cache-heavy ML feature prep, expected skew ---
d2 = DataProfile(total_bytes=int(2 * 1024**4), file_count=400000, expected_skew=True,
                  smallest_join_side_bytes=int(180 * 1024**2))  # 2 TB, 400k small files (~5MB avg), 180MB join side
c2 = ClusterProfile(platform="fabric", node_size="Large", num_nodes=10)
w2 = WorkloadHints(kind="ml_training", cache_heavy=True)
recs2 = build_full_recommendation(d2, c2, w2, enable_efficient_scaledown=True)
show("Scenario 2: 2TB Fabric ML prep, Large x10 nodes, cache-heavy + skew", recs2)
assert any("openCostInBytes" in r.key for r in recs2), "small-files advice should trigger for 40k files over 2TB"
assert any(r.key == "spark.remote.shuffle.enabled" for r in recs2)

# --- Scenario 3: generic OSS Spark on YARN, no Fabric specifics ---
d3 = DataProfile(total_bytes=int(500 * 1024**3), file_count=2000)
c3 = ClusterProfile(platform="oss", num_nodes=8, node_vcores=16, node_memory_gb=64, driver_memory_gb=16)
w3 = WorkloadHints(kind="batch_etl")
recs3 = build_full_recommendation(d3, c3, w3)
show("Scenario 3: 500GB generic YARN Spark, 8 nodes x16 vCore/64GB", recs3)
assert any(r.key == "spark.executor.cores" for r in recs3)
assert any(r.key == "_executors_per_node" for r in recs3)

# --- Unit checks on individual functions ---
assert nearest_fabric_node(10)["name"] == "Large"
assert nearest_fabric_node(4)["name"] == "Small"
assert nearest_fabric_node(100)["name"] == "XXLarge"

r_broadcast_default = recommend_broadcast_threshold(None)
assert r_broadcast_default.value == str(10 * 1024 * 1024)

r_broadcast_known = recommend_broadcast_threshold(50 * 1024 * 1024)
assert int(r_broadcast_known.value) >= 50 * 1024 * 1024

# shuffle partitions: parallelism floor should dominate for tiny data on a big cluster
tiny_rec = estimate_shuffle_partitions(total_input_bytes=10 * 1024 * 1024, total_executor_vcores=200)
assert int(tiny_rec.value) == 400, f"expected parallelism floor 400, got {tiny_rec.value}"

# shuffle partitions: size should dominate for huge data on a small cluster
huge_rec = estimate_shuffle_partitions(total_input_bytes=500 * 1024**3, total_executor_vcores=8)
assert int(huge_rec.value) > 16

print("\nALL ASSERTIONS PASSED")
