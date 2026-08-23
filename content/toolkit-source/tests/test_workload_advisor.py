import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fabric_workload_advisor import *

# capacity math
c = capacity_summary("F64", "Medium")
assert c["base_spark_vcores"] == 128 and c["burst_spark_vcores"] == 384
assert c["max_nodes_base"] == 16 and c["max_nodes_burst"] == 48

j = job_cu_cost(4, "Medium", 30)
assert j["vcores"] == 32 and j["cu_seconds"] == 32*30*60/2  # 28800

a = admission_check("F8", "Large", job_min_nodes=4)  # 4x16=64 vs burst 48 -> reject
assert a.value == "REJECTED_OR_QUEUED"
a2 = admission_check("F64", "Medium", job_min_nodes=2, concurrent_vcores_in_use=300)
assert a2.value == "ADMITTED"  # 384-300=84 >= 16

# engine choice
e1 = choose_engine(3, needs_distributed_shuffle=False)
assert e1[0].value == "python-notebook"
e2 = choose_engine(3, needs_distributed_shuffle=False, writes_gold_vorder=True)
assert e2[0].value == "spark"  # V-Order hard rule overrides size
e3 = choose_engine(500, needs_distributed_shuffle=True, runtime="fabric-2.0")
assert e3[0].value == "spark"  # distributed-shuffle hard rule fires first
assert any(x.key == "ansi_note" for x in e3)  # 4.x ANSI note surfaces

# spill risk: Medium node fully used 8 cores, 128MB partitions, 4x expansion
r = spill_risk(64, 8, 128)  # usable=(65536-300)*0.6=39141MB; per-core 4892 >= 512 -> LOW
assert any(x.value == "LOW" for x in r)
r2 = spill_risk(8, 8, 512, expansion_factor=5)  # per-core ~578MB < 2560 -> HIGH
assert any(x.value == "HIGH" for x in r2)
print([x.reason for x in r2 if x.value=="HIGH"][0][:140])

# table properties
tp = recommend_table_properties(50, "silver", "merge", "bi", runtime="fabric-1.3")
keys = [x.key for x in tp]
assert "delta.enableDeletionVectors" in keys and "delta.enableChangeDataFeed" in keys
assert "CLUSTER BY" in keys
lc = [x for x in tp if x.key=="CLUSTER BY"][0]
assert "preview" in lc.reason
tp2 = recommend_table_properties(50, "gold", "overwrite", "bi", runtime="fabric-2.0")
vord = [x for x in tp2 if x.key=="spark.sql.parquet.vorder.default"][0]
assert vord.value == "true"

# session conf: 2.0 native_speed sets ansi false; 1.3 default sets nothing ansi
c20 = build_session_conf("fabric-2.0", ansi_strategy="native_speed", enable_efficient_scaledown=True)
assert c20["spark.sql.ansi.enabled"] == "false" and c20["spark.remote.shuffle.enabled"] == "true"
c13 = build_session_conf("fabric-1.3")
assert "spark.sql.ansi.enabled" not in c13 and c13["spark.native.enabled"] == "true"
magic = render_configure_magic(c20)
import json; parsed = json.loads(magic.replace("%%configure -f\n",""))
assert parsed["conf"]["spark.sql.ansi.enabled"] == "false"

print("ALL WORKLOAD ADVISOR TESTS PASSED")
