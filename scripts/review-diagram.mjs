import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const assets = JSON.parse(readFileSync(join(root, "content/diagrams/assets.json"), "utf8"));

// Parse CLI args: --slug <slug> or default to all
const args = process.argv.slice(2);
let targetSlug = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--slug" && args[i + 1]) {
    targetSlug = args[i + 1].replace(/\.svg$/, "");
    i++;
  }
}

const targetAssets = targetSlug
  ? assets.filter((a) => basename(a.path, ".svg") === targetSlug)
  : assets;

if (targetSlug && targetAssets.length === 0) {
  console.error(`Error: Diagram slug "${targetSlug}" not found in assets.json.`);
  process.exit(1);
}

const diagrams = targetAssets.map((asset) => {
  const slug = basename(asset.path, ".svg");
  const svgPath = join(root, asset.path);
  const jsonPath = join(root, "content/diagrams", `${slug}.diagram.json`);
  return {
    slug,
    svgPath,
    jsonPath,
    markup: readFileSync(svgPath, "utf8"),
    sidecar: existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, "utf8")) : null,
  };
});

const browser = [
  process.env.DIAGRAM_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
]
  .filter(Boolean)
  .find(existsSync);

if (!browser) {
  console.error("Error: Diagram review requires Edge/Chrome or DIAGRAM_BROWSER.");
  process.exit(1);
}

const temp = mkdtempSync(join(tmpdir(), "fabric-atlas-diagram-review-"));
const htmlPath = join(temp, "index.html");
const payload = JSON.stringify(
  diagrams.map((d) => ({ slug: d.slug, markup: d.markup }))
).replace(/</g, "\\u003c");

writeFileSync(
  htmlPath,
  `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden}#stage{position:absolute;left:-20000px;top:0;width:1280px}.frame{overflow:hidden}.frame>svg{display:block;width:100%;height:100%}</style><div id="stage"></div><script>window.diagrams=${payload}</script>`
);

const port = 9400 + Math.floor(Math.random() * 500);
const child = spawn(
  browser,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(temp, "profile")}`,
    `file:///${htmlPath.replaceAll("\\", "/")}`,
  ],
  { stdio: "ignore" }
);

const auditExpression = `(()=>{
try {
const viewports=[
  {name:'Mobile',width:390},
  {name:'Tablet',width:768},
  {name:'Laptop',width:1024},
  {name:'Desktop',width:1280}
];
const results = {};
let stage = document.querySelector('#stage');
if (!stage) {
  stage = document.createElement('div');
  stage.id = 'stage';
  stage.style.cssText = 'position:absolute;left:-20000px;top:0;width:1280px;';
  const parent = document.body || document.documentElement;
  if (parent) {
    parent.appendChild(stage);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(stage));
  }
}

const transformedBox=(element,svg)=>{
  const box=element.getBBox(),root=svg.getScreenCTM(),own=element.getScreenCTM();
  if(!root||!own)return null;
  const matrix=root.inverse().multiply(own);
  const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return{x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
};

const diagramsToAudit = (window.diagrams && window.diagrams.length > 0) ? window.diagrams : ${payload};
for(const diagram of diagramsToAudit){
  const probe=document.createElement('div');
  probe.innerHTML=diagram.markup;
  const svg=probe.firstElementChild;
  const vb=svg?.viewBox?.baseVal;
  
  const diagResult = {
    slug: diagram.slug,
    viewBox: vb ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height } : null,
    viewports: {},
    collisions: [],
    overflows: [],
    emptyRegions: [],
    textMetrics: {
      totalTextNodes: 0,
      fontSizes: [],
      smallTexts: [] // font-size < 10px
    },
    iconsCount: svg.querySelectorAll('[data-official-icon="microsoft"], [data-icon-name]').length,
    gradientsCount: svg.querySelectorAll('linearGradient, radialGradient').length,
    filterCount: svg.querySelectorAll('filter').length,
    nodeRegionsCount: svg.querySelectorAll('[data-node-id]').length,
    tooltipsCount: svg.querySelectorAll('title[data-node-tooltip="true"]').length
  };

  if(!svg||!vb?.width||!vb?.height){
    diagResult.error = 'Invalid viewBox';
    results[diagram.slug] = diagResult;
    continue;
  }

  // Check multi-device rendering across viewports
  for(const vp of viewports){
    const frame=document.createElement('div');
    frame.className='frame';
    frame.style.width=vp.width+'px';
    frame.style.height=(vp.width*vb.height/vb.width)+'px';
    frame.append(svg.cloneNode(true));
    stage.append(frame);
    
    const rendered=frame.firstElementChild.getBoundingClientRect();
    const container=frame.getBoundingClientRect();
    const escapes = (rendered.left < container.left - 0.5 || rendered.right > container.right + 0.5 || rendered.top < container.top - 0.5 || rendered.bottom > container.bottom + 0.5);
    const hasScroll = frame.scrollWidth > frame.clientWidth + 1;
    
    diagResult.viewports[vp.name] = {
      width: vp.width,
      height: Math.round(vp.width*vb.height/vb.width),
      renderedWidth: Math.round(rendered.width),
      escapes,
      hasScroll,
      status: (!escapes && !hasScroll) ? 'PASS' : 'FAIL'
    };
    frame.remove();
  }

  stage.append(svg);
  const visibleText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE||n.nodeName.toLowerCase()==='tspan').map(n=>n.textContent).join(' ').trim();
  const texts=[...svg.querySelectorAll('text')].filter(t=>{
    const s=getComputedStyle(t);
    return visibleText(t)&&s.display!=='none'&&s.visibility!=='hidden'&&s.fill!=='none'&&Number(s.opacity)!==0;
  });

  diagResult.textMetrics.totalTextNodes = texts.length;

  const boxes=texts.map(element=>{
    const box = transformedBox(element, svg);
    const size = parseFloat(element.getAttribute('font-size') || getComputedStyle(element).fontSize) || 12;
    const text = visibleText(element);
    return { element, box, size, text };
  }).filter(x=>x.box);

  for(const {element,box,size,text} of boxes){
    diagResult.textMetrics.fontSizes.push(size);
    if(size < 10) {
      diagResult.textMetrics.smallTexts.push({ text: text.slice(0, 50), size });
    }
    if(box.x < vb.x - 1 || box.y < vb.y - 1 || box.right > vb.x + vb.width + 1 || box.bottom > vb.y + vb.height + 1){
      diagResult.overflows.push({ text: text.slice(0, 60), box });
    }
  }

  for(let i=0; i<boxes.length; i++){
    for(let j=i+1; j<boxes.length; j++){
      const a=boxes[i], b=boxes[j];
      const w=Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x);
      const h=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y);
      if(w>1 && h>1){
        const area=w*h;
        const aa=a.box.width*a.box.height;
        const ba=b.box.width*b.box.height;
        if(area/Math.min(aa,ba) > 0.45){
          diagResult.collisions.push({ type: 'text-on-text', textA: a.text.slice(0, 40), textB: b.text.slice(0, 40) });
        }
      }
    }
  }

  // Rect-to-text boundary overflow check (ensure text doesn't poke out of containing cards)
  const cards = [...svg.querySelectorAll('rect')].filter(r => {
    const s = getComputedStyle(r);
    const w = parseFloat(r.getAttribute('width') || s.width);
    const h = parseFloat(r.getAttribute('height') || s.height);
    return w > 50 && h > 20 && w < (vb.width - 20) && s.display !== 'none' && s.visibility !== 'hidden';
  }).map(r => ({ element: r, box: transformedBox(r, svg) })).filter(r => r.box);

  for (const { element, box, text } of boxes) {
    for (const card of cards) {
      if (box.x >= card.box.x + 4 && box.x <= card.box.right - 20 &&
          box.y >= card.box.y - 2 && box.bottom <= card.box.bottom + 2) {
        if (box.right > card.box.right + 2) {
          diagResult.collisions.push({
            type: 'text-card-overflow',
            text: text.slice(0, 50),
            overflowPx: Math.round(box.right - card.box.right)
          });
        }
      }
    }
  }

  // Line-to-text and Path-to-text collision detection
  const lines = [...svg.querySelectorAll('line, polyline, path')].filter(el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && (s.stroke !== 'none' && s.strokeWidth !== '0px');
  });

  const lineSegmentIntersectsBox = (x1, y1, x2, y2, box) => {
    // Check if either endpoint is inside
    if (x1 >= box.x && x1 <= box.right && y1 >= box.y && y1 <= box.bottom) return true;
    if (x2 >= box.x && x2 <= box.right && y2 >= box.y && y2 <= box.bottom) return true;
    // Check bounding box overlap first
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (maxX < box.x || minX > box.right || maxY < box.y || minY > box.bottom) return false;
    // Vertical line special case
    if (Math.abs(x1 - x2) < 0.1) {
      return x1 >= box.x && x1 <= box.right && minY <= box.bottom && maxY >= box.y;
    }
    // Horizontal line special case
    if (Math.abs(y1 - y2) < 0.1) {
      return y1 >= box.y && y1 <= box.bottom && minX <= box.right && maxX >= box.x;
    }
    // Line equation y = m*x + c
    const m = (y2 - y1) / (x2 - x1);
    const c = y1 - m * x1;
    // Test x at box.y and box.bottom
    const xAtTop = (box.y - c) / m;
    if (xAtTop >= box.x && xAtTop <= box.right && xAtTop >= minX && xAtTop <= maxX) return true;
    const xAtBottom = (box.bottom - c) / m;
    if (xAtBottom >= box.x && xAtBottom <= box.right && xAtBottom >= minX && xAtBottom <= maxX) return true;
    // Test y at box.x and box.right
    const yAtLeft = m * box.x + c;
    if (yAtLeft >= box.y && yAtLeft <= box.bottom && yAtLeft >= minY && yAtLeft <= maxY) return true;
    const yAtRight = m * box.right + c;
    if (yAtRight >= box.y && yAtRight <= box.bottom && yAtRight >= minY && yAtRight <= maxY) return true;
    return false;
  };

  const transformPoint = (element, svg, x, y) => {
    const root = svg.getScreenCTM(), own = element.getScreenCTM();
    if (!root || !own) return { x, y };
    const matrix = root.inverse().multiply(own);
    const p = new DOMPoint(x, y).matrixTransform(matrix);
    return { x: p.x, y: p.y };
  };

  for (const lineEl of lines) {
    if (lineEl.tagName.toLowerCase() === 'line') {
      const rawX1 = parseFloat(lineEl.getAttribute('x1') || 0);
      const rawY1 = parseFloat(lineEl.getAttribute('y1') || 0);
      const rawX2 = parseFloat(lineEl.getAttribute('x2') || 0);
      const rawY2 = parseFloat(lineEl.getAttribute('y2') || 0);
      const p1 = transformPoint(lineEl, svg, rawX1, rawY1);
      const p2 = transformPoint(lineEl, svg, rawX2, rawY2);
      for (const { box, text } of boxes) {
        if (lineSegmentIntersectsBox(p1.x, p1.y, p2.x, p2.y, box)) {
          diagResult.collisions.push({
            type: 'line-through-text',
            textA: 'Line (' + Math.round(p1.x) + ',' + Math.round(p1.y) + ' -> ' + Math.round(p2.x) + ',' + Math.round(p2.y) + ')',
            textB: text.slice(0, 50)
          });
        }
      }
    } else if (lineEl.tagName.toLowerCase() === 'path' && typeof lineEl.getTotalLength === 'function') {
      try {
        const len = lineEl.getTotalLength();
        if (len > 5) {
          const steps = Math.min(60, Math.max(10, Math.floor(len / 15)));
          for (let s = 0; s <= steps; s++) {
            const rawPt = lineEl.getPointAtLength((s / steps) * len);
            const pt = transformPoint(lineEl, svg, rawPt.x, rawPt.y);
            for (const { box, text } of boxes) {
              if (pt.x >= box.x && pt.x <= box.right && pt.y >= box.y && pt.y <= box.bottom) {
                diagResult.collisions.push({
                  type: 'path-through-text',
                  textA: 'Path crossing',
                  textB: text.slice(0, 50)
                });
                break;
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  for(const region of svg.querySelectorAll('[data-node-id]')){
    const box=transformedBox(region,svg);
    if(!box || box.width < 1 || box.height < 1){
      diagResult.emptyRegions.push(region.dataset.nodeId);
    }
  }

  svg.remove();
  results[diagram.slug] = diagResult;
}
return results;
} catch (e) {
  return { __browserError: e.stack || String(e) };
}
})()`;

async function pageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === "page");
      if (target) return target;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out connecting to headless browser.");
}

try {
  const target = await pageTarget();
  const rawResults = await new Promise((resolveResult, rejectResult) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => rejectResult(new Error("Review timed out.")), 120_000);
    socket.addEventListener("open", () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: auditExpression, returnByValue: true, awaitPromise: true },
        })
      )
    );
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) {
        rejectResult(new Error(message.result.exceptionDetails.text ?? "Evaluation failed."));
      } else {
        resolveResult(message.result.result.value);
      }
    });
    socket.addEventListener("error", () => rejectResult(new Error("WebSocket failed.")));
  });

  console.log("\n================================================================================");
  console.log("             FABRIC ATLAS DIAGRAM REVIEWER AUDIT REPORT                        ");
  console.log("================================================================================\n");

  if (rawResults?.__browserError) {
    console.error("Browser Evaluation Error:", rawResults.__browserError);
  }

  for (const d of diagrams) {
    const res = rawResults[d.slug];
    if (!res) continue;

    console.log(`📌 DIAGRAM: ${d.slug}`);
    console.log(`   Path: ${d.svgPath}`);
    if (d.sidecar) {
      console.log(`   Title: "${d.sidecar.title}" (Type: ${d.sidecar.type}, LayoutHint: ${d.sidecar.layoutHint || "standard"})`);
    }

    // Scoring calculation
    let score = 100;
    const deductions = [];

    // 1. Overlaps / Collisions
    if (res.collisions.length > 0) {
      score -= res.collisions.length * 15;
      deductions.push(`❌ ${res.collisions.length} text overlap collision(s) detected`);
    }

    // 2. Overflows
    if (res.overflows.length > 0) {
      score -= res.overflows.length * 15;
      deductions.push(`❌ ${res.overflows.length} text element(s) outside viewBox boundary`);
    }

    // 3. Multi-device check
    const deviceFailures = Object.entries(res.viewports).filter(([_, v]) => v.status !== "PASS");
    if (deviceFailures.length > 0) {
      score -= deviceFailures.length * 10;
      deductions.push(`❌ Failed responsive viewport scaling on: ${deviceFailures.map(([k]) => k).join(", ")}`);
    }

    // 4. Icons
    if (res.iconsCount === 0) {
      score -= 10;
      deductions.push(`⚠️ No official Microsoft Fabric vector icons found (recommend embedding official icons)`);
    }

    // 5. Visual Polish (Gradients & Shadows)
    if (res.gradientsCount < 2) {
      score -= 5;
      deductions.push(`⚠️ Low gradient depth (recommend using curated palette linearGradients)`);
    }
    if (res.filterCount === 0) {
      score -= 5;
      deductions.push(`⚠️ No subtle drop shadows (recommend filter="url(#shadow)")`);
    }

    // 6. Typography budgeting
    const fontSizes = res.textMetrics.fontSizes;
    const minSize = fontSizes.length ? Math.min(...fontSizes) : 12;
    const maxSize = fontSizes.length ? Math.max(...fontSizes) : 12;
    if (minSize < 8) {
      score -= 5;
      deductions.push(`⚠️ Micro-text detected (< 8px, hard to read on mobile viewports)`);
    }

    // 7. Grounding & Semantic Sidecar
    if (d.sidecar) {
      const sidecarNodes = d.sidecar.nodes?.length || 0;
      if (res.nodeRegionsCount !== sidecarNodes) {
        score -= 10;
        deductions.push(`⚠️ Node count mismatch: SVG has ${res.nodeRegionsCount} regions, sidecar has ${sidecarNodes} nodes`);
      }
      if (res.tooltipsCount < sidecarNodes) {
        score -= 5;
        deductions.push(`⚠️ Missing tooltips: ${res.tooltipsCount}/${sidecarNodes} node regions have <title data-node-tooltip="true">`);
      }
    }

    score = Math.max(0, score);
    const status = score >= 85 ? "✅ EXCELLENT" : score >= 70 ? "🟡 ACCEPTABLE" : "❌ NEEDS RE-AUTHORING";

    console.log(`   Quality Score: ${score}/100 [${status}]`);
    console.log(`   -----------------------------------------------------------------------------`);
    console.log(`   • Spatial Layout:       ${res.collisions.length === 0 && res.overflows.length === 0 ? "✅ 0 collisions / 0 overflows" : "❌ Collisions or overflows present"}`);
    console.log(`   • Device Scaling:       ${deviceFailures.length === 0 ? "✅ Passed 390px Mobile, 768px Tablet, 1024px Laptop, 1280px Desktop" : "❌ Failed on " + deviceFailures.map(([k]) => k).join(", ")}`);
    console.log(`   • Typography:           ${res.textMetrics.totalTextNodes} text elements (Font range: ${minSize}px – ${maxSize}px)`);
    console.log(`   • Iconography:          ${res.iconsCount > 0 ? `✅ ${res.iconsCount} official Microsoft icon(s)` : "⚠️ 0 official icons"}`);
    console.log(`   • Aesthetics & Polish:  ${res.gradientsCount} gradients, ${res.filterCount} shadow filters`);
    console.log(`   • Semantic Grounding:   ${res.nodeRegionsCount} focusable regions, ${res.tooltipsCount} tooltips`);

    if (deductions.length > 0) {
      console.log(`   Findings & Recommendations:`);
      for (const d of deductions) {
        console.log(`     ${d}`);
      }
    }
    if (res.collisions.length > 0) {
      console.log(`   Detailed Collisions:`);
      for (const c of res.collisions) {
        if (c.type === "text-card-overflow") {
          console.log(`     • [${c.type}] "${c.text}" overflows card by ${c.overflowPx}px`);
        } else if (c.type === "line-through-text" || c.type === "path-through-text") {
          console.log(`     • [${c.type}] ${c.textA || c.line} intersects text: "${c.textB || c.text}"`);
        } else {
          console.log(`     • [${c.type}] "${c.textA}" intersects text: "${c.textB}"`);
        }
      }
    }
    if (res.overflows.length > 0) {
      console.log(`   Detailed Overflows:`);
      for (const o of res.overflows) {
        console.log(`     • "${o.text}" [box: x=${Math.round(o.box.x)}, y=${Math.round(o.box.y)}, r=${Math.round(o.box.right)}, b=${Math.round(o.box.bottom)}]`);
      }
    }
    console.log("\n");
  }
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  try {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    if (error.code !== "EPERM") throw error;
  }
}
