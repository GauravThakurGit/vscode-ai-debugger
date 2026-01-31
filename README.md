# CodeGuardian AI – VS Code AI Debugging Assistant

CodeGuardian AI is an intelligent **Visual Studio Code extension** designed to help developers identify, understand, and resolve programming errors efficiently using **Artificial Intelligence**. The extension captures real-time error diagnostics from the editor, analyzes them using an AI-powered debugging engine, and presents clear explanations along with actionable fix suggestions directly inside VS Code.

---

## 🚀 Key Features

- 🔍 Real-time error detection using VS Code diagnostics  
- 🤖 AI-powered error explanation in simple, human-readable language  
- 🛠️ Context-aware fix suggestions  
- 🧠 Beginner-friendly debugging assistance  
- 📊 Error categorization (Syntax, Runtime, Logical)  
- 🧾 Debugging history for reference  
- ⚡ Seamless integration within Visual Studio Code  

---

## 🧩 How It Works

1. Developer writes or runs code inside Visual Studio Code  
2. The extension listens for errors and warnings  
3. Error context (message, file, language) is captured  
4. Context is sent to the AI Debug Engine  
5. AI returns:
   - Explanation of the error  
   - Possible root cause  
   - Suggested fix  
6. Results are displayed in a sidebar or notification panel  

---

## 🏗️ Project Architecture

```
VS Code Editor
     ↓
Error Listener
     ↓
Context Builder
     ↓
AI Debug Engine
     ↓
Suggestion Renderer (UI)
```

The project follows a **modular and event-driven VS Code extension architecture**, ensuring scalability, maintainability, and clear separation of concerns.

---

## 📁 Project Structure

```
vscode-ai-debugger/
├── src/
│   ├── extension.ts
│   ├── core/
│   ├── ai/
│   ├── ui/
│   └── utils/
├── docs/
├── demo/
├── README.md
└── report.pdf
```

---

## 🛠️ Technologies Used

- Visual Studio Code Extension API  
- TypeScript  
- Node.js  
- Artificial Intelligence (LLM-based analysis)  
- JSON / REST APIs  

---

## 🎯 Project Objective

The primary objective of **CodeGuardian AI** is to reduce the time and effort spent on debugging by providing **intelligent, real-time, and human-readable explanations** of programming errors directly within the development environment.

---

## 📌 Use Cases

- Beginners learning programming  
- Students working on coding assignments  
- Developers debugging unfamiliar codebases  
- Faster error resolution during software development  

---

## 📄 Academic Context

This project is developed as a **mini project for academic evaluation**. It demonstrates the practical application of **Artificial Intelligence in software development tools** and highlights the integration of IDE extensions with AI-based systems.

---

## 🔮 Future Enhancements

- Support for additional programming languages  
- One-click automatic fix application  
- Offline rule-based debugging assistance  
- Integration with version control systems  

---

## 👨‍💻 Author

**Gaurav Thakur**  
**Aman Chaudhary**
**Sumit Kumar**
