import * as THREE from "https://esm.sh/three@0.182.0";

const ROT_SPEED = 0.005;
const DEF_BACKGROUND_COLOR = "#111111";
const DEF_POINT_SIZE = 0.05;
const LIGHT_GREY = [0.7, 0.7, 0.7];
const DEF_POINT_COLOR = LIGHT_GREY;
const ASPECT_RATIO = 3 / 2;

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
		// no category column selected; just use default color
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
}

function render({ model, el }) {
	// --- Basic container setup ---
	el.innerHTML = "";
	el.style.position = "relative";
	el.style.width = "100%";
	el.style.minHeight = "300px";
	el.style.display = "flex";
	el.style.flexDirection = "column";

	// --- JS-side state (source of truth for categories + interaction mode) ---
	let interactionMode = "rotate";

	// categories_t: { colName: [cat0, cat1, ...] }
	let categoriesState = clone(model.get("categories_t") || {});
	// categories_colors_t: { colName: { catStr: [r,g,b], ... } }
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
	addControlBar(el, {
		getInteractionMode: () => interactionMode,
		setInteractionMode: (mode) => {
			interactionMode = mode;
			// when we implement lasso, we'll act on this
		},
		getCategoryColumns: () => Object.keys(categoriesState),
		getCurrentCategoryColumn: () => currentCategoryColumn,
		setCurrentCategoryColumn: (col) => {
			currentCategoryColumn = col;
			updatePoints(); // recolor points when column changes
		},
	});

	// --- View container for Three.js ---
	const view = document.createElement("div");
	view.style.position = "relative";
	view.style.width = "100%";
	view.style.flex = "1 1 auto";
	view.style.minHeight = "300px";
	el.appendChild(view);

	// --- Three.js essentials ---
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
	camera.position.set(0, 0, 10);

	const renderer = new THREE.WebGLRenderer({ antialias: true });
	view.appendChild(renderer.domElement);

	const bgColor = model.get("background") || DEF_BACKGROUND_COLOR;
	renderer.setClearColor(bgColor);

	// --- Resize logic (responsive) ---
	function resizeRenderer() {
		const containerWidth = el.clientWidth || 600;
		const height = Math.max(containerWidth / ASPECT_RATIO, 300);

		view.style.height = `${height}px`;

		camera.aspect = containerWidth / height;
		camera.updateProjectionMatrix();

		renderer.setSize(containerWidth, height, false);
		renderer.render(scene, camera);
	}

	resizeRenderer();

	const resizeObserver = new ResizeObserver(resizeRenderer);
	resizeObserver.observe(el);

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
		// new trait name from Python
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

	if (model.on) {
		// if Python ever changes the data, update JS state & rerender
		model.on("change:points_t", updatePoints);
		model.on("change:categories_t", () => {
			categoriesState = clone(model.get("categories_t") || {});
			ensureCurrentCategoryColumn();
			updatePoints();
		});
		model.on("change:categories_colors_t", () => {
			colorsByCol = model.get("categories_colors_t") || {};
			updatePoints();
		});
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
			model.off("change:points_t", updatePoints);
			model.off("change:categories_t", () => {});
			model.off("change:categories_colors_t", () => {});
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
