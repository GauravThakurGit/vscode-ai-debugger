const crypto = require("crypto");
const acorn = require("acorn");
const walk = require("acorn-walk");

const SUPPORTED_LANGUAGES = new Set(["javascript", "python", "java"]);

const SEVERITY_WEIGHT = {
  error: 3,
  warning: 2,
  info: 1
};

function analyzeCode({ text, languageId, diagnostics = [], feedbackProfile = {}, options = {} }) {
  if (!SUPPORTED_LANGUAGES.has(languageId) || typeof text !== "string") {
    return [];
  }

  const issues = [];
  const nativeIssues = diagnostics.map(mapNativeDiagnostic).filter(Boolean);
  issues.push(...nativeIssues);

  if (languageId === "javascript") {
    issues.push(...analyzeJavascript(text, options));
  } else if (languageId === "python") {
    issues.push(...analyzePython(text, options));
  } else if (languageId === "java") {
    issues.push(...analyzeJava(text, options));
  }

  return dedupeIssues(issues)
    .map((issue) => applyFeedbackProfile(issue, feedbackProfile))
    .sort(sortIssues);
}

function analyzeJavascript(text, options) {
  const issues = [];
  const { ast, syntaxError } = parseJavascript(text);
  if (syntaxError) {
    issues.push(
      createIssue(text, {
        ruleId: "parser-syntax-error",
        title: "Syntax error detected",
        explanation: "JavaScript could not be parsed, so the editor cannot reason about the code that follows.",
        suggestion: "Check the nearby line for a missing bracket, quote, comma, or unexpected keyword.",
        category: "syntax",
        severity: "error",
        confidence: 0.98,
        range: rangeFromLocation(syntaxError.loc)
      })
    );
  }

  if (!ast) {
    return issues;
  }

  issues.push(...detectJavascriptAssignmentInCondition(ast, text));
  issues.push(...detectJavascriptLooseEquality(ast, text));
  issues.push(...detectJavascriptEvalUsage(ast, text));
  issues.push(...detectJavascriptEmptyCatch(ast, text));
  issues.push(...detectJavascriptHardcodedSecrets(ast, text));
  if (options.enableConsoleLogHints !== false) {
    issues.push(...detectJavascriptConsoleLog(ast, text));
  }

  return issues;
}

function analyzePython(text, options) {
  const issues = [];
  issues.push(...detectPythonUndefinedNames(text));
  issues.push(...detectPythonNoneComparison(text));
  issues.push(...detectPythonBareExcept(text));
  issues.push(...detectPythonEvalUsage(text));
  issues.push(...detectPythonMutableDefaultArgument(text));
  issues.push(...detectPatternHardcodedSecrets(text, "python"));
  if (options.enableConsoleLogHints !== false) {
    issues.push(...detectPythonPrintUsage(text));
  }
  return issues;
}

const PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
]);

const PYTHON_BUILTINS = new Set([
  "abs",
  "all",
  "any",
  "bool",
  "dict",
  "enumerate",
  "Exception",
  "filter",
  "float",
  "input",
  "int",
  "len",
  "list",
  "map",
  "max",
  "min",
  "object",
  "open",
  "print",
  "range",
  "reversed",
  "set",
  "sorted",
  "str",
  "sum",
  "tuple",
  "type",
  "ValueError",
  "zip"
]);

function detectPythonUndefinedNames(text) {
  const issues = [];
  const declaredNames = collectPythonDeclaredNames(text);
  const lines = text.split(/\r?\n/);
  const reportedNames = new Set();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];
    const sanitizedLine = sanitizePythonLine(originalLine);
    const trimmedLine = sanitizedLine.trim();

    if (!trimmedLine || trimmedLine.startsWith("def ") || trimmedLine.startsWith("class ")) {
      continue;
    }

    const identifierRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    let match = identifierRegex.exec(sanitizedLine);
    while (match) {
      const name = match[0];
      const startIndex = match.index;
      const previousCharacter = sanitizedLine[startIndex - 1] || "";
      const nextCharacter = sanitizedLine[startIndex + name.length] || "";
      const nextNonWhitespaceCharacter =
        sanitizedLine.slice(startIndex + name.length).match(/\S/)?.[0] || "";

      if (
        PYTHON_KEYWORDS.has(name) ||
        declaredNames.has(name) ||
        previousCharacter === "." ||
        nextCharacter === "(" ||
        nextNonWhitespaceCharacter === "=" ||
        reportedNames.has(`${lineIndex}:${name}`) ||
        looksLikePythonParameterLabel(sanitizedLine, startIndex, name.length)
      ) {
        match = identifierRegex.exec(sanitizedLine);
        continue;
      }

      issues.push(
        createIssue(text, {
          ruleId: "python-undefined-name",
          title: `Possible undefined name: ${name}`,
          explanation:
            "This name is used here but does not appear to be declared, imported, or passed in. In Python this usually becomes a NameError at runtime.",
          suggestion: `Declare, import, or correct the spelling of \`${name}\` before using it.`,
          category: "runtime",
          severity: "error",
          confidence: 0.81,
          range: {
            start: { line: lineIndex, character: startIndex },
            end: { line: lineIndex, character: startIndex + name.length }
          }
        })
      );
      reportedNames.add(`${lineIndex}:${name}`);
      match = identifierRegex.exec(sanitizedLine);
    }
  }

  return issues;
}

function collectPythonDeclaredNames(text) {
  const declaredNames = new Set(PYTHON_BUILTINS);
  const lines = text.split(/\r?\n/);

  for (const originalLine of lines) {
    const line = sanitizePythonLine(originalLine).trim();
    if (!line) {
      continue;
    }

    const functionMatch = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/.exec(line);
    if (functionMatch) {
      declaredNames.add(functionMatch[1]);
      const parameterMatches = functionMatch[2].match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
      for (const parameterName of parameterMatches) {
        if (!PYTHON_KEYWORDS.has(parameterName)) {
          declaredNames.add(parameterName);
        }
      }
      continue;
    }

    const classMatch = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (classMatch) {
      declaredNames.add(classMatch[1]);
      continue;
    }

    const importMatch = /^import\s+(.+)$/.exec(line);
    if (importMatch) {
      const imports = importMatch[1].split(",");
      for (const importItem of imports) {
        const aliasMatch = /([A-Za-z_][A-Za-z0-9_\.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/.exec(importItem.trim());
        if (aliasMatch) {
          declaredNames.add(aliasMatch[2] || aliasMatch[1].split(".")[0]);
        }
      }
      continue;
    }

    const fromImportMatch = /^from\s+[A-Za-z_][A-Za-z0-9_\.]*\s+import\s+(.+)$/.exec(line);
    if (fromImportMatch) {
      const imports = fromImportMatch[1].split(",");
      for (const importItem of imports) {
        const aliasMatch = /([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/.exec(importItem.trim());
        if (aliasMatch) {
          declaredNames.add(aliasMatch[2] || aliasMatch[1]);
        }
      }
      continue;
    }

    const forMatch = /^for\s+(.+?)\s+in\s+/.exec(line);
    if (forMatch) {
      addPythonNameGroup(declaredNames, forMatch[1]);
    }

    const withMatch = /\bwith\s+.+?\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (withMatch) {
      declaredNames.add(withMatch[1]);
    }

    const exceptMatch = /\bexcept\s+.+?\s+as\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (exceptMatch) {
      declaredNames.add(exceptMatch[1]);
    }

    const assignmentMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s*=/.exec(line);
    if (assignmentMatch) {
      addPythonNameGroup(declaredNames, assignmentMatch[1]);
    }
  }

  return declaredNames;
}

function addPythonNameGroup(targetSet, source) {
  const nameMatches = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const name of nameMatches) {
    if (!PYTHON_KEYWORDS.has(name)) {
      targetSet.add(name);
    }
  }
}

function sanitizePythonLine(line) {
  let result = "";
  let quote = null;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const previousCharacter = line[index - 1];

    if (!quote && character === "#") {
      result += " ".repeat(line.length - index);
      break;
    }

    if ((character === '"' || character === "'") && previousCharacter !== "\\") {
      if (!quote) {
        quote = character;
        result += " ";
        continue;
      }

      if (quote === character) {
        quote = null;
        result += " ";
        continue;
      }
    }

    result += quote ? " " : character;
  }

  return result;
}

function looksLikePythonParameterLabel(line, startIndex, length) {
  const nextNonWhitespace = line.slice(startIndex + length).match(/\S/)?.[0] || "";
  const previousTrimmed = line.slice(0, startIndex).trimEnd();
  return nextNonWhitespace === "=" && (previousTrimmed.endsWith("(") || previousTrimmed.endsWith(","));
}

function analyzeJava(text, options) {
  const issues = [];
  issues.push(...detectJavaAssignmentInCondition(text));
  issues.push(...detectJavaStringEquality(text));
  issues.push(...detectJavaEvalUsage(text));
  issues.push(...detectJavaEmptyCatch(text));
  issues.push(...detectPatternHardcodedSecrets(text, "java"));
  if (options.enableConsoleLogHints !== false) {
    issues.push(...detectJavaPrintUsage(text));
  }
  return issues;
}

function parseJavascript(text) {
  try {
    return {
      ast: acorn.parse(text, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        locations: true
      }),
      syntaxError: null
    };
  } catch (firstError) {
    try {
      return {
        ast: acorn.parse(text, {
          ecmaVersion: "latest",
          sourceType: "script",
          allowHashBang: true,
          locations: true
        }),
        syntaxError: null
      };
    } catch (secondError) {
      return {
        ast: null,
        syntaxError: secondError || firstError
      };
    }
  }
}

function detectJavascriptAssignmentInCondition(ast, text) {
  const issues = [];
  walk.fullAncestor(ast, (node, ancestors) => {
    if (node.type !== "AssignmentExpression") {
      return;
    }

    const conditionalParent = ancestors.find(
      (ancestor) =>
        ["IfStatement", "WhileStatement", "DoWhileStatement"].includes(ancestor.type) &&
        ancestor.test &&
        node.start >= ancestor.test.start &&
        node.end <= ancestor.test.end
    );

    if (!conditionalParent) {
      return;
    }

    issues.push(
      createIssue(text, {
        ruleId: "assignment-in-conditional",
        title: "Possible assignment inside condition",
        explanation:
          "This condition assigns a value instead of comparing one, which often makes the branch behave unexpectedly.",
        suggestion: "Use a comparison such as === unless the assignment is intentional.",
        category: "logical",
        severity: "warning",
        confidence: 0.95,
        node,
        fix: {
          label: "Replace = with ===",
          type: "replace",
          range: rangeFromNode(node.left.end, node.right.start, text),
          text: " === "
        }
      })
    );
  });
  return issues;
}

function detectJavascriptLooseEquality(ast, text) {
  const issues = [];
  walk.simple(ast, {
    BinaryExpression(node) {
      if (!["==", "!="].includes(node.operator)) {
        return;
      }

      issues.push(
        createIssue(text, {
          ruleId: "loose-equality",
          title: "Loose equality can hide edge cases",
          explanation:
            "Loose equality performs type coercion, so values like 0, false, and '' may compare in surprising ways.",
          suggestion:
            node.operator === "==" ? "Prefer === for predictable comparisons." : "Prefer !== for predictable comparisons.",
          category: "logical",
          severity: "warning",
          confidence: 0.9,
          node,
          fix: {
            label: `Replace ${node.operator} with ${node.operator === "==" ? "===" : "!=="}`,
            type: "replace",
            range: rangeFromNode(node.left.end, node.right.start, text),
            text: ` ${node.operator === "==" ? "===" : "!=="} `
          }
        })
      );
    }
  });
  return issues;
}

function detectJavascriptEvalUsage(ast, text) {
  const issues = [];
  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee.type !== "Identifier" || node.callee.name !== "eval") {
        return;
      }

      issues.push(
        createIssue(text, {
          ruleId: "eval-usage",
          title: "Avoid eval in application code",
          explanation:
            "eval executes dynamic strings as code, which increases security risk and makes debugging much harder.",
          suggestion: "Replace eval with safer parsing or explicit function dispatch.",
          category: "security",
          severity: "error",
          confidence: 0.96,
          node
        })
      );
    }
  });
  return issues;
}

function detectJavascriptEmptyCatch(ast, text) {
  const issues = [];
  walk.simple(ast, {
    CatchClause(node) {
      if (node.body && Array.isArray(node.body.body) && node.body.body.length === 0) {
        issues.push(
          createIssue(text, {
            ruleId: "empty-catch",
            title: "Empty catch block hides failures",
            explanation:
              "Errors are being swallowed here, so failures can happen silently and become harder to trace later.",
            suggestion: "Log the error, rethrow it, or handle it explicitly.",
            category: "runtime",
            severity: "warning",
            confidence: 0.88,
            node
          })
        );
      }
    }
  });
  return issues;
}

function detectJavascriptHardcodedSecrets(ast, text) {
  const issues = [];
  const secretNamePattern = /(password|secret|token|apikey|api_key|clientsecret)/i;
  const literalLooksSensitive = (value) =>
    typeof value === "string" && value.length >= 8 && /[A-Za-z0-9_\-]/.test(value);

  walk.simple(ast, {
    VariableDeclarator(node) {
      if (
        node.id &&
        node.id.type === "Identifier" &&
        secretNamePattern.test(node.id.name) &&
        node.init &&
        node.init.type === "Literal" &&
        literalLooksSensitive(node.init.value)
      ) {
        issues.push(
          createIssue(text, {
            ruleId: "hardcoded-secret",
            title: "Potential hardcoded secret",
            explanation:
              "Sensitive credentials stored directly in code are easy to leak through source control, logs, or screenshots.",
            suggestion: "Move secrets to environment variables or a dedicated secret manager.",
            category: "security",
            severity: "error",
            confidence: 0.92,
            node
          })
        );
      }
    }
  });

  return issues;
}

function detectJavascriptConsoleLog(ast, text) {
  const issues = [];
  walk.simple(ast, {
    CallExpression(node) {
      if (
        node.callee &&
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.object &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "console" &&
        node.callee.property &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "log"
      ) {
        issues.push(
          createIssue(text, {
            ruleId: "console-log-leftover",
            title: "Console logging left in code",
            explanation:
              "Debug logs can clutter output and create noise when the project grows or moves toward production.",
            suggestion: "Remove the log or replace it with structured telemetry if it is still needed.",
            category: "performance",
            severity: "info",
            confidence: 0.72,
            node
          })
        );
      }
    }
  });
  return issues;
}

function detectPythonNoneComparison(text) {
  const issues = [];
  const regex = /\b([A-Za-z_][\w.]*)\s*(==|!=)\s*None\b/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    const identifier = match[1];
    const operator = match[2];
    const start = offset + match[0].indexOf(operator);
    const end = offset + match[0].length;

    issues.push(
      createIssue(text, {
        ruleId: "python-none-comparison",
        title: "Prefer identity checks for None",
        explanation:
          "In Python, comparing to None with == or != is less idiomatic and can behave unexpectedly with custom equality.",
        suggestion: operator === "==" ? "Use `is None` for clarity." : "Use `is not None` for clarity.",
        category: "logical",
        severity: "warning",
        confidence: 0.9,
        range: rangeFromOffsets(offset, offset + match[0].length, text),
        fix: {
          label: operator === "==" ? "Replace with is None" : "Replace with is not None",
          type: "replace",
          range: rangeFromOffsets(offset + identifier.length, end, text),
          text: operator === "==" ? " is None" : " is not None"
        }
      })
    );
  });

  return issues;
}

function detectPythonBareExcept(text) {
  const issues = [];
  const regex = /\bexcept\s*:/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "python-bare-except",
        title: "Bare except catches too much",
        explanation:
          "A bare except captures system-exiting exceptions as well as real application errors, which makes debugging much harder.",
        suggestion: "Catch a specific exception or use `except Exception as error:` if you need a broad guard.",
        category: "runtime",
        severity: "warning",
        confidence: 0.88,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectPythonEvalUsage(text) {
  const issues = [];
  const regex = /\beval\s*\(/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "python-eval-usage",
        title: "Avoid eval in Python code",
        explanation:
          "eval executes dynamic strings as code, which increases security risk and makes runtime behaviour harder to predict.",
        suggestion: "Use explicit parsing or dispatch logic instead of eval.",
        category: "security",
        severity: "error",
        confidence: 0.95,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectPythonMutableDefaultArgument(text) {
  const issues = [];
  const regex = /def\s+[A-Za-z_]\w*\s*\([^)]*(\[\]|\{\})[^)]*\)\s*:/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "python-mutable-default",
        title: "Mutable default argument detected",
        explanation:
          "Default lists and dictionaries are created once and then shared across calls, which can leak state between function executions.",
        suggestion: "Default the parameter to None and create the list or dictionary inside the function.",
        category: "runtime",
        severity: "warning",
        confidence: 0.84,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectPythonPrintUsage(text) {
  const issues = [];
  const regex = /^\s*print\s*\(/gm;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "python-print-leftover",
        title: "Print statement left in code",
        explanation:
          "Temporary print calls are useful while debugging but can clutter logs and make output noisy in larger projects.",
        suggestion: "Remove the print or replace it with structured logging if you still need visibility.",
        category: "performance",
        severity: "info",
        confidence: 0.72,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectJavaAssignmentInCondition(text) {
  const issues = [];
  const regex = /\b(if|while)\s*\(([^)]*)\)/g;
  const assignmentRegex = /(^|[^=!<>])=([^=])/;

  forEachRegexMatch(text, regex, (match, offset) => {
    const condition = match[2];
    const assignmentMatch = assignmentRegex.exec(condition);
    if (!assignmentMatch) {
      return;
    }

    const operatorOffset = offset + match[0].indexOf(condition) + assignmentMatch.index + assignmentMatch[1].length;
    issues.push(
      createIssue(text, {
        ruleId: "java-assignment-in-conditional",
        title: "Possible assignment inside condition",
        explanation:
          "Using = inside a Java condition usually assigns a value instead of comparing one, which can change control flow unexpectedly.",
        suggestion: "Use == unless the assignment is deliberate and clearly documented.",
        category: "logical",
        severity: "warning",
        confidence: 0.93,
        range: rangeFromOffsets(offset, offset + match[0].length, text),
        fix: {
          label: "Replace = with ==",
          type: "replace",
          range: rangeFromOffsets(operatorOffset, operatorOffset + 1, text),
          text: "=="
        }
      })
    );
  });

  return issues;
}

function detectJavaStringEquality(text) {
  const issues = [];
  const regex = /\b([A-Za-z_][\w.]*)\s*==\s*"([^"\n]*)"/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    const identifier = match[1];
    const literal = match[2];

    issues.push(
      createIssue(text, {
        ruleId: "java-string-equality",
        title: "String comparison uses ==",
        explanation:
          "In Java, == compares object references for strings, not the text content, so equal-looking strings may still fail this check.",
        suggestion: "Use `.equals` to compare string values.",
        category: "logical",
        severity: "warning",
        confidence: 0.91,
        range: rangeFromOffsets(offset, offset + match[0].length, text),
        fix: {
          label: "Replace with .equals comparison",
          type: "replace",
          range: rangeFromOffsets(offset, offset + match[0].length, text),
          text: `"${literal}".equals(${identifier})`
        }
      })
    );
  });

  return issues;
}

function detectJavaEvalUsage(text) {
  const issues = [];
  const regex = /\bScriptEngineManager\b|\beval\s*\(/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "java-dynamic-eval",
        title: "Dynamic code execution pattern found",
        explanation:
          "Executing dynamic code or script snippets in Java raises security and maintainability risks, especially when the source is not tightly controlled.",
        suggestion: "Prefer structured parsing or whitelisted command dispatch over runtime eval-style execution.",
        category: "security",
        severity: "error",
        confidence: 0.86,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectJavaEmptyCatch(text) {
  const issues = [];
  const regex = /catch\s*\([^)]*\)\s*\{\s*\}/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "java-empty-catch",
        title: "Empty catch block hides failures",
        explanation:
          "Swallowing exceptions in Java can hide the original fault and make production behaviour very difficult to trace later.",
        suggestion: "Log the exception, rethrow it, or handle it explicitly.",
        category: "runtime",
        severity: "warning",
        confidence: 0.87,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectJavaPrintUsage(text) {
  const issues = [];
  const regex = /System\.out\.println\s*\(/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: "java-system-out-leftover",
        title: "System.out.println left in code",
        explanation:
          "Temporary console output is helpful while debugging but can clutter logs and weaken the quality of production diagnostics.",
        suggestion: "Remove the print or replace it with a logger if the message still matters.",
        category: "performance",
        severity: "info",
        confidence: 0.73,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function detectPatternHardcodedSecrets(text, languageId) {
  const issues = [];
  const regex =
    languageId === "python"
      ? /\b(password|secret|token|apikey|api_key|clientsecret)\b\s*=\s*(['"])[^'"\n]{8,}\2/gi
      : /\b(?:String\s+)?(password|secret|token|apiKey|api_key|clientSecret)\b\s*=\s*"[^"\n]{8,}"/g;

  forEachRegexMatch(text, regex, (match, offset) => {
    issues.push(
      createIssue(text, {
        ruleId: `${languageId}-hardcoded-secret`,
        title: "Potential hardcoded secret",
        explanation:
          "Credentials stored directly in source code are easy to leak through commits, logs, or screenshots and should be treated as sensitive.",
        suggestion: "Move the secret to environment variables or a dedicated secret manager.",
        category: "security",
        severity: "error",
        confidence: 0.9,
        range: rangeFromOffsets(offset, offset + match[0].length, text)
      })
    );
  });

  return issues;
}

function mapNativeDiagnostic(diagnostic) {
  if (!diagnostic || !diagnostic.range || diagnostic.source === "CodeGuardian AI") {
    return null;
  }

  const severity = normalizeSeverity(diagnostic.severity);
  return {
    id: buildIssueId(`native-${diagnostic.code || diagnostic.message}`, diagnostic.range),
    ruleId: "native-diagnostic",
    title: simplifyDiagnosticTitle(diagnostic.message),
    explanation: explainNativeDiagnostic(diagnostic.message),
    suggestion: suggestForDiagnostic(diagnostic.message),
    category: categorizeNativeDiagnostic(diagnostic.message),
    severity,
    confidence: 0.83,
    source: diagnostic.source || "VS Code Diagnostic",
    range: diagnostic.range,
    fix: null,
    score: SEVERITY_WEIGHT[severity]
  };
}

function createIssue(text, config) {
  const range = config.range || rangeFromNode(config.node.start, config.node.end, text);
  return {
    id: buildIssueId(config.ruleId, range),
    ruleId: config.ruleId,
    title: config.title,
    explanation: config.explanation,
    suggestion: config.suggestion,
    category: config.category,
    severity: config.severity,
    confidence: config.confidence,
    source: "CodeGuardian Heuristic",
    range,
    fix: config.fix || null,
    score: SEVERITY_WEIGHT[config.severity]
  };
}

function applyFeedbackProfile(issue, feedbackProfile) {
  const profile = feedbackProfile[issue.ruleId] || { helpful: 0, notHelpful: 0 };
  const learnedBoost = Math.max(0, profile.helpful - profile.notHelpful) * 0.15;
  return {
    ...issue,
    score: issue.score + learnedBoost,
    learningNote:
      profile.helpful > profile.notHelpful
        ? "This suggestion type has been helpful in previous sessions."
        : null
  };
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.ruleId}:${issue.range.start.line}:${issue.range.start.character}:${issue.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortIssues(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }
  if (left.range.start.line !== right.range.start.line) {
    return left.range.start.line - right.range.start.line;
  }
  return left.range.start.character - right.range.start.character;
}

function normalizeSeverity(severity) {
  if (severity === "error" || severity === 0) {
    return "error";
  }
  if (severity === "info" || severity === 2 || severity === 3) {
    return "info";
  }
  return "warning";
}

function simplifyDiagnosticTitle(message) {
  if (!message) {
    return "Diagnostic detected";
  }
  return message.split(".")[0].trim();
}

function explainNativeDiagnostic(message) {
  const lower = String(message || "").toLowerCase();
  if (lower.includes("unexpected token")) {
    return "The editor found a symbol or keyword that does not fit the current statement structure.";
  }
  if (lower.includes("is not defined") || lower.includes("cannot find symbol") || lower.includes("nameerror")) {
    return "This code uses a name that has not been declared, imported, or spelled correctly in the current scope.";
  }
  if (lower.includes("cannot find") || lower.includes("unresolved")) {
    return "A dependency, property, or identifier referenced here is missing from the current scope or project setup.";
  }
  return "The editor reported a problem here, and this location is worth checking before running the code.";
}

function suggestForDiagnostic(message) {
  const lower = String(message || "").toLowerCase();
  if (lower.includes("unexpected token")) {
    return "Check the nearby lines for a missing bracket, quote, comma, or stray operator.";
  }
  if (lower.includes("is not defined") || lower.includes("cannot find symbol") || lower.includes("nameerror")) {
    return "Declare, import, or rename the missing identifier so it matches the intended symbol.";
  }
  if (lower.includes("cannot find") || lower.includes("unresolved")) {
    return "Verify the spelling, import path, classpath, or object shape being used at this location.";
  }
  return "Read the surrounding statement and fix the missing or invalid piece before continuing.";
}

function categorizeNativeDiagnostic(message) {
  const lower = String(message || "").toLowerCase();
  if (lower.includes("deprecated") || lower.includes("unused")) {
    return "performance";
  }
  if (
    lower.includes("is not defined") ||
    lower.includes("cannot read") ||
    lower.includes("nullpointer") ||
    lower.includes("nameerror")
  ) {
    return "runtime";
  }
  return "syntax";
}

function buildIssueId(ruleId, range) {
  const hash = crypto
    .createHash("sha1")
    .update(`${ruleId}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`)
    .digest("hex");
  return hash.slice(0, 12);
}

function rangeFromNode(startIndex, endIndex, text) {
  const resolver = createPositionResolver(text);
  return {
    start: resolver(startIndex),
    end: resolver(endIndex)
  };
}

function rangeFromOffsets(startIndex, endIndex, text) {
  return rangeFromNode(startIndex, endIndex, text);
}

function rangeFromLocation(location) {
  return {
    start: {
      line: Math.max(0, (location?.line || 1) - 1),
      character: Math.max(0, location?.column || 0)
    },
    end: {
      line: Math.max(0, (location?.line || 1) - 1),
      character: Math.max(0, (location?.column || 0) + 1)
    }
  };
}

function createPositionResolver(text) {
  const lineOffsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineOffsets.push(index + 1);
    }
  }

  return (offset) => {
    let low = 0;
    let high = lineOffsets.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (lineOffsets[middle] <= offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const line = Math.max(0, high);
    return {
      line,
      character: Math.max(0, offset - lineOffsets[line])
    };
  };
}

function forEachRegexMatch(text, regex, callback) {
  const stableRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let match = stableRegex.exec(text);
  while (match) {
    callback(match, match.index);
    match = stableRegex.exec(text);
  }
}

module.exports = {
  SUPPORTED_LANGUAGES,
  analyzeCode
};
