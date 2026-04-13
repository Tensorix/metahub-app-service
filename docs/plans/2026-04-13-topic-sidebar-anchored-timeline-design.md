# Topic Sidebar Refactor: Anchored Timeline

## Summary

- Replace the current generic topic list with an `anchored timeline` layout that preserves the existing ascending sort (`oldest -> newest`) but makes the time direction obvious.
- Use a persistent `current topic anchor` at the bottom of the sidebar as the visual "Now" point; older topics scroll above it as history.
- Keep topic navigation semantics unchanged in the store: upward means older topic, downward means newer topic.
- Unify the right sidebar and top topic selector around the same time-based language so the product does not present two different mental models.

## Key Changes

- In `frontend/src/components/chat/TopicSidebar.tsx`, restructure the sidebar into 3 zones:
  - `Header`: title, topic count, search toggle. Remove the visual weight from create/manage actions.
  - `History rail`: scrollable list of non-current topics, still sorted oldest to newest top-to-bottom.
  - `Current anchor`: fixed bottom card for the selected topic, always visible.
- Define two visual item variants instead of one generic row:
  - `HistoryTopicItem`: compact, low-emphasis, single-line title + relative time, hover actions hidden by default.
  - `CurrentTopicAnchorCard`: larger, higher-contrast card with selected state, stronger border/background, relative time, optional small status text.
- Exclude the current topic from the scrollable history rail and render it only in the bottom anchor card.
- Move `new topic` affordance into the bottom zone so it feels adjacent to the newest/current position:
  - primary action becomes a small inline action in the anchor zone, not a top-bar button.
  - create form expands directly above or inside the anchor zone.
- Keep search in the header, but when search is active:
  - temporarily collapse the anchored layout into a flat filtered result list.
  - disable the special bottom anchor treatment while filtering.
  - show a dedicated empty-search state.
- Refine boundary-scroll preview behavior:
  - when `boundaryDirection === 'up'`, highlight the previous history item with a subtle raise, border tint, and direction cue.
  - when `boundaryDirection === 'down'`, highlight the anchor card instead of a list row when moving toward newer/current content.
  - remove bounce-like affordances; use restrained motion and opacity for a more professional feel.
- Update `frontend/src/components/chat/TopicSelector.tsx`:
  - keep it as a lightweight quick-switcher, but label/sort content with the same oldest-to-newest logic.
  - visually separate `当前话题` from `历史话题` within the dropdown so it matches the sidebar model.
- Keep store behavior in `frontend/src/store/chat.ts` unchanged except for any selectors/helpers needed to expose:
  - `current topic`
  - `history topics excluding current`
  - `preview target topic`
  No sorting or navigation direction should change.

## UI / Interaction Spec

- Desktop and tablet:
  - sidebar bottom area stays pinned; only history rail scrolls.
  - current anchor card remains visible during all normal browsing states.
- Mobile drawer:
  - same anchored layout, but reduce anchor card height and action density.
  - keep tap targets at least 40px high.
- Visual style:
  - preserve existing neutral/light surfaces and brand indigo from `index.css`.
  - use depth through surface layering, fine borders, and shadow restraint; do not introduce louder colors.
  - current anchor card should feel like a docked panel, not a CTA banner.
- States:
  - empty session: neutral onboarding message.
  - no topics: anchor zone shows creation-first empty state.
  - search empty: centered filtered-empty state in the scroll area.
  - rename: inline edit remains in place for history items; current topic rename can open within the anchor card.
  - virtual topics: keep the badge, but reduce prominence.
- Accessibility:
  - keyboard focus must clearly distinguish history items vs current anchor actions.
  - preserve tab order: header controls -> history items -> anchor actions.
  - maintain visible focus ring and non-color-only selected state.

## Public Interfaces / Types

- No backend or API contract changes.
- No change to topic ordering rules or navigation semantics.
- Optional local refactor only:
  - add derived helpers/selectors for `historyTopics`, `currentTopic`, and `previewTopicId`.
  - if needed, split `TopicSidebar` presentation into small local subcomponents without changing external props.

## Test Plan

- Verify initial load selects the newest topic but renders it in the fixed bottom anchor, with older topics above.
- Verify scrolling the history rail does not move the anchor card.
- Verify creating a topic places it into the current anchor position and keeps older topics in the rail.
- Verify selecting a history topic moves the previously selected topic back into history and docks the newly selected topic in the anchor.
- Verify boundary scroll previews the correct target:
  - up previews the previous history topic.
  - down previews the newer/current destination.
- Verify search mode:
  - filters across all topics.
  - hides anchored layout in favor of filtered results.
  - restores anchored layout after clearing search.
- Verify rename/delete still work for both real and virtual topics.
- Verify desktop, tablet drawer, and mobile drawer layouts do not clip actions or overflow.

## Assumptions / Defaults

- The chosen UX is `anchored timeline` with a permanently visible bottom current-topic anchor.
- Topic sort remains `created_at` ascending everywhere.
- `Current topic` is treated as the "now" marker even if a newer topic could be created later.
- Search is a temporary utility mode and is allowed to override the anchored presentation.
- This refactor is intentionally visual/structural; it does not alter message paging, topic creation rules, or store-level topic navigation behavior.
