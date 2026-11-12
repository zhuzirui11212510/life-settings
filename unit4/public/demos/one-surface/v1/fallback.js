(() => {
  "use strict";

  const turn = Math.PI * 2;
  const radius = 1.46;
  const halfWidth = .55;
  const steps = 128;
  const crossSteps = 7;
  const traceWidth = -halfWidth * .65;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const wrap = angle => (angle % turn + turn) % turn;
  const mix = (a, b, t) => a + (b - a) * t;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const normalize = vector => {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const smooth = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const light = normalize([-.46, .83, .42]);
  const stocks = {
    raw: [223, 91, 59],
    a: [228, 100, 65],
    b: [133, 160, 172],
  };

  function surface(angle, across, twists) {
    const phase = angle * twists / 2;
    const reach = radius + across * Math.cos(phase);
    return [reach * Math.cos(angle), across * Math.sin(phase), reach * Math.sin(angle)];
  }

  function normal(angle, across, twists) {
    const rate = twists / 2;
    const phase = angle * rate;
    const sx = Math.sin(angle);
    const cx = Math.cos(angle);
    const sw = Math.sin(phase);
    const cw = Math.cos(phase);
    const reach = radius + across * cw;
    const speed = -across * rate * sw;
    return normalize(cross([speed * cx - reach * sx, across * rate * cw, speed * sx + reach * cx],
      [cw * cx, sw, cw * sx]));
  }

  function projector(yaw, elevation, zoom, width, height) {
    const eye = [Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation)];
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = cross(eye, right);
    const scale = Math.min(width / 4.86, height / 3.47) * zoom;
    const distance = 6.9;
    return {
      eye,
      scale,
      project(position) {
        const depth = dot(position, eye);
        const perspective = distance / (distance - depth);
        return [
          width * .5 + dot(position, right) * scale * perspective,
          height * .5 - dot(position, up) * scale * perspective,
          depth,
        ];
      },
    };
  }

  function amountOpen(angle, proportion, distance, thickness) {
    if (proportion <= 0) return 0;
    if (proportion >= 1) return thickness;
    return thickness * smooth(Math.min(angle, distance * proportion - angle) / .17);
  }

  function regions(angle, state) {
    if (state.mode !== "cut" || state.cutting <= 0) {
      return [[-halfWidth, halfWidth, "raw"]];
    }
    const local = angle - state.mark;
    const requestedGap = .023 + state.split * .052;
    const center = state.offset * halfWidth;
    const odd = state.twists % 2 === 1;
    const revealed = state.cutting >= 1;
    if (odd && center > 0) {
      const gap = Math.min(requestedGap, center * .63, (halfWidth - center) * .55);
      const first = amountOpen(local, state.cutting, turn * 2, gap);
      const second = amountOpen(local + turn, state.cutting, turn * 2, gap);
      return [
        [-halfWidth, -center - second, revealed ? "b" : "raw"],
        [-center + second, center - first, revealed ? "a" : "raw"],
        [center + first, halfWidth, revealed ? "b" : "raw"],
      ];
    }
    const gap = Math.min(requestedGap, (halfWidth - center) * .54);
    const first = amountOpen(local, state.cutting, turn, gap);
    return [
      [-halfWidth, center - first, revealed ? "a" : "raw"],
      [center + first, halfWidth, revealed ? (odd ? "a" : "b") : "raw"],
    ];
  }

  function paperTone(base, illumination, grain, subdued) {
    const wash = subdued ? .38 : 0;
    return "rgb(" + base.map((value, index) => Math.round(
      clamp(mix(value * illumination + grain, [202, 201, 192][index], wash), 0, 255)
    )).join(",") + ")";
  }

  function contains(point, polygon) {
    let previous = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const side = Math.sign((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]));
      if (side && previous && side !== previous) return false;
      if (side) previous = side;
    }
    return true;
  }

  function create(container, callbacks = {}) {
    const canvas = document.createElement("canvas");
    canvas.className = "ribbon-fallback-canvas";
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;user-select:none;cursor:grab";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "group");
    canvas.setAttribute("aria-label", "可旋转的纸带。方向键调整视角，加号和减号缩放，Home 键复位。");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      callbacks.onError?.("这个浏览器无法绘制纸带。");
      return null;
    }
    container.append(canvas);
    const controller = new AbortController();
    const listenerOptions = { signal: controller.signal };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const poses = {
      default: { yaw: .35, elevation: .63, zoom: 1 },
      top: { yaw: 0, elevation: Math.PI / 2 - .012, zoom: 1 },
      side: { yaw: Math.PI / 2, elevation: .08, zoom: 1 },
    };
    const camera = { ...poses.default };
    const destination = { ...poses.default };
    const pointers = new Map();
    let drag = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frame = 0;
    let lastTime = 0;
    let ready = false;
    let destroyed = false;
    let visualTwists = 1;
    let visibleFaces = [];
    let activeProbe = null;
    let pathSamples = [];
    let current = {
      twists: 1, progress: 0, cutting: 0, offset: 0, split: 0,
      mode: "build", highlight: "all", showGrid: false, showSeam: true, mark: 0,
    };

    function schedule() {
      if (!destroyed && !frame) frame = requestAnimationFrame(draw);
    }

    function resize() {
      const bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      schedule();
    }

    function shapePath(points) {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) context.lineTo(points[i][0], points[i][1]);
    }

    function drawShadow(scale) {
      context.save();
      context.translate(width * .505, height * .5 + Math.min(height * .295, scale * .98));
      context.scale(1, .23);
      const spread = Math.min(width * .43, scale * 2.2);
      const shadow = context.createRadialGradient(0, 0, 0, 0, 0, spread);
      shadow.addColorStop(0, "rgba(51,33,39,.22)");
      shadow.addColorStop(.58, "rgba(51,33,39,.13)");
      shadow.addColorStop(1, "rgba(51,33,39,0)");
      context.fillStyle = shadow;
      context.fillRect(-spread, -spread, spread * 2, spread * 2);
      context.restore();
    }

    function buildSurface(projection) {
      const faces = [];
      const angle0 = current.mode === "cut" ? current.mark : 0;
      const rings = Array.from({ length: steps + 1 }, (_, segment) => {
        const angle = angle0 + segment / steps * turn;
        return regions(angle, current).map(([start, end, part]) => {
          const points = Array.from({ length: crossSteps + 1 }, (_, crossIndex) => {
            const across = mix(start, end, crossIndex / crossSteps);
            return projection.project(surface(angle, across, visualTwists));
          });
          return { start, end, part, points };
        });
      });
      for (let segment = 0; segment < steps; segment++) {
        const angle = angle0 + segment / steps * turn;
        const halfAngle = angle + Math.PI / steps;
        for (let band = 0; band < rings[segment].length; band++) {
          const first = rings[segment][band];
          const second = rings[segment + 1][band];
          for (let column = 0; column < crossSteps; column++) {
            const points = [first.points[column], second.points[column], second.points[column + 1], first.points[column + 1]];
            const depth = points.reduce((sum, point) => sum + point[2], 0) * .25;
            const across = mix(first.start, first.end, (column + .5) / crossSteps);
            const surfaceNormal = normal(halfAngle, across, visualTwists);
            const relative = dot(surfaceNormal, projection.eye);
            const facing = relative > 0 ? 1 : -1;
            const diffuse = Math.max(0, dot(surfaceNormal, light) * facing);
            const rim = 1 - Math.abs(relative);
            const recessed = Math.max(0, .34 - depth * .14);
            const facingLight = mix(.42, diffuse, smooth(Math.abs(relative) / .26));
            const sheen = .71 + facingLight * .33 + Math.pow(rim, 3) * .045 - recessed * .13;
            const grain = (Math.sin(halfAngle * 55 + across * 173) + Math.cos(halfAngle * 24 - across * 151)) * 1.02;
            const subdued = current.highlight !== "all" && current.highlight !== first.part;
            const fill = paperTone(stocks[first.part], sheen, grain, subdued);
            faces.push({ points, angle, part: first.part, depth, fill, kind: "face" });
            if (column === 0 || column === crossSteps - 1) {
              const edge = column === 0 ? [points[0], points[1]] : [points[3], points[2]];
              faces.push({
                points: edge, depth: depth + .025, kind: "line",
                stroke: diffuse > .5 ? "rgba(255,205,160,.73)" : "rgba(103,48,34,.68)",
                weight: 1.22,
              });
            }
            if ((segment * 2 + column * 3) % 11 === 0 && diffuse > .12) {
              const fraction = .31 + Math.abs(grain) * .12;
              const lineStart = [mix(points[0][0], points[3][0], fraction), mix(points[0][1], points[3][1], fraction)];
              const lineEnd = [mix(points[1][0], points[2][0], fraction), mix(points[1][1], points[2][1], fraction)];
              const fiber = [
                [mix(lineStart[0], lineEnd[0], .34), mix(lineStart[1], lineEnd[1], .34)],
                [mix(lineStart[0], lineEnd[0], .76), mix(lineStart[1], lineEnd[1], .76)],
              ];
              faces.push({ points: fiber, depth: depth + .012, kind: "line", stroke: "rgba(255,235,181,.23)", weight: .65 });
            }
          }
        }
      }
      return faces;
    }

    function addPrint(faces, projection) {
      activeProbe = null;
      pathSamples = [];

      function lift(angle, across, polarity = 0) {
        const position = surface(angle, across, visualTwists);
        const surfaceNormal = normal(angle, across, visualTwists);
        const relative = dot(surfaceNormal, projection.eye);
        if (polarity && relative * polarity < .018) return null;
        const side = polarity || Math.sign(relative) || 1;
        return projection.project(position.map((value, axis) => value + surfaceNormal[axis] * side * .012));
      }

      function line(a, b, stroke, weight) {
        if (!a || !b) return;
        faces.push({ points: [a, b], depth: (a[2] + b[2]) * .5 + .028, kind: "line", stroke, weight });
      }

      function route(start, distance, across, stroke, weight, dashed, side = 0) {
        const count = Math.max(2, Math.ceil(distance / turn * 240));
        for (let i = 0; i < count; i++) {
          if (dashed && i % 6 > 2) continue;
          const a = start + distance * i / count;
          const b = start + distance * (i + 1) / count;
          line(lift(a, across, side), lift(b, across, side), stroke, weight);
        }
      }

      function addProbe(distance, across, progress, side, paint, outline) {
        for (let i = 0; i <= 192; i++) {
          const fraction = i / 192;
          const point = lift(current.mark + distance * fraction, across, side);
          if (point) pathSamples.push({ fraction, point });
        }
        const point = lift(current.mark + distance * progress, across, side);
        if (!point) return;
        activeProbe = point;
        faces.push({ kind: "probe", depth: point[2] + .061, point, paint, outline });
      }

      if (current.showGrid && current.cutting < .001) {
        for (let i = 0; i < 32; i++) {
          const angle = i / 32 * turn;
          line(lift(angle, -halfWidth * .93), lift(angle, halfWidth * .93), "rgba(57,33,31,.23)", .7);
        }
      }
      if (current.showSeam && current.cutting <= 0) {
        for (let i = 0; i < 9; i += 2) {
          const across = mix(-halfWidth, halfWidth, i / 9);
          const next = mix(-halfWidth, halfWidth, (i + 1) / 9);
          line(lift(0, across), lift(0, next), "rgba(60,34,31,.78)", 1.6);
        }
      }
      if (current.mode === "cut") {
        const across = current.offset * halfWidth;
        const distance = current.offset && current.twists % 2 ? turn * 2 : turn;
        if (current.cutting < .999) {
          route(current.mark, distance, across, "rgba(62,35,37,.69)", 1.35, true);
        }
        if (current.cutting > 0 && current.cutting < 1) {
          route(current.mark, distance * current.cutting, across, "#fbebbd", 1.65, false);
        }
        if (current.cutting < 1) addProbe(distance, across, current.cutting, 0, "#fff5d9", "#4a2922");
        return;
      }
      if (current.mode === "build") {
        route(0, turn, 0, "rgba(64,36,31,.44)", .9, true);
        return;
      }
      const distance = turn * (current.twists % 2 ? 2 : 1);
      const markedNormal = normal(current.mark, traceWidth, visualTwists);
      // Choose the painted local face when the user sets the origin and keep it as the view turns.
      const side = paintSide || (dot(markedNormal, projection.eye) >= 0 ? 1 : -1);
      const start = lift(current.mark, traceWidth, side);
      route(current.mark, distance, traceWidth, "rgba(248,225,177,.53)", 1, true, side);
      if (current.progress > 0) {
        route(current.mark, distance * current.progress, traceWidth, "#fff1bb", 2.3, false, side);
      }
      if (start) faces.push({ kind: "origin", depth: start[2] + .058, point: start });
      addProbe(distance, traceWidth, current.progress, side, "#fff5c9", "#503426");
    }

    let paintSide = 0;

    function draw(now) {
      frame = 0;
      if (width < 2 || height < 2) return;
      const dt = lastTime ? clamp(now - lastTime, 0, 55) : 16;
      lastTime = now;
      const quick = reduced.matches || Boolean(drag);
      const easing = quick ? 1 : 1 - Math.exp(-dt / 75);
      let animating = false;
      for (const key of Object.keys(camera)) {
        const delta = destination[key] - camera[key];
        if (Math.abs(delta) < .001) camera[key] = destination[key];
        else {
          camera[key] += delta * easing;
          animating = true;
        }
      }
      const twistGap = current.twists - visualTwists;
      if (Math.abs(twistGap) < .003 || current.mode !== "build" || reduced.matches) {
        visualTwists = current.twists;
      } else {
        visualTwists += twistGap * (1 - Math.exp(-dt / 90));
        animating = true;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const projection = projector(camera.yaw, camera.elevation, camera.zoom, width, height);
      drawShadow(projection.scale);
      const faces = buildSurface(projection);
      addPrint(faces, projection);
      faces.sort((a, b) => a.depth - b.depth);
      visibleFaces = faces.filter(face => face.kind === "face");
      context.lineCap = "round";
      context.lineJoin = "round";
      for (const face of faces) {
        if (face.kind === "face") {
          shapePath(face.points);
          context.closePath();
          context.fillStyle = face.fill;
          context.strokeStyle = face.fill;
          context.lineWidth = 1.14;
          context.fill();
          context.stroke();
        } else if (face.kind === "line") {
          shapePath(face.points);
          context.strokeStyle = face.stroke;
          context.lineWidth = face.weight;
          context.stroke();
        } else {
          context.beginPath();
          context.arc(face.point[0], face.point[1], face.kind === "probe" ? 5 : 7.1, 0, turn);
          if (face.kind === "probe") {
            context.fillStyle = face.paint;
            context.fill();
          }
          context.strokeStyle = face.outline || "rgba(255,242,202,.9)";
          context.lineWidth = face.kind === "probe" ? 1.55 : 1.05;
          context.stroke();
        }
      }
      if (!ready) {
        ready = true;
        queueMicrotask(() => { if (!destroyed) callbacks.onReady?.(); });
      }
      if (animating) schedule();
    }

    function setView(view) {
      const key = view === "perspective" ? "default" : view === "front" ? "side" : view;
      const pose = poses[key] || poses.default;
      destination.yaw = camera.yaw + wrap(pose.yaw - camera.yaw + Math.PI) - Math.PI;
      destination.elevation = pose.elevation;
      schedule();
    }

    function resetView() {
      destination.zoom = poses.default.zoom;
      setView("default");
    }

    function localPoint(event) {
      const bounds = canvas.getBoundingClientRect();
      return [event.clientX - bounds.left, event.clientY - bounds.top];
    }

    function selectPoint(point) {
      for (let i = visibleFaces.length - 1; i >= 0; i--) {
        const face = visibleFaces[i];
        if (!contains(point, face.points)) continue;
        const start = [(face.points[0][0] + face.points[3][0]) / 2, (face.points[0][1] + face.points[3][1]) / 2];
        const end = [(face.points[1][0] + face.points[2][0]) / 2, (face.points[1][1] + face.points[2][1]) / 2];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const portion = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const angle = wrap(face.angle + portion / steps * turn);
        const projection = projector(camera.yaw, camera.elevation, camera.zoom, width, height);
        paintSide = dot(normal(angle, traceWidth, visualTwists), projection.eye) >= 0 ? 1 : -1;
        callbacks.onMark?.(angle);
        return;
      }
    }

    function scrubTo(point) {
      let chosen = null;
      let best = Infinity;
      const progress = current.mode === "cut" ? current.cutting : current.progress;
      for (const sample of pathSamples) {
        const distance = Math.hypot(point[0] - sample.point[0], point[1] - sample.point[1]);
        const continuity = Math.abs(sample.fraction - progress) * 11;
        if (distance + continuity < best) {
          chosen = sample;
          best = distance + continuity;
        }
      }
      if (chosen && best < 48) callbacks.onScrub?.(chosen.fraction);
    }

    function beginDrag(event) {
      if (event.button !== 0) return;
      const point = localPoint(event);
      pointers.set(event.pointerId, point);
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 1) {
        const probe = !current.playing && activeProbe && Math.hypot(point[0] - activeProbe[0], point[1] - activeProbe[1]) < 14;
        drag = { origin: point, last: point, moved: false, probe };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        drag = { moved: true, distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: destination.zoom };
      }
      canvas.style.cursor = "grabbing";
    }

    function moveDrag(event) {
      const point = localPoint(event);
      if (!drag || !pointers.has(event.pointerId)) {
        const onProbe = !current.playing && activeProbe && Math.hypot(point[0] - activeProbe[0], point[1] - activeProbe[1]) < 14;
        canvas.style.cursor = onProbe ? "ew-resize" : "grab";
        return;
      }
      pointers.set(event.pointerId, point);
      if (pointers.size === 2 && drag.distance > 0) {
        const [a, b] = [...pointers.values()];
        destination.zoom = clamp(drag.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / drag.distance, .66, 1.8);
      } else if (pointers.size === 1 && drag.last) {
        if (!drag.moved && Math.hypot(point[0] - drag.origin[0], point[1] - drag.origin[1]) < 5) return;
        drag.moved = true;
        if (drag.probe) scrubTo(point);
        else {
          destination.yaw -= (point[0] - drag.last[0]) * .009;
          destination.elevation = clamp(destination.elevation + (point[1] - drag.last[1]) * .009, -1.42, 1.56);
        }
        drag.last = point;
      }
      schedule();
    }

    function endDrag(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (!pointers.size) {
        const canMark = current.mode === "build" || (current.mode === "trace" && current.progress <= 0) ||
          (current.mode === "cut" && current.cutting <= 0);
        if (drag && !drag.moved && event.type === "pointerup" && canMark && !current.playing) {
          selectPoint(localPoint(event));
        }
        drag = null;
        canvas.style.cursor = "grab";
      } else if (pointers.size === 1) {
        const point = [...pointers.values()][0];
        drag = { origin: point, last: point, moved: true, probe: false };
      }
    }

    canvas.addEventListener("pointerdown", beginDrag, listenerOptions);
    canvas.addEventListener("pointermove", moveDrag, listenerOptions);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(type, endDrag, listenerOptions);
    }
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      destination.zoom = clamp(destination.zoom * Math.exp(-event.deltaY * .00125), .66, 1.8);
      schedule();
    }, { ...listenerOptions, passive: false });
    canvas.addEventListener("keydown", event => {
      if (event.key === "Home") resetView();
      else if (event.key === "+" || event.key === "=") destination.zoom = clamp(destination.zoom + .09, .66, 1.8);
      else if (event.key === "-") destination.zoom = clamp(destination.zoom - .09, .66, 1.8);
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") destination.yaw += event.key === "ArrowLeft" ? .2 : -.2;
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") destination.elevation = clamp(destination.elevation + (event.key === "ArrowUp" ? .14 : -.14), -1.42, 1.56);
      else return;
      event.preventDefault();
      schedule();
    }, listenerOptions);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return {
      update(state) {
        const newTraceOrigin = state.mode === "trace" && (current.mode !== "trace" || state.mark !== current.mark);
        current = { ...current, ...state };
        if (newTraceOrigin) {
          const projection = projector(camera.yaw, camera.elevation, camera.zoom, width, height);
          paintSide = dot(normal(current.mark, traceWidth, current.twists), projection.eye) >= 0 ? 1 : -1;
        }
        schedule();
      },
      resetView,
      setView,
      setZoom(factor) {
        destination.zoom = clamp(destination.zoom * factor, .66, 1.8);
        schedule();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(frame);
        controller.abort();
        observer.disconnect();
        canvas.remove();
      },
    };
  }

  window.RibbonFallback = { create };
})();
