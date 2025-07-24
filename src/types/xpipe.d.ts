declare module 'xpipe' {
  /**
   * Creates a cross-platform pipe path
   * @param name - The name of the pipe
   * @returns A platform-specific pipe path
   */
  interface XPipe {
    eq(name: string): string;
  }
  
  const xpipe: XPipe;
  export = xpipe;
}