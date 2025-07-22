// ANSI escape codes for cursor manipulation and clearing lines
const CLEAR_LINE = '\x1b[2K'; // Clears the entire line
const CURSOR_UP = '\x1b[1A'; // Moves cursor up 1 line

let logBuffer = [];
const MAX_LINES = 5; // The number of lines to "keep" in the dynamic window

// --- Permanent Initial Logs ---
console.log("--- Starting Log Demo ---");
console.log("These first lines will stay.");
console.log("They won't be cleared by the dynamic log window below.");
console.log("-----------------------");

// An empty line to visually separate the static logs from the dynamic ones
// This line will be the 'anchor' for our dynamic logging.
console.log('\n'); // This blank line ensures the dynamic content starts below the static text


function customLog(message) {
    // 1. Move cursor to the start of the dynamic area (which is the blank line we just printed)
    // We need to move up MAX_LINES + 1 (for the initial blank line)
    // Then clear MAX_LINES + 1 lines to ensure a clean slate before redrawing.
    // However, it's safer to only clear what we know we've printed.
    // If the buffer isn't full yet, we still need to clear potential previous short outputs.
    const linesToClear = Math.max(logBuffer.length, MAX_LINES); // Clear up to MAX_LINES or current buffer size

    for (let i = 0; i < linesToClear; i++) {
        process.stdout.write(CURSOR_UP + CLEAR_LINE);
    }
    // After clearing, the cursor is at the line where the dynamic content starts.

    // 2. Add the new message to the buffer
    logBuffer.push(message);

    // 3. If the buffer exceeds MAX_LINES, remove the oldest message
    if (logBuffer.length > MAX_LINES) {
        logBuffer.shift(); // Remove the first element
    }

    // 4. Print the current content of the buffer
    logBuffer.forEach(line => {
        process.stdout.write(line + '\n');
    });

    // If the buffer isn't full, print enough blank lines to fill up to MAX_LINES
    // This ensures the dynamic area always occupies the same vertical space.
    for (let i = logBuffer.length; i < MAX_LINES; i++) {
        process.stdout.write('\n');
    }
}


// --- Simulate your loop with dynamic logging ---
console.log("Starting dynamic log window...");
console.log("Only the last 5 messages below this line will be visible.");
console.log("-------------------------------------------------------");

// Initialize the area with empty lines so we can move the cursor up consistently later
// This helps prevent issues if the first few logs are less than MAX_LINES
for (let i = 0; i < MAX_LINES; i++) {
    process.stdout.write('\n');
}

for (let i = 0; i < 20; i++) { // Run for 20 iterations
    customLog(`Log message ${i + 1}: Some dynamic content - ${new Date().toLocaleTimeString()}`);
    // Simulate some work taking time to clearly see the effect
    const start = Date.now();
    while (Date.now() - start < 200); // 200ms blocking delay
}

// Ensure the cursor is below the dynamic log area before printing final messages
// The cursor is currently at the end of the last printed line.
// The next print will appear correctly.

// --- Permanent Final Logs ---
console.log("-----------------------");
console.log("Dynamic logging finished.");
console.log("These lines appear after the dynamic window and will stay.");
console.log("--- End of Log Demo ---");