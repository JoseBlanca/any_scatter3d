import * as THREE from "https://esm.sh/three@0.182.0";

const ROT_SPEED = 0.005;
const DEF_BACKGROUND_COLOR = "#111111";
const DEF_POINT_SIZE = 0.05;
const LIGHT_GREY = [0.7, 0.7, 0.7];
const DEF_POINT_COLOR = LIGHT_GREY;
const ASPECT_RATIO = 3 / 2;

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
	const positions = new Float32Array(pointCoords);
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

	const colors = new Float32Array(pointColors);
	geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

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

function makePointerHandlers(model, scene, camera, renderer) {
	let isDragging = false;
	let prevX = 0;
	let prevY = 0;

	function onPointerDown(event) {
		const mode = model.get("interaction_mode") || "rotate";
		if (mode !== "rotate") {
			isDragging = false;
			return;
		}
		isDragging = true;
		prevX = event.clientX;
		prevY = event.clientY;
	}

	function onPointerUp() {
		isDragging = false;
	}

	function onPointerMove(event) {
		if (!isDragging) return;

		const mode = model.get("interaction_mode") || "rotate";
		if (mode !== "rotate") {
			return;
		}

		const deltaX = event.clientX - prevX;
		const deltaY = event.clientY - prevY;

		prevX = event.clientX;
		prevY = event.clientY;

		scene.rotation.y += deltaX * ROT_SPEED;
		scene.rotation.x += deltaY * ROT_SPEED;

		renderer.render(scene, camera);
	}

	return { onPointerDown, onPointerUp, onPointerMove };
}

function create_point_colors_from_categories(model) {
	const categories = model.get("categories") || [];
	const categoryColors = model.get("category_colors") || {};

	const n = categories.length;
	const out = new Float32Array(n * 3);

	for (let i = 0; i < n; i++) {
		const cat = categories[i];
		const rgb = categoryColors[cat] || DEF_POINT_COLOR;

		out[i * 3 + 0] = rgb[0] || 0;
		out[i * 3 + 1] = rgb[1] || 0;
		out[i * 3 + 2] = rgb[2] || 0;
	}

	return out;
}

function addControlBar(model, el) {
	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.gap = "0.5rem";
	controls.style.alignItems = "center";
	controls.style.marginBottom = "0.5rem";

	const modeButton = document.createElement("button");
	modeButton.className = "scatter3d-button rotate";

	function syncModeButtonLabel() {
		const mode = model.get("interaction_mode") || "rotate";
		modeButton.textContent = mode === "rotate" ? "Rotate" : "Lasso";
		modeButton.className = `scatter3d-button ${mode}`;
	}

	syncModeButtonLabel();

	modeButton.addEventListener("click", () => {
		const current = model.get("interaction_mode") || "rotate";
		const next = current === "rotate" ? "lasso" : "rotate";
		model.set("interaction_mode", next);
		model.save_changes();
		syncModeButtonLabel();
	});

	if (model.on) {
		model.on("change:interaction_mode", syncModeButtonLabel);
	}

	controls.appendChild(modeButton);
	el.appendChild(controls);

	return function disposeControlBar() {
		if (model.off) {
			model.off("change:interaction_mode", syncModeButtonLabel);
		}
	};
}

function render({ model, el }) {
	// --- Basic container setup ---
	el.innerHTML = "";
	el.style.position = "relative";
	el.style.width = "100%";
	// do not force height:100%; let content define it
	el.style.minHeight = "300px";
	el.style.display = "flex";
	el.style.flexDirection = "column";

	const disposeControlBar = addControlBar(model, el);

	// --- View container for Three.js ---
	const view = document.createElement("div");
	view.style.position = "relative";
	view.style.width = "100%";
	view.style.flex = "1 1 auto";
	view.style.minHeight = "300px";
	el.appendChild(view);

	// --- Three.js essentials ---
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000); // aspect fixed later
	camera.position.set(0, 0, 10);

	const renderer = new THREE.WebGLRenderer({ antialias: true });
	view.appendChild(renderer.domElement);

	const bgColor = model.get("background") || DEF_BACKGROUND_COLOR;
	renderer.setClearColor(bgColor);

	// --- Resize logic (responsive) ---
	function resizeRenderer() {
		const containerWidth = el.clientWidth || 600;
		const aspect = ASPECT_RATIO;
		const height = Math.max(containerWidth / aspect, 300);

		// set view height so flex layout has something concrete
		view.style.height = `${height}px`;

		camera.aspect = containerWidth / height;
		camera.updateProjectionMatrix();

		renderer.setSize(containerWidth, height, false);
		renderer.render(scene, camera);
	}

	// initial sizing
	resizeRenderer();

	const resizeObserver = new ResizeObserver(resizeRenderer);
	resizeObserver.observe(el);

	// --- Lights ---
	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(1, 1, 1);
	scene.add(light);
	scene.add(new THREE.AmbientLight(0x404040));

	const { onPointerDown, onPointerUp, onPointerMove } = makePointerHandlers(
		model,
		scene,
		camera,
		renderer,
	);

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointerup", onPointerUp);
	window.addEventListener("pointermove", onPointerMove);

	const pointsObjectRef = { current: null };

	// --- React to model changes ---
	function updatePoints() {
		const pointCoords = model.get("points") || [];
		const pointColors = create_point_colors_from_categories(model);
		const pointSize = model.get("point_size") ?? DEF_POINT_SIZE;

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
		const color = model.get("background") || DEF_BACKGROUND_COLOR;
		renderer.setClearColor(color);
		renderer.render(scene, camera);
	}

	if (model.on) {
		model.on("change:points", updatePoints);
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
			model.off("change:point_size", updatePoints);
			model.off("change:background", onBackgroundChange);
		}

		disposeControlBar();

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
