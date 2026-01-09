// debug.ts
type DebugChannels = {
	lasso?: boolean;
	// add more later: model?: boolean; resize?: boolean; tooltip?: boolean;
};

// Hardcoded debug switches.
// - Set ALL=false to silence everything.
// - Or turn on individual channels.
const DEBUG: Readonly<DebugChannels> = {
	lasso: true,
};

// Master kill switch
const ALL = true;

export function dlog(channel: keyof DebugChannels, ...args: unknown[]) {
	if (!ALL) return;
	if (DEBUG[channel] !== true) return;
	console.log(`[scatter3d:${channel}]`, ...args);
}
