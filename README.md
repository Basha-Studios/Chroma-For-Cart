CFC – Chroma Fusion Core
A modular, JSON‑driven RGB engine for Minecraft and future games.

⭐ Overview
CFC (Chroma Fusion Core) is a lightweight, event‑driven RGB engine designed to bridge Minecraft mods with the Razer Chroma SDK using a clean JSON protocol.

The goal is simple:

Mod → JSON → CFC Engine → RGB Effect → Chroma SDK
CFC handles:

JSON validation

event → effect mapping

layered RGB effects

communication with the Chroma REST API

logging

future multi‑game support

CFC is built to be modular, scalable, and easy to extend without rewriting the engine.

⭐ Features
✔ JSON‑Driven Event System
Mods send JSON packets describing gameplay events (kill, death, combo, etc).
CFC validates them using Schema.json and maps them to RGB effects.

✔ Prebuilt RGB Effects
All RGB effects live in:

Code
CFC/JSON/Events/
Each file represents a Chroma effect (wave, ripple, hotbar overlay, etc).

✔ Razer Chroma SDK Integration
CFC communicates with the Chroma REST API to trigger:

waves

ripples

reactive effects

custom animations

layered overlays

✔ Layered RGB Pipeline
CFC supports:

base layer (persistent effects)

overlay layers (temporary effects like explosions, combos, dopamine waves)

✔ Logging System
All engine activity is logged inside:

⭐ How It Works
1. Mod sends JSON → CFC Server
Example:

json
{
  "event": "kill",
  "player": "Malek",
  "weapon": "iron_sword"
}
2. CFC validates JSON using Schema.json
Ensures fields and types match.

3. CFC selects the matching RGB effect
Example: Events/Kill.json

4. CFC sends the effect to Chroma SDK
Triggers wave, ripple, overlay, etc.

5. CFC logs everything
For debugging and analytics.

6. CFC sends confirmation back to the mod
If no response in 3 seconds → mod shows error.

⭐ Dependencies
Node.js

Razer Chroma SDK (REST API)

Axios or a Chroma wrapper library

Minecraft mod (Fabric/Forge) that sends JSON packets

⭐ Goals
Build a stable RGB engine

Keep the core simple and clean

Add feature layers later (hotbar RGB, dopamine waves, overlays)

Support multiple games

Avoid spaghetti code

Use documentation + libraries instead of reinventing everything

⭐ Credits
Lead Engineer: Thakc1
Gameplay Designer: a4xme
Thakc1's Personnal Assistant: Copilot

⭐ License
MIT License
