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

    const fixedEntities = board.roulette?.entities?.length
      ? board.roulette.entities
      : board.zigzag?.entities?.length
        ? board.zigzag.entities
        : null;

    // Fixed map polylines (walls / dividers).
    if (fixedEntities) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([12, 10]);
      for (const e of fixedEntities) {
        if (e.type === "polyline" && Array.isArray(e.points) && e.points.length >= 2) {
          const y0e = e.points[0][1];
          const y1e = e.points[e.points.length - 1][1];
          if (Math.max(y0e, y1e) < view.cameraY - 200 || Math.min(y0e, y1e) > view.cameraY + view.viewHWorld + 200) {
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Static boxes (cyan obstacles) like the reference.
      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 255, 0.70)";
      ctx.lineWidth = 4;
      for (const e of fixedEntities) {
        if (e.type !== "box") continue;
        if (e.y < view.cameraY - 240 || e.y > view.cameraY + view.viewHWorld + 240) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot || 0);
        ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.restore();
      }
      ctx.restore();
    }

    // Zigzag propellers.
    if (board.zigzag?.propellers?.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 176, 0, 0.85)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      for (const p of board.zigzag.propellers) {
        if (p.y < view.cameraY - 260 || p.y > view.cameraY + view.viewHWorld + 260) continue;
        const ang = (p.phase || 0) + (p.omega || 0) * state.t;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const hx = (p.len / 2) * c;
        const hy = (p.len / 2) * s;
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();

        // Hub.
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Variable-width corridor walls.
    if (board.corridor) {
      const y0v = clamp(view.cameraY - 60, 0, board.worldH);
      const y1v = clamp(view.cameraY + view.viewHWorld + 60, 0, board.worldH);
      const stepY = Math.max(30, board.pegGapY * 0.8);

      // Shade "outside" area to make the corridor obvious.
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      // left outside
      ctx.moveTo(0, y0v);
      for (let y = y0v; y <= y1v; y += stepY) {
        const { left } = corridorAt(board, y);
        ctx.lineTo(left, y);
      }
      ctx.lineTo(corridorAt(board, y1v).left, y1v);
      ctx.lineTo(0, y1v);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      // right outside
      ctx.moveTo(board.worldW, y0v);
      for (let y = y0v; y <= y1v; y += stepY) {
        const { right } = corridorAt(board, y);
        ctx.lineTo(right, y);
      }
      ctx.lineTo(corridorAt(board, y1v).right, y1v);
      ctx.lineTo(board.worldW, y1v);
      ctx.closePath();
      ctx.fill();

      // Wall strokes.
      ctx.strokeStyle = "rgba(255,255,255,0.26)";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let first = true;
      for (let y = y0v; y <= y1v; y += stepY) {
        const { left } = corridorAt(board, y);
        if (first) {
          ctx.moveTo(left, y);
          first = false;
        } else {
          ctx.lineTo(left, y);
        }
      }
      ctx.lineTo(corridorAt(board, y1v).left, y1v);
      ctx.stroke();

      ctx.beginPath();
      first = true;
      for (let y = y0v; y <= y1v; y += stepY) {
        const { right } = corridorAt(board, y);
        if (first) {
          ctx.moveTo(right, y);
          first = false;
        } else {
          ctx.lineTo(right, y);
        }
      }
      ctx.lineTo(corridorAt(board, y1v).right, y1v);
      ctx.stroke();
    }

    // Slot zone.
    const y0 = board.worldH - board.slotH;
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, 18, y0 + 12, board.worldW - 36, board.slotH - 24, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();

    // Slot dividers & labels.
    ctx.font = "700 14px ui-monospace, Menlo, monospace";
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
    if (board.pegRows && board.pegRows.length) {
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
    }

    // Chaos objects (bumpers/spinners/portals/wind zones).
    if (state.chaos?.enabled) {
      // Wind zones as faint bands.
      for (const z of state.chaos.windZones || []) {
        if (z.y1 < view.cameraY || z.y0 > view.cameraY + view.viewHWorld) continue;
        ctx.fillStyle = "rgba(69, 243, 195, 0.07)";
        ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);

        // Direction arrows (animated).
        const midY = (z.y0 + z.y1) / 2;
        ctx.strokeStyle = "rgba(69, 243, 195, 0.28)";
        ctx.lineWidth = 2;
        const arrowStep = 90;
        const shift = (state.t * 90) % arrowStep;
        for (let x = z.x0 + 14 + shift; x < z.x1 - 14; x += arrowStep) {
          const dir = Math.sin(z.phase + state.t * z.freq) >= 0 ? 1 : -1;
          drawArrow(ctx, x, midY, dir);
        }
      }

      // Bumpers.
      for (const o of state.chaos.bumpers || []) {
        if (o.y < view.cameraY - 120 || o.y > view.cameraY + view.viewHWorld + 120) continue;
        const pulse = 0.55 + 0.45 * Math.sin(state.t * 4 + o.x * 0.01);
        ctx.fillStyle = `rgba(255, 176, 0, ${0.12 + 0.10 * pulse})`;
        ctx.strokeStyle = `rgba(255, 176, 0, ${0.70 + 0.20 * pulse})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Simple "X" marker.
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(o.x - o.r * 0.55, o.y - o.r * 0.55);
        ctx.lineTo(o.x + o.r * 0.55, o.y + o.r * 0.55);
        ctx.moveTo(o.x - o.r * 0.55, o.y + o.r * 0.55);
        ctx.lineTo(o.x + o.r * 0.55, o.y - o.r * 0.55);
        ctx.stroke();
      }

      // Spinners.
      for (const o of state.chaos.spinners || []) {
        if (o.y < view.cameraY - 120 || o.y > view.cameraY + view.viewHWorld + 120) continue;
        ctx.fillStyle = "rgba(125, 243, 211, 0.08)";
        ctx.strokeStyle = "rgba(125, 243, 211, 0.75)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Rotating bar + arrow head.
        const ang = (state.t * 2.2 * o.dir) % (Math.PI * 2);
        const ax = Math.cos(ang) * o.r * 0.72;
        const ay = Math.sin(ang) * o.r * 0.72;
        ctx.beginPath();
        ctx.moveTo(o.x - ax, o.y - ay);
        ctx.lineTo(o.x + ax, o.y + ay);
        ctx.stroke();
        ctx.fillStyle = "rgba(125, 243, 211, 0.85)";
        ctx.beginPath();
        ctx.arc(o.x + ax, o.y + ay, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Portals.
      for (const p of state.chaos.portals || []) {
        const ends = [
          { end: p.a, label: "A" },
          { end: p.b, label: "B" }
        ];
        for (const { end, label } of ends) {
          if (end.y < view.cameraY - 120 || end.y > view.cameraY + view.viewHWorld + 120) continue;
          const swirl = (state.t * 2.6) % (Math.PI * 2);
          ctx.lineWidth = 4;
          ctx.setLineDash([]);
          // Outer ring.
          ctx.strokeStyle = "rgba(202, 160, 255, 0.85)";
          ctx.beginPath();
          ctx.arc(end.x, end.y, end.r, 0, Math.PI * 2);
          ctx.stroke();
          // Inner swirl (dashed).
          ctx.strokeStyle = "rgba(202, 160, 255, 0.55)";
          ctx.setLineDash([10, 8]);
          ctx.beginPath();
          ctx.arc(end.x, end.y, end.r * 0.72, swirl, swirl + Math.PI * 1.6);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label.
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          ctx.arc(end.x, end.y, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.font = "900 14px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, end.x, end.y + 0.5);
        }
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

function drawArrow(ctx, x, y, dir) {
  const len = 20;
  const head = 6;
  ctx.beginPath();
  ctx.moveTo(x - (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir, y);
  ctx.moveTo(x + (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir - head * dir, y - head);
  ctx.moveTo(x + (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir - head * dir, y + head);
  ctx.stroke();
}

function corridorAt(board, y) {
  const c = board.corridor;
  if (!c) return { left: 0, right: board.worldW };
  const cx = c.worldW / 2;
  const t = clamp((y - c.startY) / (c.endY - c.startY), 0, 1);
  const u = smoothstep(t);
  const hw = lerp(c.wideHalf, c.narrowHalf, u);
  return { left: clamp(cx - hw, 0, board.worldW), right: clamp(cx + hw, 0, board.worldW) };
}

function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
