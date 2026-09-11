import { describe, expect, it } from "vitest";

import { sanitizeErrorMessage } from "@/cmd/sanitize-error.js";

describe("sanitizeErrorMessage", () => {
	it("redacts a bare connection URL", () => {
		expect(sanitizeErrorMessage("connect ECONNREFUSED postgresql://admin:secret@localhost:5432/app")).toBe(
			"connect ECONNREFUSED the configured database",
		);
	});

	it("keeps closing parens and commas of the supported-types message", () => {
		expect(
			sanitizeErrorMessage(
				"Unsupported database type: invalid. Supported types: PostgreSQL (postgres://), MySQL (mysql://), SQL Server (mssql://).",
			),
		).toBe(
			"Unsupported database type: invalid. Supported types: PostgreSQL (the configured database), MySQL (the configured database), SQL Server (the configured database).",
		);
	});

	it("leaves text without a URL untouched", () => {
		expect(sanitizeErrorMessage("Database startup check timed out")).toBe(
			"Database startup check timed out",
		);
	});
});
