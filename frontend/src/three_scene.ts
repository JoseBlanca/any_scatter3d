// three_scene.ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WidgetModel } from "./model";
import { bytesToUint8Array } from "./binary";

export type ThreeScene = {
	domElement: HTMLCanvasElement;
	setSize: (cssW: number, cssH: number, dpr: number) => void;
	setPointsFromModel: () => void;
	setPointSizeFromModel: () => void;
	setColorsFromCategory: (
		codesBytes: unknown,
		colorsForCodes: number[][],
	) => void;
	selectIndicesInLasso: (polyNdc: { x: number; y: number }[]) => number[];
	render: () => void;
	dispose: () => void;
};
type Point2D = { x: number; y: number };

function positionsFromPackedBytes(
	pointsBytes: unknown,
	dtype: unknown,
	stride: unknown,
): Float32Array {
	const dt = typeof dtype === "string" ? dtype : "float32";
	const s = typeof stride === "number" ? stride : 3;

	if (dt === ">f4") {
		throw new Error(
			"Big-endian float32 (>f4) is not supported in JS TypedArrays",
		);
	}
	if (dt !== "float32") {
		throw new Error(`Unsupported points dtype: ${dt} (expected float32)`);
	}
	if (s !== 3) {
		throw new Error(`Unsupported points stride: ${s} (expected 3)`);
	}

	const u8 = bytesToUint8Array(pointsBytes);
	const byteOffset = u8.byteOffset;
	const byteLength = u8.byteLength;

	if (byteLength % 4 !== 0) {
		throw new Error(`points bytes length ${byteLength} not divisible by 4`);
	}

	let f32: Float32Array;

	if (byteOffset % 4 === 0) {
		f32 = new Float32Array(u8.buffer, byteOffset, byteLength / 4);
	} else {
		const copy = new Uint8Array(byteLength);
		copy.set(u8);
		f32 = new Float32Array(copy.buffer);
	}

	if (f32.length % 3 !== 0) throw new Error("points not divisible by 3");
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

export function createThreeScene(
	canvasHost: HTMLElement,
	model: WidgetModel,
): ThreeScene {
	// --- renderer / scene / camera ---
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	canvasHost.appendChild(renderer.domElement);
	const bg = String(model.get("background") ?? "#ffffff");
	renderer.setClearColor(new THREE.Color(bg), 1);

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
	camera.position.set(0, 0, 10);

	// basic lights (PointsMaterial doesn't need them, but later you might)
	scene.add(new THREE.AmbientLight(0xffffff, 0.8));

	// Orbit controls (rotate mode)
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;

	// --- points geometry ---
	const geom = new THREE.BufferGeometry();
	const initial = positionsFromPackedBytes(
		model.get("points_t"),
		model.get("points_dtype_t"),
		model.get("points_stride_t"),
	);
	let positionAttr = new THREE.BufferAttribute(initial, 3);
	geom.setAttribute("position", positionAttr);
	const attr = geom.getAttribute("position") as THREE.BufferAttribute;

	const nPoints = positionAttr.count;
	const colorArray = new Float32Array(nPoints * 3);

	// default color (unset)
	for (let i = 0; i < nPoints; i++) {
		colorArray[i * 3 + 0] = 0.6;
		colorArray[i * 3 + 1] = 0.6;
		colorArray[i * 3 + 2] = 0.6;
	}

	const colorAttr = new THREE.BufferAttribute(colorArray, 3);
	geom.setAttribute("color", colorAttr);

	function frameCameraToGeometry() {
		const bs = geom.boundingSphere;
		if (!bs || !Number.isFinite(bs.radius) || bs.radius <= 0) return;

		// Put camera so the sphere fits the view.
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

	function setPointsFromModel() {
		const arr = positionsFromPackedBytes(
			model.get("points_t"),
			model.get("points_dtype_t"),
			model.get("points_stride_t"),
		);

		if (positionAttr.array.length !== arr.length) {
			// size changed: recreate attribute
			positionAttr = new THREE.BufferAttribute(arr, 3);
			geom.setAttribute("position", positionAttr);
		} else {
			// size same: update in place
			(positionAttr.array as Float32Array).set(arr);
			positionAttr.needsUpdate = true;
		}

		geom.computeBoundingSphere();
		frameCameraToGeometry();
	}

	const pointSize = Number(model.get("point_size_t")) || 0.05;

	const mat = new THREE.PointsMaterial({
		size: pointSize,
		sizeAttenuation: true,
		vertexColors: true,
	});

	function setPointSizeFromModel() {
		const s = Number(model.get("point_size_t")) || 0.05;
		mat.size = s;
		mat.needsUpdate = true;
	}

	const pointsObj = new THREE.Points(geom, mat);
	scene.add(pointsObj);

	function setColorsFromCategory(
		codesBytes: unknown,
		colorsForCodes: number[][],
	) {
		const codes = bytesToUint8Array(codesBytes);
		const colorAttr = geom.getAttribute("color") as THREE.BufferAttribute;
		const colorArr = colorAttr.array as Float32Array;

		for (let i = 0; i < nPoints; i++) {
			const code = codes[i] ?? 0;
			const rgb = colorsForCodes[code] ?? colorsForCodes[0] ?? [1, 1, 1];
			const j = i * 3;
			colorArr[j] = rgb[0];
			colorArr[j + 1] = rgb[1];
			colorArr[j + 2] = rgb[2];
		}

		colorAttr.needsUpdate = true;
	}

	function setSize(cssW: number, cssH: number, dpr: number) {
		renderer.setPixelRatio(dpr);
		renderer.setSize(cssW, cssH, false);
		camera.aspect = cssW > 0 && cssH > 0 ? cssW / cssH : 1;
		camera.updateProjectionMatrix();
	}

	const tmpV = new THREE.Vector3();

	function selectIndicesInLasso(polyNdc: Point2D[]): number[] {
		if (polyNdc.length < 3) return [];

		camera.updateMatrixWorld(true);

		const pos = geom.getAttribute("position") as THREE.BufferAttribute;
		const arr = pos.array as Float32Array;
		const out: number[] = [];

		// arr layout: [x0,y0,z0,x1,y1,z1,...]
		for (let i = 0; i < arr.length; i += 3) {
			tmpV.set(arr[i], arr[i + 1], arr[i + 2]);
			tmpV.project(camera); // now in NDC

			// skip clipped points (behind camera / outside clip volume)
			if (tmpV.z < -1 || tmpV.z > 1) continue;

			if (pointInPolygon({ x: tmpV.x, y: tmpV.y }, polyNdc)) {
				out.push(i / 3);
			}
		}

		return out;
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
		setPointSizeFromModel,
		setColorsFromCategory,
		selectIndicesInLasso,
		render,
		dispose,
	};
}
