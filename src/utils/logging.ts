// ANSI escape codes for cursor manipulation and clearing lines
const CLEAR_LINE = '\x1b[2K'; // Clears the entire line
const CURSOR_UP = '\x1b[1A'; // Moves cursor up 1 line
const MAX_LINES = 5; // The number of lines to "keep" in the dynamic window


export class TailLog {

    private logBuffer: string[];

    constructor() {
        this.logBuffer = [];
        console.log("\n"); // This blank line ensures the dynamic content starts below the static text
    }

    log(message: string) {

        // Check if it a multiple lines
        if (message.includes("\n")) {
            message.split("\n").forEach(line => {
                this.log(line);
            });
            return;
        }

        // 1. Move cursor to the start of the dynamic area (which is the blank line we just printed)
        // We need to move up MAX_LINES + 1 (for the initial blank line)
        // Then clear MAX_LINES + 1 lines to ensure a clean slate before redrawing.
        // However, it's safer to only clear what we know we've printed.
        // If the buffer isn't full yet, we still need to clear potential previous short outputs.
        const linesToClear = Math.max(this.logBuffer.length, MAX_LINES); // Clear up to MAX_LINES or current buffer size

        for (let i = 0; i < linesToClear; i++) {
            process.stdout.write(CURSOR_UP + CLEAR_LINE);
        }
        // After clearing, the cursor is at the line where the dynamic content starts.

        // 2. Add the new message to the buffer
        this.logBuffer.push(message);

        // 3. If the buffer exceeds MAX_LINES, remove the oldest message
        if (this.logBuffer.length > MAX_LINES) {
            this.logBuffer.shift(); // Remove the first element
        }

        // 4. Print the current content of the buffer
        this.logBuffer.forEach(line => {
            process.stdout.write(line + '\n');
        });

        // If the buffer isn't full, print enough blank lines to fill up to MAX_LINES
        // This ensures the dynamic area always occupies the same vertical space.
        for (let i = this.logBuffer.length; i < MAX_LINES; i++) {
            process.stdout.write('\n');
        }
    }
}