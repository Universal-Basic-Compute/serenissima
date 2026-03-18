"""Orchestrator — budget-driven tick engine for citizen session dispatch.

Core components:
  - account_balancer: Round-robin across Claude Code account credentials
  - claude_invoker: Claude Code subprocess invocation (primary) + API fallback
  - compute_budget: Trust-based compute allocation and tick speed control
  - message_queue: Priority queue for incoming requests
  - session_tracker: Neuron profile management (active sessions)
  - degradation: Graceful degradation (4 levels) with auto-recovery
  - dispatcher: Main dispatch loop
"""
