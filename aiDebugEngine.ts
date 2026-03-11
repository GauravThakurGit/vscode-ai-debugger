import axios, { AxiosInstance } from 'axios';

export interface AIAnalysisResult {
	errorId: string;
	originalError: any;
	explanation: string;
	fixSuggestions: string[];
	confidence: number;
	relatedResources?: string[];
}

export class AIDebugEngine {
	private apiClient: AxiosInstance;
	private apiKey: string;
	private cache = new Map<string, AIAnalysisResult>();

	constructor(apiKey: string = '') {
		this.apiKey = apiKey;
		this.apiClient = axios.create({
			baseURL: 'http://localhost:5000/api',
			timeout: 10000,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			}
		});
	}

	async analyzeError(error: any, context: string): Promise<AIAnalysisResult> {
		const cacheKey = `${error.message}_${context.substring(0, 50)}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}

		if (!this.apiKey) {
			return this.getLocalAnalysis(error, context);
		}

		try {
			const response = await this.apiClient.post('/analyze', { error, context });
			const result: AIAnalysisResult = {
				errorId: this.generateId(),
				originalError: error,
				explanation: response.data.explanation || 'Analysis complete',
				fixSuggestions: response.data.suggestions || [],
				confidence: response.data.confidence || 0.8,
				relatedResources: response.data.resources || []
			};
			this.cache.set(cacheKey, result);
			return result;
		} catch {
			return this.getLocalAnalysis(error, context);
		}
	}

	private getLocalAnalysis(error: any, context: string): AIAnalysisResult {
		let explanation = '';
		let suggestions: string[] = [];

		switch (error.category) {
			case 'Syntax Error':
				explanation = 'Syntax error detected';
				suggestions = ['Check syntax', 'Verify brackets'];
				break;
			case 'Logic Error':
				explanation = 'Logic issue found';
				suggestions = ['Review conditions', 'Test edge cases'];
				break;
			case 'Runtime Error':
				explanation = 'Runtime error occurred';
				suggestions = ['Add error handling', 'Check types'];
				break;
			case 'Security Issue':
				explanation = 'Security vulnerability detected';
				suggestions = ['Sanitize input', 'Use secure methods'];
				break;
			default:
				explanation = 'Issue detected';
				suggestions = ['Review code', 'Check documentation'];
		}

		return {
			errorId: this.generateId(),
			originalError: error,
			explanation,
			fixSuggestions: suggestions,
			confidence: 0.7,
			relatedResources: ['VS Code Docs', 'MDN Web Docs']
		};
	}

	private generateId(): string {
		return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	clearCache(): void {
		this.cache.clear();
	}
}
