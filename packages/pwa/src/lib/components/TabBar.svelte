<script lang="ts">
  import { page } from "$app/stores";

  const tabs = [
    { href: "/", label: "Home", id: "home" },
    { href: "/trails", label: "Trails", id: "trails" },
    { href: "/settings", label: "Settings", id: "settings" },
  ];
</script>

<nav class="tab-bar">
  {#each tabs as tab}
    <a
      href={tab.href}
      class="tab"
      class:active={tab.href === "/" ? $page.url.pathname === "/" : $page.url.pathname.startsWith(tab.href)}
    >
      <span class="icon">
        {#if tab.id === "home"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>
        {:else if tab.id === "trails"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
        {:else if tab.id === "settings"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
        {/if}
      </span>
      <span class="label">{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .tab-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-around;
    background: white;
    border-top: 1px solid #e0e0e0;
    padding: 6px 0 env(safe-area-inset-bottom, 6px);
    z-index: 100;
  }
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-decoration: none;
    color: #767676;
    font-size: 11px;
    padding: 4px 12px;
    gap: 2px;
  }
  .tab.active { color: #0066cc; }
  .icon { width: 24px; height: 24px; }
  .icon svg { width: 100%; height: 100%; }
  .label { font-size: 11px; }
</style>
