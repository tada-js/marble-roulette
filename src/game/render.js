export function makeRenderer(canvas, { board }) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("2D context not available");

  const dpr = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const bootMs = performance.now();
  const hashStr = (s) => {
    // Small deterministic hash for stable per-entity color offsets.
    let h = 2166136261 >>> 0;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };
  const view = {
    scale: 1,
    ox: 0,
    oy: 0,
    cameraY: 0,
    viewHWorld: board.worldH,
    cameraOverrideY: null
  };

  const bgCache = {
    base: null,
    baseCtx: null,
    w: 0,
    h: 0,
    stripePattern: null,
    gridPattern: null,
    patternSeed: 0,
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

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }

  function ensureBgCache(cssW, cssH) {
    if (!bgCache.base || bgCache.w !== cssW || bgCache.h !== cssH) {
      bgCache.w = cssW | 0;
      bgCache.h = cssH | 0;
      bgCache.base = makeCanvas(bgCache.w, bgCache.h);
      bgCache.baseCtx = bgCache.base.getContext("2d");
      bgCache.stripePattern = null;
      bgCache.gridPattern = null;
      bgCache.patternSeed = (bgCache.patternSeed + 1) | 0;
    }

    const bctx = bgCache.baseCtx;
    if (bctx && !bgCache.stripePattern) {
      // Diagonal stripe pattern (pre-rendered for performance).
      const p = makeCanvas(140, 140);
      const pctx = p.getContext("2d");
      if (pctx) {
        pctx.clearRect(0, 0, p.width, p.height);
        pctx.globalAlpha = 1;
        pctx.strokeStyle = "rgba(255,255,255,0.10)";
        pctx.lineWidth = 18;
        for (let i = -p.height; i < p.width + p.height; i += 70) {
          pctx.beginPath();
          pctx.moveTo(i, 0);
          pctx.lineTo(i + p.height, p.height);
          pctx.stroke();
        }
      }
      bgCache.stripePattern = bctx.createPattern(p, "repeat");
    }

    if (bctx && !bgCache.gridPattern) {
      // Neon grid pattern (pre-rendered).
      const p = makeCanvas(128, 128);
      const pctx = p.getContext("2d");
      if (pctx) {
        pctx.clearRect(0, 0, p.width, p.height);
        pctx.lineWidth = 1;

        // Fine grid.
        pctx.strokeStyle = "rgba(0,255,255,0.10)";
        for (let x = 0; x <= p.width; x += 16) {
          pctx.beginPath();
          pctx.moveTo(x + 0.5, 0);
          pctx.lineTo(x + 0.5, p.height);
          pctx.stroke();
        }
        for (let y = 0; y <= p.height; y += 16) {
          pctx.beginPath();
          pctx.moveTo(0, y + 0.5);
          pctx.lineTo(p.width, y + 0.5);
          pctx.stroke();
        }

        // Stronger major lines.
        pctx.strokeStyle = "rgba(255,0,170,0.14)";
        pctx.lineWidth = 2;
        for (let x = 0; x <= p.width; x += 64) {
          pctx.beginPath();
          pctx.moveTo(x + 1, 0);
          pctx.lineTo(x + 1, p.height);
          pctx.stroke();
        }
        for (let y = 0; y <= p.height; y += 64) {
          pctx.beginPath();
          pctx.moveTo(0, y + 1);
          pctx.lineTo(p.width, y + 1);
          pctx.stroke();
        }
      }
      bgCache.gridPattern = bctx.createPattern(p, "repeat");
    }

    // Render base layer once per size change.
    if (bctx && bgCache.base && bgCache.patternSeed) {
      // Use patternSeed to avoid redrawing every call; redraw only after cache reset.
      // Decrement to mark it "drawn".
      bgCache.patternSeed = 0;
      bctx.clearRect(0, 0, bgCache.w, bgCache.h);

      const g = bctx.createLinearGradient(0, 0, 0, bgCache.h);
      g.addColorStop(0, "#06102a");
      g.addColorStop(0.5, "#071a3c");
      g.addColorStop(1, "#040a18");
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, bgCache.w, bgCache.h);

      if (bgCache.stripePattern) {
        bctx.save();
        bctx.globalAlpha = 0.08;
        bctx.fillStyle = bgCache.stripePattern;
        bctx.fillRect(0, 0, bgCache.w, bgCache.h);
        bctx.restore();
      }

      // Gentle vignette.
      const v = bctx.createRadialGradient(bgCache.w * 0.5, bgCache.h * 0.35, 30, bgCache.w * 0.5, bgCache.h * 0.45, bgCache.h * 0.85);
      v.addColorStop(0, "rgba(255,255,255,0.05)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      bctx.fillStyle = v;
      bctx.fillRect(0, 0, bgCache.w, bgCache.h);
    }
  }

  function drawBoardBase(tSec = 0) {
    // Use real time so the background animates even when the simulation is paused (menu, dialogs, etc).
    const rt = (performance.now() - bootMs) / 1000;
    const tt = (Number.isFinite(tSec) ? tSec : 0) + rt * 0.85;

    // Background (optimized): cached base + a couple of animated haze layers + a scrolling neon grid pattern.
    const cssW = canvas.clientWidth || board.worldW;
    const cssH = canvas.clientHeight || board.worldH;
    ensureBgCache(cssW, cssH);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgCache.base) ctx.drawImage(bgCache.base, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Animated neon haze (2 gradients only).
    {
      const p0 = tt * 0.28;
      const p1 = tt * 0.22 + 1.7;
      const x0 = cssW * (0.30 + 0.08 * Math.sin(p0));
      const y0 = cssH * (0.22 + 0.06 * Math.cos(p0 * 1.2));
      const x1 = cssW * (0.72 + 0.08 * Math.cos(p1));
      const y1 = cssH * (0.62 + 0.06 * Math.sin(p1 * 1.1));

      const g0 = ctx.createRadialGradient(x0, y0, 18, x0, y0, Math.max(cssW, cssH) * 0.62);
      g0.addColorStop(0, "rgba(0,255,255,0.12)");
      g0.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, cssW, cssH);

      const g1 = ctx.createRadialGradient(x1, y1, 20, x1, y1, Math.max(cssW, cssH) * 0.72);
      g1.addColorStop(0, "rgba(255,0,170,0.10)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    // Scrolling neon grid overlay (pattern fill).
    if (bgCache.gridPattern) {
      const dx = -(tt * 22) % 128;
      const dy = (tt * 34) % 128;
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.10 * Math.sin(tt * 0.6);
      ctx.translate(dx, dy);
      ctx.fillStyle = bgCache.gridPattern;
      ctx.fillRect(-128, -128, cssW + 256, cssH + 256);
      ctx.restore();
    }

    ctx.restore();
  }

  function draw(state, ballsCatalog, imagesById) {
    drawBoardBase(state?.t || 0);

    // Shared FX time for hue cycling (keeps animating even when game is paused).
    const fxT = ((performance.now() - bootMs) / 1000) + (state?.t || 0);

    // Camera:
    // - manual: minimap / view lock can set cameraOverrideY (works even before starting).
    // - auto: in-play, follow the "tail" (smallest y among not-finished marbles).
    if (typeof view.cameraOverrideY === "number") {
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
      if (!found) targetY = board.worldH;
      const desired = clamp(targetY - view.viewHWorld * 0.22, 0, Math.max(0, board.worldH - view.viewHWorld));
      // Smooth motion to reduce jitter when the tail bounces.
      view.cameraY = view.cameraY + (desired - view.cameraY) * 0.14;
    } else {
      view.cameraY = 0;
    }

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.translate(0, -view.cameraY);

    // Board frame.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, 8, 8, board.worldW - 16, board.worldH - 16, 26);
    ctx.fill();
    ctx.restore();

    // Chrome rim + inner glass.
    roundRect(ctx, 10, 10, board.worldW - 20, board.worldH - 20, 26);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(69,243,195,0.18)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fill();

    const fixedEntities = board.roulette?.entities?.length
      ? board.roulette.entities
      : board.zigzag?.entities?.length
        ? board.zigzag.entities
        : null;

    // Fixed map polylines (walls / dividers).
    if (fixedEntities) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const e of fixedEntities) {
        if (e.type === "polyline" && Array.isArray(e.points) && e.points.length >= 2) {
          const y0e = e.points[0][1];
          const y1e = e.points[e.points.length - 1][1];
          if (Math.max(y0e, y1e) < view.cameraY - 200 || Math.min(y0e, y1e) > view.cameraY + view.viewHWorld + 200) {
            continue;
          }
          // Outer rubber.
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 11;
          ctx.strokeStyle = "rgba(0,0,0,0.42)";
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();

          // Neon rail: animated RGB sign gradient.
          const x0 = e.points[0][0];
          const y0 = e.points[0][1];
          const x1 = e.points[e.points.length - 1][0];
          const y1 = e.points[e.points.length - 1][1];
          const hOff = (hashStr(e.id) % 360) | 0;
          const h0 = (fxT * 42 + hOff) % 360;
          const h1 = (h0 + 120) % 360;
          const h2 = (h0 + 240) % 360;
          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          grad.addColorStop(0, `hsla(${h0}, 100%, 64%, 0.70)`);
          grad.addColorStop(0.5, `hsla(${h1}, 100%, 64%, 0.70)`);
          grad.addColorStop(1, `hsla(${h2}, 100%, 64%, 0.70)`);

          ctx.shadowColor = `hsla(${h0}, 100%, 62%, 0.95)`;
          ctx.shadowBlur = 24;
          ctx.lineWidth = 7.5;
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();

          // Hot highlight for that "pinball rail" punch.
          ctx.shadowColor = `hsla(${h1}, 100%, 70%, 0.55)`;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = "rgba(255,255,255,0.78)";
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();
        }
      }
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
      ctx.lineCap = "round";
      for (const p of board.zigzag.propellers) {
        if (p.y < view.cameraY - 260 || p.y > view.cameraY + view.viewHWorld + 260) continue;
        const ang = (p.phase || 0) + (p.omega || 0) * state.t;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const hx = (p.len / 2) * c;
        const hy = (p.len / 2) * s;
        // Rubber + highlight.
        ctx.shadowColor = "rgba(255,176,0,0.45)";
        ctx.shadowBlur = 14;
        ctx.lineWidth = 14;
        ctx.strokeStyle = "rgba(0,0,0,0.42)";
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(255, 176, 0, 0.88)";
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();

        // Hub.
        ctx.shadowBlur = 0;
        const hg = ctx.createRadialGradient(p.x - 4, p.y - 6, 2, p.x, p.y, 18);
        hg.addColorStop(0, "rgba(255,255,255,0.35)");
        hg.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Zigzag circular rotors (early section).
    if (board.zigzag?.rotors?.length) {
      ctx.save();
      ctx.lineWidth = 4;
      for (const r of board.zigzag.rotors) {
        if (r.y < view.cameraY - 260 || r.y > view.cameraY + view.viewHWorld + 260) continue;
        ctx.strokeStyle = "rgba(255, 176, 0, 0.70)";
        ctx.fillStyle = "rgba(255, 176, 0, 0.08)";
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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

    // Slot visuals removed: we only show the final (last) result via UI/modal.

    // Pegs.
    if (board.pegRows && board.pegRows.length) {
      const yMin = view.cameraY - 60;
      const yMax = view.cameraY + view.viewHWorld + 60;
      const r0 = clampInt(Math.floor((yMin - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
      const r1 = clampInt(Math.ceil((yMax - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
      for (let rr = r0; rr <= r1; rr++) {
        const row = board.pegRows[rr];
        for (const p of row) {
          // Bumper: chrome rim + neon core.
          const r = p.r;
          ctx.shadowColor = "rgba(69,243,195,0.25)";
          ctx.shadowBlur = 10;
          const rim = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.35, 1, p.x, p.y, r * 1.4);
          rim.addColorStop(0, "rgba(255,255,255,0.80)");
          rim.addColorStop(1, "rgba(0,0,0,0.55)");
          ctx.fillStyle = rim;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.fill();

          const core = ctx.createRadialGradient(p.x - r * 0.2, p.y - r * 0.2, 2, p.x, p.y, r);
          core.addColorStop(0, "rgba(255,255,255,0.20)");
          core.addColorStop(1, "rgba(69,243,195,0.18)");
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Drop guide removed (no click-to-set drop position).

    // Marbles (pending + active).
    for (const m of [...(state.pending || []), ...state.marbles]) {
      // Hide finished marbles to avoid clutter when 100+ arrive.
      if (m.done) continue;
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

      // Arrival order badge for the single-slot mode.
      if (board.slotCount === 1 && m.done && m.result?.label) {
        const txt = String(m.result.label);
        const fontSize = Math.max(11, Math.min(18, r * 0.95));
        ctx.font = `800 ${fontSize}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Small plate for contrast over photos.
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(12, r * 0.62), 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(txt, 0, 0);
      }

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
