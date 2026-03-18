# Task: cleanup_dead_agent

```
NODE: narrative:task
STATUS: active
PROBLEM: AGENT_DEAD
EXECUTOR: automated
```

---

## Purpose

Clean up a dead agent: mark status, release claimed tasks, remove work links.

---

## Trigger

- Problem: AGENT_DEAD
- Signal: critical

---

## Steps

```yaml
steps:
  - id: mark_dead
    action: set_property
    params:
      node: "{target}"
      property: status
      value: dead

  - id: find_claimed_tasks
    action: query
    params:
      cypher: |
        MATCH (t:Narrative {type: 'task_run', status: 'claimed'})
        WHERE t.claimed_by = $agent_id
        RETURN t.id
      params:
        agent_id: "{target}"
    outputs:
      task_ids: list

  - id: release_tasks
    action: foreach
    params:
      items: "{task_ids}"
      do:
        - action: set_property
          params:
            node: "{item}"
            property: status
            value: pending
        - action: set_property
          params:
            node: "{item}"
            property: claimed_by
            value: null

  - id: remove_work_links
    action: execute
    params:
      cypher: |
        MATCH (a:Actor {id: $agent_id})-[r:WORKS_ON]->()
        DELETE r
      params:
        agent_id: "{target}"

  - id: remove_claim_links
    action: execute
    params:
      cypher: |
        MATCH ()-[r:CLAIMED_BY]->(a:Actor {id: $agent_id})
        DELETE r
      params:
        agent_id: "{target}"

  - id: complete
    action: complete
    params:
      status: cleaned
      released_tasks: "{task_ids}"
```

---

## Context Required

| Field | Type | Description |
|-------|------|-------------|
| target | string | Dead agent ID |
| elapsed_seconds | int | Seconds since last heartbeat |

---

## Invariants After

- Agent status = dead
- No tasks claimed by this agent
- No WORKS_ON links from this agent
- No CLAIMED_BY links to this agent
