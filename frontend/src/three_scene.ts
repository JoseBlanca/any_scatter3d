import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WidgetModel, RGB } from "./model";
import { TRAITS } from "./model";
import {
	bytesToFloat32ArrayLE,
	bytesToUint16ArrayLE,
	createPackedMaskBig,
	setPackedMaskBitBig,
} from "./binary";
import { buildColorBuffer } from "./color_mapping";
import { buildSizeBuffer } from "./size_mapping";

export type ThreeScene = {
	domElement: HTMLCanvasElement;
	setSize: (cssW: number, cssH: number, dpr: number) => void;

	setPointsFromModel: () => void;
	setColorsFromModel: () => void;
	setSizesFromModel: () => void;

	// pick nearest point under mouse
	pickPointIndex: (ndcX: number, ndcY: number) => number | null;

	// Returns packed bits (bitorder="big") for N points:
	// byte = i >> 3, bit = 7 - (i & 7)
	selectMaskInLasso: (polyNdc: { x: number; y: number }[]) => Uint8Array;

	setAxesFromModel: () => void;
	rebuildAxisLabels: () => void;

	render: () => void;
	dispose: () => void;
};

type Point2D = { x: number; y: number };

const BLACK = "#000";
// NOTE: Data-analysis convention:
// Z is drawn "upwards" (screen Y), Y is depth.
// This is intentional: do NOT "fix" unless changing conventions.
const X_AXIS_COLOR = BLACK;
const Y_AXIS_COLOR = BLACK; // depth
const Z_AXIS_COLOR = BLACK; // vertical (up)

function positionsFromXYZBytes(xyzBytes: unknown): Float32Array {
	const f32 = bytesToFloat32ArrayLE(xyzBytes);
	if (f32.length % 3 !== 0) {
		throw new Error(`xyz_bytes_t length ${f32.length} not divisible by 3`);
	}
	return f32;
}

function pointInPolygon(p: Point2D, poly: readonly Point2D[]): boolean {
	// Ray casting algorithm
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i].x;
		const yi = poly[i].y;
		const xj = poly[j].x;
		const yj = poly[j].y;

		const intersect =
			yi > p.y !== yj > p.y &&
			p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 0.0) + xi;

		if (intersect) inside = !inside;
	}
	return inside;
}

function readRGBList(x: unknown, name: string): RGB[] {
	if (!Array.isArray(x)) {
		throw new Error(`${name} must be an array`);
	}
	const out: RGB[] = [];
	for (let i = 0; i < x.length; i++) {
		const v = x[i];
		if (!Array.isArray(v) || v.length !== 3) {
			throw new Error(`${name}[${i}] must be [r,g,b]`);
		}
		const r = Number(v[0]);
		const g = Number(v[1]);
		const b = Number(v[2]);
		if (![r, g, b].every((z) => Number.isFinite(z))) {
			throw new Error(`${name}[${i}] must contain finite numbers`);
		}
		out.push([r, g, b]);
	}
	return out;
}

function readRGB(x: unknown, name: string): RGB {
	if (!Array.isArray(x) || x.length !== 3) {
		throw new Error(`${name} must be [r,g,b]`);
	}
	const r = Number(x[0]);
	const g = Number(x[1]);
	const b = Number(x[2]);
	if (![r, g, b].every((z) => Number.isFinite(z))) {
		throw new Error(`${name} must contain finite numbers`);
	}
	return [r, g, b];
}

// Intentionally untyped trait getter for legacy / unknown traits.
// Keep it isolated so the rest of the file stays type-safe.
function getUntypedStringTrait(
	model: WidgetModel,
	key: string,
	fallback: string,
): string {
	const v = (model as any).get?.(key);
	return typeof v === "string" && v.length ? v : fallback;
}

function getPositiveFiniteNumber(v: unknown, fallback: number): number {
	return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

export function createThreeScene(
	canvasHost: HTMLElement,
	model: WidgetModel,
): ThreeScene {
	// --- renderer / scene / camera ---
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	canvasHost.appendChild(renderer.domElement);

	// background might still exist as a traitlet in your widget; if not, default.
	const bg = getUntypedStringTrait(model, "background", "#ffffff");
	renderer.setClearColor(new THREE.Color(bg), 1);

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
	camera.position.set(0, 0, 10);

	scene.add(new THREE.AmbientLight(0xffffff, 0.8));

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;

	// --- points geometry ---
	const geom = new THREE.BufferGeometry();

	const initialPos = positionsFromXYZBytes(model.get(TRAITS.xyzBytes));
	let positionAttr = new THREE.BufferAttribute(initialPos, 3);
	geom.setAttribute("position", positionAttr);

	let nPoints = positionAttr.count;
	let colorArray = new Float32Array(nPoints * 3);
	let colorAttr = new THREE.BufferAttribute(colorArray, 3);
	geom.setAttribute("color", colorAttr);

	let sizeArray = new Float32Array(nPoints);
	let sizeAttr = new THREE.BufferAttribute(sizeArray, 1);
	geom.setAttribute("size", sizeAttr);

	function frameCameraToGeometry() {
		const bs = geom.boundingSphere;
		if (!bs || !Number.isFinite(bs.radius) || bs.radius <= 0) return;

		const fovRad = (camera.fov * Math.PI) / 180;
		const dist = bs.radius / Math.sin(fovRad / 2);

		controls.target.copy(bs.center);
		camera.position.copy(bs.center).add(new THREE.Vector3(0, 0, dist));
		camera.near = Math.max(0.01, dist / 1000);
		camera.far = dist * 10;
		camera.updateProjectionMatrix();
	}

	geom.computeBoundingSphere();
	frameCameraToGeometry();

	function getPointSize(): number {
		return getPositiveFiniteNumber(model.get(TRAITS.pointSize), 0.05);
	}

	const mat = new THREE.ShaderMaterial({
		transparent: true,
		vertexColors: true,
		depthTest: true,
		depthWrite: true,
		uniforms: {
			uPixelRatio: { value: window.devicePixelRatio || 1 },
		},
		vertexShader: `
		uniform float uPixelRatio;

		attribute float size;
		varying vec3 vColor;

		void main() {
			vColor = color;

			vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

			// perspective-correct point size
			gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);

			gl_Position = projectionMatrix * mvPosition;
		}
	`,
		fragmentShader: `
		varying vec3 vColor;

		void main() {
			// circular points
			vec2 c = gl_PointCoord - vec2(0.5);
			if (dot(c, c) > 0.25) discard;

			gl_FragColor = vec4(vColor, 1.0);
		}
	`,
	});

	const pointsObj = new THREE.Points(geom, mat);
	scene.add(pointsObj);

	const raycaster = new THREE.Raycaster();
	raycaster.params.Points = raycaster.params.Points ?? {};
	// Tune this (world units). Start here and adjust by feel.
	(raycaster.params.Points as any).threshold = 0.06;

	const ndc = new THREE.Vector2();

	function pickPointIndex(ndcX: number, ndcY: number): number | null {
		ndc.set(ndcX, ndcY);
		raycaster.setFromCamera(ndc, camera);

		const hits = raycaster.intersectObject(pointsObj, false);
		if (!hits.length) return null;

		const idx = (hits[0] as any).index;
		return Number.isFinite(idx) ? (idx as number) : null;
	}

	const axesGroup = new THREE.Group();
	scene.add(axesGroup);

	function makeAxisLine(color: string): THREE.Line {
		const g = new THREE.BufferGeometry();
		// 2 points: origin and endpoint
		const pos = new Float32Array(6);
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		const m = new THREE.LineBasicMaterial({
			color,
			transparent: true,
			opacity: 0.7,
		});
		return new THREE.Line(g, m);
	}

	const xAxis = makeAxisLine(X_AXIS_COLOR);
	const yAxis = makeAxisLine(Y_AXIS_COLOR);
	const zAxis = makeAxisLine(Z_AXIS_COLOR);
	axesGroup.add(xAxis, yAxis, zAxis);

	function computeMaxXYZ(posArr: Float32Array): { max: number } {
		let max = -Infinity;

		for (let i = 0; i < posArr.length; i++) {
			const v = Math.abs(posArr[i]);
			if (v > max) max = v;
		}

		// Safe fallback for empty or invalid arrays
		if (!Number.isFinite(max)) max = 0;

		return { max };
	}

	function setLinePositions(
		line: THREE.Line,
		x0: number,
		y0: number,
		z0: number,
		x1: number,
		y1: number,
		z1: number,
	) {
		const attr = line.geometry.getAttribute(
			"position",
		) as THREE.BufferAttribute;
		const a = attr.array as Float32Array;
		a[0] = x0;
		a[1] = y0;
		a[2] = z0;
		a[3] = x1;
		a[4] = y1;
		a[5] = z1;
		attr.needsUpdate = true;
	}

	function getAxisLabelSize(): number {
		return getPositiveFiniteNumber(model.get(TRAITS.axisLabelSize), 0.05);
	}

	function makeAxisLabelSprite(
		text: "x" | "y" | "z",
		size: number,
	): THREE.Sprite {
		// --- draw high-resolution text on a canvas ---
		const canvas = document.createElement("canvas");
		const RES = 256;
		canvas.width = RES;
		canvas.height = RES;

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get 2D canvas context for axis label");
		}
		ctx.clearRect(0, 0, RES, RES);

		// fixed font size → visual quality only
		const fontPx = 160;
		ctx.font = `bold ${fontPx}px sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		ctx.fillStyle = "rgba(255,255,255,0.95)";
		ctx.strokeStyle = "rgba(0,0,0,0.65)";
		ctx.lineWidth = 10;

		ctx.strokeText(text, RES / 2, RES / 2);
		ctx.fillText(text, RES / 2, RES / 2);

		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.needsUpdate = true;

		const mat = new THREE.SpriteMaterial({
			map: tex,
			transparent: true,
			depthTest: false,
			depthWrite: false,
		});

		const sprite = new THREE.Sprite(mat);
		sprite.scale.set(size, size, 1);
		return sprite;
	}

	let xLabel = makeAxisLabelSprite("x", getAxisLabelSize());
	let yLabel = makeAxisLabelSprite("y", getAxisLabelSize());
	let zLabel = makeAxisLabelSprite("z", getAxisLabelSize());
	axesGroup.add(xLabel, yLabel, zLabel);

	function setAxesFromModel() {
		const show = model.get(TRAITS.showAxes) === true;
		axesGroup.visible = show;
		if (!show) return;

		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		const { max } = computeMaxXYZ(arr);

		// from origin to maxima on each axis
		// Intentionally swapped:
		//   Z → up (screen Y)
		//   Y → depth (screen Z)
		setLinePositions(xAxis, 0, 0, 0, max, 0, 0);
		setLinePositions(zAxis, 0, 0, 0, 0, max, 0);
		setLinePositions(yAxis, 0, 0, 0, 0, 0, max);

		const pad = max * 0.03; // 3% past the tip
		xLabel.position.set(max + pad, 0, 0);
		yLabel.position.set(0, 0, max + pad);
		zLabel.position.set(0, max + pad, 0);
	}

	function rebuildAxisLabels() {
		// remove old sprites
		axesGroup.remove(xLabel, yLabel, zLabel);

		// IMPORTANT: dispose old GPU resources to avoid leaks
		for (const s of [xLabel, yLabel, zLabel]) {
			const m = s.material as THREE.SpriteMaterial;
			m.map?.dispose();
			m.dispose();
		}

		const size = getAxisLabelSize();
		xLabel = makeAxisLabelSprite("x", size);
		yLabel = makeAxisLabelSprite("y", size);
		zLabel = makeAxisLabelSprite("z", size);
		axesGroup.add(xLabel, yLabel, zLabel);

		setAxesFromModel();
	}

	function setPointsFromModel() {
		const arr = positionsFromXYZBytes(model.get(TRAITS.xyzBytes));

		if (positionAttr.array.length !== arr.length) {
			// recreate color buffer too
			nPoints = positionAttr.count;
			colorArray = new Float32Array(nPoints * 3);
			colorAttr = new THREE.BufferAttribute(colorArray, 3);
			geom.setAttribute("color", colorAttr);

			// recreate size buffer too
			sizeArray = new Float32Array(nPoints);
			sizeAttr = new THREE.BufferAttribute(sizeArray, 1);
			geom.setAttribute("size", sizeAttr);
		} else {
			(positionAttr.array as Float32Array).set(arr);
			positionAttr.needsUpdate = true;
		}

		geom.computeBoundingSphere();
		frameCameraToGeometry();
		setAxesFromModel();
	}

	function setColorsFromModel() {
		// codes: uint16 length N
		const codes = bytesToUint16ArrayLE(model.get(TRAITS.codedValues));

		nPoints = (geom.getAttribute("position") as THREE.BufferAttribute).count;
		if (codes.length !== nPoints) {
			throw new Error(
				`coded_values_t length ${codes.length} != nPoints ${nPoints}`,
			);
		}

		// palette aligned with labels (code i+1)
		const colors = readRGBList(model.get(TRAITS.colors), "colors_t");
		const missing = readRGB(model.get(TRAITS.missingColor), "missing_color_t");

		// active_category_t (python authoritative)
		const activeLabel = model.get(TRAITS.activeCategory);
		let activeCode: number | null = null;

		if (activeLabel !== null && activeLabel !== undefined) {
			if (typeof activeLabel !== "string") {
				throw new Error(
					`active_category_t must be string|null|undefined, got ${typeof activeLabel}`,
				);
			}
			// Map label -> code via labels_t ordering (code = index + 1)
			const labelsRaw = model.get(TRAITS.labels);
			if (!Array.isArray(labelsRaw)) {
				throw new Error(
					`labels_t must be an array when active_category_t is set`,
				);
			}
			const labels = labelsRaw.map((v) => String(v));
			const idx = labels.indexOf(activeLabel);
			if (idx < 0) {
				throw new Error(
					`active_category_t="${activeLabel}" not found in labels_t`,
				);
			}
			activeCode = idx + 1;
		}

		const computed = buildColorBuffer({
			codes,
			palette: colors,
			missing,
			activeCode,
			inactiveDesaturateAmount: activeCode === null ? 0 : 0.75,
		});

		const cAttr = geom.getAttribute("color") as THREE.BufferAttribute;
		const cArr = cAttr.array as Float32Array;

		if (cArr.length !== computed.length) {
			throw new Error(
				`Internal error: color buffer length ${cArr.length} != computed length ${computed.length}`,
			);
		}

		cArr.set(computed);
		cAttr.needsUpdate = true;
	}

	function setSizesFromModel() {
		const codes = bytesToUint16ArrayLE(model.get(TRAITS.codedValues));

		nPoints = (geom.getAttribute("position") as THREE.BufferAttribute).count;
		if (codes.length !== nPoints) {
			throw new Error(
				`coded_values_t length ${codes.length} != nPoints ${nPoints}`,
			);
		}

		const baseSize = getPointSize();

		// active category → code
		const activeLabel = model.get(TRAITS.activeCategory);
		let activeCode: number | null = null;

		if (activeLabel !== null && activeLabel !== undefined) {
			if (typeof activeLabel !== "string") {
				throw new Error(`active_category_t must be string|null`);
			}
			const labelsRaw = model.get(TRAITS.labels);
			if (!Array.isArray(labelsRaw)) {
				throw new Error(`labels_t must be array when active_category_t is set`);
			}
			const labels = labelsRaw.map((v) => String(v));
			const idx = labels.indexOf(activeLabel);
			if (idx < 0) {
				throw new Error(
					`active_category_t="${activeLabel}" not found in labels_t`,
				);
			}
			activeCode = idx + 1;
		}

		const sizes = buildSizeBuffer({
			codes,
			activeCode,
			baseSize,
			inactiveScale: activeCode === null ? 1 : 0.35,
		});

		if (sizes.length !== sizeArray.length) {
			throw new Error(`Internal error: size buffer length mismatch`);
		}

		sizeArray.set(sizes);
		sizeAttr.needsUpdate = true;
	}

	function setSize(cssW: number, cssH: number, dpr: number) {
		renderer.setPixelRatio(dpr);
		// CRITICAL: updateStyle must be true so the WebGL canvas CSS size matches the overlay canvas.
		// If false, the lasso polygon (computed from overlay NDC) won’t match point projections.
		renderer.setSize(cssW, cssH, true);
		camera.aspect = cssW > 0 && cssH > 0 ? cssW / cssH : 1;
		camera.updateProjectionMatrix();
	}

	const tmpV = new THREE.Vector3();

	function selectMaskInLasso(polyNdc: Point2D[]): Uint8Array {
		if (polyNdc.length < 3) {
			return new Uint8Array(0);
		}

		camera.updateMatrixWorld(true);

		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		const count = pos.count;

		const mask = createPackedMaskBig(count);

		// arr layout: [x0,y0,z0,x1,y1,z1,...]
		for (let i = 0; i < arr.length; i += 3) {
			tmpV.set(arr[i], arr[i + 1], arr[i + 2]);
			tmpV.project(camera);

			// skip clipped points
			if (tmpV.z < -1 || tmpV.z > 1) continue;

			const idx = i / 3;
			if (pointInPolygon({ x: tmpV.x, y: tmpV.y }, polyNdc)) {
				setPackedMaskBitBig(mask, idx);
			}
		}

		return mask;
	}

	function render() {
		const s = (geom.getAttribute("size") as THREE.BufferAttribute)
			.array as Float32Array;
		let maxS = 0;
		for (let i = 0; i < s.length; i++) if (s[i] > maxS) maxS = s[i];
		if (!(maxS > 0)) {
			throw new Error(
				"Points not visible: size attribute max is 0 (setSizesFromModel was likely never called).",
			);
		}

		controls.update();
		renderer.render(scene, camera);
	}

	function dispose() {
		controls.dispose();
		geom.dispose();
		mat.dispose();
		renderer.dispose();
		renderer.forceContextLoss();
		renderer.domElement.remove();
		scene.remove(pointsObj);

		// Dispose axis label resources too
		for (const s of [xLabel, yLabel, zLabel]) {
			const m = s.material as THREE.SpriteMaterial;
			m.map?.dispose();
			m.dispose();
		}
	}

	return {
		domElement: renderer.domElement,
		setSize,
		setPointsFromModel,
		setColorsFromModel,
		setSizesFromModel,
		pickPointIndex,
		setAxesFromModel,
		rebuildAxisLabels,
		selectMaskInLasso,
		render,
		dispose,
	};
}
