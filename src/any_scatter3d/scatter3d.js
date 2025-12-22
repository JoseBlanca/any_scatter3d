import * as THREE from "https://esm.sh/three@0.182.0";

const ROT_SPEED = 0.005;
const DEF_BACKGROUND_COLOR = "#111111";
const DEF_POINT_SIZE = 0.05;
const LIGHT_GREY = [0.7, 0.7, 0.7];
const DEF_POINT_COLOR = LIGHT_GREY;

const ASPECT_RATIO = 3 / 2; // width / height
const MIN_HEIGHT = 150; // minimal usable height
const PADDING_BOTTOM = 16; // margin from widget bottom to viewport bottom

// Simple JSON-based clone: safe here (only strings / numbers)
function clone(obj) {
	return obj ? JSON.parse(JSON.stringify(obj)) : {};
}

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

function makePointerHandlers(scene, camera, renderer, getInteractionMode) {
	let isDragging = false;
	let prevX = 0;
	let prevY = 0;

	function onPointerDown(event) {
		const mode = getInteractionMode();
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

		const mode = getInteractionMode();
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

// Build color array for the currently selected category column
function createPointColors(categoriesState, colorsByCol, currentCol) {
	if (!currentCol) {
		const anyCol = Object.keys(categoriesState)[0];
		if (!anyCol) {
			return new Float32Array(0);
		}
		currentCol = anyCol;
	}

	const cats = categoriesState[currentCol] || [];
	const colorMap = colorsByCol[currentCol] || {};

	const n = cats.length;
	const out = new Float32Array(n * 3);

	for (let i = 0; i < n; i++) {
		const cat = cats[i];
		const rgb = colorMap[cat] || DEF_POINT_COLOR;

		out[i * 3 + 0] = rgb[0] || 0;
		out[i * 3 + 1] = rgb[1] || 0;
		out[i * 3 + 2] = rgb[2] || 0;
	}

	return out;
}

function addControlBar(el, controlApi) {
	const {
		getInteractionMode,
		setInteractionMode,
		getCategoryColumns,
		getCurrentCategoryColumn,
		setCurrentCategoryColumn,
	} = controlApi;

	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.gap = "0.75rem";
	controls.style.alignItems = "center";
	controls.style.marginBottom = "0.5rem";
	controls.style.flexWrap = "wrap";

	// --- Rotate / Lasso button (pure JS state) ---
	const modeButton = document.createElement("button");
	modeButton.className = "scatter3d-button rotate";

	function syncModeButtonLabel() {
		const mode = getInteractionMode();
		modeButton.textContent = mode === "rotate" ? "Rotate" : "Lasso";
		modeButton.className = `scatter3d-button ${mode}`;
	}

	syncModeButtonLabel();

	modeButton.addEventListener("click", () => {
		const current = getInteractionMode();
		const next = current === "rotate" ? "lasso" : "rotate";
		setInteractionMode(next);
		syncModeButtonLabel();
	});

	controls.appendChild(modeButton);

	// --- Category column dropdown ---
	const catColLabel = document.createElement("label");
	catColLabel.textContent = "Category column:";
	catColLabel.style.fontSize = "13px";
	catColLabel.style.fontFamily = "sans-serif";

	const catColSelect = document.createElement("select");
	catColSelect.className = "scatter3d-select";

	function syncCategoryColumnOptions() {
		const cols = getCategoryColumns();
		const current = getCurrentCategoryColumn();

		catColSelect.innerHTML = "";

		for (const col of cols) {
			const opt = document.createElement("option");
			opt.value = col;
			opt.textContent = col;
			if (col === current) {
				opt.selected = true;
			}
			catColSelect.appendChild(opt);
		}

		if (cols.length > 0 && !cols.includes(current)) {
			catColSelect.value = cols[0];
			setCurrentCategoryColumn(cols[0]);
		}
	}

	syncCategoryColumnOptions();

	catColSelect.addEventListener("change", () => {
		const value = catColSelect.value;
		setCurrentCategoryColumn(value);
	});

	catColLabel.appendChild(catColSelect);
	controls.appendChild(catColLabel);

	el.appendChild(controls);

	return {
		controls,
		dispose() {
			// placeholder for future listeners
		},
	};
}

function render({ model, el }) {
	// --- Basic container setup ---
	el.innerHTML = "";
	el.style.position = "relative";
	el.style.width = "100%";
	el.style.display = "flex";
	el.style.flexDirection = "column";

	// --- JS-side state (source of truth for categories + interaction mode) ---
	let interactionMode = "rotate";

	let categoriesState = clone(model.get("categories_t") || {});
	let colorsByCol = model.get("categories_colors_t") || {};

	let currentCategoryColumn = null;

	function ensureCurrentCategoryColumn() {
		const cols = Object.keys(categoriesState);
		if (!currentCategoryColumn || !cols.includes(currentCategoryColumn)) {
			currentCategoryColumn = cols.length > 0 ? cols[0] : null;
		}
	}

	ensureCurrentCategoryColumn();

	// --- Control bar ---
	const { controls, dispose: disposeControls } = addControlBar(el, {
		getInteractionMode: () => interactionMode,
		setInteractionMode: (mode) => {
			interactionMode = mode;
		},
		getCategoryColumns: () => Object.keys(categoriesState),
		getCurrentCategoryColumn: () => currentCategoryColumn,
		setCurrentCategoryColumn: (col) => {
			currentCategoryColumn = col;
			updatePoints();
		},
	});

	// --- View container for Three.js ---
	const view = document.createElement("div");
	view.style.position = "relative";
	view.style.width = "100%";
	el.appendChild(view);

	// --- Three.js essentials ---
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
	camera.position.set(0, 0, 10);

	const renderer = new THREE.WebGLRenderer({ antialias: true });
	view.appendChild(renderer.domElement);

	const bgColor = model.get("background") || DEF_BACKGROUND_COLOR;
	renderer.setClearColor(bgColor);

	// --- Resize logic with aspect ratio and viewport-based vertical cap ---
	function resizeRenderer() {
		// width bound from host
		const widthBound =
			view.clientWidth ||
			el.clientWidth ||
			(el.parentElement ? el.parentElement.clientWidth : 0) ||
			window.innerWidth ||
			800;

		// ideal height from aspect ratio
		let width = widthBound;
		let height = width / ASPECT_RATIO;

		// vertical space available in viewport from top of widget
		const rect = el.getBoundingClientRect();
		const viewportHeight =
			window.innerHeight || document.documentElement.clientHeight || 800;
		let availableHeight = viewportHeight - rect.top - PADDING_BOTTOM;

		if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
			availableHeight = viewportHeight * 0.5;
		}

		// clamp height to what can be shown without forcing extra scroll
		if (height > availableHeight) {
			const scale = availableHeight / height;
			height = Math.max(MIN_HEIGHT, availableHeight);
			width = width * scale;
		}

		// ensure minimum height
		if (height < MIN_HEIGHT) {
			const scale = MIN_HEIGHT / height;
			height = MIN_HEIGHT;
			width = width * scale;
		}

		// if width now exceeds bound, clamp and adjust height accordingly
		if (width > widthBound) {
			const scale = widthBound / width;
			width = widthBound;
			height = Math.max(MIN_HEIGHT, height * scale);
		}

		view.style.height = `${height}px`;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		renderer.setSize(width, height, false);
		renderer.render(scene, camera);
	}

	resizeRenderer();

	const resizeObserver = new ResizeObserver(() => {
		resizeRenderer();
	});
	resizeObserver.observe(view);
	window.addEventListener("resize", resizeRenderer);

	// --- Lights ---
	const light = new THREE.DirectionalLight(0xffffff, 1);
	light.position.set(1, 1, 1);
	scene.add(light);
	scene.add(new THREE.AmbientLight(0x404040));

	const { onPointerDown, onPointerUp, onPointerMove } = makePointerHandlers(
		scene,
		camera,
		renderer,
		() => interactionMode,
	);

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointerup", onPointerUp);
	window.addEventListener("pointermove", onPointerMove);

	const pointsObjectRef = { current: null };

	// --- React to model changes ---

	function getPointCoords() {
		return model.get("points_t") || [];
	}

	function updatePoints() {
		ensureCurrentCategoryColumn();

		const pointCoords = getPointCoords();
		const pointColors = createPointColors(
			categoriesState,
			colorsByCol,
			currentCategoryColumn,
		);
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

	const onPointsChange = updatePoints;
	const onCategoriesChange = () => {
		categoriesState = clone(model.get("categories_t") || {});
		ensureCurrentCategoryColumn();
		updatePoints();
	};
	const onColorsChange = () => {
		colorsByCol = model.get("categories_colors_t") || {};
		updatePoints();
	};
	const onPointSizeChange = updatePoints;

	if (model.on) {
		model.on("change:points_t", onPointsChange);
		model.on("change:categories_t", onCategoriesChange);
		model.on("change:categories_colors_t", onColorsChange);
		model.on("change:point_size", onPointSizeChange);
		model.on("change:background", onBackgroundChange);
	}

	// Initial render
	updatePoints();

	// --- Cleanup ---
	return () => {
		resizeObserver.disconnect();
		window.removeEventListener("resize", resizeRenderer);
		renderer.domElement.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointermove", onPointerMove);

		if (model.off) {
			model.off("change:points_t", onPointsChange);
			model.off("change:categories_t", onCategoriesChange);
			model.off("change:categories_colors_t", onColorsChange);
			model.off("change:point_size", onPointSizeChange);
			model.off("change:background", onBackgroundChange);
		}

		if (pointsObjectRef.current) {
			scene.remove(pointsObjectRef.current);
			pointsObjectRef.current.geometry.dispose();
			pointsObjectRef.current.material.dispose();
		}

		disposeControls();

		renderer.dispose();
		el.innerHTML = "";
	};
}

export default { render };
