import * as THREE from "https://esm.sh/three@0.182.0";

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

	// --- Geometry for points ---
	let pointsObject = null;

	function buildPoints() {
		if (pointsObject) {
			scene.remove(pointsObject);
			pointsObject.geometry.dispose();
			pointsObject.material.dispose();
			pointsObject = null;
		}

		const pointsData = model.get("points") || []; // [[x,y,z], ...]
		const colorData = model.get("point_colors") || []; // [[r,g,b], ...]

		console.log("points[0..3] =", pointsData.slice(0, 3));
		console.log("point_colors[0..3] =", colorData.slice(0, 3));

		const size = model.get("point_size") ?? defaultPointSize;

		if (!Array.isArray(pointsData) || pointsData.length === 0) {
			renderer.render(scene, camera);
			return;
		}

		const geometry = new THREE.BufferGeometry();
		const positions = new Float32Array(pointsData.length * 3);
		const colors = new Float32Array(pointsData.length * 3);

		for (let i = 0; i < pointsData.length; i++) {
			const [x, y, z] = pointsData[i];
			positions[i * 3] = x;
			positions[i * 3 + 1] = y;
			positions[i * 3 + 2] = z;

			const [r, g, b] = colorData[i] || [0.5, 0.5, 0.5]; // default gray
			colors[i * 3] = r;
			colors[i * 3 + 1] = g;
			colors[i * 3 + 2] = b;
		}

		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			size,
			sizeAttenuation: true,
			vertexColors: true,
			// optional: color multiplies vertex colors, leave white to see them as-is:
			color: 0xffffff,
		});

		pointsObject = new THREE.Points(geometry, material);
		scene.add(pointsObject);

		geometry.computeBoundingSphere();
		if (geometry.boundingSphere) {
			const { center, radius } = geometry.boundingSphere;
			camera.position.set(center.x, center.y, radius * 3 || 10);
			camera.lookAt(center);
		}

		renderer.render(scene, camera);
	}

	// --- Mouse interaction ---
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

		const rotSpeed = 0.005;
		scene.rotation.y += deltaX * rotSpeed;
		scene.rotation.x += deltaY * rotSpeed;

		renderer.render(scene, camera);
	}

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	window.addEventListener("pointerup", onPointerUp);
	window.addEventListener("pointermove", onPointerMove);

	// --- Resize handling ---
	function onResize() {
		const w = el.clientWidth || width;
		const h = el.clientHeight || height;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
		renderer.render(scene, camera);
	}

	const resizeObserver = new ResizeObserver(onResize);
	resizeObserver.observe(el);

	// --- React to model changes ---
	model.on("change:points", buildPoints);
	model.on("change:point_colors", buildPoints);
	model.on("change:point_size", buildPoints);

	model.on("change:background", () => {
		const color = model.get("background") || defaultBackgroundColor;
		renderer.setClearColor(color);
		renderer.render(scene, camera);
	});

	// Initial render
	buildPoints();

	// --- Cleanup ---
	return () => {
		resizeObserver.disconnect();
		renderer.domElement.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointermove", onPointerMove);

		if (pointsObject) {
			scene.remove(pointsObject);
			pointsObject.geometry.dispose();
			pointsObject.material.dispose();
		}

		renderer.dispose();
		el.innerHTML = "";
	};
}

export default { render };
