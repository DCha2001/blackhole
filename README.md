# Blackhole

A real-time black hole renderer built with C++ and OpenGL. Simulates gravitational lensing, the photon sphere, and a lensed procedural starfield — all computed in a GLSL fragment shader.

![screenshot placeholder — replace with a gif or screenshot of the renderer]

## Features

- **Gravitational lensing** — rays are continuously deflected toward the singularity using Rodrigues rotation, accumulating bending as they pass near the black hole
- **Photon sphere** — brightened ring at 1.5× the Schwarzschild radius where light orbits
- **Critical impact parameter** — rays with impact parameter near b_crit = 2.598 r_s produce multiple lensed images of the background sky
- **Procedural starfield** — hash-based star noise mapped to a sky sphere, sampled through the lensed ray directions
- **Free camera** — WASD movement + mouse look, scroll to zoom FOV

## How It Works

The renderer traces one ray per pixel using a fullscreen quad. All rendering logic lives in `shaders/fragAug.frag`:

1. **Ray setup** — screen-space UV coordinates are unprojected into world-space ray directions using the inverse view matrix
2. **Ray marching** — each ray steps through the scene; the step size is determined by the SDF distance to the Schwarzschild sphere
3. **Ray bending** — every few steps, the ray direction is rotated around the perpendicular axis using the local deflection angle, approximating the curved geodesic path near a Schwarzschild black hole
4. **Shading** — rays that hit the horizon (r < r_s) are black; escaping rays sample the lensed sky with a ring brightness boost near b_crit

## Controls

| Input | Action |
|-------|--------|
| W / A / S / D | Move camera |
| Mouse | Look around |
| Scroll wheel | Zoom (FOV) |
| Escape | Quit |

## Build

Requires Visual Studio 2022 with the following dependencies configured in the project's include/library paths:

- [GLFW](https://www.glfw.org/)
- [GLAD](https://glad.dav1d.de/) (OpenGL 3.3 Core)
- [GLM](https://github.com/g-truc/glm)

Open `Blackhole.sln` and build with **Release | x64**.

## Tech Stack

- **C++17**
- **OpenGL 3.3 Core**
- **GLFW** — windowing and input
- **GLAD** — OpenGL function loading
- **GLM** — math (vectors, matrices)
- **GLSL** — all rendering logic runs on the GPU
