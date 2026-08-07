# Live2D motion mapping

Each Live2D pet folder has a `pet.json`. Use `motionMap` to bind oc-claw
animation states to motions that actually exist on the model.

## oc-claw states (keys)

- `idle` — resting
- `working` / `running` — agent busy (also used for compacting)
- `waiting` — Shell / MCP confirm
- `jumping` — hover one-shot
- `run-left` / `run-right` — while dragging

## Binding fields

```json
"motionMap": {
  "idle": { "group": "Idle", "index": 0 },
  "working": { "group": "Tap", "loop": true },
  "waiting": { "group": "Idle", "index": 1, "expression": "f03" },
  "jumping": { "group": "Tap", "index": 0 }
}
```

- `group` — Cubism motion group name from `.model3.json` (`FileReferences.Motions` keys). Empty string `""` is valid (Mao).
- `index` — optional index inside that group; omit for random.
- `loop` — replay while the oc-claw state stays active (needed for `working` / drag).
- `expression` — optional expression name from `FileReferences.Expressions`.

`availableMotions` / `availableExpressions` are documentation helpers so you
can see what the model ships with when editing the map.

Legacy `motionGroups: { idle, working, waiting, jumping }` still works.
