// Vice Harbor — keyboard + mouse input (pointer lock on the canvas).
export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseClicked = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (!e.repeat) justPressed.add(e.code);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (locked) { mouseDX += e.movementX; mouseDY += e.movementY; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseClicked = true;
    if (!locked && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
    }
  });

  return {
    keys,
    isDown(code) { return keys.has(code); },
    pressed(code) { return justPressed.has(code); },
    takeMouse() { const d = { dx: mouseDX, dy: mouseDY }; mouseDX = 0; mouseDY = 0; return d; },
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    endFrame() { justPressed.clear(); },
  };
}
