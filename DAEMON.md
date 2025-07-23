# Keelan Monitor Daemon

The Keelan Monitor Daemon is a background service that continuously monitors running ships and updates their status in the database. This solves the issue of detached processes not being properly tracked.

## Features

- **Background Monitoring**: Runs as a detached daemon process
- **Process Health Checks**: Periodically verifies that ship processes are still running
- **Database Updates**: Automatically updates ship status when processes stop
- **Graceful Shutdown**: Handles SIGTERM and SIGINT signals properly
- **Logging**: Comprehensive logging with configurable log files
- **PID Management**: Proper PID file handling for daemon lifecycle

## Usage

### Starting the Daemon

```bash
# Start daemon with default settings (30-second interval)
keelan daemon start

# Start with custom interval
keelan daemon start --interval 60

# Start with custom log and PID files
keelan daemon start --log-file /custom/path/daemon.log --pid-file /custom/path/daemon.pid

# Start in foreground for debugging
keelan daemon start --foreground
```

### Checking Daemon Status

```bash
keelan daemon status
```

This will show:
- Whether the daemon is running
- Process ID (PID)
- Log file location and size
- Recent log entries

### Stopping the Daemon

```bash
keelan daemon stop
```

### Restarting the Daemon

```bash
keelan daemon restart
```

## How It Works

### Process Detachment

When deploying ships, the spawn process is now detached using:

```typescript
const child = spawn('chroot', args, {
  detached: true,        // Detach from parent process
  windowsHide: true,     // Hide window on Windows
  stdio: ['ignore', out, err]
});

child.unref();           // Allow parent to exit independently
```

### Background Monitoring

The daemon performs these tasks:

1. **Periodic Health Checks**: Every N seconds (configurable), check all running ships
2. **Process Verification**: Use `process.kill(pid, 0)` to verify processes are alive
3. **Database Updates**: Update ship status when processes are found to be stopped
4. **Cleanup**: Remove stale PID files and update timestamps

### Database Integration

The daemon integrates with the existing database schema:

- Updates `status` field ('running' → 'stopped')
- Sets `stoppedAt` timestamp
- Records `exitCode` when available
- Maintains `processId` for tracking

## Configuration

### Environment Variables

- `BASE_DIRECTORY`: Base directory for logs and PID files (default: current working directory)

### Default Paths

- **Log Directory**: `${BASE_DIRECTORY}/logs/`
- **Run Directory**: `${BASE_DIRECTORY}/run/`
- **Default Log File**: `${BASE_DIRECTORY}/logs/monitor-daemon.log`
- **Default PID File**: `${BASE_DIRECTORY}/run/monitor-daemon.pid`

## Troubleshooting

### Daemon Won't Start

1. Check if daemon is already running: `keelan daemon status`
2. Verify permissions on log and run directories
3. Check for port conflicts or resource limitations
4. Run in foreground mode for debugging: `keelan daemon start --foreground`

### Ships Not Being Monitored

1. Verify daemon is running: `keelan daemon status`
2. Check daemon logs for errors
3. Ensure ships were deployed after daemon was started
4. Verify database connectivity

### Stale PID Files

```bash
# Clean up stale PID files
keelan daemon stop
keelan daemon start
```

### Log File Management

The daemon logs are not automatically rotated. For production use, consider:

- Setting up log rotation with `logrotate`
- Monitoring log file sizes
- Implementing custom log cleanup scripts

## Architecture

### Components

1. **deploy.ts**: Modified to spawn detached processes and set up initial monitoring
2. **daemon.ts**: CLI handler for daemon management commands
3. **monitor-daemon.ts**: The actual daemon process that runs in the background
4. **Database Schema**: Extended to track process IDs and status

### Process Flow

```
1. User runs: keelan deploy myapp
2. Ship process spawned as detached
3. Initial process monitoring setup
4. Daemon (if running) picks up the new ship
5. Daemon periodically checks ship health
6. When ship stops, daemon updates database
```

## Security Considerations

- PID files are created with appropriate permissions
- Daemon runs with same privileges as the user who started it
- Log files may contain sensitive information - secure appropriately
- Process signals are handled gracefully to prevent data corruption

## Performance

- Minimal CPU usage during monitoring cycles
- Configurable intervals to balance responsiveness vs resource usage
- Efficient process checking using OS signals
- Database updates only when status changes occur

## Future Enhancements

- Log rotation and archiving
- Metrics and monitoring integration
- Web dashboard for daemon status
- Email/webhook notifications for ship failures
- Clustering support for multiple daemon instances