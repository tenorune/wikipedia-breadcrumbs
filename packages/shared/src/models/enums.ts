export const SourceType = { Link: "link", Search: "search", External: "external", Manual: "manual", ShareTarget: "share_target" } as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

export const SyncStatus = { LocalOnly: "local_only", Synced: "synced", PendingSync: "pending_sync" } as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export const TrailStatus = { Active: "active", Finalized: "finalized" } as const;
export type TrailStatus = (typeof TrailStatus)[keyof typeof TrailStatus];

export const Visibility = { Private: "private", Unlisted: "unlisted", Public: "public" } as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const StartReason = { AutoNewTab: "auto_new_tab", AutoTimeout: "auto_timeout", AutoExternal: "auto_external", AutoSearch: "auto_search", AutoMainPage: "auto_main_page", Manual: "manual", Forked: "forked" } as const;
export type StartReason = (typeof StartReason)[keyof typeof StartReason];

export const CitationFormat = { Wikipedia: "wikipedia", APA: "apa", MLA: "mla", Chicago: "chicago", BibTeX: "bibtex", URL: "url", Markdown: "markdown" } as const;
export type CitationFormat = (typeof CitationFormat)[keyof typeof CitationFormat];
