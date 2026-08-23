from pyspark.sql import SparkSession
builder = (
    SparkSession.builder.appName("probe")
    .master("local[4]")
    .config("spark.driver.memory", "2g")
)
spark = builder.getOrCreate()
spark.sparkContext.setLogLevel("ERROR")

keys_to_probe = {
    "spark.sql.shuffle.partitions": "300",
    "spark.sql.adaptive.enabled": "true",
    "spark.sql.adaptive.coalescePartitions.enabled": "true",
    "spark.sql.adaptive.coalescePartitions.parallelismFirst": "false",
    "spark.sql.adaptive.advisoryPartitionSizeInBytes": "134217728",
    "spark.sql.adaptive.skewJoin.enabled": "true",
    "spark.sql.files.maxPartitionBytes": "134217728",
    "spark.sql.files.openCostInBytes": "4194304",
    "spark.sql.autoBroadcastJoinThreshold": "10485760",
    "spark.executor.cores": "5",
    "spark.executor.memory": "4g",
    "spark.executor.memoryOverhead": "1g",
    "spark.memory.fraction": "0.7",
    "spark.memory.storageFraction": "0.6",
    "spark.driver.memory": "3g",
    "spark.dynamicAllocation.enabled": "true",
    "spark.dynamicAllocation.minExecutors": "2",
    "spark.dynamicAllocation.maxExecutors": "10",
    "spark.dynamicAllocation.executorIdleTimeout": "90s",
    "spark.memory.offHeap.enabled": "true",
    "spark.memory.offHeap.size": "1g",
    "spark.remote.shuffle.enabled": "true",  # expect: not a real key in OSS Spark, just verify no crash pattern differs
}

results = {}
for k, v in keys_to_probe.items():
    try:
        spark.conf.set(k, v)
        results[k] = "MUTABLE (spark.conf.set worked)"
    except Exception as e:
        etype = type(e).__name__
        results[k] = f"IMMUTABLE ({etype}: {str(e)[:80]})"

for k, v in results.items():
    print(f"{k:55s} -> {v}")

spark.stop()
