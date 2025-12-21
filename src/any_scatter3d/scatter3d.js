import * as THREE from "https://esm.sh/three@0.182.0";

function renderPoints(
	pointCoords,
	pointColors,
	pointSize,
	scene,
	camera,
	renderer,
	pointsObjectRef,
) {
	if (pointsObjectRef.current) {
		scene.remove(pointsObjectRef.current);
		pointsObjectRef.current.geometry.dispose();
		pointsObjectRef.current.material.dispose();
		pointsObjectRef.current = null;
	}

	if (!Array.isArray(pointCoords) || pointCoords.length === 0) {
		renderer.render(scene, camera);
		return;
	}

	const geometry = new THREE.BufferGeometry();
	const positions = new Float32Array(pointCoords.length * 3);
	const colors = new Float32Array(pointCoords.length * 3);

	for (let i = 0; i < pointCoords.length; i++) {
		const [x, y, z] = pointCoords[i];
		positions[i * 3] = x;
		positions[i * 3 + 1] = y;
		positions[i * 3 + 2] = z;

		const [r, g, b] = pointColors[i] || [0.5, 0.5, 0.5];
		colors[i * 3] = r;
		colors[i * 3 + 1] = g;
		colors[i * 3 + 2] = b;
	}

	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

	const material = new THREE.PointsMaterial({
		size: pointSize,
		sizeAttenuation: true,
		vertexColors: true,
		color: 0xffffff,
	});

	const pointsObject = new THREE.Points(geometry, material);
	pointsObjectRef.current = pointsObject;
	scene.add(pointsObject);

	geometry.computeBoundingSphere();
	if (geometry.boundingSphere) {
		const { center, radius } = geometry.boundingSphere;
		camera.position.set(center.x, center.y, radius * 3 || 10);
		camera.lookAt(center);
	}

	renderer.render(scene, camera);
}

function makePointerHandlers(scene, camera, renderer) {
	let isDragging = false;
	let prevX = 0;
	let prevY = 0;

	function onPointerDown(event) {
		isDragging = true;
		prevX = event.clientX;
		prevY = event.clientY;
	}

	function onPointerUp() {
		isDragging = false;
	}

	function onPointerMove(event) {
		if (!isDragging) return;

		const deltaX = event.clientX - prevX;
		const deltaY = event.clientY - prevY;

		prevX = event.clientX;
		prevY = event.clientY;

		scene.rotation.y += deltaX * 0.005;
		scene.rotation.x += deltaY * 0.005;

		renderer.render(scene, camera);
	}

	return { onPointerDown, onPointerUp, onPointerMove };
}

function makeResizeHandler(
	el,
	scene,
	camera,
	renderer,
	initialWidth,
	initialHeight,
) {
	return function onResize() {
		const w = el.clientWidth || initialWidth;
		const h = el.clientHeight || initialHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
		renderer.render(scene, camera);
	};
}

function render({ model, el }) {
	const defaultBackgroundColor = "#111111";
	const defaultPointSize = 0.05;

	// --- Basic container setup ---
	el.innerHTML = "";
	el.style.position = "relative";
	el.style.width = "100%";
	el.style.height = "100%";
	el.style.minHeight = "300px";

	const width = el.clientWidth || 600;
	const height = el.clientHeight || 400;

	// --- Three.js essentials ---
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
	camera.position.set(0, 0, 10);

	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(width, height);
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	el.appendChild(renderer.domElement);

	// Background from model (or default)
	const bgColor = model.get("background") || defaultBackgroundColor;
	renderer.setClearColor(bgColor);

	// --- Lights ---
	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(1, 1, 1);
	scene.add(light);
	scene.add(new THREE.AmbientLight(0x404040));

	const { onPointerDown, onPointerUp, onPointerMove } = makePointerHandlers(
		scene,
		camera,
		renderer,
	);

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointerup", onPointerUp);
	window.addEventListener("pointermove", onPointerMove);

	const onResize = makeResizeHandler(
		el,
		scene,
		camera,
		renderer,
		width,
		height,
	);
	const resizeObserver = new ResizeObserver(onResize);
	resizeObserver.observe(el);

	const pointsObjectRef = { current: null };

	// --- React to model changes ---
	function updatePoints() {
		const pointCoords = model.get("points") || [];
		const pointColors = model.get("point_colors") || [];
		const pointSize = model.get("point_size") ?? defaultPointSize;

		renderPoints(
			pointCoords,
			pointColors,
			pointSize,
			scene,
			camera,
			renderer,
			pointsObjectRef,
		);
	}

	function onBackgroundChange() {
		const color = model.get("background") || defaultBackgroundColor;
		renderer.setClearColor(color);
		renderer.render(scene, camera);
	}

	// Register listeners
	if (model.on) {
		model.on("change:points", updatePoints);
		model.on("change:point_colors", updatePoints);
		model.on("change:point_size", updatePoints);
		model.on("change:background", onBackgroundChange);
	}

	// Initial render
	updatePoints();

	// --- Cleanup ---
	return () => {
		resizeObserver.disconnect();
		renderer.domElement.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointermove", onPointerMove);

		if (model.off) {
			model.off("change:points", updatePoints);
			model.off("change:point_colors", updatePoints);
			model.off("change:point_size", updatePoints);
			model.off("change:background", onBackgroundChange);
		}

		if (pointsObjectRef.current) {
			scene.remove(pointsObjectRef.current);
			pointsObjectRef.current.geometry.dispose();
			pointsObjectRef.current.material.dispose();
		}

		renderer.dispose();
		el.innerHTML = "";
	};
}

export default { render };
