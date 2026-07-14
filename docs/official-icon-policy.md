# Official Microsoft icon policy

Fabric Atlas diagrams may use official Microsoft Fabric, Azure, Microsoft Entra, Microsoft 365,
and Power Platform architecture icons when Microsoft publishes the icon for diagram or
documentation use.

The controlling sources are the Microsoft Learn terms for each collection. In particular:

- [Microsoft Fabric product, workload, and item icons](https://learn.microsoft.com/en-us/fabric/fundamentals/icons)
- [Azure architecture icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)
- [Microsoft Power Platform icons](https://learn.microsoft.com/en-us/power-platform/guidance/icons)

Microsoft permits these official collections to be copied, distributed, and displayed in
architecture diagrams, training materials, and documentation. That permission does not make the
icons general-purpose open-source artwork and does not transfer Microsoft's remaining rights.

## Required use

- Obtain icons only from a Microsoft Learn download, a Microsoft-owned repository linked by that
  page, or an official Microsoft package linked by that page. For Fabric, the canonical download is
  the Microsoft-owned `fabric-samples/docs-samples/Icons.zip` collection.
- Use an icon only to identify the Microsoft product, workload, experience, or item it represents.
- Put the corresponding product or item name next to the icon. The icon cannot be the only label.
- Preserve the upstream shape, aspect ratio, orientation, and colors. Do not crop, flip, rotate,
  distort, trace, redraw, recolor, or combine it into a new mark.
- Keep each diagram's composition, explanatory panels, connectors, annotations, and non-product
  glyphs original. Permission to use an icon is not permission to copy a Microsoft diagram.
- Record provenance when icons are vendored: upstream URL, upstream filename, retrieval date, and
  package version or commit when available. Store that record beside the files under
  `content/diagrams/icons/microsoft/NOTICE.md`.
- Wrap each use in the authored SVG with
  `<g data-official-icon="microsoft" data-icon-name="<upstream icon name>">`. This metadata is not
  visible, but lets publishing validation require provenance and makes later upstream updates
  auditable.
- Keep vendored files limited to the icons actually used. Do not commit an entire icon archive by
  default.

## Prohibited use

- Do not use a Microsoft product icon as the Fabric Atlas logo, favicon, application identity,
  endorsement badge, or representation of a non-Microsoft service.
- Do not use official icons in promotional branding or marketing artwork outside the permitted
  architecture, training, slide, and documentation contexts.
- Do not import icons from community mirrors, search results, screenshots, blogs, or unofficial
  packages.
- Do not use third-party vendor logos unless that vendor publishes comparable terms and the
  repository records the source and permission separately.

Official icons are optional. When no approved icon exists, use an original product-neutral vector
glyph and do not approximate a Microsoft trademark.
