# Wikipedia Breadcrumbs

## Project Context

This is a PWA/Chrome extension project (Wikipedia Breadcrumbs). Tech stack: TypeScript, JavaScript, HTML/CSS. Always consider service worker caching when deploying changes—remind me to clear cache or bump the SW version.

## Communication Rules

When I describe a feature or UI behavior, confirm your understanding of the exact scope and conditions before implementing. Restate what you plan to do and wait for approval on ambiguous requests.

When implementing UI animations or conditional display logic, list all the exact conditions and edge cases you're implementing BEFORE writing code. Wait for confirmation.

## Development Workflow

For CSS and styling changes, verify the build pipeline actually rebuilds CSS before confirming the fix is done. If there's a build step, run it and confirm output changed.

## Code Change Rules

Prefer minimal, targeted edits. Do not refactor or change code outside the specific request unless asked. When fixing a bug, only change what's necessary.
