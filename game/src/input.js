// Vice Harbor — keyboard and mouse input.
// Tracks held keys, one-shot presses, and mouse drag deltas for the
// third-person camera. Pointer lock is requested on click while
// playing; drag works as a fallback.

export function createInput() {
  const input = {
    keys: {},
    pressed: {},
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    locked: false,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    input.pressed[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    input.keys = {};
  });

  const canvas = document.getElementById('game-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown', (e) => {
      input.mouseDown = true;
      input.dragging = true;
      input.lastX = e.clientX;
      input.lastY = e.clientY;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    window.addEventListener('mouseup', () => {
      input.mouseDown = false;
      input.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        input.mouseDX += e.movementX || 0;
        input.mouseDY += e.movementY || 0;
      } else if (input.dragging) {
        input.mouseDX += e.clientX - input.lastX;
        input.mouseDY += e.clientY - input.lastY;
        input.lastX = e.clientX;
        input.lastY = e.clientY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      input.locked = document.pointerLockElement === canvas;
    });
  }

  // One-shot press, consumed by the game loop each frame.
  input.wasPressed = (code) => {
    const hit = !!input.pressed[code];
    input.pressed[code] = false;
    return hit;
  };
  input.endFrame = () => {
    input.pressed = {};
    input.mouseDX = 0;
    input.mouseDY = 0;
  };
  return input;
}
