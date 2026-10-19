---
status: accepted
supersedes: ["[[0001]]"]
anchors: [src/**]
---
# Rotating refresh tokens

## Context
Hard expiry logged people out mid-task.

## Decision
Refresh tokens rotate on every use; access tokens last 15 minutes.
