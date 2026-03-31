<script lang="ts">
  import SyncStatus from "$lib/components/SyncStatus.svelte";
  import AuthForm from "$lib/components/AuthForm.svelte";
</script>

<h1>Settings</h1>
<AuthForm />
<hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
<SyncStatus />

<style>
  h1 { margin: 0 0 20px; font-size: 24px; }
</style>
