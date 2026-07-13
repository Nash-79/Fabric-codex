import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const assets = JSON.parse(readFileSync(join(root, "content/diagrams/assets.json"), "utf8"));
const diagrams = assets.map((asset) => ({
  slug: basename(asset.path, ".svg"),
  markup: readFileSync(join(root, asset.path), "utf8"),
}));
const browser = [
  process.env.DIAGRAM_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
]
  .filter(Boolean)
  .find(existsSync);
if (!browser) throw new Error("Diagram layout validation needs Edge/Chrome or DIAGRAM_BROWSER.");

const temp = mkdtempSync(join(tmpdir(), "fabric-atlas-diagram-layout-"));
const htmlPath = join(temp, "index.html");
const payload = JSON.stringify(diagrams).replace(/</g, "\\u003c");
writeFileSync(
  htmlPath,
  `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;overflow-x:hidden}#stage{position:absolute;left:-20000px;top:0;width:1280px}.frame{overflow:hidden}.frame>svg{display:block;width:100%;height:100%}</style><div id="stage"></div><script>window.diagrams=${payload}</script>`,
);

const port = 9300 + Math.floor(Math.random() * 500);
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
  { stdio: "ignore" },
);

const auditExpression = `(()=>{
const widths=[390,768,1280],failures=[],stage=document.querySelector('#stage');
const transformedBox=(element,svg)=>{const box=element.getBBox(),root=svg.getScreenCTM(),own=element.getScreenCTM();if(!root||!own)return null;const matrix=root.inverse().multiply(own);const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}};
for(const diagram of window.diagrams){
 const probe=document.createElement('div');probe.innerHTML=diagram.markup;const svg=probe.firstElementChild,vb=svg?.viewBox?.baseVal;
 if(!svg||!vb?.width||!vb?.height){failures.push(diagram.slug+': invalid viewBox');continue}
 for(const width of widths){const frame=document.createElement('div');frame.className='frame';frame.style.width=width+'px';frame.style.height=(width*vb.height/vb.width)+'px';frame.append(svg.cloneNode(true));stage.append(frame);const rendered=frame.firstElementChild.getBoundingClientRect(),container=frame.getBoundingClientRect();if(rendered.left<container.left-.5||rendered.right>container.right+.5||rendered.top<container.top-.5||rendered.bottom>container.bottom+.5)failures.push(diagram.slug+': SVG escapes '+width+'px frame');if(frame.scrollWidth>frame.clientWidth+1)failures.push(diagram.slug+': horizontal overflow at '+width+'px');frame.remove()}
 stage.append(svg);const visibleText=element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE||node.nodeName.toLowerCase()==='tspan').map(node=>node.textContent).join(' ').trim();const texts=[...svg.querySelectorAll('text')].filter(t=>{const style=getComputedStyle(t);return visibleText(t)&&style.display!=='none'&&style.visibility!=='hidden'&&style.fill!=='none'&&Number(style.opacity)!==0});const boxes=texts.map(element=>({element,box:transformedBox(element,svg)})).filter(x=>x.box);
 for(const {element,box} of boxes)if(box.x<vb.x-1||box.y<vb.y-1||box.right>vb.x+vb.width+1||box.bottom>vb.y+vb.height+1)failures.push(diagram.slug+': text outside viewBox: "'+visibleText(element).slice(0,70)+'"');
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],w=Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x),h=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y);if(w>1&&h>1){const area=w*h,aa=(a.box.right-a.box.x)*(a.box.bottom-a.box.y),ba=(b.box.right-b.box.x)*(b.box.bottom-b.box.y);if(area/Math.min(aa,ba)>.45)failures.push(diagram.slug+': overlapping text: "'+visibleText(a.element).slice(0,45)+'" / "'+visibleText(b.element).slice(0,45)+'"')}}
 for(const region of svg.querySelectorAll('[data-node-id]')){const box=transformedBox(region,svg);if(!box||(box.right-box.x)<1||(box.bottom-box.y)<1)failures.push(diagram.slug+': empty node region '+region.dataset.nodeId)}svg.remove();
}
return [...new Set(failures)];})()`;

async function pageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === "page");
      if (target) return target;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Timed out connecting to the headless browser.");
}

try {
  const target = await pageTarget();
  const failures = await new Promise((resolveResult, rejectResult) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(
      () => rejectResult(new Error("Diagram browser audit timed out.")),
      120_000,
    );
    socket.addEventListener("open", () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression: auditExpression, returnByValue: true, awaitPromise: true },
        }),
      ),
    );
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails)
        rejectResult(
          new Error(message.result.exceptionDetails.text ?? "Browser evaluation failed."),
        );
      else resolveResult(message.result.result.value);
    });
    socket.addEventListener("error", () => rejectResult(new Error("Browser connection failed.")));
  });
  if (failures.length) {
    console.error(
      `Diagram layout validation failed (${failures.length}):\n- ${failures.join("\n- ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Diagram layout validation passed: ${diagrams.length} SVGs at 390px, 768px, and 1280px with no text collisions or overflow.`,
    );
  }
} finally {
  child.kill();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  try {
    rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    // Edge can briefly retain its disposable profile on Windows after the CDP page closes. A
    // cleanup race must not turn a successful geometry audit into a validation failure.
    if (error.code !== "EPERM") throw error;
  }
}
