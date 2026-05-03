# Map Traceroute — Product Spec

## Vision

The product will run locally and visualize the packets, both incoming and outgoing, on the world map.

## Problem

At a given point, a person does not grasp the concept that how he is connected to the world. This will help him grasp that. 

## Target users

Anyone

## What it should do

The computer is constantly sending and receiving packets. The app captures these packets in real time and shows them on a world map.

### Capture

- A **Start** button begins the whole process: packet capture, map drawing, and line animation.
- A **Stop** button ends packet capture. The 5-second expiry keeps running, so already-drawn lines continue to fade out and disappear until the map is empty.
- While capturing, the app holds a **5-second moving window**: it keeps every packet captured in the last 5 seconds and discards anything older.

### Visualization

- The UI shows a **world map**.
- Each captured packet has a **source location** and a **destination location**, resolved from its source and destination IP addresses.
- For every captured packet, the app draws an **animated arc** from source to destination.
- The arc's **color encodes the protocol**: TCP, UDP, ICMP, Other each get their own color.
- The arc's **height encodes direction**: outgoing arcs arch **high**, incoming arcs stay **low/flat**. You can see at a glance whether traffic is leaving or arriving.
- The arc grows from source to destination when the packet is captured.
- When a packet ages past 5 seconds, its arc **fades out** and is removed from the map.
- Incoming and outgoing packets are both shown.

### Live packet list

- Below the map, the UI shows a **live packet list** — a Wireshark-style table of every packet currently in the 5-second window.
- Columns: **direction** (in/out), **source** (IP + "city, country"), **destination** (IP + "city, country"), **protocol**, **bytes**, **age** (seconds since captured).
- Newest packets on top. A row disappears when its packet expires, with a short fade-out.
- If a source or destination is the user's own machine, the location column shows `(local)` instead of a city.
- Only routable packets are listed — same stream that appears on the map.

### Themes

- The UI ships with **three themes** the user can switch between at runtime:
  - **Console at night** — calm dark theme with GitHub-like panels. Default.
  - **Space map** — deep blue-black background, saturated arcs, "control room" feel.
  - **Topographic paper** — light theme, warm off-white, muted navy/forest/raspberry arcs.
- A **theme dropdown** sits in the controls panel (top-left). Selecting a theme applies it immediately to the map, packet list, and controls.
- The choice is **persisted** in the browser (localStorage). Next visit starts with the user's last theme.

## How the user runs it

This is a **local tool**. The user clones the GitHub repo and runs it on their own machine.

### Setup and run

- A **single command** sets up everything (dependencies, permissions, etc.) and starts the program — both the backend capture process and the UI.
- After running that one command, the user sees the map UI with Start and Stop buttons, ready to use.

### Agent prompt

- The README includes an **Agent Prompt** the user can paste into a coding agent (e.g. Claude Code).
- The agent runs end-to-end for the user: clones the repo (if needed), runs the single setup command, and gets the app running. The user does not need to read docs or run anything themselves.