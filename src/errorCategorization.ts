export enum ErrorCategory {
	Syntax = 'Syntax Error',
	Logic = 'Logic Error',
	Runtime = 'Runtime Error',
	TypeMismatch = 'Type Mismatch',
	NullReference = 'Null Reference',
	Security = 'Security Issue',
	Performance = 'Performance Issue',
	BestPractice = 'Best Practice',
	Unknown = 'Unknown'
}

export interface CategorizedError {
	category: ErrorCategory;
	severity: 'critical' | 'high' | 'medium' | 'low';
	message: string;
	line: number;
	column: number;
	suggestion?: string;
}

export class ErrorCategorizer {
	categorizeError(message: string, code: string, line: number, column: number): CategorizedError {
		const lowerMsg = message.toLowerCase();

		if (this.isSyntaxError(lowerMsg, code)) {
			return {
				category: ErrorCategory.Syntax,
				severity: 'high',
				message,
				line,
				column,
				suggestion: this.getSyntaxSuggestion(code)
			};
		}

		if (this.isLogicError(code)) {
			return {
				category: ErrorCategory.Logic,
				severity: 'high',
				message,
				line,
				column,
				suggestion: 'Review conditional logic'
			};
		}

		if (this.isRuntimeError(lowerMsg)) {
			return {
				category: ErrorCategory.Runtime,
				severity: 'critical',
				message,
				line,
				column,
				suggestion: 'Add error handling'
			};
		}

		if (this.isTypeMismatch(lowerMsg, code)) {
			return {
				category: ErrorCategory.TypeMismatch,
				severity: 'medium',
				message,
				line,
				column,
				suggestion: 'Check type compatibility'
			};
		}

		if (this.isNullReference(lowerMsg, code)) {
			return {
				category: ErrorCategory.NullReference,
				severity: 'critical',
				message,
				line,
				column,
				suggestion: 'Add null checks'
			};
		}

		if (this.isSecurityIssue(code)) {
			return {
				category: ErrorCategory.Security,
				severity: 'critical',
				message,
				line,
				column,
				suggestion: 'Review security practices'
			};
		}

		if (this.isPerformanceIssue(code)) {
			return {
				category: ErrorCategory.Performance,
				severity: 'low',
				message,
				line,
				column,
				suggestion: 'Consider optimization'
			};
		}

		if (this.isBestPracticeViolation(code)) {
			return {
				category: ErrorCategory.BestPractice,
				severity: 'low',
				message,
				line,
				column,
				suggestion: 'Follow coding standards'
			};
		}

		return {
			category: ErrorCategory.Unknown,
			severity: 'medium',
			message,
			line,
			column
		};
	}

	private isSyntaxError(message: string, code: string): boolean {
		return message.includes('syntax') || message.includes('unexpected') || message.includes('expected');
	}

	private isLogicError(code: string): boolean {
		return /if\s*\(\s*true\s*\)/.test(code) || /while\s*\(\s*true\s*\)/.test(code);
	}

	private isRuntimeError(message: string): boolean {
		return message.includes('undefined') || message.includes('null') || message.includes('type error');
	}

	private isTypeMismatch(message: string, code: string): boolean {
		return message.includes('type') || code.includes(':');
	}

	private isNullReference(message: string, code: string): boolean {
		return (message.includes('null') || message.includes('undefined')) && (code.includes('.') || code.includes('['));
	}

	private isSecurityIssue(code: string): boolean {
		return /eval\s*\(/.test(code) || /innerHTML\s*=/.test(code) || /password|secret|token/i.test(code);
	}

	private isPerformanceIssue(code: string): boolean {
		return /\.forEach\s*\(/.test(code) || /while\s*\(\s*true\s*\)/.test(code);
	}

	private isBestPracticeViolation(code: string): boolean {
		return /^var\s+/.test(code.trim()) || /console\.log/.test(code);
	}

	private getSyntaxSuggestion(code: string): string {
		if (code.includes('(') && !code.includes(')')) return 'Missing closing parenthesis';
		if (code.includes('{') && !code.includes('}')) return 'Missing closing brace';
		return 'Check syntax';
	}
}
