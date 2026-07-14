# Provenance — Microsoft Fabric official icons

Vendored under the terms in [docs/official-icon-policy.md](../../../../docs/official-icon-policy.md)
and the [Microsoft Fabric product, experience, and item icons](https://learn.microsoft.com/en-us/fabric/fundamentals/icons)
Learn page.

- **Upstream package:** [`@fabric-msft/svg-icons`](https://www.npmjs.com/package/@fabric-msft/svg-icons)
  (npm), the package the Learn page itself links to for programmatic/dev use of the same icon set.
  The Learn page's GitHub "Download" link (`microsoft/fabric-samples/docs-samples/Icons.zip`)
  resolved to an unrelated `@fluentui/svg-icons` archive at the time of retrieval and was not used.
- **Package version:** 8.2.0
- **Package license:** MIT (per package.json)
- **Retrieved:** 2026-07-14, via `npm pack @fabric-msft/svg-icons`
- **Integrity:** sha512-0mp+BNc2V7kvi...LBYoQKBxv/dug== (shasum `273b803fbb8a0e31be02cc6da5139afad4b66ca3`)

## Vendored subset

Only icons used by Fabric Atlas diagrams are kept, not the full 1,659-file collection. Product/
workload icons use the upstream `_color` variant (preserves official multi-tone fill); Fabric item
icons use the upstream `_item` variant (no separate color variant exists for items upstream).

| File | Upstream source | Represents |
|---|---|---|
| `svg/data_factory_32_color.svg` | `data_factory_32_color.svg` | Data Factory workload |
| `svg/data_science_32_color.svg` | `data_science_32_color.svg` | Data Science workload |
| `svg/data_warehouse_32_color.svg` | `data_warehouse_32_color.svg` | Data Warehouse workload |
| `svg/power_bi_32_color.svg` | `power_bi_32_color.svg` | Power BI workload |
| `svg/copilot_32_color.svg` | `copilot_32_color.svg` | Copilot (embedded AI) |
| `svg/purview_32_color.svg` | `purview_32_color.svg` | Purview governance |
| `svg/real_time_intelligence_32_color.svg` | `real_time_intelligence_32_color.svg` | Real-Time Intelligence workload |
| `svg/one_lake_32_color.svg` | `one_lake_32_color.svg` | OneLake |
| `svg/lakehouse_item_32.svg` | `lakehouse_32_item.svg` | Lakehouse item |
| `svg/notebook_item_32.svg` | `notebook_32_item.svg` | Notebook item |
| `svg/dataflow_gen2_item_32.svg` | `dataflow_gen2_32_item.svg` | Dataflow Gen2 item |
| `svg/eventstream_item_32.svg` | `eventstream_32_item.svg` | Eventstream item |
| `svg/event_house_item_32.svg` | `event_house_32_item.svg` | Eventhouse item |
| `svg/semantic_model_item_32.svg` | `semantic_model_32_item.svg` | Semantic model item |
| `svg/data_warehouse_item_32.svg` | `data_warehouse_32_item.svg` | Warehouse item |

## Required practice (per official-icon-policy.md)

- Every embedded use in an authored diagram gets wrapped with
  `<g data-official-icon="microsoft" data-icon-name="<upstream file name>">`.
- A product/item name label sits next to every icon use — the icon is never the sole label.
- Shape, aspect ratio, orientation, and color are preserved as vendored; no recoloring or redrawing.
- To add another icon: `npm pack @fabric-msft/svg-icons@<same or newer version>`, copy the needed
  SVG from `svg/` in the extracted tarball, add a row to the table above, note the new retrieval
  date if the package version changed.
