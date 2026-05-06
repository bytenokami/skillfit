# Sample repo rules

## Style

- Prefer hard failure over silent fallback
- No fallback values without explicit alerting
- All schemas validated at boundaries

## Testing

- Integration tests must hit a real database, not mocks
- Snapshot tests reviewed every release
