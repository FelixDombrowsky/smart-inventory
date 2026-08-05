# Zebra ZQ630 Plus — `~HS` Raw Host Status Reference

## Purpose
This file documents how to parse the `rawHostStatus` string returned by a Zebra
printer's `~HS` command, and includes two real sample readings for reference.
Use this to build a printer status table/parser (e.g. in a Node/C#/JS service
that talks to the ZQ630 Plus).

## Raw format
The printer returns 3 lines (separated by `\r\n`), containing 25
comma-separated fields total (b1–b25).

## Sample readings

### Reading 1
```
159,1,0,0249,000,0,0,0,000,0,0,0
000,0,0,0,0,2,6,0,00000000,1,000
0000,0
```

### Reading 2
```
159,1,0,0249,000,0,0,0,000,0,0,0
000,0,1,0,0,2,6,0,00000000,1,000
0000,0
```

Only field **b15** differs between the two readings (`0` → `1`).

## Field-by-field breakdown

### Line 1 — Communication / Error status
| Field | Reading 1 | Reading 2 | Name | Meaning |
|---|---|---|---|---|
| b1 | 159 | 159 | Interface settings | Encoded baud/parity/comm settings |
| b2 | 1 | 1 | **Paper Out** | `1` = no media detected |
| b3 | 0 | 0 | Pause | `0` = not paused |
| b4 | 0249 | 0249 | Label Length | In dot rows |
| b5 | 000 | 000 | Formats in buffer | Number of formats waiting in receive buffer |
| b6 | 0 | 0 | Buffer Full | `0` = not full |
| b7 | 0 | 0 | Diagnostic Mode | `0` = not in diagnostics |
| b8 | 0 | 0 | Partial Format | `0` = no partial format in progress |
| b9 | 000 | 000 | (unused) | Reserved |
| b10 | 0 | 0 | Corrupt RAM | `0` = RAM OK |
| b11 | 0 | 0 | Under Temperature | `0` = not under temp |
| b12 | 0 | 0 | Over Temperature | `0` = not over temp |

### Line 2 — Mode / Print status
| Field | Reading 1 | Reading 2 | Name | Meaning |
|---|---|---|---|---|
| b13 | 000 | 000 | Function settings | Reserved/model-specific |
| b14 | 0 | 0 | (unused) | Reserved |
| b15 | **0** | **1** | **Head Up** | `1` = printhead open/lifted |
| b16 | 0 | 0 | Ribbon Out | Not applicable (Direct Thermal) |
| b17 | 0 | 0 | Thermal Transfer Mode | `0` = Direct Thermal mode active |
| b18 | 2 | 2 | Print Mode | `2` = Tear-Off |
| b19 | 6 | 6 | Print Width Mode | Encoded configured print width |
| b20 | 0 | 0 | Label Waiting | `0` = not waiting |
| b21 | 00000000 | 00000000 | Labels Remaining in Batch | Count remaining |
| b22 | 1 | 1 | Format While Printing | `1` = enabled |
| b23 | 000 | 000 | Graphics Stored | Number of graphic images stored in memory |

### Line 3 — Password / Memory
| Field | Reading 1 | Reading 2 | Name | Meaning |
|---|---|---|---|---|
| b24 | 0000 | 0000 | Password | Current password (default) |
| b25 | 0 | 0 | Static RAM | `0` = no optional Static RAM installed |

## b18 — Print Mode value mapping

`b18` is not a binary flag — it's an enumerated code representing the
printer's configured print mode (set via `^MN`/`^MM` or the printer's
config menu). Full mapping per Zebra ZPL Programming Guide:

| Value | Print Mode |
|---|---|
| 0 | Rewind |
| 1 | Peel-Off |
| 2 | Tear-Off |
| 3 | Cutter |
| 4 | Applicator |
| 5 | Delayed Cutter |
| 6 | Linerless Peel |
| 7 | Linerless Rewind |
| 8 | Partial Cutter |
| 9 | RFID |
| 10 | Kiosk |
| 11 | Linerless Cutter |
| 12 | Linerless Delayed Cutter |

> ZQ630 Plus is a mobile printer, so in practice it will typically only ever
> report `1` (Peel-Off) or `2` (Tear-Off) depending on config — the cutter/
> applicator/RFID/linerless modes apply to industrial desktop/print-engine
> models, not this unit. If you see anything else, treat it as unexpected
> and worth flagging.

## Other fields that are codes, not flags (use caution parsing)

Most `~HS` fields are simple `0`/`1` booleans, but a few are **not** —
treat them as enums/encoded values rather than true/false when you build
the parser:

| Field | Type | Notes |
|---|---|---|
| b1 | Encoded settings byte | Encodes baud rate + parity + handshake as a lookup value, not a flag. Don't interpret directly as 0/1 — cross-reference against the printer's comm settings table if you need to decode it. |
| b18 | Enum (see table above) | Print mode |
| b19 | Encoded width code | Represents configured print width, encoded per printer model/dot density — not a literal dot count. Safer to just display the raw code unless you have the ZQ630's specific width lookup table. |
| b21 | Numeric count | Labels remaining in batch — literal integer, not a flag |
| b23 | Numeric count | Graphics stored in memory — literal integer, not a flag |
| b24 | Numeric | Password value — literal, not a flag |

Everything else (b2, b3, b6, b7, b8, b10, b11, b12, b15, b16, b17, b20, b22, b25)
is a true `0 = off / 1 = on` boolean flag and safe to render as a simple
badge (OK/Error, Off/On, etc.) in your status table.

## Interpretation summary
- Both readings show **Paper Out = 1** → printer cannot detect media loaded.
- Print mode is **Tear-Off**, engine is in **Direct Thermal** (expected for ZQ630 Plus, no ribbon).
- No RAM/temperature errors in either reading.
- The only change between readings is **b15: Head Up 0 → 1**, meaning the
  printhead was opened between the two status queries (likely operator opening
  the cover to load media).

## Suggested task for Claude Code
Parse `rawHostStatus` strings like the samples above into a structured status
object (e.g. `{ paperOut, headOpen, printMode, labelLengthDots, ... }`), then
render a table/UI showing current printer status, highlighting any error
flags (paper out, head open, over/under temp, RAM error, buffer full) in red.
Use the b18 print mode lookup table above to map the numeric code to a
human-readable label (e.g. `2 → "Tear-Off"`) instead of showing the raw digit.
