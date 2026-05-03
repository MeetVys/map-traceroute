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
- For every captured packet, the app draws a **line on the map** connecting source to destination.
- The line is **animated**: it grows from the source point and ends at the destination point.
- When a packet ages past 5 seconds, its line **fades out** and is removed from the map.
- Incoming and outgoing packets are both shown.

### Live packet list

- Below the map, the UI shows a **live packet list** — a Wireshark-style table of every packet currently in the 5-second window.
- Columns: **direction** (in/out), **source** (IP + "city, country"), **destination** (IP + "city, country"), **protocol**, **bytes**, **age** (seconds since captured).
- Newest packets on top. A row disappears when its packet expires, with a short fade-out.
- If a source or destination is the user's own machine, the location column shows `(local)` instead of a city.
- Only routable packets are listed — same stream that appears on the map.

## How the user runs it

This is a **local tool**. The user clones the GitHub repo and runs it on their own machine.

### Setup and run

- A **single command** sets up everything (dependencies, permissions, etc.) and starts the program — both the backend capture process and the UI.
- After running that one command, the user sees the map UI with Start and Stop buttons, ready to use.

### Agent prompt

- The README includes an **Agent Prompt** the user can paste into a coding agent (e.g. Claude Code).
- The agent runs end-to-end for the user: clones the repo (if needed), runs the single setup command, and gets the app running. The user does not need to read docs or run anything themselves.