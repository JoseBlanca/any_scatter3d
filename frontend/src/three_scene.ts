// frontend/src/three_scene.ts
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

export type ThreeScene = {
	domElement: HTMLCanvasElement;
	setSize: (cssW: number, cssH: number, dpr: number) => void;

	setPointsFromModel: () => void;
	setColorsFromModel: () => void;

	// Returns packed bits (bitorder="big") for N points:
	// byte = i >> 3, bit = 7 - (i & 7)
	selectMaskInLasso: (polyNdc: { x: number; y: number }[]) => Uint8Array;

	setAxesFromModel: () => void;

	render: () => void;
	dispose: () => void;
};

type Point2D = { x: number; y: number };

const BLACK = "#000";
const X_AXIS_COLOR = BLACK;
const Y_AXIS_COLOR = BLACK;
const Z_AXIS_COLOR = BLACK;

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

export function createThreeScene(
	canvasHost: HTMLElement,
	model: WidgetModel,
): ThreeScene {
	// --- renderer / scene / camera ---
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	canvasHost.appendChild(renderer.domElement);

	// background might still exist as a traitlet in your widget; if not, default.
	const bg = String((model.get("background") as any) ?? "#ffffff");
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

	// point size traitlet might still exist; default if not.
	const initialPointSize =
		Number((model.get("point_size_t") as any) ?? 0.05) || 0.05;

	const mat = new THREE.PointsMaterial({
		size: initialPointSize,
		sizeAttenuation: true,
		vertexColors: true,
	});

	const pointsObj = new THREE.Points(geom, mat);
	scene.add(pointsObj);

	const axesGroup = new THREE.Group();
	scene.add(axesGroup);

	function makeAxisLine(color: number): THREE.Line {
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
			const v = posArr[i];
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

	function setAxesFromModel() {
		const show = Boolean(model.get(TRAITS.showAxes));
		axesGroup.visible = show;

		if (!show) return;

		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		const { max } = computeMaxXYZ(arr);

		// from origin to maxima on each axis
		setLinePositions(xAxis, 0, 0, 0, max, 0, 0);
		setLinePositions(yAxis, 0, 0, 0, 0, max, 0);
		setLinePositions(zAxis, 0, 0, 0, 0, 0, max);
	}

	function setPointsFromModel() {
		const arr = positionsFromXYZBytes(model.get(TRAITS.xyzBytes));

		if (positionAttr.array.length !== arr.length) {
			// size changed: recreate attribute
			positionAttr = new THREE.BufferAttribute(arr, 3);
			geom.setAttribute("position", positionAttr);

			// recreate color buffer too
			nPoints = positionAttr.count;
			colorArray = new Float32Array(nPoints * 3);
			colorAttr = new THREE.BufferAttribute(colorArray, 3);
			geom.setAttribute("color", colorAttr);
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

		const cAttr = geom.getAttribute("color") as THREE.BufferAttribute;
		const cArr = cAttr.array as Float32Array;

		for (let i = 0; i < nPoints; i++) {
			const code = codes[i] ?? 0;
			const j = i * 3;

			if (code === 0) {
				cArr[j] = missing[0];
				cArr[j + 1] = missing[1];
				cArr[j + 2] = missing[2];
				continue;
			}

			const idx = code - 1;
			const rgb = colors[idx];
			if (!rgb) {
				// Hard fail: codes and colors out of sync is a bug we want to see.
				throw new Error(
					`No color for code=${code} (colors_t length=${colors.length}); expected colors_t[${idx}]`,
				);
			}
			cArr[j] = rgb[0];
			cArr[j + 1] = rgb[1];
			cArr[j + 2] = rgb[2];
		}

		cAttr.needsUpdate = true;
	}

	function setSize(cssW: number, cssH: number, dpr: number) {
		renderer.setPixelRatio(dpr);
		renderer.setSize(cssW, cssH, false);
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
	}

	return {
		domElement: renderer.domElement,
		setSize,
		setPointsFromModel,
		setColorsFromModel,
		setAxesFromModel,
		selectMaskInLasso,
		render,
		dispose,
	};
}
