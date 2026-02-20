import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Pattern Parser ─────────────────────────────────────────────────────────
// Converts human-readable crochet pattern text into structured stitch data.

const STITCH_TYPES = {
    ch:    { name: 'Chain',            height: 0.3, width: 1.0 },
    sl_st: { name: 'Slip Stitch',     height: 0.1, width: 1.0 },
    sc:    { name: 'Single Crochet',   height: 1.0, width: 1.0 },
    hdc:   { name: 'Half Double',      height: 1.5, width: 1.0 },
    dc:    { name: 'Double Crochet',   height: 2.0, width: 1.0 },
    tr:    { name: 'Treble',           height: 2.5, width: 1.0 },
    inc:   { name: 'Increase',         height: 1.0, width: 1.0, generates: 2 },
    dec:   { name: 'Decrease',         height: 1.0, width: 1.0, consumes: 2 },
};

function parsePattern(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
    const rows = [];
    let workingMode = 'round'; // 'round' or 'row'

    for (const line of lines) {
        const parsed = parseLine(line);
        if (parsed) {
            if (parsed.mode) workingMode = parsed.mode;
            parsed.mode = parsed.mode || workingMode;
            rows.push(parsed);
        }
    }

    // If any line says "Row" explicitly, treat the whole thing as rows
    if (rows.some(r => r.mode === 'row')) {
        for (const r of rows) r.mode = 'row';
    }

    return rows;
}

function parseLine(line) {
    const orig = line;

    // Detect round/row prefix
    let rowNum = null;
    let mode = null;
    const prefixMatch = line.match(/^(Round|Rnd|Row|R)\s*(\d+)\s*:\s*/i);
    if (prefixMatch) {
        mode = prefixMatch[1].toLowerCase().startsWith('row') ? 'row' : 'round';
        rowNum = parseInt(prefixMatch[2]);
        line = line.slice(prefixMatch[0].length);
    }

    // Extract stitch count hint from end like (12) or [18]
    let expectedCount = null;
    const countHint = line.match(/[\(\[]\s*(\d+)\s*(?:sts?|stitches?)?\s*[\)\]]\s*$/i);
    if (countHint) {
        expectedCount = parseInt(countHint[1]);
        line = line.slice(0, -countHint[0].length).trim();
    }

    // Normalize
    line = line.toLowerCase()
        .replace(/slip\s*stitch/g, 'sl_st')
        .replace(/sl\s+st/g, 'sl_st')
        .replace(/slst/g, 'sl_st')
        .replace(/single\s*crochet/g, 'sc')
        .replace(/half\s*double\s*crochet/g, 'hdc')
        .replace(/double\s*crochet/g, 'dc')
        .replace(/treble\s*crochet/g, 'tr')
        .replace(/triple\s*crochet/g, 'tr')
        .replace(/increase/gi, 'inc')
        .replace(/decrease/gi, 'dec')
        .replace(/sc2tog/gi, 'dec')
        .replace(/dc2tog/gi, 'dec')
        .replace(/magic\s*(?:ring|circle|loop)/g, 'magic_ring')
        .replace(/fasten\s*off/g, 'fasten_off')
        .replace(/turn/g, 'turn');

    const stitches = [];

    // Magic ring
    if (line.includes('magic_ring')) {
        stitches.push({ type: 'magic_ring' });
        line = line.replace(/magic_ring\s*,?\s*/, '');
    }

    // Handle "X around" pattern — e.g. "inc around"
    const aroundMatch = line.match(/^(\w+)\s+around$/);
    if (aroundMatch && STITCH_TYPES[aroundMatch[1]]) {
        stitches.push({ type: aroundMatch[1], around: true });
        return { rowNum, mode, stitches, expectedCount, raw: orig };
    }

    // Tokenize remaining instructions
    // Handle groups like (sc, inc) x 6  or  (sc, inc) around  or  *sc, inc* x 6
    const tokens = tokenize(line);

    for (const token of tokens) {
        if (token.type === 'group') {
            stitches.push(token);
        } else if (token.type === 'stitch') {
            stitches.push(token);
        }
    }

    if (stitches.length === 0 && !line.includes('fasten_off') && !line.includes('turn')) {
        return null;
    }

    return { rowNum, mode, stitches, expectedCount, raw: orig };
}

function tokenize(text) {
    const results = [];
    // Remove trailing commas/periods
    text = text.replace(/[.,;]+$/, '').trim();

    // Match groups: (sc, inc) x 6  or  (sc, inc) around  or  (sc 2, inc) repeat 6 times
    const groupRe = /[\(\*]\s*([^)\*]+?)\s*[\)\*]\s*(?:(?:x|times|repeat)\s*(\d+)|around)/gi;
    let lastIdx = 0;
    let match;

    while ((match = groupRe.exec(text)) !== null) {
        // Parse content before the group
        const before = text.slice(lastIdx, match.index).trim();
        if (before) results.push(...parseSimpleStitches(before));

        const inner = parseSimpleStitches(match[1]);
        const repeat = match[2] ? parseInt(match[2]) : 'around';
        results.push({ type: 'group', stitches: inner, repeat });
        lastIdx = match.index + match[0].length;
    }

    const remainder = text.slice(lastIdx).trim();
    if (remainder) results.push(...parseSimpleStitches(remainder));

    return results;
}

function parseSimpleStitches(text) {
    const results = [];
    // Split on comma or whitespace-separated instructions
    const parts = text.split(/[,;]+/).map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
        // Match: "6 sc" or "sc 6" or "sc" or "2 dc in next st" or "ch 3"
        const m1 = part.match(/^(\d+)\s+(\w+)/);
        const m2 = part.match(/^(\w+)\s+(\d+)/);
        const m3 = part.match(/^(\w+)$/);
        const m4 = part.match(/^(\w+)\s+in\s+/);

        if (m1 && STITCH_TYPES[m1[2]]) {
            results.push({ type: 'stitch', stitch: m1[2], count: parseInt(m1[1]) });
        } else if (m4 && STITCH_TYPES[m4[1]]) {
            results.push({ type: 'stitch', stitch: m4[1], count: 1 });
        } else if (m2 && STITCH_TYPES[m2[1]]) {
            results.push({ type: 'stitch', stitch: m2[1], count: parseInt(m2[2]) });
        } else if (m3 && STITCH_TYPES[m3[1]]) {
            results.push({ type: 'stitch', stitch: m3[1], count: 1 });
        }
        // Skip unrecognized tokens silently
    }

    return results;
}

// ─── Stitch Placement Engine ────────────────────────────────────────────────
// Takes parsed rows and assigns (x, y, z) positions to every stitch.

function expandRow(parsedRow, prevStitchCount) {
    const expanded = [];
    const stitches = parsedRow.stitches;

    for (const item of stitches) {
        if (item.type === 'magic_ring') continue;

        if (item.type === 'group') {
            const repeatCount = item.repeat === 'around'
                ? (prevStitchCount > 0 ? Math.max(1, Math.floor(prevStitchCount / groupStitchConsumption(item.stitches))) : 6)
                : item.repeat;
            for (let r = 0; r < repeatCount; r++) {
                for (const s of item.stitches) {
                    const count = s.count || 1;
                    for (let i = 0; i < count; i++) {
                        expanded.push(s.stitch);
                    }
                }
            }
        } else if (item.type === 'stitch') {
            const count = item.count || 1;
            for (let i = 0; i < count; i++) {
                expanded.push(item.stitch);
            }
        } else if (item.around) {
            // "inc around" or "sc around"
            const st = item.type;
            const generates = STITCH_TYPES[st]?.generates || 1;
            const consumes = STITCH_TYPES[st]?.consumes || 1;
            const repeatCount = prevStitchCount > 0 ? Math.floor(prevStitchCount / consumes) : 6;
            for (let i = 0; i < repeatCount; i++) {
                expanded.push(st);
            }
        }
    }

    // If we have an expected count and it differs significantly, trust the expanded
    // but cap to something reasonable
    return expanded;
}

function groupStitchConsumption(stitches) {
    let total = 0;
    for (const s of stitches) {
        const count = s.count || 1;
        for (let i = 0; i < count; i++) {
            const info = STITCH_TYPES[s.stitch];
            if (info?.consumes) total += info.consumes;
            else total += 1;
        }
    }
    return total || 1;
}

function placeStitches(parsedRows) {
    const allStitches = [];
    let prevCount = 0;
    let yOffset = 0;

    for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx++) {
        const row = parsedRows[rowIdx];
        const expanded = expandRow(row, prevCount);

        if (expanded.length === 0) {
            // Maybe it's just a magic ring start — create 6 sc default
            if (row.stitches.some(s => s.type === 'magic_ring')) {
                const baseCount = row.expectedCount || 6;
                for (let i = 0; i < baseCount; i++) expanded.push('sc');
            }
        }

        // If there's an expected count and we have no stitches, generate them
        if (expanded.length === 0 && row.expectedCount) {
            for (let i = 0; i < row.expectedCount; i++) expanded.push('sc');
        }

        if (expanded.length === 0) continue;

        const isRound = row.mode === 'round';
        const stitchCount = expanded.length;

        // Compute actual stitch count accounting for increases/decreases
        let actualCount = 0;
        for (const st of expanded) {
            const info = STITCH_TYPES[st];
            actualCount += info?.generates || 1;
        }

        // Calculate max height for this row
        let maxHeight = 0;
        for (const st of expanded) {
            const info = STITCH_TYPES[st];
            if (info) maxHeight = Math.max(maxHeight, info.height);
        }

        if (isRound) {
            // Place stitches in a circle
            const radius = Math.max(actualCount / (2 * Math.PI) * 1.0, 1.2);
            let angleStep = (2 * Math.PI) / stitchCount;
            let angle = 0;

            for (let i = 0; i < stitchCount; i++) {
                const st = expanded[i];
                const info = STITCH_TYPES[st] || STITCH_TYPES.sc;
                const generates = info.generates || 1;

                for (let g = 0; g < generates; g++) {
                    const a = angle + (generates > 1 ? (g - 0.5) * angleStep * 0.4 : 0);
                    const x = Math.cos(a) * radius;
                    const z = Math.sin(a) * radius;

                    allStitches.push({
                        type: st,
                        x, y: yOffset, z,
                        height: info.height,
                        row: rowIdx,
                        radius,
                        angle: a,
                    });
                }

                angle += angleStep;
            }
        } else {
            // Place stitches in a line (flat / rows)
            const spacing = 1.0;
            const totalWidth = (stitchCount - 1) * spacing;
            const startX = -totalWidth / 2;
            const direction = rowIdx % 2 === 0 ? 1 : -1; // alternate direction for rows

            for (let i = 0; i < stitchCount; i++) {
                const st = expanded[i];
                const info = STITCH_TYPES[st] || STITCH_TYPES.sc;
                const idx = direction === 1 ? i : (stitchCount - 1 - i);
                const x = startX + idx * spacing;

                allStitches.push({
                    type: st,
                    x, y: yOffset, z: 0,
                    height: info.height,
                    row: rowIdx,
                });
            }
        }

        yOffset += maxHeight * 0.8;
        prevCount = actualCount;
    }

    return allStitches;
}

// ─── Three.js Renderer ──────────────────────────────────────────────────────

let scene, camera, renderer, controls;
let stitchMeshes = [];
let animationId;

function initThree() {
    const canvas = document.getElementById('canvas3d');
    const viewport = canvas.parentElement;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

    camera = new THREE.PerspectiveCamera(50, viewport.clientWidth / viewport.clientHeight, 0.1, 500);
    camera.position.set(15, 15, 15);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 100;

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x6088ff, 0.4);
    fillLight.position.set(-10, 5, -10);
    scene.add(fillLight);

    // Ground grid
    const grid = new THREE.GridHelper(40, 40, 0x1a2a4a, 0x111828);
    grid.position.y = -0.5;
    scene.add(grid);

    window.addEventListener('resize', onResize);
    animate();
}

function onResize() {
    const viewport = document.getElementById('canvas3d').parentElement;
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// ─── Build Stitch Meshes ────────────────────────────────────────────────────

const STITCH_COLORS = {
    ch:    0xe94560,
    sl_st: 0xff4757,
    sc:    0xff6b6b,
    hdc:   0xffa502,
    dc:    0x2ed573,
    tr:    0x1e90ff,
    inc:   0xffd43b,
    dec:   0xa55eea,
};

function buildVisualization(stitchData, options = {}) {
    // Clear old meshes
    for (const m of stitchMeshes) {
        scene.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
    }
    stitchMeshes = [];

    if (stitchData.length === 0) return;

    const yarnColor = new THREE.Color(options.color || '#e94560');
    const style = options.style || 'yarn';
    const sizeFactor = options.size || 1.0;

    // Group by row for connecting yarn paths
    const rowGroups = {};
    for (const s of stitchData) {
        if (!rowGroups[s.row]) rowGroups[s.row] = [];
        rowGroups[s.row].push(s);
    }

    const rowKeys = Object.keys(rowGroups).map(Number).sort((a, b) => a - b);

    for (const rowIdx of rowKeys) {
        const rowStitches = rowGroups[rowIdx];
        const rowColor = style === 'yarn' ? yarnColor : new THREE.Color(STITCH_COLORS[rowStitches[0]?.type] || 0xff6b6b);

        if (style === 'solid') {
            buildSolidRow(rowStitches, rowColor, sizeFactor, rowIdx);
        } else if (style === 'wireframe') {
            buildWireframeRow(rowStitches, rowColor, sizeFactor, rowIdx);
        } else {
            buildYarnRow(rowStitches, yarnColor, sizeFactor, rowIdx);
        }
    }

    // Build connecting yarn between rows
    if (style === 'yarn' && rowKeys.length > 1) {
        buildRowConnections(rowGroups, rowKeys, yarnColor, sizeFactor);
    }

    // Center camera on the model
    fitCamera(stitchData);
}

function buildYarnRow(stitches, baseColor, size, rowIdx) {
    if (stitches.length < 2) {
        // Single stitch — draw a small sphere
        for (const s of stitches) {
            const geo = new THREE.SphereGeometry(0.2 * size, 12, 8);
            const mat = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: 0.7,
                metalness: 0.1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(s.x, s.y, s.z);
            mesh.userData = { row: rowIdx, stitch: s };
            scene.add(mesh);
            stitchMeshes.push(mesh);
        }
        return;
    }

    // Build a smooth curve through all stitch positions
    const points = stitches.map(s => new THREE.Vector3(s.x, s.y, s.z));

    // If it's a round (first and last near each other in angle), close the loop
    const isRound = stitches[0].radius !== undefined;
    if (isRound) {
        points.push(points[0].clone()); // close the loop
    }

    const curve = new THREE.CatmullRomCurve3(points, isRound);
    const tubeSegments = Math.max(stitches.length * 8, 32);
    const tubeRadius = 0.12 * size;

    const geo = new THREE.TubeGeometry(curve, tubeSegments, tubeRadius, 8, isRound);
    const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.6,
        metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { row: rowIdx };
    mesh.castShadow = true;
    scene.add(mesh);
    stitchMeshes.push(mesh);

    // Add small stitch markers at each position
    for (const s of stitches) {
        const info = STITCH_TYPES[s.type] || STITCH_TYPES.sc;
        const markerHeight = info.height * 0.3 * size;
        const markerGeo = new THREE.CapsuleGeometry(0.08 * size, markerHeight, 4, 8);
        const markerMat = new THREE.MeshStandardMaterial({
            color: STITCH_COLORS[s.type] || 0xff6b6b,
            roughness: 0.5,
            metalness: 0.15,
            emissive: new THREE.Color(STITCH_COLORS[s.type] || 0xff6b6b),
            emissiveIntensity: 0.15,
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(s.x, s.y + markerHeight / 2 + tubeRadius, s.z);

        // Point the capsule upward (it defaults to Y axis which is what we want)
        marker.userData = { row: rowIdx, stitch: s };
        marker.castShadow = true;
        scene.add(marker);
        stitchMeshes.push(marker);
    }
}

function buildSolidRow(stitches, color, size, rowIdx) {
    const isRound = stitches[0]?.radius !== undefined;

    if (isRound && stitches.length >= 3) {
        // Build a ring-like surface
        const shape = new THREE.Shape();
        const innerRadius = stitches[0].radius - 0.4 * size;
        const outerRadius = stitches[0].radius + 0.4 * size;

        // Create a ring cross-section
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const r = outerRadius;
            if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        for (let i = segments; i >= 0; i--) {
            const a = (i / segments) * Math.PI * 2;
            const r = innerRadius;
            shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();

        const geo = new THREE.ShapeGeometry(shape, 32);
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.6,
            metalness: 0.1,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        // Rotate to lie flat in XZ plane at the right Y
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = stitches[0].y;
        mesh.userData = { row: rowIdx };
        mesh.castShadow = true;
        scene.add(mesh);
        stitchMeshes.push(mesh);
    } else {
        // Row-based: build a flat strip
        for (const s of stitches) {
            const info = STITCH_TYPES[s.type] || STITCH_TYPES.sc;
            const h = info.height * 0.6 * size;
            const geo = new THREE.BoxGeometry(0.8 * size, h, 0.4 * size);
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(STITCH_COLORS[s.type] || 0xff6b6b),
                roughness: 0.6,
                metalness: 0.1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(s.x, s.y + h / 2, s.z);
            mesh.userData = { row: rowIdx, stitch: s };
            mesh.castShadow = true;
            scene.add(mesh);
            stitchMeshes.push(mesh);
        }
    }
}

function buildWireframeRow(stitches, color, size, rowIdx) {
    if (stitches.length < 2) return;

    const points = stitches.map(s => new THREE.Vector3(s.x, s.y, s.z));
    const isRound = stitches[0]?.radius !== undefined;
    if (isRound) points.push(points[0].clone());

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    line.userData = { row: rowIdx };
    scene.add(line);
    stitchMeshes.push(line);

    // Small dots at each stitch
    for (const s of stitches) {
        const dotGeo = new THREE.SphereGeometry(0.1 * size, 8, 6);
        const dotMat = new THREE.MeshStandardMaterial({
            color: STITCH_COLORS[s.type] || 0xff6b6b,
            emissive: new THREE.Color(STITCH_COLORS[s.type] || 0xff6b6b),
            emissiveIntensity: 0.4,
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(s.x, s.y, s.z);
        dot.userData = { row: rowIdx, stitch: s };
        scene.add(dot);
        stitchMeshes.push(dot);
    }
}

function buildRowConnections(rowGroups, rowKeys, color, size) {
    for (let i = 0; i < rowKeys.length - 1; i++) {
        const curr = rowGroups[rowKeys[i]];
        const next = rowGroups[rowKeys[i + 1]];

        // Connect last stitch of current row to first stitch of next row
        const from = curr[curr.length - 1];
        const to = next[0];

        const points = [
            new THREE.Vector3(from.x, from.y, from.z),
            new THREE.Vector3(
                (from.x + to.x) / 2,
                (from.y + to.y) / 2 + 0.3,
                (from.z + to.z) / 2
            ),
            new THREE.Vector3(to.x, to.y, to.z),
        ];

        const curve = new THREE.CatmullRomCurve3(points);
        const geo = new THREE.TubeGeometry(curve, 12, 0.06 * size, 6, false);
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.7,
            metalness: 0.05,
            transparent: true,
            opacity: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        stitchMeshes.push(mesh);
    }
}

function fitCamera(stitchData) {
    if (stitchData.length === 0) return;

    const box = new THREE.Box3();
    for (const s of stitchData) {
        box.expandByPoint(new THREE.Vector3(s.x, s.y, s.z));
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const bsize = new THREE.Vector3();
    box.getSize(bsize);
    const maxDim = Math.max(bsize.x, bsize.y, bsize.z, 2);

    controls.target.copy(center);
    camera.position.set(
        center.x + maxDim * 1.2,
        center.y + maxDim * 1.0,
        center.z + maxDim * 1.2
    );
    controls.update();
}

// ─── Camera Preset Views ────────────────────────────────────────────────────

function setCameraView(position, target) {
    const t = controls.target.clone();
    camera.position.set(
        t.x + position[0],
        t.y + position[1],
        t.z + position[2]
    );
    controls.update();
}

// ─── Example Patterns ───────────────────────────────────────────────────────

const EXAMPLES = [
    {
        name: 'Amigurumi Ball',
        desc: 'Classic sphere shape (rounds with increases then decreases)',
        pattern: `Round 1: Magic ring, 6 sc (6)
Round 2: inc around (12)
Round 3: (sc, inc) around (18)
Round 4: (2 sc, inc) around (24)
Round 5: (3 sc, inc) around (30)
Round 6: (4 sc, inc) around (36)
Round 7: sc around (36)
Round 8: sc around (36)
Round 9: sc around (36)
Round 10: sc around (36)
Round 11: sc around (36)
Round 12: (4 sc, dec) around (30)
Round 13: (3 sc, dec) around (24)
Round 14: (2 sc, dec) around (18)
Round 15: (sc, dec) around (12)
Round 16: dec around (6)`,
    },
    {
        name: 'Flat Circle',
        desc: 'Flat disc that increases each round',
        pattern: `Round 1: Magic ring, 6 sc (6)
Round 2: inc around (12)
Round 3: (sc, inc) around (18)
Round 4: (2 sc, inc) around (24)
Round 5: (3 sc, inc) around (30)
Round 6: (4 sc, inc) around (36)
Round 7: (5 sc, inc) around (42)
Round 8: (6 sc, inc) around (48)`,
    },
    {
        name: 'Simple Cylinder',
        desc: 'Tube shape - increases then straight rounds',
        pattern: `Round 1: Magic ring, 6 sc (6)
Round 2: inc around (12)
Round 3: (sc, inc) around (18)
Round 4: (2 sc, inc) around (24)
Round 5: sc around (24)
Round 6: sc around (24)
Round 7: sc around (24)
Round 8: sc around (24)
Round 9: sc around (24)
Round 10: sc around (24)
Round 11: sc around (24)
Round 12: sc around (24)`,
    },
    {
        name: 'Flat Swatch (Rows)',
        desc: 'Rectangular piece worked in rows',
        pattern: `Row 1: ch 15, sc 14 (14)
Row 2: ch 1, sc 14 (14)
Row 3: ch 1, sc 14 (14)
Row 4: ch 1, sc 14 (14)
Row 5: ch 1, sc 14 (14)
Row 6: ch 1, sc 14 (14)
Row 7: ch 1, sc 14 (14)
Row 8: ch 1, sc 14 (14)
Row 9: ch 1, sc 14 (14)
Row 10: ch 1, sc 14 (14)`,
    },
    {
        name: 'Cone / Hat Shape',
        desc: 'Increases then straight rounds for a cone',
        pattern: `Round 1: Magic ring, 4 sc (4)
Round 2: inc around (8)
Round 3: (sc, inc) around (12)
Round 4: (2 sc, inc) around (16)
Round 5: (3 sc, inc) around (20)
Round 6: (4 sc, inc) around (24)
Round 7: (5 sc, inc) around (28)
Round 8: (6 sc, inc) around (32)
Round 9: (7 sc, inc) around (36)
Round 10: sc around (36)
Round 11: sc around (36)
Round 12: sc around (36)`,
    },
    {
        name: 'Textured Swatch',
        desc: 'Mixed stitch heights in rows (sc, hdc, dc)',
        pattern: `Row 1: ch 12, sc 11 (11)
Row 2: ch 1, sc 3, hdc 3, dc 3, sc 2 (11)
Row 3: ch 1, sc 3, hdc 3, dc 3, sc 2 (11)
Row 4: ch 1, dc 3, hdc 3, sc 3, dc 2 (11)
Row 5: ch 1, dc 3, hdc 3, sc 3, dc 2 (11)
Row 6: ch 1, sc 3, hdc 3, dc 3, sc 2 (11)
Row 7: ch 1, sc 3, hdc 3, dc 3, sc 2 (11)
Row 8: ch 1, dc 11 (11)`,
    },
    {
        name: 'Mushroom',
        desc: 'Cap (sphere top) + stem (cylinder)',
        pattern: `// Cap
Round 1: Magic ring, 6 sc (6)
Round 2: inc around (12)
Round 3: (sc, inc) around (18)
Round 4: (2 sc, inc) around (24)
Round 5: (3 sc, inc) around (30)
Round 6: (4 sc, inc) around (36)
Round 7: (5 sc, inc) around (42)
Round 8: sc around (42)
Round 9: (5 sc, dec) around (36)
Round 10: (4 sc, dec) around (30)
Round 11: (3 sc, dec) around (24)
// Stem
Round 12: (2 sc, dec) around (18)
Round 13: sc around (18)
Round 14: sc around (18)
Round 15: sc around (18)
Round 16: sc around (18)
Round 17: sc around (18)
Round 18: (sc, inc) around (24)`,
    },
];

// ─── UI Wiring ──────────────────────────────────────────────────────────────

function showError(msg) {
    const el = document.getElementById('errorToast');
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3500);
}

function renderPattern() {
    const text = document.getElementById('patternInput').value.trim();
    if (!text) {
        showError('Please enter a crochet pattern first.');
        return;
    }

    try {
        const parsed = parsePattern(text);
        if (parsed.length === 0) {
            showError('Could not parse any stitches. Check the pattern format.');
            return;
        }

        const stitchData = placeStitches(parsed);

        const color = document.getElementById('yarnColor').value;
        const style = document.getElementById('renderStyle').value;
        const size = parseFloat(document.getElementById('stitchSize').value);

        buildVisualization(stitchData, { color, style, size });

        // Update info badges
        document.getElementById('stitchCount').textContent = stitchData.length;
        document.getElementById('rowCount').textContent = parsed.length;

    } catch (e) {
        console.error(e);
        showError('Error rendering pattern: ' + e.message);
    }
}

function init() {
    initThree();

    // Render button
    document.getElementById('renderBtn').addEventListener('click', renderPattern);

    // Clear button
    document.getElementById('clearBtn').addEventListener('click', () => {
        document.getElementById('patternInput').value = '';
        for (const m of stitchMeshes) {
            scene.remove(m);
            m.geometry?.dispose();
            m.material?.dispose();
        }
        stitchMeshes = [];
        document.getElementById('stitchCount').textContent = '0';
        document.getElementById('rowCount').textContent = '0';
    });

    // Example buttons
    const exList = document.getElementById('examplesList');
    for (const ex of EXAMPLES) {
        const btn = document.createElement('button');
        btn.className = 'example-btn';
        btn.innerHTML = `<div class="example-name">${ex.name}</div><div class="example-desc">${ex.desc}</div>`;
        btn.addEventListener('click', () => {
            document.getElementById('patternInput').value = ex.pattern;
            renderPattern();
        });
        exList.appendChild(btn);
    }

    // View buttons
    document.getElementById('viewTop').addEventListener('click', () => setCameraView([0, 25, 0.1]));
    document.getElementById('viewFront').addEventListener('click', () => setCameraView([0, 2, 25]));
    document.getElementById('viewSide').addEventListener('click', () => setCameraView([25, 2, 0]));
    document.getElementById('viewReset').addEventListener('click', () => {
        if (stitchMeshes.length > 0) {
            const data = [];
            for (const m of stitchMeshes) {
                if (m.userData?.stitch) data.push(m.userData.stitch);
            }
            if (data.length > 0) fitCamera(data);
            else setCameraView([15, 15, 15]);
        } else {
            camera.position.set(15, 15, 15);
            controls.target.set(0, 0, 0);
            controls.update();
        }
    });

    // Style/color/size changes auto-re-render
    for (const id of ['yarnColor', 'renderStyle', 'stitchSize']) {
        document.getElementById(id).addEventListener('change', () => {
            if (document.getElementById('patternInput').value.trim()) {
                renderPattern();
            }
        });
        document.getElementById(id).addEventListener('input', () => {
            if (id === 'stitchSize' && document.getElementById('patternInput').value.trim()) {
                renderPattern();
            }
        });
    }

    // Ctrl+Enter to render
    document.getElementById('patternInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            renderPattern();
        }
    });

    // Raycasting for hover info
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const canvasEl = document.getElementById('canvas3d');
    const rowInfoEl = document.getElementById('rowInfo');
    const rowLabelEl = document.getElementById('rowLabel');
    const rowDetailEl = document.getElementById('rowDetail');

    canvasEl.addEventListener('mousemove', (e) => {
        const rect = canvasEl.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(stitchMeshes);

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            const rowIdx = obj.userData?.row;
            const stitch = obj.userData?.stitch;

            if (rowIdx !== undefined) {
                rowInfoEl.style.display = 'block';
                rowLabelEl.textContent = `Row ${rowIdx + 1}`;
                if (stitch) {
                    const info = STITCH_TYPES[stitch.type];
                    rowDetailEl.textContent = ` - ${info?.name || stitch.type}`;
                } else {
                    rowDetailEl.textContent = '';
                }
            }
        } else {
            rowInfoEl.style.display = 'none';
        }
    });

    // Load first example by default
    document.getElementById('patternInput').value = EXAMPLES[0].pattern;
    renderPattern();
}

init();
