/**
 * Redact database connection URLs from error text before printing them.
 * Only the URL itself is replaced; surrounding prose and punctuation
 * (closing parens, commas) are left intact.
 */
export const sanitizeErrorMessage = (message: string): string => {
	return message.replace(
		/\b(?:postgres(?:ql)?|mysql2?|mssql|sqlserver|mongodb(?:\+srv)?|sqlite|rediss?):\/\/[^\s),]*/gi,
		"the configured database",
	);
};
