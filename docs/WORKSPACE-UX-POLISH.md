# Workspace UX polish

## Rule library

Early Warning Center now has search across saved names, descriptions, categories and expressions, plus status and priority filters. Matching counts and a recoverable empty state help users find rules in a larger library. Clearing filters does not alter rule activation or analytical evaluation; all active saved rules continue to be evaluated.

Rule cards remain mounted while hidden by view filters so unfinished edits survive searching and filtering. A visible unsaved-edit notice explains that generated signals still use the saved revision. Save and Discard are disabled when there are no changes. Adding a rule clears view filters and focuses its name field. The new controls and editor fields use touch-sized inputs on mobile.

Draft preservation originally covered filtering within the current page. The later [research completion](RESEARCH-COMPLETION.md) update adds revision-aware local draft recovery across navigation/reload and paginates editors. Existing save validation, persistence, suppression and immutable alert provenance remain unchanged.

## Shared navigation accessibility

All interface shells share route focus and a polite, named navigation announcement. The navigator waits for visible page content after lazy loading, instead of focusing a loading heading or old hidden content. It avoids active modal dialogs and does not take focus from an editable control. Query-only updates to year/district/model/source preserve focus and scroll. The main workspace's previous immediate-focus effect is replaced to avoid competing handlers.

`tests/workspace-ux-polish.mjs` covers search/filter isolation, empty-state recovery, draft preservation, save/discard, rule creation focus, lazy desktop/mobile navigation, query focus and phone/tablet overflow. Existing full browser suites remain the regression gate. Scientific calculations, research fixtures and evidence classifications are unchanged.
