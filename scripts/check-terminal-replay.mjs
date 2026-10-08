// Replay captured PTY output using xterm, including the Windows/ConPTY settings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import xterm from '@xterm/headless';

const events = JSON.parse(readFileSync(0, 'utf8'));
for (const windowsPty of [undefined, { backend: 'conpty', buildNumber: 22621 }]) {
  const terminal = new xterm.Terminal({ cols: 47, rows: 24, allowProposedApi: true, scrollback: 1000, windowsPty });
  const write = data => new Promise(resolve => terminal.write(data, resolve));
  const text = buffer => Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) || '').join('\n');
  try {
    await write('KEEP MY SHELL HISTORY\r\n$ arcapush\r\n');
    for (const event of events) {
      if (event.resize) terminal.resize(...event.resize);
      if (event.write) await write(event.write);
      if (event.checkpoint === 'selector') {
        assert.equal(terminal.buffer.active.type, 'alternate', 'Selector must not redraw into shell scrollback');
        const screen = text(terminal.buffer.active);
        assert.equal((screen.match(/Good products deserve/g) || []).length, 1, 'Expected exactly one visible interface');
        assert.match(screen, /Choose what you are shipping/);
        assert.match(screen, /Product/);
        assert.ok(!text(terminal.buffer.normal).includes('Good products deserve'), 'Selector leaked into scrollback');
      }
      if (event.checkpoint === 'restored') {
        assert.equal(terminal.buffer.active.type, 'normal');
        assert.match(text(terminal.buffer.normal), /KEEP MY SHELL HISTORY/);
        assert.ok(!text(terminal.buffer.normal).includes('Good products deserve'));
      }
    }
  } finally { terminal.dispose(); }
}
console.log('PASS: xterm and ConPTY replay keep one screen across startup, four resizes and navigation; shell history restored');
