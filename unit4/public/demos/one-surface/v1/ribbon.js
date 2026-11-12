(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const RADIUS = 1.46;
  const HALF_WIDTH = .56;
  const INK_OFFSET = -.65 * HALF_WIDTH;
  const DEFAULT = { twists: 1, progress: 0, cutting: 0, offset: 0, split: 0, mode: "build", highlight: "all", showGrid: true, showSeam: true, playing: false, mark: 0 };
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const mod = (value, period) => ((value % period) + period) % period;
  const smooth = value => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const angleDelta = (from, to) => mod(to - from + Math.PI, TAU) - Math.PI;

  // A full lap advances the local width coordinate by a reflection for each odd twist.
  function stripPoint(t, width, twists, point, normal) {
    const bend = twists / 2;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const cosBend = Math.cos(t * bend);
    const sinBend = Math.sin(t * bend);
    const radial = RADIUS + width * cosBend;
    point.set(radial * cosT, width * sinBend, radial * sinT);
    const drift = -width * bend * sinBend;
    const tx = drift * cosT - radial * sinT;
    const ty = width * bend * cosBend;
    const tz = drift * sinT + radial * cosT;
    const wx = cosBend * cosT;
    const wy = sinBend;
    const wz = cosBend * sinT;
    normal.set(ty * wz - tz * wy, tz * wx - tx * wz, tx * wy - ty * wx).normalize();
  }

  function paperTexture(THREE) {
    const textureSource = document.createElement("canvas");
    textureSource.width = 1536;
    textureSource.height = 512;
    const ctx = textureSource.getContext("2d");
    const { width, height } = textureSource;
    let seed = 946219;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const fiber = (random() - .5) * 6;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const wave = Math.sin(x / width * TAU * 4 + y * .012) * 1.8;
        const grain = (random() - .5) * 17 + fiber + wave;
        image.data[i] = 222 + grain;
        image.data[i + 1] = 74 + grain * .8;
        image.data[i + 2] = 43 + grain * .68;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    for (let i = 0; i < 8500; i++) {
      ctx.fillStyle = i % 2 ? "#ffe5bd2a" : "#69342035";
      ctx.fillRect(random() * width, random() * height, .5 + random() * 5, .55 + random() * .85);
    }
    ctx.strokeStyle = "#ffe4ad7a";
    ctx.lineWidth = 1.75;
    for (const y of [31, height - 31]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let i = 0; i < 96; i++) {
      const x = (i + .5) * width / 96;
      const length = i % 12 === 0 ? 20 : i % 3 === 0 ? 11 : 6;
      ctx.strokeStyle = i % 12 ? "#ffe4ad63" : "#fff0cbb5";
      ctx.beginPath();
      ctx.moveTo(x, 31);
      ctx.lineTo(x, 31 + length);
      ctx.moveTo(x, height - 31);
      ctx.lineTo(x, height - 31 - length);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffe4b29a";
    for (let x = width / 24; x < width; x += width / 12) {
      ctx.fillRect(x, height / 2 - 1, width / 29, 2);
    }
    const texture = new THREE.CanvasTexture(textureSource);
    texture.wrapS = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  function planeGeometry(THREE, rows, columns) {
    const geometry = new THREE.BufferGeometry();
    const vertices = (rows + 1) * (columns + 1);
    const position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    const normal = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    const uv = new THREE.BufferAttribute(new Float32Array(vertices * 2), 2);
    position.setUsage(THREE.DynamicDrawUsage);
    normal.setUsage(THREE.DynamicDrawUsage);
    uv.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", position);
    geometry.setAttribute("normal", normal);
    geometry.setAttribute("uv", uv);
    const index = [];
    const stride = columns + 1;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const here = row * stride + column;
        index.push(here, here + stride, here + 1, here + 1, here + stride, here + stride + 1);
      }
    }
    geometry.setIndex(index);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3.1);
    return geometry;
  }

  function makeBand(THREE, scene, texture) {
    const rows = 288;
    const columns = 12;
    const geometry = planeGeometry(THREE, rows, columns);
    const paper = new THREE.MeshStandardMaterial({
      map: texture, roughness: .88, side: THREE.DoubleSide, color: 0xffffff,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4cba8, roughness: .88, side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(geometry, paper);
    panel.castShadow = true;
    panel.receiveShadow = true;
    const edges = [0, 1].map(() => {
      const mesh = new THREE.Mesh(planeGeometry(THREE, rows, 1), edgeMaterial);
      mesh.frustumCulled = false;
      return mesh;
    });
    scene.add(panel, ...edges);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const position = geometry.getAttribute("position");
    const direction = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");

    function update({ from, to, twists, limits, edgeSizes }) {
      for (let row = 0; row <= rows; row++) {
        const t = from + (to - from) * (row / rows);
        const [low, high] = limits(t);
        for (let column = 0; column <= columns; column++) {
          const v = low + (high - low) * (column / columns);
          const i = row * (columns + 1) + column;
          stripPoint(t, v, twists, point, normal);
          position.setXYZ(i, point.x, point.y, point.z);
          direction.setXYZ(i, normal.x, normal.y, normal.z);
          uv.setXY(i, t / TAU, (v + HALF_WIDTH) / (2 * HALF_WIDTH));
        }
        const thickness = edgeSizes(t);
        for (const [side, v] of [low, high].entries()) {
          stripPoint(t, v, twists, point, normal);
          const attributes = edges[side].geometry.attributes;
          const radialX = Math.cos(t) * (side ? 1 : -1);
          const radialZ = Math.sin(t) * (side ? 1 : -1);
          for (let face = 0; face < 2; face++) {
            const z = (face ? 1 : -1) * thickness[side];
            const i = row * 2 + face;
            attributes.position.setXYZ(i, point.x + normal.x * z, point.y + normal.y * z, point.z + normal.z * z);
            attributes.normal.setXYZ(i, radialX, 0, radialZ);
          }
        }
      }
      position.needsUpdate = direction.needsUpdate = uv.needsUpdate = true;
      for (const edge of edges) {
        edge.geometry.attributes.position.needsUpdate = true;
        edge.geometry.attributes.normal.needsUpdate = true;
      }
    }

    return {
      panel, paper, edgeMaterial, update, rows, columns, position,
      show(visible) { panel.visible = visible; edges.forEach(edge => { edge.visible = visible; }); },
    };
  }

  function makeFloor(THREE, scene) {
    const ground = new THREE.Group();
    scene.add(ground);
    const height = -.71;
    const castSize = 6.1;
    const castPixels = 320;
    const castSource = document.createElement("canvas");
    const castMask = document.createElement("canvas");
    castSource.width = castSource.height = castMask.width = castMask.height = castPixels;
    const castContext = castSource.getContext("2d");
    const maskContext = castMask.getContext("2d");
    const castTexture = new THREE.CanvasTexture(castSource);
    castTexture.colorSpace = THREE.SRGBColorSpace;
    const viewport = { value: new THREE.Vector2(1, 1) };
    function softenFrameEdge(material) {
      material.onBeforeCompile = shader => {
        shader.uniforms.floorViewport = viewport;
        shader.fragmentShader = `
          uniform vec2 floorViewport;
          ${shader.fragmentShader.replace("#include <dithering_fragment>", `
            #include <dithering_fragment>
            vec2 withinFrame = gl_FragCoord.xy / floorViewport;
            gl_FragColor.a *= smoothstep(0.0, 0.15, withinFrame.y)
              * smoothstep(0.0, 0.055, min(withinFrame.x, 1.0 - withinFrame.x));
          `)}
        `;
      };
    }
    const cast = new THREE.Mesh(new THREE.PlaneGeometry(castSize, castSize), new THREE.MeshBasicMaterial({
      map: castTexture, transparent: true, opacity: .24, depthWrite: false,
    }));
    softenFrameEdge(cast.material);
    cast.rotation.x = -Math.PI / 2;
    cast.position.y = height;
    scene.add(cast);

    const contactSource = document.createElement("canvas");
    contactSource.width = contactSource.height = 256;
    const ctx = contactSource.getContext("2d");
    const falloff = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    falloff.addColorStop(0, "#283a4b35");
    falloff.addColorStop(.36, "#283a4b20");
    falloff.addColorStop(.72, "#283a4b0a");
    falloff.addColorStop(1, "#283a4b00");
    ctx.fillStyle = falloff;
    ctx.fillRect(0, 0, 256, 256);
    const contactTexture = new THREE.CanvasTexture(contactSource);
    contactTexture.colorSpace = THREE.SRGBColorSpace;
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.15), new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
    softenFrameEdge(contact.material);
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(.2, height - .008, .12);
    scene.add(contact);

    const positions = [];
    for (let i = -8; i <= 8; i++) {
      const point = i * .31;
      positions.push(-2.48, height + .013, point, 2.48, height + .013, point);
      positions.push(point, height + .013, -2.48, point, height + .013, 2.48);
    }
    const gridGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    ground.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0x52737b, transparent: true, opacity: .115, depthWrite: false })));
    const scale = [];
    for (let i = 0; i < 120; i++) {
      const t = i / 120 * TAU;
      const length = i % 10 === 0 ? .124 : .049;
      scale.push(2.37 * Math.cos(t), height + .018, 2.37 * Math.sin(t), (2.37 + length) * Math.cos(t), height + .018, (2.37 + length) * Math.sin(t));
    }
    const scaleGeometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(scale, 3));
    ground.add(new THREE.LineSegments(scaleGeometry, new THREE.LineBasicMaterial({ color: 0x48626b, transparent: true, opacity: .24, depthWrite: false })));
    function drawCast(bands) {
      maskContext.clearRect(0, 0, castPixels, castPixels);
      maskContext.fillStyle = "#34444a";
      const stride = castPixels / castSize;
      function shadowPoint(band, row, side, start = false) {
        const index = row * (band.columns + 1) + side * band.columns;
        const drop = band.position.getY(index) - height;
        const x = castPixels / 2 + stride * (.96 * band.position.getX(index) + .27 * drop);
        const y = castPixels / 2 + stride * (.96 * band.position.getZ(index) + .13 * drop);
        if (start) maskContext.moveTo(x, y);
        else maskContext.lineTo(x, y);
      }
      for (const band of bands) {
        if (!band.panel.visible) continue;
        for (let row = 0; row < band.rows; row += 4) {
          const next = Math.min(band.rows, row + 4);
          maskContext.beginPath();
          shadowPoint(band, row, 0, true);
          shadowPoint(band, row, 1);
          shadowPoint(band, next, 1);
          shadowPoint(band, next, 0);
          maskContext.closePath();
          maskContext.fill();
        }
      }
      castContext.clearRect(0, 0, castPixels, castPixels);
      castContext.filter = "blur(6px)";
      castContext.drawImage(castMask, 0, 0);
      castTexture.needsUpdate = true;
    }
    return { ground, cast, castTexture, drawCast, contact, contactTexture, viewport };
  }

  function makeGuide(THREE, scene, color) {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(289 * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    const distances = new THREE.BufferAttribute(new Float32Array(positions.count), 1);
    distances.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("lineDistance", distances);
    const material = new THREE.LineDashedMaterial({ color, dashSize: .054, gapSize: .054, transparent: true, opacity: .88 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    return {
      line,
      update(start, length, v, twists, side) {
        for (let i = 0; i < positions.count; i++) {
          stripPoint(start + length * i / (positions.count - 1), v, twists, point, normal);
          point.addScaledVector(normal, side * .012);
          positions.setXYZ(i, point.x, point.y, point.z);
          if (i > 0) distances.setX(i, distances.getX(i - 1) + Math.hypot(
            point.x - positions.getX(i - 1), point.y - positions.getY(i - 1), point.z - positions.getZ(i - 1),
          ));
        }
        positions.needsUpdate = distances.needsUpdate = true;
      },
    };
  }

  function makeInk(THREE, scene) {
    const rows = 288;
    const geometry = planeGeometry(THREE, rows, 1);
    const paint = new THREE.MeshBasicMaterial({ color: 0x143e68, side: THREE.DoubleSide });
    const ink = new THREE.Mesh(geometry, paint);
    scene.add(ink);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    return {
      ink,
      update(start, length, twists, face) {
        const position = geometry.getAttribute("position");
        for (let i = 0; i <= rows; i++) {
          const t = start + length * i / rows;
          for (let side = 0; side < 2; side++) {
            stripPoint(t, INK_OFFSET + (side ? .017 : -.017), twists, point, normal);
            point.addScaledVector(normal, .013 * face);
            position.setXYZ(i * 2 + side, point.x, point.y, point.z);
          }
        }
        position.needsUpdate = true;
      },
    };
  }

  function createWebGL(THREE, container, callbacks, onContextLost) {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.01;
    const canvas = renderer.domElement;
    canvas.className = "ribbon-canvas";
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab;";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "纸带三维模型。拖动旋转，滚动或双指缩放。方向键旋转，加减键缩放，Home 还原。");
    container.append(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .09, 40);
    scene.add(new THREE.HemisphereLight(0xfff7e9, 0x9baeb5, 1.7));
    const key = new THREE.DirectionalLight(0xffe9d7, 2.85);
    key.position.set(-3.9, 6.4, -2.75);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.1, right: 3.1, top: 3.1, bottom: -3.1, near: .5, far: 14 });
    key.shadow.normalBias = .032;
    key.shadow.bias = -.00025;
    key.shadow.radius = 3.5;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd8eaf1, 1.23);
    fill.position.set(4, 2.8, 3.7);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9c6, .85);
    rim.position.set(1, .5, -5.5);
    scene.add(rim);

    const floor = makeFloor(THREE, scene);
    const texture = paperTexture(THREE);
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const bands = [makeBand(THREE, scene, texture), makeBand(THREE, scene, texture)];
    const guides = [makeGuide(THREE, scene, 0x602b26), makeGuide(THREE, scene, 0x602b26)];
    const paint = makeInk(THREE, scene);
    const seamGeometry = new THREE.BufferGeometry();
    seamGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const seam = new THREE.Line(seamGeometry, new THREE.LineBasicMaterial({ color: 0xffead1, transparent: true, opacity: .78 }));
    seam.renderOrder = 1;
    scene.add(seam);

    const pin = new THREE.Group();
    const pinRing = new THREE.Mesh(new THREE.TorusGeometry(.079, .0125, 10, 32), new THREE.MeshBasicMaterial({ color: 0xfff6dc }));
    const pinTip = new THREE.Mesh(new THREE.SphereGeometry(.036, 16, 12), new THREE.MeshBasicMaterial({ color: 0x153a62 }));
    const pinHit = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pin.add(pinRing, pinTip, pinHit);
    scene.add(pin);
    const markerPoint = new THREE.Vector3();
    const markerNormal = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const oxide = new THREE.Color(0xc5665e);
    const paperHits = bands.map(band => band.panel);
    const pick = new THREE.Raycaster();
    const coords = new THREE.Vector2();
    const pointers = new Map();
    const ideal = { yaw: .85, pitch: .57, zoom: 1 };
    const view = { ...ideal };
    let state = { ...DEFAULT };
    let currentTwists = state.twists;
    let transition = null;
    let drag = null;
    let firstUpdate = true;
    let requested = 0;
    let sizeChanged = true;
    let geometryChanged = true;
    let overlaysChanged = true;
    let chooseFace = true;
    let visibleFace = 1;
    let guideSignature = "";
    let finished = false;

    function request() {
      if (!requested && !finished) requested = requestAnimationFrame(draw);
    }

    function slit(t, period, depth) {
      if (state.cutting <= 0) return 0;
      if (state.cutting >= .9999) return depth;
      const along = mod(t - state.mark, period);
      const length = state.cutting * period;
      const edge = Math.min(along, length - along);
      return smooth(edge / .17) * depth;
    }

    function setGeometry(open) {
      const odd = state.twists % 2 === 1;
      const offset = state.offset * HALF_WIDTH;
      const center = offset < .001;
      const thickness = .010;
      const whole = state.mode !== "cut" || state.cutting <= 0 || !!transition;
      const first = bands[0];
      const second = bands[1];
      first.show(true);
      second.show(!whole && !(odd && center));
      if (whole) {
        first.update({ from: open, to: TAU - open, twists: currentTwists, limits: () => [-HALF_WIDTH, HALF_WIDTH], edgeSizes: () => [thickness, thickness] });
      } else {
        const depthLimit = odd && !center ? Math.min(offset * .41, (HALF_WIDTH - offset) * .47) : (HALF_WIDTH - offset) * .47;
        const depth = Math.min(.014 + .087 * state.split, depthLimit);
        const longPeriod = odd && !center ? 2 * TAU : TAU;
        const cut = t => slit(t, longPeriod, depth);
        const cutEdge = width => Math.min(thickness, width);
        const start = state.mark;
        if (odd && center) {
          first.update({ from: start, to: start + TAU * 2, twists: currentTwists, limits: t => [cut(t), HALF_WIDTH], edgeSizes: t => [cutEdge(cut(t)), thickness] });
        } else if (odd) {
          first.update({
            from: start, to: start + TAU, twists: currentTwists,
            limits: t => [-offset + cut(t + TAU), offset - cut(t)],
            edgeSizes: t => [cutEdge(cut(t + TAU)), cutEdge(cut(t))],
          });
          second.update({
            from: start, to: start + 2 * TAU, twists: currentTwists,
            limits: t => [offset + cut(t), HALF_WIDTH], edgeSizes: t => [cutEdge(cut(t)), thickness],
          });
        } else {
          first.update({
            from: start, to: start + TAU, twists: currentTwists,
            limits: t => [-HALF_WIDTH, offset - cut(t)], edgeSizes: t => [thickness, cutEdge(cut(t))],
          });
          second.update({
            from: start, to: start + TAU, twists: currentTwists,
            limits: t => [offset + cut(t), HALF_WIDTH], edgeSizes: t => [cutEdge(cut(t)), thickness],
          });
        }
      }
      const highlight = whole ? "all" : state.highlight;
      for (const [index, band] of bands.entries()) {
        const dim = highlight !== "all" && highlight !== (index === 0 ? "a" : "b");
        band.paper.color.setHex(0xffffff);
        if (index === 0 && second.panel.visible && state.cutting >= .9999) band.paper.color.lerp(oxide, smooth(state.split));
        if (dim) band.paper.color.multiplyScalar(.48);
        band.edgeMaterial.color.setHex(dim ? 0xab927e : 0xf4cba8);
      }
      floor.drawCast(bands);
      renderer.shadowMap.needsUpdate = true;
    }

    function positionSeam() {
      const positions = seam.geometry.getAttribute("position");
      const start = -HALF_WIDTH;
      for (let i = 0; i < 2; i++) {
        stripPoint(0, start + 2 * HALF_WIDTH * i, currentTwists, markerPoint, markerNormal);
        positions.setXYZ(i, markerPoint.x, markerPoint.y + .021, markerPoint.z);
      }
      positions.needsUpdate = true;
      seam.geometry.computeBoundingSphere();
    }

    function progressPath() {
      if (state.mode === "trace") {
        return { width: INK_OFFSET, length: state.twists % 2 ? 2 * TAU : TAU, fraction: state.progress };
      }
      if (state.mode === "cut") {
        return { width: state.offset * HALF_WIDTH, length: state.twists % 2 && state.offset > .001 ? 2 * TAU : TAU, fraction: state.cutting };
      }
      return { width: INK_OFFSET, length: TAU, fraction: 0 };
    }

    function setOverlays() {
      const path = progressPath();
      if (chooseFace && !transition) {
        stripPoint(state.mark, path.width, currentTwists, markerPoint, markerNormal);
        const cameraSide = markerNormal.dot(camera.position) - markerNormal.dot(markerPoint);
        visibleFace = cameraSide < 0 ? -1 : 1;
        chooseFace = false;
      }
      const probing = state.mode !== "build" || state.mark !== 0;
      const showGuides = state.mode === "cut" && state.cutting < .9999 && !transition;
      const signature = showGuides ? [state.mark, path.length, path.width, currentTwists].join(",") : "";
      guides.forEach((guide, i) => {
        guide.line.visible = showGuides;
        if (showGuides && signature !== guideSignature) guide.update(state.mark, path.length, path.width, currentTwists, i ? -1 : 1);
      });
      guideSignature = signature;
      floor.ground.visible = state.showGrid;
      seam.visible = state.showSeam && !transition && !(state.mode === "cut" && state.cutting > 0);
      if (seam.visible) positionSeam();
      paint.ink.visible = state.mode === "trace" && state.progress > 0 && !transition;
      if (paint.ink.visible) paint.update(state.mark, path.length * state.progress, currentTwists, visibleFace);

      pin.visible = probing && !transition && !(state.mode === "cut" && state.cutting >= .9999);
      if (pin.visible) {
        const t = state.mark + path.length * path.fraction;
        stripPoint(t, path.width, currentTwists, markerPoint, markerNormal);
        markerNormal.multiplyScalar(visibleFace);
        pin.position.copy(markerPoint).addScaledVector(markerNormal, .056);
        pin.quaternion.setFromUnitVectors(zAxis, markerNormal);
        pinTip.material.color.setHex(state.mode === "trace" ? 0x163f66 : 0x513321);
      }
    }

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, width * height > 700000 ? 1.4 : 1.7);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      renderer.getDrawingBufferSize(floor.viewport.value);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      return true;
    }

    function applyCamera() {
      const distance = 6.15 * Math.max(1, 1.30 / camera.aspect) / view.zoom;
      const flat = Math.cos(view.pitch) * distance;
      camera.position.set(flat * Math.sin(view.yaw), Math.sin(view.pitch) * distance, flat * Math.cos(view.yaw));
      camera.lookAt(0, -.06, 0);
      camera.updateMatrixWorld();
    }

    function draw(now) {
      requested = 0;
      if (finished) return;
      if (sizeChanged) {
        if (!resize()) return;
        sizeChanged = false;
      }
      let open = 0;
      if (transition) {
        const duration = 610;
        const fraction = clamp((now - transition.start) / duration, 0, 1);
        currentTwists = transition.from + (transition.to - transition.from) * smooth(fraction);
        open = .14 * Math.sin(Math.PI * fraction);
        if (fraction >= 1) {
          currentTwists = transition.to;
          transition = null;
        }
        geometryChanged = overlaysChanged = true;
      }
      if (geometryChanged) {
        setGeometry(open);
        geometryChanged = false;
      }
      let moving = false;
      for (const key of ["yaw", "pitch", "zoom"]) {
        const change = ideal[key] - view[key];
        if (Math.abs(change) < .0007 || motion.matches) view[key] = ideal[key];
        else {
          view[key] += change * (drag ? .42 : .22);
          moving = true;
        }
      }
      applyCamera();
      if (overlaysChanged) {
        setOverlays();
        overlaysChanged = false;
      }
      const below = clamp((view.pitch + .16) / .26, 0, 1);
      floor.cast.material.opacity = .24 * below;
      floor.contact.material.opacity = below;
      renderer.render(scene, camera);
      if (transition || moving) request();
    }

    function pointerRay(event) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      coords.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      pick.setFromCamera(coords, camera);
    }

    function paperAngle(event) {
      pointerRay(event);
      const hit = pick.intersectObjects(paperHits.filter(panel => panel.visible), false)[0];
      return hit ? mod(Math.atan2(hit.point.z, hit.point.x), TAU) : null;
    }

    function zoomTo(value) {
      ideal.zoom = clamp(value, .66, 1.64);
      request();
    }

    function pointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      if (pointers.size > 1) {
        const [a, b] = pointers.values();
        drag = { kind: "pinch", distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: ideal.zoom, moved: true };
      } else {
        pointerRay(event);
        const pinDepth = state.mode === "build" || !pin.visible || state.playing ? Infinity : pick.intersectObject(pinHit, false)[0]?.distance ?? Infinity;
        const paperDepth = pinDepth === Infinity ? 0 : pick.intersectObjects(paperHits.filter(panel => panel.visible), false)[0]?.distance ?? Infinity;
        const scrub = pinDepth < Infinity && pinDepth <= paperDepth + .04;
        drag = { kind: scrub ? "scrub" : "orbit", x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      }
      canvas.style.cursor = "grabbing";
    }

    function scrubAt(event) {
      const angle = paperAngle(event);
      if (angle === null) return;
      const { fraction, length } = progressPath();
      const current = fraction * length;
      const along = mod(angle - state.mark, TAU);
      const lower = Math.round((current - along) / TAU);
      const nearest = along + lower * TAU;
      callbacks.onScrub?.(clamp(nearest / length, 0, 1));
    }

    function pointerMove(event) {
      if (!drag || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (drag.kind === "pinch" && pointers.size >= 2) {
        const [a, b] = pointers.values();
        zoomTo(drag.zoom * Math.hypot(a.x - b.x, a.y - b.y) / drag.distance);
        return;
      }
      if (drag.kind === "pinch") return;
      drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
      if (drag.kind === "scrub") {
        if (drag.moved) scrubAt(event);
      } else if (drag.moved) {
        ideal.yaw -= (event.clientX - drag.x) * .009;
        ideal.pitch = clamp(ideal.pitch + (event.clientY - drag.y) * .008, -.83, Math.PI / 2 - .024);
        request();
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
    }

    function pointerEnd(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (pointers.size) return;
      if (event.type === "pointerup" && drag && !drag.moved && drag.kind === "orbit" && !state.playing &&
          (state.mode === "build" || (state.mode === "trace" && state.progress === 0) || (state.mode === "cut" && state.cutting === 0))) {
        const angle = paperAngle(event);
        if (angle !== null) callbacks.onMark?.(angle);
      }
      drag = null;
      canvas.style.cursor = "grab";
    }

    function wheel(event) {
      event.preventDefault();
      zoomTo(ideal.zoom * Math.exp(-event.deltaY * .00145));
    }

    function setView(which) {
      const poses = {
        default: [.85, .57], perspective: [.85, .57], top: [0, Math.PI / 2 - .025], side: [Math.PI / 2, .015], front: [Math.PI / 2, .015],
      };
      const [yaw, pitch] = poses[which] || poses.default;
      ideal.yaw = view.yaw + angleDelta(view.yaw, yaw);
      ideal.pitch = pitch;
      request();
    }

    function resetView() {
      zoomTo(1);
      setView("default");
    }

    function keyboard(event) {
      const key = event.key;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "Home"].includes(key)) return;
      event.preventDefault();
      if (key === "ArrowLeft") ideal.yaw += .15;
      if (key === "ArrowRight") ideal.yaw -= .15;
      if (key === "ArrowUp") ideal.pitch = Math.min(Math.PI / 2 - .024, ideal.pitch + .12);
      if (key === "ArrowDown") ideal.pitch = Math.max(-.83, ideal.pitch - .12);
      if (key === "+" || key === "=") zoomTo(ideal.zoom * 1.08);
      if (key === "-") zoomTo(ideal.zoom / 1.08);
      if (key === "Home") resetView();
      request();
    }

    function lostContext(event) {
      event.preventDefault();
      onContextLost();
    }

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, pointerEnd);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keyboard);
    canvas.addEventListener("webglcontextlost", lostContext);
    const observer = new ResizeObserver(() => { sizeChanged = true; request(); });
    observer.observe(container);
    request();

    return {
      update(update) {
        const previous = state;
        state = { ...DEFAULT, ...update };
        if (previous.twists !== state.twists || firstUpdate) {
          if (firstUpdate || motion.matches) {
            currentTwists = state.twists;
            transition = null;
          } else {
            transition = { from: currentTwists, to: state.twists, start: performance.now() };
          }
        }
        chooseFace ||= firstUpdate || ["twists", "mode", "mark", "offset"].some(key => state[key] !== previous[key]);
        geometryChanged ||= firstUpdate || ["twists", "offset", "cutting", "split", "mode", "highlight", "mark"].some(key => state[key] !== previous[key]);
        overlaysChanged ||= geometryChanged || ["progress", "showGrid", "showSeam"].some(key => state[key] !== previous[key]);
        firstUpdate = false;
        request();
      },
      resetView, setView, setZoom: zoomTo,
      destroy() {
        if (finished) return;
        finished = true;
        observer.disconnect();
        cancelAnimationFrame(requested);
        canvas.removeEventListener("webglcontextlost", lostContext);
        const geometries = new Set();
        const materials = new Set();
        scene.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          if (object.material) materials.add(object.material);
        });
        geometries.forEach(item => item.dispose());
        materials.forEach(item => item.dispose());
        texture.dispose();
        floor.castTexture.dispose();
        floor.contactTexture.dispose();
        key.shadow.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      },
    };
  }

  function create(container, callbacks = {}) {
    try {
      if (!window.THREE) throw new Error("三维绘图组件不可用");
      const stage = createWebGL(window.THREE, container, callbacks, () => callbacks.onError?.("三维绘图连接已中断"));
      queueMicrotask(() => callbacks.onReady?.());
      return stage;
    } catch (error) {
      callbacks.onError?.(error.message);
      return null;
    }
  }

  window.RibbonStage = { create };
})();
