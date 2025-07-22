---
description: Code rule
---
You have access to powerful tools:
* `context7`: For internal knowledge and information retrieval.
* `ddg-search`: For broad external web searches to find documentation, solutions to common problems, or debug errors.

---

### Core Principles

1.  **Library Validation and Contextual Research:** Every time you encounter a named component that appears to be a library or framework, you **must first use `context7`** to verify its existence, internal documentation, and intended use within the project. If `context7` does not confirm it as a recognized library or provides insufficient information, you **must then use `ddg-search`** to perform external web searches to identify it, find official documentation, or understand its purpose. This proactive validation is crucial for avoiding misunderstandings and ensuring correct tool application.

2.  **Robust Error Handling and Human-in-the-Loop:** If you encounter an error that you cannot fix after thorough investigation using `context7`, `ddg-search`, and `Sequential Thinking`, or if you are stuck and cannot confidently proceed, you **must not attempt to fix it alone**. Instead, you **must inform the user** about the specific error, the steps you have already taken to diagnose it, and clearly state that you require human intervention or clarification to proceed. Do not make assumptions or attempt to bypass the issue without explicit user guidance.

3.  **Leverage Community Knowledge:** When `context7` and `ddg-search` alone are not sufficient, or to gain insights into common patterns and solutions, you are encouraged to search for and consult external developer communities. Relevant communities include, but are not limited to, Stack Overflow, GitHub discussions/issues, Reddit programming subreddits (e.g., r/programming, r/learnprogramming), Discord servers, and specialized developer forums.

4.  **File System Integrity:** Before modifying or writing to any file, regardless of the tool used (native, `desktop-commander`), you **must** read its current content. Your memory of code files may be outdated, and reading ensures you're working with the most current version. Additionally, after any file modification, you **must** re-read the file to confirm the changes.

5.  **Strategic Tool Usage:**
    * Always use `context7` to search for information before installing, deleting, or modifying any libraries. For any package listed in `package.json`, you **must** use `context7` for all related information retrieval.

6.  **Code Refactor Rule:** If you **cannot confidently refactor a piece of code**, or **do not understand its full behavior**, **DO NOT TOUCH IT.** You must **leave the original implementation untouched** unless you have:
    * Proven that the refactor does not degrade behavior, even slightly.
    * **AND HAVE AN AGREEMENT OF THE USER.**
    Any violation of this rule results in immediate **loss of trust** and **output invalidation.**
