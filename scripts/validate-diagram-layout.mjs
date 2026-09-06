import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { retryDiagramBrowserEvaluation } from "../src/lib/diagram-layout-browser.ts";

const root = resolve(import.meta.dirname, "..");
const assets = JSON.parse(readFileSync(join(root, "content/diagrams/assets.json"), "utf8"));
const diagrams = assets.map((asset) => ({
  slug: basename(asset.path, ".svg"),
  markup: readFileSync(join(root, asset.path), "utf8"),
}));
// Windows paths first (the authoring machines), then the Linux locations CI runners use, so the
// same gate runs in both places without the workflow having to pin an absolute path.
const browser = [
  process.env.DIAGRAM_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
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

// The payload is a multi-megabyte inline script, so the page target becomes connectable well
// before the parser has evaluated it. Awaiting window.diagrams here is what keeps the audit from
// throwing "window.diagrams is not iterable" and reporting a crash instead of a real result.
const auditExpression = `(async()=>{
for(let attempt=0;attempt<300;attempt++){
 if(Array.isArray(window.diagrams)&&window.diagrams.length&&document.querySelector('#stage'))break;
 await new Promise(done=>setTimeout(done,100));
}
if(!Array.isArray(window.diagrams)||!window.diagrams.length)return ['audit payload never finished loading'];
if(!document.querySelector('#stage'))return ['audit stage element missing'];
const widths=[390,768,1280],failures=[],stage=document.querySelector('#stage');
const transformedBox=(element,svg)=>{const box=element.getBBox(),root=svg.getScreenCTM(),own=element.getScreenCTM();if(!root||!own)return null;const matrix=root.inverse().multiply(own);const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}};
for(const diagram of window.diagrams){
 const probe=document.createElement('div');probe.innerHTML=diagram.markup;const svg=probe.firstElementChild,vb=svg?.viewBox?.baseVal;
 if(!svg||!vb?.width||!vb?.height){failures.push(diagram.slug+': invalid viewBox');continue}
 for(const width of widths){const frame=document.createElement('div');frame.className='frame';frame.style.width=width+'px';frame.style.height=(width*vb.height/vb.width)+'px';frame.append(svg.cloneNode(true));stage.append(frame);const rendered=frame.firstElementChild.getBoundingClientRect(),container=frame.getBoundingClientRect();if(rendered.left<container.left-.5||rendered.right>container.right+.5||rendered.top<container.top-.5||rendered.bottom>container.bottom+.5)failures.push(diagram.slug+': SVG escapes '+width+'px frame');if(frame.scrollWidth>frame.clientWidth+1)failures.push(diagram.slug+': horizontal overflow at '+width+'px');frame.remove()}
 stage.append(svg);const visibleText=element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE||node.nodeName.toLowerCase()==='tspan').map(node=>node.textContent).join(' ').trim();const texts=[...svg.querySelectorAll('text')].filter(t=>{const style=getComputedStyle(t);return visibleText(t)&&style.display!=='none'&&style.visibility!=='hidden'&&style.fill!=='none'&&Number(style.opacity)!==0});const boxes=texts.map(element=>({element,box:transformedBox(element,svg),text:visibleText(element)})).filter(x=>x.box);
 for(const {element,box,text} of boxes)if(box.x<vb.x-1||box.y<vb.y-1||box.right>vb.x+vb.width+1||box.bottom>vb.y+vb.height+1)failures.push(diagram.slug+': text outside viewBox: "'+text.slice(0,70)+'"');
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j],w=Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x),h=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y);if(w>1&&h>1){const area=w*h,aa=(a.box.right-a.box.x)*(a.box.bottom-a.box.y),ba=(b.box.right-b.box.x)*(b.box.bottom-b.box.y);if(area/Math.min(aa,ba)>.45)failures.push(diagram.slug+': overlapping text: "'+a.text.slice(0,45)+'" / "'+b.text.slice(0,45)+'"')}}
 for(const region of svg.querySelectorAll('[data-node-id]')){const box=transformedBox(region,svg);if(!box||(box.right-box.x)<1||(box.bottom-box.y)<1)failures.push(diagram.slug+': empty node region '+region.dataset.nodeId)}svg.remove();
}
return [...new Set(failures)];})()`;

// Chrome startup is the flakiest part of this check. 80 x 100ms was 8s, which is comfortable on a
// warm laptop and marginal on a cold CI runner -- it produced intermittent red builds unrelated to
// any diagram. 45s, and a report of why the last attempt failed rather than a bare timeout.
const BROWSER_CONNECT_TIMEOUT_MS = 45_000;

async function pageTarget() {
  const deadline = Date.now() + BROWSER_CONNECT_TIMEOUT_MS;
  let lastError = "no response from the DevTools endpoint";
  while (Date.now() < deadline) {
    // NOTE: deliberately not treating child exit as failure. Chrome commonly re-execs into a
    // background process and the launcher we spawned exits 0 immediately, so a non-null exitCode
    // says nothing about whether the browser is up. The DevTools endpoint below is the real signal.
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === "page");
      if (target) return target;
      lastError = `DevTools listed ${targets.length} target(s), none of type "page"`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(
    `Timed out after ${BROWSER_CONNECT_TIMEOUT_MS / 1000}s connecting to the headless browser on port ${port}. Last attempt: ${lastError}`,
  );
}

try {
  const failures = await retryDiagramBrowserEvaluation(async () => {
    const target = await pageTarget();
    return await new Promise((resolveResult, rejectResult) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      let settled = false;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        callback(value);
      };
      const timer = setTimeout(
        () => settle(rejectResult, new Error("Diagram browser audit timed out.")),
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
        // Anything thrown in here lands in an event listener, where it becomes an unhandled
        // exception that kills the process instead of failing the check -- so every path must
        // resolve or reject rather than assume a response shape.
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          settle(rejectResult, new Error("Browser sent a malformed CDP response."));
          return;
        }
        if (message.id !== 1) return;
        // CDP protocol-level failure (e.g. the target went away): there is no `result` at all.
        if (message.error) {
          settle(
            rejectResult,
            new Error(`Browser evaluation failed: ${message.error.message ?? "unknown CDP error"}`),
          );
          return;
        }
        if (message.result?.exceptionDetails) {
          // exceptionDetails.text is usually the bare word "Uncaught"; the actual message lives on
          // the nested exception description. Preferring it keeps a browser-side failure debuggable.
          const details = message.result.exceptionDetails;
          settle(
            rejectResult,
            new Error(
              details.exception?.description ?? details.text ?? "Browser evaluation failed.",
            ),
          );
          return;
        }
        // Runtime.evaluate nests the value as result.result.value. A missing nesting means the
        // response was not the shape we asked for -- report it rather than throwing on undefined.
        if (message.result?.result === undefined) {
          settle(rejectResult, new Error("Browser returned no evaluation result."));
          return;
        }
        settle(resolveResult, message.result.result.value);
      });
      socket.addEventListener("error", () =>
        settle(rejectResult, new Error("Browser connection failed.")),
      );
      socket.addEventListener("close", () =>
        settle(rejectResult, new Error("Browser target closed before evaluation completed.")),
      );
    });
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
