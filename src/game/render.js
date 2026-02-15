export function makeRenderer(canvas, { board }) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D context not available");

  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const view = {
    scale: 1,
    ox: 0,
    oy: 0,
    cameraY: 0,
    viewHWorld: board.worldH,
    cameraOverrideY: null
  };

  function resizeToFit() {
    const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || board.worldW;
    const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || board.worldH;
    // For tall boards, fit width and use a scrolling camera for Y.
    const s = Math.min(cssW / board.worldW, 1.6);
    view.scale = s;
    view.ox = (cssW - board.worldW * s) / 2;
    view.oy = 0;
    view.viewHWorld = cssH / s;

    const r = dpr();
    canvas.width = Math.floor(cssW * r);
    canvas.height = Math.floor(cssH * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }

  function worldToScreen(x, y) {
    return { x: view.ox + x * view.scale, y: view.oy + (y - view.cameraY) * view.scale };
  }
  function screenToWorld(x, y) {
    return { x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale + view.cameraY };
  }

  const bg = {
    gridA: "rgba(255,255,255,0.05)",
    gridB: "rgba(255,255,255,0.02)"
  };

  function drawBoardBase() {
    // Background in canvas: subtle grid + vignette.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const cssW = canvas.clientWidth || board.worldW;
    const cssH = canvas.clientHeight || board.worldH;

    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, "#0a1224");
    g.addColorStop(1, "#111b33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.globalAlpha = 1;
    const step = 26;
    for (let x = 0; x < cssW; x += step) {
      ctx.strokeStyle = x % (step * 2) === 0 ? bg.gridA : bg.gridB;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, cssH);
      ctx.stroke();
    }
    for (let y = 0; y < cssH; y += step) {
      ctx.strokeStyle = y % (step * 2) === 0 ? bg.gridA : bg.gridB;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(cssW, y + 0.5);
      ctx.stroke();
    }

    const v = ctx.createRadialGradient(cssW * 0.5, cssH * 0.35, 30, cssW * 0.5, cssH * 0.45, cssH * 0.75);
    v.addColorStop(0, "rgba(255,255,255,0.06)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.restore();
  }

  function draw(state, ballsCatalog, imagesById) {
    drawBoardBase();

    // Camera:
    // - default: auto-follow the slowest (smallest y) unfinished marble so the "last finisher" stays in view.
    // - manual: user clicks minimap -> cameraOverrideY.
    // Camera never moves upward in auto mode to avoid disorienting jumps.
    if (state.mode === "playing" && typeof view.cameraOverrideY === "number") {
      view.cameraY = clamp(view.cameraOverrideY, 0, Math.max(0, board.worldH - view.viewHWorld));
    } else if (state.mode === "playing" && state.released) {
      let targetY = 0;
      let found = false;
      for (const m of state.marbles) {
        if (m.done) continue;
        if (!found || m.y < targetY) {
          targetY = m.y;
          found = true;
        }
      }
      if (!found) targetY = board.worldH - board.slotH - view.viewHWorld;
      const desired = clamp(targetY - view.viewHWorld * 0.35, 0, Math.max(0, board.worldH - view.viewHWorld));
      view.cameraY = Math.max(view.cameraY, desired);
    } else {
      view.cameraY = 0;
    }

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.translate(0, -view.cameraY);

    // Board frame.
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    roundRect(ctx, 10, 10, board.worldW - 20, board.worldH - 20, 24);
    ctx.fill();
    ctx.stroke();

    // Slot zone.
    const y0 = board.worldH - board.slotH;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, 18, y0 + 12, board.worldW - 36, board.slotH - 24, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();

    // Slot dividers & labels.
    ctx.font = "700 16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < board.slotCount; i++) {
      const x = i * board.slotW;
      if (i !== 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, board.worldH - 16);
        ctx.stroke();
      }
      const cx = x + board.slotW / 2;
      const cy = y0 + board.slotH * 0.58;
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.fillText(board.slots[i].label, cx, cy);
    }

    // Pegs.
    const yMin = view.cameraY - 60;
    const yMax = view.cameraY + view.viewHWorld + 60;
    const r0 = clampInt(Math.floor((yMin - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
    const r1 = clampInt(Math.ceil((yMax - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
    for (let rr = r0; rr <= r1; rr++) {
      const row = board.pegRows[rr];
      for (const p of row) {
        ctx.fillStyle = "rgba(255,255,255,0.70)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.arc(p.x - 2.5, p.y - 2.5, Math.max(2, p.r * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Drop guide.
    if (state.mode === "playing") {
      ctx.strokeStyle = "rgba(255, 176, 0, 0.50)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      // In world coords.
      ctx.moveTo(state.dropX, view.cameraY + 10);
      ctx.lineTo(state.dropX, y0 - 30);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Marbles (pending + active).
    for (const m of [...(state.pending || []), ...state.marbles]) {
      const meta = ballsCatalog.find((b) => b.id === m.ballId);
      const img = imagesById.get(m.ballId);
      const r = m.r;

      ctx.save();
      ctx.translate(m.x, m.y);

      // Outer rim.
      const rim = ctx.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
      rim.addColorStop(0, "rgba(255,255,255,0.90)");
      rim.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.fill();

      // Face.
      ctx.fillStyle = meta?.tint || "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      if (img && img.complete) {
        ctx.drawImage(img, -r, -r, r * 2, r * 2);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(-r, -r, r * 2, r * 2);
      }
      ctx.restore();

      // Glint.
      const gl = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, -r * 0.35, -r * 0.35, r * 1.1);
      gl.addColorStop(0, "rgba(255,255,255,0.65)");
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }

  return {
    ctx,
    resizeToFit,
    draw,
    screenToWorld,
    worldToScreen,
    getViewState: () => ({
      scale: view.scale,
      cameraY: view.cameraY,
      viewHWorld: view.viewHWorld,
      cameraOverrideY: view.cameraOverrideY
    }),
    setCameraOverrideY: (y) => {
      view.cameraOverrideY = typeof y === "number" && Number.isFinite(y) ? y : null;
    },
    clearCameraOverride: () => {
      view.cameraOverrideY = null;
    }
  };
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function clampInt(v, a, b) {
  return Math.max(a, Math.min(b, v | 0));
}
