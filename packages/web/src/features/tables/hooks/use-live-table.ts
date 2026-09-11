import type { ColumnInfoSchemaType } from "@db-studio/shared/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDatabaseCapability } from "@/hooks/use-database-capabilities";
import { useDatabaseStore } from "@/stores/database.store";
import { useOverlayStore } from "@/stores/overlay.store";
import type { TableRecord } from "@/types/table.type";
import { useLiveModeStore } from "../stores/live-mode.store";
import { useUpdateCellStore } from "../stores/update-cell.store";
import { diffTableRows } from "../utils/table-diff";

const LIVE_POLL_INTERVAL_MS = 1000;

interface UseLiveTableProps {
	tableName: string;
	tableCols?: ColumnInfoSchemaType[];
	tableDataRows: TableRecord[];
	refetchTableData: () => Promise<unknown>;
	isEditingCell?: boolean;
}

export const useLiveTable = ({
	tableName,
	tableCols,
	tableDataRows,
	refetchTableData,
	isEditingCell = false,
}: UseLiveTableProps) => {
	const canLiveMode = useDatabaseCapability("liveMode");

	const isLive = useLiveModeStore((state) => state.isLive);
	const status = useLiveModeStore((state) => state.status);
	const isPulsing = useLiveModeStore((state) => state.isPulsing);
	const setLive = useLiveModeStore((state) => state.setLive);
	const pauseLive = useLiveModeStore((state) => state.pauseLive);
	const setStatus = useLiveModeStore((state) => state.setStatus);
	const triggerPulse = useLiveModeStore((state) => state.triggerPulse);
	const setHighlights = useLiveModeStore((state) => state.setHighlights);
	const isRowHighlighted = useLiveModeStore((state) => state.isRowHighlighted);
	const isCellHighlighted = useLiveModeStore((state) => state.isCellHighlighted);
	const reset = useLiveModeStore((state) => state.reset);

	const hasCellUpdates = useUpdateCellStore((state) => state.hasAnyUpdates());
	const hasOpenRecordOverlay = useOverlayStore((state) =>
		state.openOverlays.some((id) => id.startsWith("records.")),
	);

	const isEditing = isEditingCell || hasCellUpdates || hasOpenRecordOverlay;

	const pkCols = useMemo(
		() => tableCols?.filter((c) => c.isPrimaryKey).map((c) => c.columnName) ?? [],
		[tableCols],
	);

	const prevRowsRef = useRef<TableRecord[] | null>(null);
	const refetchRef = useRef(refetchTableData);
	refetchRef.current = refetchTableData;

	// Pause Live mode when editing begins
	useEffect(() => {
		if (isLive && isEditing) {
			pauseLive();
		}
	}, [isLive, isEditing, pauseLive]);

	// Diff rows and trigger visual highlights when tableDataRows changes during Live mode
	useEffect(() => {
		if (isLive && prevRowsRef.current !== null) {
			const diff = diffTableRows(prevRowsRef.current, tableDataRows, pkCols);
			if (diff.hasVisibleChanges) {
				triggerPulse();
				setHighlights(diff.insertedRowIds, diff.changedCellKeys);
			}
		}
		prevRowsRef.current = tableDataRows;
	}, [tableDataRows, isLive, pkCols, triggerPulse, setHighlights]);

	// Polling execution helper
	const executePoll = useCallback(async () => {
		if (typeof document !== "undefined" && document.hidden) {
			return;
		}
		if (isEditing) {
			pauseLive();
			return;
		}

		try {
			const res = await refetchRef.current();
			if (res && typeof res === "object" && "isError" in res && res.isError) {
				setStatus("disconnected");
			} else {
				setStatus("healthy");
			}
		} catch {
			setStatus("disconnected");
		}
	}, [isEditing, pauseLive, setStatus]);

	const selectedDatabase = useDatabaseStore((state) => state.selectedDatabase);

	// 1-second polling interval lifecycle
	useEffect(() => {
		if (!isLive || !canLiveMode) {
			return;
		}

		// Execute immediate poll upon enabling Live mode
		executePoll();

		const intervalId = setInterval(() => {
			executePoll();
		}, LIVE_POLL_INTERVAL_MS);

		return () => {
			clearInterval(intervalId);
		};
	}, [isLive, canLiveMode, executePoll]);

	// Stop polling when tab is hidden, poll immediately when tab becomes visible
	useEffect(() => {
		if (!isLive || !canLiveMode) return;

		const handleVisibilityChange = () => {
			if (!document.hidden && isLive) {
				executePoll();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [isLive, canLiveMode, executePoll]);

	// Cleanup on table, database, or route switch
	useEffect(() => {
		return () => {
			reset();
		};
	}, [tableName, selectedDatabase, reset]);

	const toggleLive = useCallback(() => {
		if (!canLiveMode) return;
		if (isLive) {
			setLive(false);
		} else {
			setLive(true, tableName);
		}
	}, [canLiveMode, isLive, tableName, setLive]);

	return {
		canLiveMode,
		isLive,
		status,
		isPulsing,
		isRowHighlighted,
		isCellHighlighted,
		toggleLive,
	};
};
