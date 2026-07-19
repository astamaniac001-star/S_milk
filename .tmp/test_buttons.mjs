// T:\milk\S_milk\.tmp\test_buttons.mjs
// Uses native WebSocket (Node 22+)

async function fetchTabs() {
  const res = await fetch("http://127.0.0.1:9222/json");
  return res.json();
}

function rpc(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  // Create a new tab
  const newTab = await fetch(
    "http://127.0.0.1:9222/json/new?http://localhost:5173",
    { method: "PUT" },
  );
  const tab = await newTab.json();
  console.log("Opened tab:", tab.url, tab.id);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });

  let id = 0;
  const consoleMessages = [];
  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args
        .map((a) =>
          a.value !== undefined ? String(a.value) : a.description || "",
        )
        .join(" ");
      consoleMessages.push({ type: msg.params.type, text });
      console.log(`[console.${msg.params.type}]`, text.substring(0, 300));
    } else if (msg.method === "Runtime.exceptionThrown") {
      const e = msg.params.exceptionDetails;
      consoleMessages.push({
        type: "exception",
        text: e.text + " " + (e.exception?.description || ""),
      });
      console.log("[EXCEPTION]", e.text, e.exception?.description || "");
    } else if (msg.method === "Log.entryAdded") {
      console.log(
        "[log]",
        msg.params.entry.level,
        msg.params.entry.text,
        msg.params.entry.url || "",
      );
    }
  });

  await rpc(ws, ++id, "Runtime.enable");
  await rpc(ws, ++id, "Log.enable");
  await rpc(ws, ++id, "Page.enable");
  await rpc(ws, ++id, "Network.enable");

  await new Promise((r) => setTimeout(r, 4000));

  const findButtons = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      JSON.stringify((() => {
        const out = { url: location.href, title: document.title, buttonCount: 0, buttons: [] };
        const buttons = document.querySelectorAll('button');
        out.buttonCount = buttons.length;
        buttons.forEach((b, i) => {
          if (i < 5) {
            const reactKey = Object.keys(b).find(k => k.startsWith('__reactProps$'));
            const reactProps = reactKey ? b[reactKey] : null;
            out.buttons.push({
              i, text: (b.textContent || '').substring(0,40).trim(),
              hasOnClick: !!(reactProps && reactProps.onClick),
            });
          }
        });
        return out;
      })())
    `,
    returnByValue: true,
  });
  console.log("=== INITIAL ===\n", findButtons.result.value);

  // Type PIN
  await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const pin = document.getElementById('pin-input');
        if (!pin) return 'NO PIN INPUT';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(pin, '1234');
        pin.dispatchEvent(new Event('input', { bubbles: true }));
        return 'PIN set';
      })()
    `,
    returnByValue: true,
  });
  console.log("Pin set to 1234");

  console.log("--- Clicking Login ---");
  await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          const t = b.textContent.trim();
          if (t.startsWith('Login') || t.startsWith('Verifying')) {
            b.click();
            return 'Clicked: ' + t;
          }
        }
        return 'No Login button';
      })()
    `,
    returnByValue: true,
  });

  await new Promise((r) => setTimeout(r, 5000));

  const afterLogin = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      JSON.stringify((() => {
        const out = { activeTab: '', body: document.body.innerText.substring(0, 300), buttonCount: 0, buttons: [] };
        const tabs = document.querySelectorAll('.nav-item');
        tabs.forEach(t => { if (t.classList.contains('active')) out.activeTab = t.textContent.trim(); });
        const buttons = document.querySelectorAll('button');
        out.buttonCount = buttons.length;
        buttons.forEach((b, i) => {
          if (i < 15) {
            const reactKey = Object.keys(b).find(k => k.startsWith('__reactProps$'));
            const reactProps = reactKey ? b[reactKey] : null;
            out.buttons.push({
              text: (b.textContent || '').substring(0,30).trim(),
              hasOnClick: !!(reactProps && reactProps.onClick),
            });
          }
        });
        return out;
      })())
    `,
    returnByValue: true,
  });
  console.log("=== AFTER LOGIN ===\n", afterLogin.result.value);

  // Click customers tab
  console.log("--- Clicking Customers tab ---");
  await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const tabs = document.querySelectorAll('.nav-item');
        for (const t of tabs) {
          if (t.textContent.trim() === 'Customers') { t.click(); return 'clicked'; }
        }
        return 'not found';
      })()
    `,
    returnByValue: true,
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Click + Add button
  console.log("--- Clicking + Add ---");
  const clickResult = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const buttons = document.querySelectorAll('button');
        for (const b of buttons) {
          if (b.textContent.trim() === '+ Add') { b.click(); return 'clicked'; }
        }
        return 'not found';
      })()
    `,
    returnByValue: true,
  });
  console.log("Add click:", clickResult.result.value);

  await new Promise((r) => setTimeout(r, 2000));

  const modalState = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      JSON.stringify((() => {
        const modal = document.querySelector('.modal-overlay');
        const modalContent = document.querySelector('.modal-content');
        const inputs = document.querySelectorAll('.modal-content input, .modal-content select');
        return {
          modalOpen: !!modal,
          modalTitle: modalContent ? modalContent.querySelector('h3')?.textContent : null,
          modalInputs: Array.from(inputs).map(i => i.type || i.tagName + ':' + (i.placeholder || '')),
          modalButtons: Array.from(modalContent?.querySelectorAll('button') || []).map(b => {
            const reactKey = Object.keys(b).find(k => k.startsWith('__reactProps$'));
            const reactProps = reactKey ? b[reactKey] : null;
            return { text: b.textContent.trim(), hasOnClick: !!(reactProps && reactProps.onClick) };
          }),
        };
      })())
    `,
    returnByValue: true,
  });
  console.log("=== MODAL STATE ===\n", modalState.result.value);

  // Try filling the form
  console.log("--- Filling form ---");
  await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const inputs = document.querySelectorAll('.modal-content input');
        let i = 0;
        const data = ['Test Customer', '123 Test St', '9876543210'];
        for (const inp of inputs) {
          if (i < data.length) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, data[i]);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
          }
        }
        return 'filled ' + i;
      })()
    `,
    returnByValue: true,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Click Save in modal
  console.log("--- Clicking Save in modal ---");
  const saveResult = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      (() => {
        const modalBtns = document.querySelectorAll('.modal-content button');
        for (const b of modalBtns) {
          const t = b.textContent.trim();
          if (t === 'Save' || t === 'Update' || t.startsWith('Saving')) {
            b.click();
            return 'Clicked: ' + t;
          }
        }
        return 'No Save button';
      })()
    `,
    returnByValue: true,
  });
  console.log("Save click:", saveResult.result.value);

  await new Promise((r) => setTimeout(r, 5000));

  const afterSave = await rpc(ws, ++id, "Runtime.evaluate", {
    expression: `
      JSON.stringify((() => {
        const modal = document.querySelector('.modal-overlay');
        const toast = document.querySelector('.toast');
        return {
          modalStillOpen: !!modal,
          toastText: toast ? toast.textContent : null,
          bodyText: document.body.innerText.substring(0, 500),
        };
      })())
    `,
    returnByValue: true,
  });
  console.log("=== AFTER SAVE ===\n", afterSave.result.value);

  // Capture screenshot
  const ss = await rpc(ws, ++id, "Page.captureScreenshot", { format: "png" });
  const buf = Buffer.from(ss.data, "base64");
  const fs = await import("fs");
  fs.writeFileSync("T:/milk/S_milk/.tmp/screenshot.png", buf);
  console.log("Screenshot saved");

  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
