# Wikipedia Breadcrumbs — Design Guidelines

---

## Principles

These describe the fundamental beliefs about what makes a good experience in this app.

### The interface is stable

The screen should never shift, jump, or flash in response to a user action unless the user explicitly asked for content to change. Editing a field should not move the content around it. Hovering should not resize anything. Opening a menu should not push other elements. Loading new content should not cause a visible "pop" from one state to another.

### The user is in control of one thing at a time

Every interaction should feel focused and contained. When the user opens a menu, that is the only thing open. When they dismiss it, only the dismissal happens — not an accidental action on whatever was underneath. The user should never feel that the interface did something they didn't intend.

### The app tells the truth

Status information must reflect reality. If the app says data was synced, it was synced — to the cloud, not locally. If the user is offline, the app says so plainly instead of pretending things are working. Timestamps grow honestly with passing time.

### Both platforms are one product

A user moving between the extension and the PWA should feel like they are using the same application, not two different ones. Visual language, interaction patterns, and data should be consistent. Differences between platforms should only exist where the platform demands it.

### The interface stays out of the way

Primary content — trails, visits, notes — should dominate the screen. Tools and actions are available but not prominent. Rarely-used actions are tucked into menus. The user discovers functionality as they need it, not all at once.

### Edits happen naturally

Writing and editing should feel like using a notepad, not filling out a form. There are no Save or Cancel buttons. Changes persist as the user types and finalize when they move on. The editing surface should look and feel like the content it replaces.

### The user always knows where they are

Visual hierarchy makes relationships between content clear at a glance. The current page stands out. Pages discovered from it are visually connected to it. Pages that came before are present but recede. The user can navigate these relationships intuitively.

### Destructive actions are deliberate

Anything that removes or restructures data requires a clear confirmation that names what will be affected. The user should never wonder "what did I just delete?" Generic confirmations are not acceptable.

---

## Guidelines

These translate the principles into design decisions. They describe *what to do* without prescribing *how to implement it*.

### Spatial consistency

- Switching between viewing and editing a field should produce no visible movement of surrounding content. The editable area occupies the same space as the display area.
- Interactive states (hover, focus, selection) add visual emphasis without changing dimensions. If a background color appears on hover, the space for it must already exist.
- Menus and dropdowns overlay the page rather than inserting into it. They do not push content down or sideways.
- Repeating elements (lists of cards, rows of items) maintain uniform spacing regardless of which features are active or visible.

### Interaction containment

- Only one overlay (menu, dropdown, picker) is visible at a time. Opening one closes any other.
- Dismissing an overlay — by tapping outside it, pressing Escape, or selecting an option — should never trigger an action on the element beneath it. There is a brief grace period after dismissal during which underlying click targets are inactive.
- Inline editing (notes, titles) follows the same principle: exiting edit mode should not cause focus changes or navigation on the surrounding content.

### Truthful status

- Sync status reflects the last successful exchange with the remote database, never a local operation.
- When the device is offline, sync controls are disabled and labeled as offline. The time since last sync continues to grow in real time.
- Loading states are invisible for brief durations. If loading takes noticeably long, a subtle indicator appears — never a text label that flashes and disappears.
- Content fades in once loaded rather than appearing in an empty or zero-value state that immediately corrects itself.

### Cross-platform coherence

- The extension and PWA share the same icon set, color palette, and interaction vocabulary.
- Equivalent UI elements use the same patterns: the same style of dropdown, the same style of confirmation dialog, the same approach to inline editing.
- Font sizes and spacing may differ slightly between platforms to suit their contexts, but should be internally consistent within each platform.
- Data created on one platform appears identically on the other after sync.

### Progressive disclosure

- Each view surface shows only its most important actions by default. Secondary and destructive actions live inside menus.
- Native browser controls (selects, confirms, alerts) are replaced with custom equivalents that can be styled and that do not expose technical details like URLs to the user.
- Sort and filter controls use compact dropdown buttons rather than always-visible option sets.

### Effortless editing

- Text fields save continuously as the user types. There are no Save or Cancel buttons.
- The transition into edit mode is seamless: the editable field appears in place, at the same size, with the same content. The cursor is placed ready to type.
- Multiline input is supported where appropriate. The editing area grows to accommodate content.
- Leaving the field (tapping elsewhere, pressing Enter where appropriate) commits the edit and returns to display mode.

### Clear visual hierarchy

- The focal element (current page, selected card) is visually prominent: bolder, fully opaque, and optionally highlighted.
- Contextual ancestors (parent pages, the page you came from) are present but visually receded — reduced opacity, no emphasis.
- Contextual descendants (pages discovered from the current one) are visually connected: indented, with a colored border indicating the relationship.
- Unrelated items are dimmed to the same level as ancestors.
- Scroll position adapts to show the most relevant content. If the current item has many descendants, it appears near the top. Otherwise, it is centered.

### Deliberate destruction

- Every action that deletes, splits, merges, or signs out requires an explicit confirmation step.
- The confirmation names the specific item being affected ("Delete 'George Lucas'?", not "Delete this item?").
- The confirm button is labeled with the specific action ("Delete", "Split", "Merge"), not a generic "OK" or "Yes".
- Sign-out offers a chance to sync first, acknowledging that local data will be removed.

### Mobile awareness

- Touch targets are large enough to tap accurately. Interactive elements do not crowd each other.
- Text inputs are sized to prevent the operating system from auto-zooming the viewport.
- The app does not produce tap-highlight flashes, scroll-bounce artifacts, or viewport jumps on mobile devices.
- Persistent navigation (tab bar) eliminates the need for back buttons, reducing the number of taps to reach any section.

### Time as language

- Relative time ("3 minutes ago") is used for recent, changing values like sync status. It uses full words, not abbreviations.
- Absolute time is used for historical records like trail dates and visit timestamps. It follows the user's locale and uses a natural reading format with an "at" separator between date and time.
- Time labels are contextual: "Started" for trail creation, no prefix for visit discovery, "Last visited" for revisits.
