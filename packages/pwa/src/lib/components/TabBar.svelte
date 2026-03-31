<script lang="ts">
  import { page } from "$app/stores";

  const tabs = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/trails", label: "Trails", icon: "📋" },
    { href: "/settings", label: "Settings", icon: "⚙️" },
  ];
</script>

<nav class="tab-bar">
  {#each tabs as tab}
    <a
      href={tab.href}
      class="tab"
      class:active={tab.href === "/" ? $page.url.pathname === "/" : $page.url.pathname.startsWith(tab.href)}
    >
      <span class="icon">{tab.icon}</span>
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
    color: #999;
    font-size: 11px;
    padding: 4px 12px;
    gap: 2px;
  }
  .tab.active { color: #0066cc; }
  .icon { font-size: 20px; }
  .label { font-size: 11px; }
</style>
