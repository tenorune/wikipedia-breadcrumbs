<script lang="ts">
  interface Props {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel }: Props = $props();
</script>

<div class="overlay">
  <div class="dialog">
    <p>{message}</p>
    <div class="actions">
      <button class="btn-confirm" onclick={onConfirm}>{confirmLabel}</button>
      <button class="btn-cancel" onclick={onCancel}>{cancelLabel}</button>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .dialog { background: white; border-radius: 8px; padding: 20px; max-width: 360px; width: 90%; }
  .dialog p { margin: 0 0 16px; font-size: 14px; color: #333; line-height: 1.4; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-confirm { padding: 6px 14px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .btn-confirm:hover { background: #0055aa; }
  .btn-cancel { padding: 6px 14px; background: #eee; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .btn-cancel:hover { background: #ddd; }
</style>
