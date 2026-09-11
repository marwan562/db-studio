export type ColumnPrefs = {
	order: string[];
	hidden: string[];
};

export type ColumnPrefKeyParts = {
	dbType: string;
	database: string;
	tableName: string;
};

const STORAGE_PREFIX = "db-studio:columns:";

// Tiny pub/sub so every useColumnPreferences instance (table model, menu, ...)
// re-reads preferences after any write, staying in sync without prop drilling.
type PrefsListener = (parts: ColumnPrefKeyParts) => void;
const listeners = new Set<PrefsListener>();

const notifyPrefsChanged = (parts: ColumnPrefKeyParts): void => {
	for (const listener of listeners) listener(parts);
};

export const subscribeColumnPrefsChanged = (listener: PrefsListener): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const sameColumnPrefKey = (a: ColumnPrefKeyParts, b: ColumnPrefKeyParts): boolean =>
	a.dbType === b.dbType && a.database === b.database && a.tableName === b.tableName;

/** Deep equality for prefs — used to skip no-op writes and state updates. */
export const sameColumnPrefs = (a: ColumnPrefs, b: ColumnPrefs): boolean =>
	a.order.length === b.order.length &&
	a.hidden.length === b.hidden.length &&
	a.order.every((name, i) => name === b.order[i]) &&
	a.hidden.every((name, i) => name === b.hidden[i]);

export const makeStorageKey = ({ dbType, database, tableName }: ColumnPrefKeyParts): string =>
	`${STORAGE_PREFIX}${dbType}:${database}:${tableName}`;

const sanitize = (value: unknown): ColumnPrefs => {
	const raw = (value ?? {}) as Partial<ColumnPrefs>;
	const order = Array.isArray(raw.order) ? raw.order.filter((c) => typeof c === "string") : [];
	const hidden = Array.isArray(raw.hidden)
		? raw.hidden.filter((c) => typeof c === "string")
		: [];
	return { order, hidden };
};

export const loadColumnPrefs = (
	parts: ColumnPrefKeyParts,
	storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): ColumnPrefs => {
	try {
		const raw = storage.getItem(makeStorageKey(parts));
		return raw ? sanitize(JSON.parse(raw)) : { order: [], hidden: [] };
	} catch {
		return { order: [], hidden: [] };
	}
};

export const saveColumnPrefs = (
	parts: ColumnPrefKeyParts,
	prefs: ColumnPrefs,
	storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): void => {
	try {
		storage.setItem(makeStorageKey(parts), JSON.stringify(prefs));
		notifyPrefsChanged(parts);
	} catch {
		// storage full or unavailable; preferences become session-only
	}
};

export const clearColumnPrefs = (
	parts: ColumnPrefKeyParts,
	storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
): void => {
	try {
		storage.removeItem(makeStorageKey(parts));
		notifyPrefsChanged(parts);
	} catch {
		// ignore
	}
};

/**
 * Reconcile saved prefs against the live schema:
 * - dropped columns that no longer exist
 * - appended new columns (in schema order) to the end of the saved order
 * - dropped hidden entries that no longer exist
 * The result always contains every schema column exactly once, so the table
 * never loses a column because of stale preferences.
 */
export const reconcileColumnPrefs = (
	schemaCols: string[],
	prefs: ColumnPrefs,
): ColumnPrefs => {
	const schemaSet = new Set(schemaCols);
	const seen = new Set<string>();
	const order: string[] = [];
	for (const name of prefs.order) {
		if (schemaSet.has(name) && !seen.has(name)) {
			order.push(name);
			seen.add(name);
		}
	}
	for (const name of schemaCols) {
		if (!seen.has(name)) {
			order.push(name);
			seen.add(name);
		}
	}
	const hidden = prefs.hidden.filter(
		(name) => schemaSet.has(name) && typeof name === "string",
	);
	return { order, hidden };
};

/** Applied view: schema columns ordered by prefs and filtered by hidden. */
export const applyColumnPrefs = (schemaCols: string[], prefs: ColumnPrefs): string[] => {
	const { order, hidden } = reconcileColumnPrefs(schemaCols, prefs);
	const hiddenSet = new Set(hidden);
	const ordered = order.filter((name) => !hiddenSet.has(name));
	return [...ordered].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

/**
 * Move a column relative to another target column in the order list.
 * Safe against index mismatches when lists are filtered by search.
 */
export const reorderColumns = (
	order: string[],
	sourceCol: string,
	targetCol: string,
	position?: "before" | "after",
): string[] => {
	if (sourceCol === targetCol) return order;
	const fromIndex = order.indexOf(sourceCol);
	const targetIndex = order.indexOf(targetCol);
	if (fromIndex === -1 || targetIndex === -1) return order;

	const next = [...order];
	next.splice(fromIndex, 1);
	const newTargetIndex = next.indexOf(targetCol);
	const insertIndex =
		(position ?? (fromIndex < targetIndex ? "after" : "before")) === "after"
			? newTargetIndex + 1
			: newTargetIndex;
	next.splice(insertIndex, 0, sourceCol);
	return next;
};
