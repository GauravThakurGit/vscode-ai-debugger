# CodeGuardian AI

AI-Driven Bug Detection and Intelligent Code Debugger for VS Code

## Features

- Real-time error detection
- AI-powered error explanations
- Context-aware fix suggestions
- Error categorization
- Non-intrusive integration

## Requirements

- VS Code 1.60.0+
- Node.js 12.0.0+

## Installation

1. Clone repository
2. Run `npm install`
3. Press F5 to launch extension

## Usage

The extension automatically analyzes code as you type. Use commands:
- `CodeGuardian: Analyze Code` - Manual analysis
- `CodeGuardian: Show Debug Panel` - View results

## Configuration

```json
{
  "codeguardian.enableRealTimeAnalysis": true,
  "codeguardian.apiKey": "your-api-key"
}
```
