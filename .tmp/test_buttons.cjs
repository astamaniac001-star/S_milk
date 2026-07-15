// T:\milk\S_milk\.tmp\test_buttons.cjs
// Headless test using puppeteer-like approach via Edge's debugging protocol
// Actually we'll use a simpler approach - open page with Edge and dump console

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

// Write an HTML harness that loads the dev server, tries to click buttons, and dumps console
const harness = `
<!DOCTYPE html>
<html>
<head>
<title>Button Test</title>
</head>
<body>
<iframe id="app" src="http://localhost:5173" style="width:100%;height:600px;border:0;"></iframe>
<div id="log" style="font-family:monospace;white-space:pre-wrap;background:#000;color:#0f0;padding:10px;"></div>
<script>
const log = document.getElementById('log');
function addLog(msg) {
  log.textContent += msg + '\\n';
  console.log(msg);
}

// Listen for errors
window.addEventListener('error', (e) => addLog('WINDOW ERROR: ' + e.message));
window.addEventListener('unhandledrejection', (e) => addLog('UNHANDLED REJECTION: ' + (e.reason?.message || e.reason)));

// Wait for iframe to load
const iframe = document.getElementById('app');
iframe.addEventListener('load', () => {
  addLog('Iframe loaded');
  const win = iframe.contentWindow;
  if (!win) { addLog('No window access'); return; }
  
  // Forward iframe console logs
  ['log','warn','error'].forEach(level => {
    const orig = win.console[level];
    win.console[level] = function(...args) {
      addLog('[iframe ' + level + '] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      orig.apply(win.console, args);
    };
  });
  
  win.addEventListener('error', (e) => addLog('IFRAME ERROR: ' + e.message + ' at ' + e.filename + ':' + e.lineno));
  win.addEventListener('unhandledrejection', (e) => addLog('IFRAME UNHANDLED: ' + (e.reason?.message || e.reason)));
  
  // Try to find buttons after a delay
  setTimeout(() => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) { addLog('No doc'); return; }
      const buttons = doc.querySelectorAll('button');
      addLog('Found ' + buttons.length + ' buttons');
      buttons.forEach((b, i) => {
        addLog('  Button ' + i + ': type=' + b.type + ' text=' + (b.textContent || '').substring(0,40).trim() + ' disabled=' + b.disabled);
        // Try to find any onclick handlers via React's props
        const reactKey = Object.keys(b).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
        if (reactKey) {
          const props = b[reactKey];
          addLog('    React props keys: ' + Object.keys(props).join(','));
          addLog('    Has onClick: ' + (typeof props.onClick === 'function'));
        } else {
          addLog('    No react props found');
        }
      });
    } catch (e) {
      addLog('ERROR accessing iframe doc: ' + e.message);
    }
  }, 3000);
});
</script>
</body>
</html>
`;

const harnessPath = path.join(__dirname, 'harness.html');
fs.writeFileSync(harnessPath, harness);

console.log('Wrote harness to', harnessPath);
