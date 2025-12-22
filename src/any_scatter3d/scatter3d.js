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

// Simple point-in-polygon test in screen coordinates
function pointInPolygon(x, y, polygon) {
	let inside = false;
	const n = polygon.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;

		const intersect =
			yi > y !== yj > y &&
			x <
				((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + // avoid division by zero
					xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function addControlBar(el, controlApi) {
	const {
		getInteractionMode,
		setInteractionMode,
		getLassoOperation,
		setLassoOperation,
		getCategoryColumns,
		getCurrentCategoryColumn,
		setCurrentCategoryColumn,
		getAvailableCategories,
		getCurrentCategoryValue,
		setCurrentCategoryValue,
	} = controlApi;

	const controls = document.createElement("div");
	controls.style.display = "flex";
	controls.style.flexDirection = "column";
	controls.style.gap = "0.25rem";
	controls.style.marginBottom = "0.5rem";

	// ---------- Top row: Mode + Operation ----------

	const topRow = document.createElement("div");
	topRow.style.display = "flex";
	topRow.style.flexWrap = "wrap";
	topRow.style.gap = "0.5rem";
	topRow.style.alignItems = "center";

	// Mode: Rotate | Lasso
	const modeLabel = document.createElement("span");
	modeLabel.textContent = "Mode:";
	modeLabel.style.fontSize = "13px";
	modeLabel.style.fontFamily = "sans-serif";

	function styleModeButton(btn, isActive) {
		btn.style.padding = "2px 8px";
		btn.style.borderRadius = "4px";
		btn.style.border = "1px solid #444";
		btn.style.cursor = "pointer";
		btn.style.fontSize = "12px";

		if (isActive) {
			// Active state: blue (matches Add)
			btn.style.background = "#2563eb"; // blue
			btn.style.color = "#fff";
		} else {
			// Inactive state: grey
			btn.style.background = "#222"; // dark grey
			btn.style.color = "#aaa";
		}
	}

	const rotateButton = document.createElement("button");
	rotateButton.textContent = "Rotate";

	const lassoButton = document.createElement("button");
	lassoButton.textContent = "Lasso";

	// Operation: + Add | – Remove (only visible in lasso mode)
	const opContainer = document.createElement("div");
	opContainer.style.display = "none"; // hidden in rotate mode
	opContainer.style.alignItems = "center";
	opContainer.style.gap = "0.25rem";

	const opLabel = document.createElement("span");
	opLabel.textContent = "Operation:";
	opLabel.style.fontSize = "13px";
	opLabel.style.fontFamily = "sans-serif";

	const addButton = document.createElement("button");
	addButton.textContent = "+ Add";

	const removeButton = document.createElement("button");
	removeButton.textContent = "– Remove";

	function styleOpButton(btn, activeColor, isActive) {
		btn.style.padding = "2px 8px";
		btn.style.borderRadius = "4px";
		btn.style.border = "1px solid #444";
		btn.style.cursor = "pointer";
		btn.style.fontSize = "12px";
		if (isActive) {
			btn.style.background = activeColor;
			btn.style.color = "#fff";
		} else {
			btn.style.background = "#222";
			btn.style.color = "#aaa";
		}
	}

	opContainer.appendChild(opLabel);
	opContainer.appendChild(addButton);
	opContainer.appendChild(removeButton);

	topRow.appendChild(modeLabel);
	topRow.appendChild(rotateButton);
	topRow.appendChild(lassoButton);
	topRow.appendChild(opContainer);

	controls.appendChild(topRow);

	// ---------- Second row: Column + Value dropdown ----------

	const bottomRow = document.createElement("div");
	bottomRow.style.display = "flex";
	bottomRow.style.alignItems = "center";
	bottomRow.style.gap = "0.75rem";
	bottomRow.style.flexWrap = "wrap";

	const colLabel = document.createElement("span");
	colLabel.textContent = "Category:";
	colLabel.style.fontSize = "13px";
	colLabel.style.fontFamily = "sans-serif";

	const colSelect = document.createElement("select");
	colSelect.style.fontSize = "13px";

	const valLabel = document.createElement("span");
	valLabel.textContent = "Value:";
	valLabel.style.fontSize = "13px";
	valLabel.style.fontFamily = "sans-serif";

	const valSelect = document.createElement("select");
	valSelect.style.fontSize = "13px";

	bottomRow.appendChild(colLabel);
	bottomRow.appendChild(colSelect);
	bottomRow.appendChild(valLabel);
	bottomRow.appendChild(valSelect);
	controls.appendChild(bottomRow);

	// ---------- Sync helpers ----------

	function syncModeButtons() {
		const mode = getInteractionMode();

		styleModeButton(rotateButton, mode === "rotate");
		styleModeButton(lassoButton, mode === "lasso");

		if (mode === "rotate") {
			opContainer.style.display = "none";
		} else {
			opContainer.style.display = "flex";
		}
	}

	function syncOperationButtons() {
		const op = getLassoOperation();

		// add = blue, remove = red
		styleOpButton(addButton, "#2563eb", op === "add");
		styleOpButton(removeButton, "#b91c1c", op === "remove");
	}

	function syncColumnOptions() {
		const cols = getCategoryColumns();
		const current = getCurrentCategoryColumn();

		colSelect.innerHTML = "";

		for (const col of cols) {
			const opt = document.createElement("option");
			opt.value = col;
			opt.textContent = col;
			if (col === current) {
				opt.selected = true;
			}
			colSelect.appendChild(opt);
		}
	}

	function syncValueOptions() {
		const col = getCurrentCategoryColumn();
		const values = getAvailableCategories(col);
		const currentVal = getCurrentCategoryValue();

		valSelect.innerHTML = "";

		for (const v of values) {
			const opt = document.createElement("option");
			opt.value = v;
			opt.textContent = v;
			if (v === currentVal) {
				opt.selected = true;
			}
			valSelect.appendChild(opt);
		}
	}

	function syncAllCategoryControls() {
		syncColumnOptions();
		syncValueOptions();
	}

	// Initial sync
	syncModeButtons();
	syncOperationButtons();
	syncAllCategoryControls();

	// ---------- Event listeners ----------

	rotateButton.addEventListener("click", () => {
		setInteractionMode("rotate");
		syncModeButtons();
	});

	lassoButton.addEventListener("click", () => {
		setInteractionMode("lasso");
		syncModeButtons();
	});

	addButton.addEventListener("click", () => {
		setLassoOperation("add");
		syncOperationButtons();
	});

	removeButton.addEventListener("click", () => {
		setLassoOperation("remove");
		syncOperationButtons();
	});

	colSelect.addEventListener("change", () => {
		const value = colSelect.value;
		setCurrentCategoryColumn(value);
		// column changed → value list and current value may change
		syncAllCategoryControls();
	});

	valSelect.addEventListener("change", () => {
		const value = valSelect.value;
		setCurrentCategoryValue(value);
	});

	el.appendChild(controls);

	return {
		controls,
		syncCategoryUI: syncAllCategoryControls,
		dispose() {
			// placeholder for future cleanup
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

	// --- JS-side state ---
	let interactionMode = "rotate"; // "rotate" | "lasso"
	let lassoOperation = "add"; // "add" | "remove"

	let categoriesState = clone(model.get("categories_t") || {});
	let colorsByCol = model.get("categories_colors_t") || {};

	let currentCategoryColumn = null;
	let currentCategoryValue = null;

	function ensureCurrentCategoryColumn() {
		const cols = Object.keys(categoriesState);
		if (!currentCategoryColumn || !cols.includes(currentCategoryColumn)) {
			currentCategoryColumn = cols.length > 0 ? cols[0] : null;
		}
	}

	function ensureCurrentCategoryValue() {
		if (!currentCategoryColumn) {
			currentCategoryValue = null;
			return;
		}
		const colMap = colorsByCol[currentCategoryColumn] || {};
		const values = Object.keys(colMap);
		if (!currentCategoryValue || !values.includes(currentCategoryValue)) {
			currentCategoryValue = values.length > 0 ? values[0] : null;
		}
	}

	function ensureCategorySelection() {
		ensureCurrentCategoryColumn();
		ensureCurrentCategoryValue();
	}

	ensureCategorySelection();

	// --- Control bar ---
	const {
		controls,
		syncCategoryUI,
		dispose: disposeControls,
	} = addControlBar(el, {
		getInteractionMode: () => interactionMode,
		setInteractionMode: (mode) => {
			interactionMode = mode;
		},
		getLassoOperation: () => lassoOperation,
		setLassoOperation: (op) => {
			lassoOperation = op;
		},
		getCategoryColumns: () => Object.keys(categoriesState),
		getCurrentCategoryColumn: () => currentCategoryColumn,
		setCurrentCategoryColumn: (col) => {
			currentCategoryColumn = col;
			ensureCurrentCategoryValue();
			updatePoints();
		},
		getAvailableCategories: (col) => {
			if (!col) return [];
			const colMap = colorsByCol[col] || {};
			return Object.keys(colMap);
		},
		getCurrentCategoryValue: () => currentCategoryValue,
		setCurrentCategoryValue: (v) => {
			currentCategoryValue = v;
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

	// --- Lasso overlay canvas ---
	const lassoCanvas = document.createElement("canvas");
	lassoCanvas.style.position = "absolute";
	lassoCanvas.style.left = "0";
	lassoCanvas.style.top = "0";
	lassoCanvas.style.pointerEvents = "none"; // let events pass through
	view.appendChild(lassoCanvas);
	const lassoCtx = lassoCanvas.getContext("2d");

	let lastRenderWidth = 0;
	let lastRenderHeight = 0;

	function clearLassoCanvas() {
		if (!lassoCtx) return;
		lassoCtx.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
	}

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

		// Resize lasso canvas to match
		lassoCanvas.width = width;
		lassoCanvas.height = height;
		lassoCanvas.style.width = `${width}px`;
		lassoCanvas.style.height = `${height}px`;
		clearLassoCanvas();

		lastRenderWidth = width;
		lastRenderHeight = height;

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

	const pointsObjectRef = { current: null };

	function getPointCoords() {
		return model.get("points_t") || [];
	}

	function updatePoints() {
		ensureCategorySelection();

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
		ensureCategorySelection();
		updatePoints();
		syncCategoryUI();
	};
	const onColorsChange = () => {
		colorsByCol = model.get("categories_colors_t") || {};
		ensureCategorySelection();
		updatePoints();
		syncCategoryUI();
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
	syncCategoryUI();

	// --- Lasso + rotate interaction ---

	let isRotating = false;
	let lastX = 0;
	let lastY = 0;

	let isLassoing = false;
	let lassoPoints = []; // array of {x, y} in canvas coords

	function getCanvasCoords(event) {
		const rect = view.getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	function drawLasso() {
		if (!lassoCtx || lassoPoints.length < 2) return;
		clearLassoCanvas();
		lassoCtx.beginPath();
		lassoCtx.lineWidth = 1.5;
		lassoCtx.strokeStyle = "rgba(255,255,255,0.9)";
		lassoCtx.fillStyle = "rgba(37,99,235,0.15)"; // semi-transparent blue fill

		lassoCtx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
		for (let i = 1; i < lassoPoints.length; i++) {
			lassoCtx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
		}
		lassoCtx.closePath();
		lassoCtx.fill();
		lassoCtx.stroke();
	}

	function applyLassoSelection() {
		if (!pointsObjectRef.current) return;
		if (lassoPoints.length < 3) return;
		if (lastRenderWidth <= 0 || lastRenderHeight <= 0) return;

		const pointCoords = getPointCoords();
		if (!Array.isArray(pointCoords) || pointCoords.length === 0) return;

		const nPoints = pointCoords.length / 3;
		const width = lastRenderWidth;
		const height = lastRenderHeight;

		const v = new THREE.Vector3();
		const selectedIndices = [];

		for (let i = 0; i < nPoints; i++) {
			const x = pointCoords[i * 3 + 0];
			const y = pointCoords[i * 3 + 1];
			const z = pointCoords[i * 3 + 2];

			v.set(x, y, z);
			v.project(camera);

			const sx = (v.x * 0.5 + 0.5) * width;
			const sy = (-v.y * 0.5 + 0.5) * height;

			if (pointInPolygon(sx, sy, lassoPoints)) {
				selectedIndices.push(i);
			}
		}

		if (selectedIndices.length === 0) {
			return;
		}

		const colName = currentCategoryColumn;
		const categoryValue = currentCategoryValue;

		// If we don't have a column or value, do nothing
		if (!colName || !categoryValue) {
			return;
		}

		// --- Update categories_t according to lassoOperation ---
		let catsObj = clone(model.get("categories_t") || {});
		let colArr = Array.isArray(catsObj[colName])
			? catsObj[colName].slice()
			: [];
		if (colArr.length < nPoints) {
			for (let i = colArr.length; i < nPoints; i++) {
				colArr.push("");
			}
		}

		if (lassoOperation === "add") {
			for (const idx of selectedIndices) {
				colArr[idx] = categoryValue;
			}
		} else {
			// "remove": only clear if it matches the current category value
			for (const idx of selectedIndices) {
				if (colArr[idx] === categoryValue) {
					colArr[idx] = "";
				}
			}
		}

		catsObj[colName] = colArr;
		model.set("categories_t", catsObj);

		// Optional: expose debug info about the last lasso selection
		model.set("_last_lasso", {
			indices: selectedIndices,
			operation: lassoOperation,
			column: colName,
			value: categoryValue,
		});

		if (typeof model.save_changes === "function") {
			model.save_changes();
		}
	}

	function onPointerDown(event) {
		const mode = interactionMode;

		if (mode === "rotate") {
			isRotating = true;
			lastX = event.clientX;
			lastY = event.clientY;
			return;
		}

		if (mode === "lasso") {
			isLassoing = true;
			lassoPoints = [];
			const p = getCanvasCoords(event);
			lassoPoints.push(p);
			drawLasso();
		}
	}

	function onPointerMove(event) {
		const mode = interactionMode;

		if (mode === "rotate") {
			if (!isRotating) return;
			const deltaX = event.clientX - lastX;
			const deltaY = event.clientY - lastY;

			lastX = event.clientX;
			lastY = event.clientY;

			scene.rotation.y += deltaX * ROT_SPEED;
			scene.rotation.x += deltaY * ROT_SPEED;

			renderer.render(scene, camera);
			return;
		}

		if (mode === "lasso") {
			if (!isLassoing) return;
			const p = getCanvasCoords(event);
			lassoPoints.push(p);
			drawLasso();
		}
	}

	function onPointerUp() {
		const mode = interactionMode;

		if (mode === "rotate") {
			isRotating = false;
			return;
		}

		if (mode === "lasso") {
			if (isLassoing) {
				isLassoing = false;
				applyLassoSelection();
				clearLassoCanvas();
			}
		}
	}

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	renderer.domElement.addEventListener("pointermove", onPointerMove);
	renderer.domElement.addEventListener("pointerup", onPointerUp);
	renderer.domElement.addEventListener("pointerleave", onPointerUp);

	// --- Cleanup ---
	return () => {
		resizeObserver.disconnect();
		window.removeEventListener("resize", resizeRenderer);

		renderer.domElement.removeEventListener("pointerdown", onPointerDown);
		renderer.domElement.removeEventListener("pointermove", onPointerMove);
		renderer.domElement.removeEventListener("pointerup", onPointerUp);
		renderer.domElement.removeEventListener("pointerleave", onPointerUp);

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
