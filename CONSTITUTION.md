# NanoPilot Constitution

`CONSTITUTION.md` is the canonical source for NanoPilot's mission, scope,
anti-goals, principles, decision tests, and amendment rules. If this file
conflicts with `README.md`, `CONTRIBUTING.md`, or `docs/REQUIREMENTS.md`, this
file wins and the summaries should be updated in the same diff.

## Mission

NanoPilot exists to give an individual a personal AI assistant powered by
GitHub Copilot that is:

- **Small enough to understand** without a large team or a maze of services
- **Secure by true isolation** rather than by app-level permission theater
- **Customizable by code and skills** without turning the core into a platform

The core repository should stay focused on the smallest host runtime that makes
that possible: routing messages, persisting state, launching isolated agents,
and scheduling work. Everything else should justify its place in core.

## Scope

NanoPilot's core is responsible for:

- Running a single, understandable host process
- Routing inbound and outbound messages
- Persisting the minimum shared state needed for groups, tasks, and sessions
- Spawning isolated agents in containers or equivalent sandboxes
- Providing stable extension points for skills, channels, and agent runtime
  behavior

NanoPilot is also responsible for being easy to fork and adapt. The project is
not trying to be the one universal assistant for every team. It is trying to be
the best base repo for one person's assistant that can be shaped cleanly over
time.

## Anti-Goals

NanoPilot is **not** trying to become:

- A kitchen-sink assistant platform with every feature bundled into core
- A configuration-heavy framework that avoids code changes by adding flags,
  switches, and admin panels
- An application-level permissions system that replaces container isolation with
  complex policy logic
- A compatibility layer for every channel, provider, or workflow directly in
  core
- A repo with five different philosophy documents saying similar but conflicting
  things

If a proposed change pulls NanoPilot toward any of these outcomes, that is a
reason to stop and reconsider.

## Principles

### 1. Small enough to understand

The repo should stay readable by a single determined engineer. Prefer one
process, a small number of files, and explicit flows over distributed systems,
hidden magic, or abstraction layers that exist only to feel architectural.

### 2. Security through real isolation

Security boundaries should come from containers, mounts, filesystem separation,
and narrow runtime surfaces. Prefer OS-level isolation over in-app permission
schemes that are hard to reason about and easy to bypass.

### 3. Built for the individual user

NanoPilot serves the person running their own assistant. Optimize for the fork,
the private deploy, and the user's exact setup. Do not bloat the core trying to
serve every hypothetical team or enterprise scenario.

### 4. Skills over core features

When a capability is useful but not universal, it should be a skill. The core
should absorb bug fixes, security fixes, simplifications, and broadly necessary
infrastructure. Optional capabilities, channel additions, and niche workflows
should default to skills.

### 5. Code over configuration sprawl

NanoPilot should not grow a large configuration surface to avoid making code
changes. Small, obvious config is fine. Broad behavioral customization should
happen by editing code or applying skills in a fork that owns that behavior.

### 6. Prefer boring tools and minimal glue

Reuse existing runtimes, SDKs, libraries, and operating-system primitives where
they are good enough. Avoid building custom infrastructure when a simple wrapper
around an existing tool will do.

### 7. Keep doctrine explicit

AI-native development does not remove the need for clarity. The project may
assume an AI collaborator exists, but its direction still needs one canonical
document so humans and assistants do not drift into different interpretations of
what NanoPilot is for.

## Decision Tests

Before adding or changing anything in core, ask:

1. **Does almost every NanoPilot user need this?**
   - If not, it probably belongs in a skill or a fork.

2. **Does this make the repo easier to understand, or at least not harder?**
   - If it adds hidden state, extra processes, or indirection, it needs a very
     strong reason to exist.

3. **Does this preserve security through isolation?**
   - Prefer mounts, containers, and explicit boundaries over permission logic
     sprinkled through the app.

4. **Could this be a skill instead of a core change?**
   - If yes, the default answer is to keep it out of core.

5. **Does this reduce or expand configuration sprawl?**
   - Avoid adding knobs that exist only to cover edge cases a fork can own.

6. **Are we reusing proven tools, or inventing new infrastructure?**
   - Thin glue is good. Reinventing the platform is not.

7. **Are the docs still telling one coherent story?**
   - If a change affects project doctrine, update `CONSTITUTION.md` and any
     touched summaries in the same diff.

Practical outcomes:

- **Good core changes:** bug fixes, security fixes, simplifications, reducing
  code, and broadly required infrastructure that strengthens the existing model
- **Usually skill changes:** new channels, optional integrations, niche
  workflows, alternative interfaces, or capabilities only a subset of users
  need
- **Usually wrong for NanoPilot:** changes that make the repo larger, more
  configurable, more abstract, or less isolated in order to chase generality

## Amendment Process

Changes to this constitution require direct maintainer approval on `main`.

Any amendment should:

- Explain what real repo decision or pain point the current text is failing to
  handle
- Update this file first, not only a summary somewhere else
- Update any affected summaries in the same diff so there is never more than one
  active doctrine

If NanoPilot's actual behavior and this document diverge, the fix is to either
change the code or amend the constitution. Do not leave the repo in a state
where contributors have to guess which philosophy is real.
