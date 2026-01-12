import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let restoreGetContext: (() => void) | null = null;

function installCanvas2dMock() {
	const original = HTMLCanvasElement.prototype.getContext;

	HTMLCanvasElement.prototype.getContext = function (
		type: string,
		..._args: any[]
	): any {
		if (type !== "2d") return original.call(this, type as any);

		// Minimal subset used by makeAxisLabelSprite()
		return {
			clearRect: vi.fn(),
			strokeText: vi.fn(),
			fillText: vi.fn(),

			// properties assigned in code
			font: "",
			textAlign: "",
			textBaseline: "",
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 0,
		};
	};

	return () => {
		HTMLCanvasElement.prototype.getContext = original;
	};
}

beforeEach(() => {
	restoreGetContext = installCanvas2dMock();
});

afterEach(() => {
	restoreGetContext?.();
	restoreGetContext = null;
});

let lastRenderer: any = null;

// Minimal THREE mock: only what createThreeScene touches before/around setSize().
vi.mock("three", () => {
	class WebGLRenderer {
		public domElement = document.createElement("canvas");
		public setPixelRatio = vi.fn();
		public setSize = vi.fn();
		public setClearColor = vi.fn();
		public render = vi.fn();
		public dispose = vi.fn();
		public forceContextLoss = vi.fn();

		constructor(..._args: any[]) {
			lastRenderer = this;
		}
	}

	class Scene {
		public add = vi.fn();
		public remove = vi.fn();
	}

	class PerspectiveCamera {
		public fov = 45;
		public aspect = 1;
		public near = 0.01;
		public far = 1000;

		// Needs to support: camera.position.copy(...).add(...)
		public position = (() => {
			const pos: any = {
				set: vi.fn(() => pos),
				copy: vi.fn(() => pos),
				add: vi.fn(() => pos),
			};
			return pos;
		})();

		public updateProjectionMatrix = vi.fn();
		public updateMatrixWorld = vi.fn();
		constructor(..._args: any[]) {}
	}

	class AmbientLight {
		constructor(..._args: any[]) {}
	}

	class BufferGeometry {
		public setAttribute = vi.fn();
		public computeBoundingSphere = vi.fn(() => {
			// keep boundingSphere consistent
			this.boundingSphere = { radius: 1, center: {} };
		});
		public getAttribute = vi.fn((_name?: string) => ({
			count: 1,
			array: new Float32Array([0, 0, 0]),
		}));
		public boundingSphere: any = { radius: 1, center: {} };
		public dispose = vi.fn();
	}

	class BufferAttribute {
		public count: number;
		public array: any;
		public needsUpdate = false;
		constructor(array: any, itemSize: number) {
			this.array = array;
			this.count = itemSize ? array.length / itemSize : 0;
		}
	}

	class ShaderMaterial {
		public dispose = vi.fn();
		constructor(..._args: any[]) {}
	}

	class Points {
		constructor(..._args: any[]) {}
	}

	class Group {
		public add = vi.fn();
		public remove = vi.fn();
		public visible = true;
	}

	class Line {
		public geometry: any;
		constructor(geometry: any, _mat: any) {
			this.geometry = geometry;
		}
	}

	class LineBasicMaterial {
		constructor(..._args: any[]) {}
	}

	class Vector2 {
		public set = vi.fn();
		constructor(..._args: any[]) {}
	}

	class Vector3 {
		public set = vi.fn(() => this);
		public project = vi.fn(() => this);
		constructor(..._args: any[]) {}
	}

	class Raycaster {
		public params: any = {};
		public setFromCamera = vi.fn();
		public intersectObject = vi.fn(() => []);
	}

	class CanvasTexture {
		public needsUpdate = false;
		public dispose = vi.fn();
		public colorSpace: any;
		constructor(..._args: any[]) {}
	}

	class SpriteMaterial {
		public map?: any;
		public dispose = vi.fn();
		constructor(args: any) {
			this.map = args?.map;
		}
	}

	class Sprite {
		public material: any;
		public position = { set: vi.fn() };
		public scale = { set: vi.fn() };
		constructor(material: any) {
			this.material = material;
		}
	}

	class Color {
		constructor(..._args: any[]) {}
	}

	const SRGBColorSpace = "srgb";

	return {
		WebGLRenderer,
		Scene,
		PerspectiveCamera,
		AmbientLight,
		BufferGeometry,
		BufferAttribute,
		ShaderMaterial,
		Points,
		Group,
		Line,
		LineBasicMaterial,
		Vector2,
		Vector3,
		Raycaster,
		CanvasTexture,
		SpriteMaterial,
		Sprite,
		Color,
		SRGBColorSpace,
	};
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => {
	return {
		OrbitControls: class {
			public enableDamping = false;
			public dampingFactor = 0;
			public target = { copy: vi.fn() };
			public update = vi.fn();
			public dispose = vi.fn();
			constructor(..._args: any[]) {}
		},
	};
});

// Mock helpers used by createThreeScene init.
vi.mock("../src/binary", () => ({
	bytesToFloat32ArrayLE: () => new Float32Array([0, 0, 0]), // one point
	bytesToUint16ArrayLE: () => new Uint16Array([0]),
	createPackedMaskBig: (n: number) => new Uint8Array(Math.ceil(n / 8)),
	setPackedMaskBitBig: () => {},
}));

vi.mock("../src/color_mapping", () => ({
	buildColorBuffer: () => new Float32Array([1, 1, 1]),
}));

vi.mock("../src/size_mapping", () => ({
	buildSizeBuffer: () => new Float32Array([1]),
}));

import { createThreeScene } from "../src/three_scene";

describe("three_scene setSize", () => {
	it("calls renderer.setSize with updateStyle=true so WebGL canvas CSS matches overlay", () => {
		lastRenderer = null;

		const host = document.createElement("div");

		// Minimal model stub: only traits read during createThreeScene init.
		const model: any = {
			get: (_k: any) => {
				// xyz bytes are read immediately; other gets are handled by your internal fallbacks.
				return new Uint8Array(12);
			},
		};

		const three = createThreeScene(host, model);
		expect(lastRenderer).not.toBeNull();

		three.setSize(400, 300, 2);

		expect(lastRenderer.setPixelRatio).toHaveBeenCalledWith(2);
		expect(lastRenderer.setSize).toHaveBeenCalledWith(400, 300, true);
	});
});
